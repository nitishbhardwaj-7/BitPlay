import express from 'express';
import mongoose from 'mongoose';
import Purchase from '../../models/Purchase.js';
import UserMiningDetail from '../../models/UserMiningDetails.js';
import SubscriptionPlan from '../../models/SubscriptionPlan.js';
import { verifyPurchase } from '../../services/revenuecatService.js';
import { requireMobileClient, writeLimiter, readLimiter } from '../../middleware/mobileAuth.js';

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
      platform,
    } = req.body;

    // Validate required fields
    if (!userId || !plan_id || !product_identifier || !price_paid || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, plan_id, product_identifier, price_paid, currency',
      });
    }

    // Duplicate purchase guard — check before opening transaction
    const existing = await Purchase.findOne({ user: userId, product_identifier });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This product has already been credited to this account.',
        purchase_id: existing._id,
      });
    }

    // RevenueCat server-side verification
    if (revenuecat_customer_id) {
      try {
        await verifyPurchase(revenuecat_customer_id, product_identifier, platform || 'android');
      } catch (rcErr) {
        return res.status(rcErr.statusCode || 402).json({
          success: false,
          message: rcErr.message || 'Purchase could not be verified',
        });
      }
    }

    // Start transaction
    session.startTransaction();

    // Fetch the subscription plan details
    const plan = await SubscriptionPlan.findById(plan_id).session(session);

    if (!plan) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found',
      });
    }

    console.log('Found plan:', plan.name, 'Hashrate:', plan.hashrate, plan.unit);

    // Get current user mining details with lock
    let userMining = await UserMiningDetail.findOne({ user: userId }).session(session);
    const existingHashPower = userMining ? userMining.hashpower : 0;

    // Bonus % — read from plan.bonus_percent (set per-plan in DB, never hardcoded)
    const extraPercent = typeof plan.bonus_percent === 'number' ? plan.bonus_percent : 0;
    const baseHash = plan.hashrate * 2;
    const extraHash = baseHash * (extraPercent / 100);
    const hashpowerToAdd = baseHash + extraHash;
    const updatedHashPower = existingHashPower + hashpowerToAdd;

    console.log(`Hashpower update: ${existingHashPower} -> ${updatedHashPower}`);

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
      mining_power_added: false,
    });

    await purchase.save({ session });
    console.log('Purchase saved:', purchase._id);

    // Update user mining power
    if (!userMining) {
      userMining = new UserMiningDetail({
        user: userId,
        hashpower: hashpowerToAdd,
        claimedHashpower: 0,
        purchasedHashpower: hashpowerToAdd,
        rewarded_ads_watched: 0,
        thirty_gh_rewarded_ads_watched: 0,
        random_ads_watched: 0,
        mining_isactive: false,
        start_time: null,
        stop_time: null,
        local_start_time: null,
        local_stop_time: null,
        offset: null,
      });
      console.log('Created new mining details for user:', userId);
    } else {
      const existingPurchased = userMining.purchasedHashpower || 0;
      userMining.purchasedHashpower = existingPurchased + hashpowerToAdd;
      userMining.hashpower = updatedHashPower;

      // Migration: initialize missing fields for old users
      if (!userMining.dailyVideoRequirement || !userMining.dailyVideoRequirement.lastResetDate) {
        console.log(`Migrating dailyVideoRequirement for user ${userId} during purchase`);
        userMining.dailyVideoRequirement = {
          videosWatched: 0,
          required: 10,
          lastResetDate: new Date(),
          consecutiveFailures: 0,
        };
      }

      if (!userMining.lossTracking || !userMining.lossTracking.last_check_date) {
        console.log(`Migrating lossTracking for user ${userId} during purchase`);
        userMining.lossTracking = {
          daily_ads_watched: 0,
          cumulative_loss: 0,
          daily_loss_offset: 3.0,
          daily_ads_required: 10,
          last_check_date: new Date(),
        };
      }

      console.log(`Updated mining power for user ${userId}: purchased=${userMining.purchasedHashpower}, total=${userMining.hashpower}`);
    }

    await userMining.save({ session });

    // Mark purchase as mining power added
    purchase.mining_power_added = true;
    await purchase.save({ session });

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
        updated_hashpower: updatedHashPower,
      },
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error processing purchase:', error);

    // Duplicate key error from the unique index — return 409
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This product has already been credited to this account.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to process purchase',
      error: error.message,
    });
  } finally {
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
      purchases,
    });

  } catch (error) {
    console.error('Error fetching purchases:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch purchases',
      error: error.message,
    });
  }
});

export default router;
