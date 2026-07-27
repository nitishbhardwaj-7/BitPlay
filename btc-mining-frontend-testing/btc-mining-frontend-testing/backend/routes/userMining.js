const express = require('express');
const router = express.Router();
const {
  getUserMiningDetails,
  updateUserMiningDetails,
  incrementDailyVideoCount,
  getDailyProgress,
  activateSubscription,
  checkDailyCompliance,
  getPenaltyHistory,
  incrementLossOffsetAd
} = require('../controllers/userMiningController');

// Get user mining details
router.get('/:userId', getUserMiningDetails);

// Update user mining details
router.post('/', updateUserMiningDetails);

// Increment daily video count (called when user watches ad)
router.post('/increment-video', incrementDailyVideoCount);

// Increment loss offset ad count (called when user watches rewarded ad)
router.post('/increment-loss-ad', incrementLossOffsetAd);

// Get daily video progress
router.get('/daily-progress/:userId', getDailyProgress);

// Activate subscription (called when user purchases subscription plan)
router.post('/activate-subscription', activateSubscription);

// Check daily compliance and apply penalties (called by cron job)
router.post('/check-compliance', checkDailyCompliance);

// Get penalty history for a user
router.get('/penalty-history/:userId', getPenaltyHistory);

module.exports = router;
