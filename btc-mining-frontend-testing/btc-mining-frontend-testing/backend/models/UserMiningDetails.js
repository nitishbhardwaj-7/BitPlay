const mongoose = require('mongoose');

/**
 * User Mining Details Schema
 * Tracks mining activity, video watch requirements, and penalty history
 */
const userMiningDetailsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // Mining Power
  hashpower: {
    type: Number,
    default: 0,
    min: 0
  },

  // Mining Status
  mining_isactive: {
    type: Boolean,
    default: false
  },

  // Ad Watch Tracking
  rewarded_ads_watched: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },

  random_ads_watched: {
    type: Number,
    default: 0
  },

  // Mining Time Tracking
  start_time: {
    type: Number, // Unix timestamp
    default: null
  },

  stop_time: {
    type: Number, // Unix timestamp
    default: null
  },

  local_start_time: {
    type: String,
    default: null
  },

  local_end_time: {
    type: String,
    default: null
  },

  offset: {
    type: Number, // Timezone offset in minutes
    default: 0
  },

  // Daily Video Requirement (NEW)
  dailyVideoRequirement: {
    // Is user subject to daily video requirement (has active subscription)
    isActive: {
      type: Boolean,
      default: false
    },

    // Number of videos watched today (resets daily at midnight)
    videosWatchedToday: {
      type: Number,
      default: 0,
      min: 0,
      max: 10
    },

    // Daily target (always 10 for now)
    dailyTarget: {
      type: Number,
      default: 10
    },

    // Last time the counter was reset (used to detect new day)
    lastResetDate: {
      type: Date,
      default: Date.now
    },

    // Last time compliance was checked
    lastComplianceCheckDate: {
      type: Date,
      default: null
    },

    // Number of consecutive days user failed to meet requirement
    consecutiveFailures: {
      type: Number,
      default: 0,
      min: 0
    },

    // Total number of penalties applied (lifetime)
    totalPenaltiesApplied: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  // Subscription Status (NEW)
  subscription: {
    hasActiveSubscription: {
      type: Boolean,
      default: false
    },

    // Date when subscription was activated
    activatedDate: {
      type: Date,
      default: null
    },

    // Subscription plan details
    planName: {
      type: String,
      default: null
    },

    // Original hashpower from subscription purchase
    originalHashpower: {
      type: Number,
      default: 0
    }
  },

  // Penalty History (NEW)
  penaltyHistory: [{
    date: {
      type: Date,
      default: Date.now
    },

    reason: {
      type: String,
      default: 'Daily video requirement not met'
    },

    penaltyPercentage: {
      type: Number,
      default: 13 // 10% cumulative + 3% daily offset
    },

    hashpowerBefore: {
      type: Number,
      required: true
    },

    hashpowerAfter: {
      type: Number,
      required: true
    },

    hashpowerLost: {
      type: Number,
      required: true
    },

    videosWatchedThatDay: {
      type: Number,
      default: 0
    }
  }],

  // Loss Tracking (for 30 ads requirement)
  lossTracking: {
    cumulative_loss: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    daily_ads_watched: {
      type: Number,
      default: 0,
      min: 0,
      max: 30
    },
    daily_ads_required: {
      type: Number,
      default: 30,
      immutable: true
    },
    last_penalty_date: {
      type: String,
      default: () => new Date().toDateString()
    },
    days_without_meeting: {
      type: Number,
      default: 0
    }
  },

  // Previous day earnings
  previous_day_earnings: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true // Automatically adds createdAt and updatedAt
});

// Indexes for performance
userMiningDetailsSchema.index({ userId: 1 });
userMiningDetailsSchema.index({ 'dailyVideoRequirement.lastResetDate': 1 });
userMiningDetailsSchema.index({ 'subscription.hasActiveSubscription': 1 });

/**
 * Method: Apply daily penalty for not meeting video requirement
 * Reduces hashpower by 13% (10% cumulative + 3% daily offset)
 */
userMiningDetailsSchema.methods.applyDailyPenalty = function() {
  const CUMULATIVE_LOSS = 0.10;  // 10%
  const DAILY_OFFSET = 0.03;     // 3%
  const TOTAL_PENALTY = CUMULATIVE_LOSS + DAILY_OFFSET; // 13%

  const hashpowerBefore = this.hashpower;
  const hashpowerLost = hashpowerBefore * TOTAL_PENALTY;
  const hashpowerAfter = hashpowerBefore * (1 - TOTAL_PENALTY);

  // Update hashpower
  this.hashpower = hashpowerAfter;

  // Update failure counters
  this.dailyVideoRequirement.consecutiveFailures += 1;
  this.dailyVideoRequirement.totalPenaltiesApplied += 1;

  // Record penalty in history
  this.penaltyHistory.push({
    date: new Date(),
    reason: 'Daily video requirement not met',
    penaltyPercentage: TOTAL_PENALTY * 100,
    hashpowerBefore,
    hashpowerAfter,
    hashpowerLost,
    videosWatchedThatDay: this.dailyVideoRequirement.videosWatchedToday
  });

  return {
    applied: true,
    hashpowerBefore,
    hashpowerAfter,
    hashpowerLost,
    penaltyPercentage: TOTAL_PENALTY * 100
  };
};

/**
 * Method: Reset daily video counter (called at midnight)
 */
userMiningDetailsSchema.methods.resetDailyVideoCounter = function() {
  this.dailyVideoRequirement.videosWatchedToday = 0;
  this.dailyVideoRequirement.lastResetDate = new Date();
};

/**
 * Method: Increment daily video count (called when ad is watched)
 */
userMiningDetailsSchema.methods.incrementDailyVideoCount = function() {
  if (this.dailyVideoRequirement.videosWatchedToday < this.dailyVideoRequirement.dailyTarget) {
    this.dailyVideoRequirement.videosWatchedToday += 1;
  }
};

/**
 * Method: Check if user met daily video requirement
 */
userMiningDetailsSchema.methods.metDailyRequirement = function() {
  return this.dailyVideoRequirement.videosWatchedToday >= this.dailyVideoRequirement.dailyTarget;
};

/**
 * Method: Activate subscription (enables daily video requirement)
 */
userMiningDetailsSchema.methods.activateSubscription = function(planName, hashpowerAmount) {
  this.subscription.hasActiveSubscription = true;
  this.subscription.activatedDate = new Date();
  this.subscription.planName = planName;
  this.subscription.originalHashpower = hashpowerAmount;

  // Enable daily video requirement
  this.dailyVideoRequirement.isActive = true;
  this.dailyVideoRequirement.videosWatchedToday = 0;
  this.dailyVideoRequirement.consecutiveFailures = 0;
};

/**
 * Method: Get daily progress summary
 */
userMiningDetailsSchema.methods.getDailyProgress = function() {
  return {
    videosWatchedToday: this.dailyVideoRequirement.videosWatchedToday,
    dailyTarget: this.dailyVideoRequirement.dailyTarget,
    remaining: this.dailyVideoRequirement.dailyTarget - this.dailyVideoRequirement.videosWatchedToday,
    isComplete: this.metDailyRequirement(),
    hasActiveSubscription: this.subscription.hasActiveSubscription,
    requirementActive: this.dailyVideoRequirement.isActive
  };
};

/**
 * Method: Increment daily ads watched (for loss offset)
 */
userMiningDetailsSchema.methods.incrementLossOffsetAds = function() {
  if (this.lossTracking.daily_ads_watched < this.lossTracking.daily_ads_required) {
    this.lossTracking.daily_ads_watched += 1;

    // If reached 30, apply recovery (reduce cumulative loss by 3%)
    if (this.lossTracking.daily_ads_watched === 30 && this.lossTracking.cumulative_loss > 0) {
      this.lossTracking.cumulative_loss = Math.max(this.lossTracking.cumulative_loss - 3.0, 0);
      console.log(`Recovery applied: Loss reduced to ${this.lossTracking.cumulative_loss}%`);
    }
  }
};

/**
 * Method: Apply daily loss penalty (if 30 ads not watched)
 */
userMiningDetailsSchema.methods.applyLossPenalty = function() {
  const today = new Date().toDateString();

  // Only apply if not already applied today
  if (this.lossTracking.last_penalty_date !== today) {
    // Check if user watched 30 ads yesterday
    if (this.lossTracking.daily_ads_watched < this.lossTracking.daily_ads_required) {
      // Penalty: Add 3% to cumulative loss
      this.lossTracking.cumulative_loss += 3.0;

      // Ensure minimum 10% base loss
      if (this.lossTracking.cumulative_loss < 10.0) {
        this.lossTracking.cumulative_loss = 10.0;
      }

      this.lossTracking.days_without_meeting += 1;
      console.log(`Loss penalty applied: Now at ${this.lossTracking.cumulative_loss}%`);
    } else {
      // Met requirement - reset counter
      this.lossTracking.days_without_meeting = 0;
    }

    // Reset daily counter for new day
    this.lossTracking.daily_ads_watched = 0;
    this.lossTracking.last_penalty_date = today;
  }
};

module.exports = mongoose.model('UserMiningDetails', userMiningDetailsSchema);
