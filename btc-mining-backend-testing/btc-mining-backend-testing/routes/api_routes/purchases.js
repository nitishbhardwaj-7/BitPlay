import express from 'express';
import mongoose from 'mongoose';
import Purchase from '../../models/Purchase.js';
import UserMiningDetail from '../../models/UserMiningDetails.js';
import SubscriptionPlan from '../../models/SubscriptionPlan.js';
import { requireMobileClient, writeLimiter, readLimiter } from '../../middleware/mobileAuth.js';
import { verifyPurchase } from '../../services/revenuecatService.js';

const router = express.Router();

// POST /api/purchases/:userId - Store purchase and update mining power
router.post('/:userId', requireMobileClient, writeLimiter, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { userId } = req.params;
    const {
      plan_id,
      product_identifier,
      revenuecat_customer_id,
      price_paid,
      currency,
      purchase_date,
      platform,   // 'ios' | 'android' — selects the correct RevenueCat API key
    } = req.body;

    // Validate required fields
    if (!userId || !plan_id || !product_identifier || !price_paid || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, plan_id, product_identifier, price_paid, currency'
      });
    }

    // Duplicate purchase guard — one product_identifier per user
    const existing = await Purchase.findOne({ user: userId, product_identifier });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Purchase already recorded for this product',
        purchase_id: existing._id
      });
    }

    // RevenueCat server-side verification — uses platform-specific API key
    const { verified, reason } = await verifyPurchase({
      revenuecatCustomerId: revenuecat_customer_id,
      productIdentifier: product_identifier,
      platform,
    });

    if (!verified) {
      console.warn(`[Purchase] RevenueCat verification failed for user ${userId} (${platform}): ${reason}`);
      return res.status(402).json({
        success: false,
        message: 'Purchase could not be verified. Please contact support if you were charged.',
        reason
      });
    }

    // Start transaction
    session.startTransaction();

    // Fetch the subscription plan details
    const plan = await SubscriptionPlan.findById(plan_id).session(session);
    
    if (!plan) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    console.log('Found plan:', plan.name, 'Hashrate:', plan.hashrate, plan.unit, 'Bonus:', plan.bonus_percent, '%');

    // Get current user mining details with lock
    let userMining = await UserMiningDetail.findOne({ user: userId }).session(session);
    const existingHashPower = userMining ? userMining.hashpower : 0;

    // Calculate hashpower using bonus_percent from the plan (no hardcoded IDs)
    const bonusPercent = plan.bonus_percent || 0;
    const baseHash = plan.hashrate * 2;
    const extraHash = baseHash * (bonusPercent / 100);
    const hashpowerToAdd = baseHash + extraHash;
    const updatedHashPower = existingHashPower + hashpowerToAdd;

    console.log(`Hashpower update: ${existingHashPower} -> ${updatedHashPower} (bonus: ${bonusPercent}%)`);

    // Create purchase record
    const purchase = new Purchase({
      user: userId,
      plan_id: plan._id,
      product_identifier,
      revenuecat_customer_id: revenuecat_customer_id || null,
      price_paid,
      currency,
      purchase_date: purchase_date || new Date(),
      status: 'completed',
      existing_hashpower: existingHashPower,
      updated_hashpower: updatedHashPower,
      mining_power_added: false
    });

    await purchase.save({ session });
    console.log('Purchase saved:', purchase._id);

    // Update user mining power
    if (!userMining) {
      // Create new mining details if not exists
      userMining = new UserMiningDetail({
        user: userId,
        hashpower: hashpowerToAdd,
        claimedHashpower: 0,
        purchasedHashpower: hashpowerToAdd, // Set purchased hashpower (2x)
        rewarded_ads_watched: 0,
        thirty_gh_rewarded_ads_watched: 0,
        random_ads_watched: 0,
        mining_isactive: false,
        start_time: null,
        stop_time: null,
        local_start_time: null,
        local_stop_time: null,
        offset: null
      });
      console.log('Created new mining details for user:', userId);
    } else {
      // Add hashrate to existing mining power (2x multiplier: users get double the purchased hashpower)
      const existingClaimed = userMining.claimedHashpower || 0;
      const existingPurchased = userMining.purchasedHashpower || 0;

      userMining.purchasedHashpower = existingPurchased + hashpowerToAdd; // Add to purchased (2x)
      userMining.hashpower = updatedHashPower; // Total = claimed + purchased

      // Migration: Initialize missing fields for old users
      if (!userMining.dailyVideoRequirement || !userMining.dailyVideoRequirement.lastResetDate) {
        console.log(`Migrating dailyVideoRequirement for user ${userId} during purchase`);
        userMining.dailyVideoRequirement = {
          videosWatched: 0,
          required: 10,
          lastResetDate: new Date(),
          consecutiveFailures: 0
        };
      }

      if (!userMining.lossTracking || !userMining.lossTracking.last_check_date) {
        console.log(`Migrating lossTracking for user ${userId} during purchase`);
        userMining.lossTracking = {
          daily_ads_watched: 0,
          cumulative_loss: 0,
          daily_loss_offset: 3.0,
          daily_ads_required: 10,
          last_check_date: new Date()
        };
      }

      console.log(`Updated mining power for user ${userId}: claimed=${existingClaimed}, purchased=${userMining.purchasedHashpower}, total=${userMining.hashpower}`);
    }

    await userMining.save({ session });

    // Mark purchase as mining power added
    purchase.mining_power_added = true;
    await purchase.save({ session });

    // Commit transaction
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Purchase recorded and mining power updated successfully',
      purchase: {
        id: purchase._id,
        plan_name: plan.name,
        hashrate: plan.hashrate,
        unit: plan.unit,
        duration: plan.duration,
        price_paid: purchase.price_paid,
        currency: purchase.currency,
        purchase_date: purchase.purchase_date,
        existing_hashpower: existingHashPower,
        updated_hashpower: updatedHashPower
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    console.error('Error processing purchase:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process purchase',
      error: error.message
    });
  } finally {
    // End session
    session.endSession();
  }
});

// GET /api/purchases/:userId - Get user's purchase history
router.get('/:userId', requireMobileClient, readLimiter, async (req, res) => {
  try {
    const { userId } = req.params;

    const purchases = await Purchase.find({ user: userId })
      .populate('plan_id')
      .sort({ purchase_date: -1 })
      .select('-__v');

    return res.status(200).json({
      success: true,
      count: purchases.length,
      purchases
    });

  } catch (error) {
    console.error('Error fetching purchases:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch purchases',
      error: error.message
    });
  }
});

export default router;