/**
 * RevenueCat server-side purchase verification.
 *
 * Supports separate API keys per platform:
 *   REVENUECAT_API_KEY_IOS     — App Store secret key
 *   REVENUECAT_API_KEY_ANDROID — Play Store secret key
 *   REVENUECAT_API_KEY         — fallback if platform is not specified
 *
 * Pass platform: 'ios' | 'android' from the purchase request body.
 * If the matching env var is not set, verification is skipped with a warning.
 */

import axios from 'axios';

const REVENUECAT_API_URL = 'https://api.revenuecat.com/v1';

function getApiKey(platform) {
  if (platform === 'ios') return process.env.REVENUECAT_API_KEY_IOS || process.env.REVENUECAT_API_KEY;
  if (platform === 'android') return process.env.REVENUECAT_API_KEY_ANDROID || process.env.REVENUECAT_API_KEY;
  return process.env.REVENUECAT_API_KEY;
}

/**
 * Verify that `productIdentifier` appears as a completed, non-refunded purchase
 * for `revenuecatCustomerId`.
 *
 * @returns {{ verified: boolean, reason: string }}
 */
export async function verifyPurchase({ revenuecatCustomerId, productIdentifier, platform }) {
  const API_KEY = getApiKey(platform);

  if (!API_KEY) {
    console.warn(`[RevenueCat] No API key set for platform "${platform || 'unknown'}" — skipping verification`);
    return { verified: true, reason: 'verification_skipped_no_api_key' };
  }

  if (!revenuecatCustomerId) {
    return { verified: false, reason: 'missing_revenuecat_customer_id' };
  }

  try {
    const { data } = await axios.get(
      `${REVENUECAT_API_URL}/subscribers/${encodeURIComponent(revenuecatCustomerId)}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );

    const subscriber = data?.subscriber;
    if (!subscriber) {
      return { verified: false, reason: 'subscriber_not_found' };
    }

    // Check non-subscription purchases (one-time)
    const nonSubs = subscriber.non_subscriptions?.[productIdentifier];
    if (nonSubs && nonSubs.length > 0) {
      const valid = nonSubs.some(p => !p.is_sandbox || process.env.NODE_ENV !== 'production');
      if (valid) return { verified: true, reason: 'non_subscription_found' };
    }

    // Check subscriptions
    const sub = subscriber.subscriptions?.[productIdentifier];
    if (sub) {
      const notRefunded = !sub.refunded_at;
      const notExpired = !sub.expires_date || new Date(sub.expires_date) > new Date();
      if (notRefunded && notExpired) {
        return { verified: true, reason: 'subscription_active' };
      }
      if (sub.refunded_at) {
        return { verified: false, reason: 'purchase_refunded' };
      }
    }

    return { verified: false, reason: 'product_not_found_in_subscriber' };

  } catch (err) {
    const status = err.response?.status;
    if (status === 404) {
      return { verified: false, reason: 'revenuecat_customer_not_found' };
    }
    // Network/timeout — fail open so a RevenueCat outage never blocks real users
    console.error('[RevenueCat] Verification request failed:', err.message);
    return { verified: true, reason: 'verification_failed_open_on_error' };
  }
}
