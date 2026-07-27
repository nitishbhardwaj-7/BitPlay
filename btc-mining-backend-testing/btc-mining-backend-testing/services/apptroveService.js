/**
 * Apptrove MMP — Server-to-Server (S2S) Analytics Service
 *
 * All 4 events that must fire from the backend (not the mobile client):
 *   referral_signup       — when a new user registers with a referral code
 *   referral_reward_claimed — when a parent earns BTC from a child's mining
 *   trial_converted       — RevenueCat webhook: trial → paid
 *   subscription_renewed  — RevenueCat webhook: successful renewal
 *
 * Env vars required:
 *   APPTROVE_S2S_TOKEN    — Apptrove S2S API token (from Apptrove dashboard)
 *   APPTROVE_BASE_URL     — optional, defaults to https://api.apptrove.io/s2s/v1
 */

import axios from 'axios';

const BASE_URL = process.env.APPTROVE_BASE_URL || 'https://api.apptrove.io/s2s/v1';
const S2S_TOKEN = process.env.APPTROVE_S2S_TOKEN;

/**
 * Fire a single Apptrove S2S event. Never throws — analytics failures must
 * never crash the app. Logs errors only.
 */
async function trackEvent(eventName, params = {}) {
  if (!S2S_TOKEN) {
    console.warn(`[Apptrove] APPTROVE_S2S_TOKEN not set — skipping "${eventName}"`);
    return;
  }

  const payload = {
    event_name: eventName,
    timestamp: new Date().toISOString(),
    source: 'server',
    ...params,
  };

  // Strip null / undefined values — Apptrove rejects empty fields
  Object.keys(payload).forEach(k => {
    if (payload[k] === null || payload[k] === undefined || payload[k] === '') {
      delete payload[k];
    }
  });

  try {
    await axios.post(`${BASE_URL}/events`, payload, {
      headers: {
        Authorization: `Bearer ${S2S_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000, // don't block main flow
    });
    console.log(`[Apptrove] ✅ Tracked "${eventName}" for user ${params.user_id || 'unknown'}`);
  } catch (err) {
    // Log but never rethrow — analytics must be non-fatal
    const status = err.response?.status;
    const body = err.response?.data;
    console.error(`[Apptrove] ❌ Failed to track "${eventName}": HTTP ${status}`, body || err.message);
  }
}

// ─── Event helpers ────────────────────────────────────────────────────────────

/**
 * referral_signup
 * Fire immediately after a new user successfully registers using a referral code.
 */
export async function trackReferralSignup({ userId, referralCode, referralOwnerId, platform, appVersion, country }) {
  await trackEvent('referral_signup', {
    user_id: userId,
    referral_code: referralCode,
    referral_owner_id: referralOwnerId,
    device_platform: platform,
    app_version: appVersion,
    country,
  });
}

/**
 * referral_reward_claimed
 * Fire after parent's BTC balance is successfully updated from child's mining.
 */
export async function trackReferralRewardClaimed({ parentUserId, childUserId, rewardAmountBTC, rewardDate }) {
  await trackEvent('referral_reward_claimed', {
    user_id: parentUserId,
    child_user_id: childUserId,
    reward_amount: rewardAmountBTC,
    currency: 'BTC',
    reward_date: rewardDate instanceof Date ? rewardDate.toISOString().split('T')[0] : rewardDate,
  });
}

/**
 * trial_converted
 * Fire from RevenueCat webhook when a user converts from trial to paid.
 */
export async function trackTrialConverted({ userId, productId, transactionId, amount, currency, store, country }) {
  await trackEvent('trial_converted', {
    user_id: userId,
    product_id: productId,
    transaction_id: transactionId,
    amount,
    currency,
    store,
    country,
    payment_provider: 'revenuecat',
  });
}

/**
 * subscription_renewed
 * Fire from RevenueCat webhook on each successful auto-renewal.
 */
export async function trackSubscriptionRenewed({ userId, productId, transactionId, amount, currency, store, country, entitlementId }) {
  await trackEvent('subscription_renewed', {
    user_id: userId,
    product_id: productId,
    transaction_id: transactionId,
    entitlement_id: entitlementId,
    amount,
    currency,
    store,
    country,
    payment_provider: 'revenuecat',
  });
}
