/**
 * RevenueCat server-side purchase verification.
 *
 * Calls the RevenueCat REST API to confirm a purchase exists and is non-refunded
 * before we credit hashpower. Requires REVENUECAT_API_KEY (secret key) in env.
 *
 * If REVENUECAT_API_KEY is not set, verification is skipped with a warning so
 * the app still works in environments where the key hasn't been configured yet.
 */

import axios from 'axios';

const REVENUECAT_API_URL = 'https://api.revenuecat.com/v1';
const API_KEY = process.env.REVENUECAT_API_KEY;

/**
 * Verify that `productIdentifier` appears as a completed, non-refunded purchase
 * for `revenuecatCustomerId`.
 *
 * @returns {{ verified: boolean, reason: string }}
 */
export async function verifyPurchase({ revenuecatCustomerId, productIdentifier }) {
  if (!API_KEY) {
    console.warn('[RevenueCat] REVENUECAT_API_KEY not set — skipping server-side verification');
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
    // Network/timeout errors — fail open with a warning so a RevenueCat outage
    // doesn't block all purchases. Log for monitoring.
    console.error('[RevenueCat] Verification request failed:', err.message);
    return { verified: true, reason: 'verification_failed_open_on_error' };
  }
}
