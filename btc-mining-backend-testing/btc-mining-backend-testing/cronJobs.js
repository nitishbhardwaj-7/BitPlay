import cron from "node-cron";
import mongoose from "mongoose";
import Balance from "./models/Balance.js";
import BalanceHistory from "./models/BalanceHistory.js";
import DailyRewardClaim from "./models/DailyRewardClaim.js";
import DailyRewardClaimHistory from "./models/DailyRewardClaimHistory.js";
import UserMiningDetail from "./models/UserMiningDetails.js";
import DailyFreeMiner from "./models/DailyMiner.js";
import MiningSession from "./models/MiningSession.js";
import {
  sendMiningExpiryNotification,
  sendClockResetNotification,
  sendVideoReminderNotification,
  sendDailyRewardReminder,
  sendMiningStoppedNotification,
} from "./services/notificationService.js";
import { initializeFirebase } from "./config/firebase.js";

console.log("Cron Job Started!!");

// Initialize Firebase Admin SDK for push notifications
initializeFirebase();



const BTC_PER_HASHPOWER_PER_SEC = 0.000000000070; // Example conversion rate
const MAX_MINING_DURATION_MS = 24 * 60 * 60 * 1000;

// Run at midnight UAE time (00:00:00 UAE): "0 0 * * *" with timezone
// This job saves today's balance snapshot before resetting mining power
cron.schedule("0 0 * * *", async () => {
  console.log("Running midnight job: balance snapshots + mining reset (UAE time)...");
  try {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const now = new Date();

    // Step 1: Balance snapshots via bulkWrite (N+1 → 2 queries)
    const allBalances = await Balance.find({}).lean();
    if (allBalances.length > 0) {
      const snapshotOps = allBalances.map(b => ({
        updateOne: {
          filter: { user: b.user, date: todayDate },
          update: { $set: { user: b.user, date: todayDate, balances: { BTC: b.BTC || 0, BNB: b.BNB || 0, USDT: b.USDT || 0, USDC: b.USDC || 0, LTC: b.LTC || 0 } } },
          upsert: true,
        },
      }));
      await BalanceHistory.bulkWrite(snapshotOps, { ordered: false });
      console.log(`✅ Saved ${allBalances.length} balance snapshots`);
    }

    // Step 2: Reset active miners via bulkWrite (N+1 → 2 queries)
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const activeMiners = await UserMiningDetail.find(
      { mining_isactive: true, $or: [{ lastResetTime: { $lt: cutoff24h } }, { lastResetTime: { $exists: false } }] },
      { user: 1, purchasedHashpower: 1 }
    ).lean();

    if (activeMiners.length > 0) {
      const userIds = activeMiners.map(m => m.user);
      const resetOps = activeMiners.map(m => ({
        updateOne: {
          filter: { user: m.user },
          update: { $set: { claimedHashpower: 0, hashpower: m.purchasedHashpower || 0, mining_isactive: false, rewarded_ads_watched: 0, thirty_gh_rewarded_ads_watched: 0, random_ads_watched: 0, lastResetTime: now } },
        },
      }));
      await UserMiningDetail.bulkWrite(resetOps, { ordered: false });
      await DailyFreeMiner.deleteMany({ userId: { $in: userIds } });
      await Promise.allSettled(userIds.map(uid => sendMiningStoppedNotification(uid).catch(e => console.error(`Notify error ${uid}:`, e))));
      console.log(`✅ Reset ${activeMiners.length} active miners`);
    }

    console.log("Midnight job completed");
  } catch (err) {
    console.error("Error in midnight cron job:", err);
  }
}, { timezone: "Asia/Dubai" });

// Check for expired mining sessions every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  console.log("🔔 Checking for expired mining sessions...");

  try {


    // Find sessions that have expired but not notified
    const expiredSessions = await MiningSession.findExpiredNotNotified();

    console.log(`Found ${expiredSessions.length} expired sessions to notify`);

    for (const session of expiredSessions) {
      try {
        // Send expiry notification
        await sendMiningExpiryNotification(session.user_id);

        // Mark as notified
        await session.recordNotification('expired');

        console.log(`✅ Sent expiry notification to user ${session.user_id}`);
      } catch (notifyErr) {
        console.error(`Error notifying user ${session.user_id}:`, notifyErr);
      }
    }

    console.log("Expired mining session notifications completed");

  } catch (err) {
    console.error("Error in expired mining session cron job:", err);
  }
});

/**
 * Check for mining sessions expiring soon every hour
 *
 */
cron.schedule("0 * * * *", async () => {
  console.log("⏰ Checking for mining sessions expiring soon...");

  try {


    // Find sessions expiring within 1 hour
    const expiringSessions = await MiningSession.findExpiringSoon();

    console.log(`Found ${expiringSessions.length} sessions expiring soon`);

    for (const session of expiringSessions) {
      try {
        // Calculate hours remaining
        const hoursRemaining = Math.ceil(
          (session.end_time - new Date()) / (1000 * 60 * 60)
        );

        // Send warning notification
        await sendClockResetNotification(session.user_id, hoursRemaining);

        // Mark as notified
        await session.recordNotification('expiry_warning');

        console.log(`✅ Sent expiry warning to user ${session.user_id} (${hoursRemaining}h remaining)`);
      } catch (notifyErr) {
        console.error(`Error notifying user ${session.user_id}:`, notifyErr);
      }
    }

    console.log("Expiry warning notifications completed");

  } catch (err) {
    console.error("Error in expiry warning cron job:", err);
  }
});

/**
 * Send video reminders every 6 hours (4 times a day)

 */
cron.schedule("0 */6 * * *", async () => {
  console.log("🎥 Checking for video reminder opportunities...");

  try {


    // Find active sessions with low video count
    const sessionsNeedingReminder = await MiningSession.findNeedingVideoReminder();

    console.log(`Found ${sessionsNeedingReminder.length} users needing video reminders`);

    for (const session of sessionsNeedingReminder) {
      try {
        const maxAds = 10; // From frontend MAX_ADS constant

        // Send video reminder
        await sendVideoReminderNotification(
          session.user_id,
          session.ads_watched,
          maxAds
        );

        // Record that reminder was sent
        await session.recordNotification('video_reminder');

        console.log(`✅ Sent video reminder to user ${session.user_id} (${session.ads_watched}/${maxAds} ads)`);
      } catch (notifyErr) {
        console.error(`Error sending video reminder to user ${session.user_id}:`, notifyErr);
      }
    }

    console.log("Video reminder notifications completed");

  } catch (err) {
    console.error("Error in video reminder cron job:", err);
  }
});

/**
 * Send daily reward reminders at 9 AM server time
 *
 */
// cron.schedule("0 9 * * *", async () => {
//   console.log("🎁 Sending daily reward reminders...");

//   try {
// 

//     // Find users who haven't claimed daily reward yet
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const unclaimedUsers = await DailyFreeMiner.distinct('userId', {
//       createdAt: { $lt: today }
//     });

//     // Get all users with mining details
//     const allUsers = await UserMiningDetail.find({}, 'user');

//     // Filter users who haven't claimed today
//     const usersToNotify = allUsers
//       .map(u => u.user)
//       .filter(userId => !unclaimedUsers.includes(userId));

//     console.log(`Sending daily reward reminders to ${usersToNotify.length} users`);

//     // for (const userId of usersToNotify) {
//     //   try {
//     //     await sendDailyRewardReminder(userId);
//     //     console.log(`✅ Sent daily reward reminder to user ${userId}`);
//     //   } catch (notifyErr) {
//     //     console.error(`Error sending reward reminder to user ${userId}:`, notifyErr);
//     //   }
//     // }

//     console.log("Daily reward reminders completed");

//   } catch (err) {
//     console.error("Error in daily reward reminder cron job:", err);
//   }
// });