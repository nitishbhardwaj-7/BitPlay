const UserMiningDetails = require('../models/UserMiningDetails');
const User = require('../models/User');

/**
 * @desc    Get or create user mining details
 * @route   GET /api/user_mining/:userId
 * @access  Public
 */
exports.getUserMiningDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { local_time } = req.query;

    let miningDetails = await UserMiningDetails.findOne({ userId });

    // Create if doesn't exist
    if (!miningDetails) {
      miningDetails = await UserMiningDetails.create({ userId });
    }

    // Check if we need to reset daily counter (new day)
    const now = new Date();
    const lastReset = new Date(miningDetails.dailyVideoRequirement.lastResetDate);

    if (now.toDateString() !== lastReset.toDateString()) {
      // New day - reset counter
      miningDetails.resetDailyVideoCounter();
      await miningDetails.save();
    }

    // Calculate time remaining until next reset (midnight)
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const timeRemaining = Math.floor((tomorrow - now) / 1000); // seconds

    res.status(200).json({
      success: true,
      mining_details: {
        hashpower: miningDetails.hashpower,
        mining_isactive: miningDetails.mining_isactive,
        rewarded_ads_watched: miningDetails.rewarded_ads_watched,
        start_time: miningDetails.start_time,
        stop_time: miningDetails.stop_time
      },
      daily_progress: miningDetails.getDailyProgress(),
      time_remaining: timeRemaining,
      calculated_btc: 0, // Placeholder - calculate based on mining time

      // Loss tracking data (for 30 ads requirement)
      loss_tracking: {
        cumulative_loss: miningDetails.lossTracking?.cumulative_loss || 0,
        daily_loss_offset: 3.0, // Fixed at 3%
        daily_ads_watched: miningDetails.lossTracking?.daily_ads_watched || 0,
        daily_ads_required: 30 // Fixed at 30
      },

      // Previous day earnings
      previous_day_earnings: miningDetails.previous_day_earnings || 0
    });
  } catch (error) {
    console.error('Error getting user mining details:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving mining details',
      error: error.message
    });
  }
};

/**
 * @desc    Update user mining details
 * @route   POST /api/user_mining
 * @access  Public
 */
exports.updateUserMiningDetails = async (req, res) => {
  try {
    const {
      user_id,
      hashpower,
      mining_isactive,
      rewarded_ads_watched,
      random_ads_watched,
      start_time,
      stop_time,
      local_start_time,
      local_end_time,
      offset
    } = req.body;

    let miningDetails = await UserMiningDetails.findOne({ userId: user_id });

    if (!miningDetails) {
      miningDetails = await UserMiningDetails.create({
        userId: user_id,
        hashpower,
        mining_isactive,
        rewarded_ads_watched,
        random_ads_watched,
        start_time,
        stop_time,
        local_start_time,
        local_end_time,
        offset
      });
    } else {
      // Update existing record
      miningDetails.hashpower = hashpower;
      miningDetails.mining_isactive = mining_isactive;
      miningDetails.rewarded_ads_watched = rewarded_ads_watched;
      miningDetails.random_ads_watched = random_ads_watched;
      miningDetails.start_time = start_time;
      miningDetails.stop_time = stop_time;
      miningDetails.local_start_time = local_start_time;
      miningDetails.local_end_time = local_end_time;
      miningDetails.offset = offset;

      await miningDetails.save();
    }

    res.status(200).json({
      success: true,
      message: 'Mining details updated successfully',
      data: miningDetails
    });
  } catch (error) {
    console.error('Error updating user mining details:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating mining details',
      error: error.message
    });
  }
};

/**
 * @desc    Increment daily video count (called when user watches ad)
 * @route   POST /api/user_mining/increment-video
 * @access  Public
 */
exports.incrementDailyVideoCount = async (req, res) => {
  try {
    const { userId } = req.body;

    let miningDetails = await UserMiningDetails.findOne({ userId });

    if (!miningDetails) {
      return res.status(404).json({
        success: false,
        message: 'Mining details not found'
      });
    }

    // Check if we need to reset counter for new day
    const now = new Date();
    const lastReset = new Date(miningDetails.dailyVideoRequirement.lastResetDate);

    if (now.toDateString() !== lastReset.toDateString()) {
      miningDetails.resetDailyVideoCounter();
    }

    // Increment video count
    miningDetails.incrementDailyVideoCount();

    // Reset consecutive failures if they meet requirement
    if (miningDetails.metDailyRequirement()) {
      miningDetails.dailyVideoRequirement.consecutiveFailures = 0;
    }

    await miningDetails.save();

    res.status(200).json({
      success: true,
      message: 'Video count incremented',
      daily_progress: miningDetails.getDailyProgress()
    });
  } catch (error) {
    console.error('Error incrementing video count:', error);
    res.status(500).json({
      success: false,
      message: 'Error incrementing video count',
      error: error.message
    });
  }
};

/**
 * @desc    Increment daily ads watched for loss offset
 * @route   POST /api/user_mining/increment-loss-ad
 * @access  Public
 */
exports.incrementLossOffsetAd = async (req, res) => {
  try {
    const { userId } = req.body;

    let miningDetails = await UserMiningDetails.findOne({ userId });

    if (!miningDetails) {
      return res.status(404).json({
        success: false,
        message: 'Mining details not found'
      });
    }

    // Increment ads watched
    miningDetails.incrementLossOffsetAds();
    await miningDetails.save();

    res.status(200).json({
      success: true,
      message: 'Loss offset ad count incremented',
      daily_ads_watched: miningDetails.lossTracking.daily_ads_watched,
      cumulative_loss: miningDetails.lossTracking.cumulative_loss
    });
  } catch (error) {
    console.error('Error incrementing loss offset ads:', error);
    res.status(500).json({
      success: false,
      message: 'Error incrementing ad count',
      error: error.message
    });
  }
};

/**
 * @desc    Get daily video progress
 * @route   GET /api/user_mining/daily-progress/:userId
 * @access  Public
 */
exports.getDailyProgress = async (req, res) => {
  try {
    const { userId } = req.params;

    let miningDetails = await UserMiningDetails.findOne({ userId });

    if (!miningDetails) {
      return res.status(404).json({
        success: false,
        message: 'Mining details not found'
      });
    }

    // Check if we need to reset counter for new day
    const now = new Date();
    const lastReset = new Date(miningDetails.dailyVideoRequirement.lastResetDate);

    if (now.toDateString() !== lastReset.toDateString()) {
      miningDetails.resetDailyVideoCounter();
      await miningDetails.save();
    }

    res.status(200).json({
      success: true,
      daily_progress: miningDetails.getDailyProgress()
    });
  } catch (error) {
    console.error('Error getting daily progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving daily progress',
      error: error.message
    });
  }
};

/**
 * @desc    Activate subscription (enables daily video requirement)
 * @route   POST /api/user_mining/activate-subscription
 * @access  Public
 */
exports.activateSubscription = async (req, res) => {
  try {
    const { userId, planName, hashpowerAmount } = req.body;

    let miningDetails = await UserMiningDetails.findOne({ userId });

    if (!miningDetails) {
      miningDetails = await UserMiningDetails.create({ userId });
    }

    // Activate subscription and enable daily video requirement
    miningDetails.activateSubscription(planName, hashpowerAmount);
    miningDetails.hashpower += hashpowerAmount;

    await miningDetails.save();

    res.status(200).json({
      success: true,
      message: 'Subscription activated successfully',
      data: {
        hasActiveSubscription: miningDetails.subscription.hasActiveSubscription,
        hashpower: miningDetails.hashpower,
        dailyRequirementActive: miningDetails.dailyVideoRequirement.isActive
      }
    });
  } catch (error) {
    console.error('Error activating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Error activating subscription',
      error: error.message
    });
  }
};

/**
 * @desc    Check daily compliance and apply penalties
 * @route   POST /api/user_mining/check-compliance
 * @access  Private (called by cron job)
 */
exports.checkDailyCompliance = async (req, res) => {
  try {
    // Find all users with active subscriptions
    const usersWithSubscriptions = await UserMiningDetails.find({
      'subscription.hasActiveSubscription': true,
      'dailyVideoRequirement.isActive': true
    });

    const results = {
      totalChecked: usersWithSubscriptions.length,
      penaltiesApplied: 0,
      compliantUsers: 0,
      details: []
    };

    for (const miningDetails of usersWithSubscriptions) {
      // Check if user met daily requirement
      const metRequirement = miningDetails.metDailyRequirement();

      if (!metRequirement) {
        // Apply penalty
        const penaltyResult = miningDetails.applyDailyPenalty();

        results.penaltiesApplied++;
        results.details.push({
          userId: miningDetails.userId,
          videosWatched: miningDetails.dailyVideoRequirement.videosWatchedToday,
          penaltyApplied: true,
          ...penaltyResult
        });
      } else {
        results.compliantUsers++;
        results.details.push({
          userId: miningDetails.userId,
          videosWatched: miningDetails.dailyVideoRequirement.videosWatchedToday,
          penaltyApplied: false
        });
      }

      // Apply loss tracking penalties if user has hashpower > 3
      if (miningDetails.hashpower > 3) {
        miningDetails.applyLossPenalty();
      }

      // Reset daily counter for tomorrow
      miningDetails.resetDailyVideoCounter();
      miningDetails.dailyVideoRequirement.lastComplianceCheckDate = new Date();

      await miningDetails.save();
    }

    console.log('Daily compliance check completed:', results);

    res.status(200).json({
      success: true,
      message: 'Daily compliance check completed',
      results
    });
  } catch (error) {
    console.error('Error checking daily compliance:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking daily compliance',
      error: error.message
    });
  }
};

/**
 * @desc    Get penalty history for a user
 * @route   GET /api/user_mining/penalty-history/:userId
 * @access  Public
 */
exports.getPenaltyHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const miningDetails = await UserMiningDetails.findOne({ userId });

    if (!miningDetails) {
      return res.status(404).json({
        success: false,
        message: 'Mining details not found'
      });
    }

    res.status(200).json({
      success: true,
      penaltyHistory: miningDetails.penaltyHistory,
      totalPenaltiesApplied: miningDetails.dailyVideoRequirement.totalPenaltiesApplied,
      consecutiveFailures: miningDetails.dailyVideoRequirement.consecutiveFailures
    });
  } catch (error) {
    console.error('Error getting penalty history:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving penalty history',
      error: error.message
    });
  }
};
