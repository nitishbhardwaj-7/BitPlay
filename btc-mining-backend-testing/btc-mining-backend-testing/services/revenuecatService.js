import fetch from 'node-fetch';

const RC_API_BASE = 'https://api.revenuecat.com/v1';

/**
 * Verify a RevenueCat purchase server-side.
 * Selects the correct API key based on platform ('ios' | 'android').
 * Returns { valid: true } on success, throws on fraud / network errors.
 *
 * Fails open on network errors (RevenueCat outage should not block real users).
 * Fails closed on definitive fraud signals (status = 200 but refunded, or 404).
 */
export async function verifyPurchase(revenuecatCustomerId, productIdentifier, platform = 'android') {
  const iOS = platform === 'ios';
  const apiKey = iOS
    ? (process.env.REVENUECAT_API_KEY_IOS || process.env.REVENUECAT_API_KEY)
    : (process.env.REVENUECAT_API_KEY_ANDROID || process.env.REVENUECAT_API_KEY);

  if (!apiKey) {
    // No key configured — skip verification in dev/staging
    console.warn('[RevenueCat] No API key configured — skipping verification');
    return { valid: true, skipped: true };
  }

  let res;
  try {
    res = await fetch(
      `${RC_API_BASE}/subscribers/${encodeURIComponent(revenuecatCustomerId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );
  } catch (networkErr) {
    // Network failure — fail open so RC outage doesn't block real purchases
    console.error('[RevenueCat] Network error verifying purchase — failing open:', networkErr.message);
    return { valid: true, networkError: true };
  }

  if (res.status === 404) {
    throw Object.assign(new Error('RevenueCat customer not found'), { statusCode: 402 });
  }

  if (!res.ok) {
    // Unexpected RC error — fail open
    console.error(`[RevenueCat] Unexpected status ${res.status} — failing open`);
    return { valid: true, unexpectedStatus: res.status };
  }

  const body = await res.json();
  const subscriber = body.subscriber;

  if (!subscriber) {
    throw Object.assign(new Error('Invalid RevenueCat response'), { statusCode: 402 });
  }

  // Check non-subscription (one-time) purchases
  const nonSubs = subscriber.non_subscriptions || {};
  for (const [identifier, purchases] of Object.entries(nonSubs)) {
    if (identifier === productIdentifier && Array.isArray(purchases) && purchases.length > 0) {
      const latest = purchases[purchases.length - 1];
      if (latest && !latest.refunded_at) {
        return { valid: true };
      }
    }
  }

  // Check active entitlements
  const entitlements = subscriber.entitlements || {};
  const active = entitlements.active || {};
  for (const ent of Object.values(active)) {
    if (ent.product_identifier === productIdentifier) {
      return { valid: true };
    }
  }

  // Check all subscriptions
  const subscriptions = subscriber.subscriptions || {};
  const sub = subscriptions[productIdentifier];
  if (sub) {
    const expiresDate = sub.expires_date ? new Date(sub.expires_date) : null;
    const isActive = !expiresDate || expiresDate > new Date();
    const isRefunded = !!sub.refunded_at;
    if (isActive && !isRefunded) {
      return { valid: true };
    }
    if (isRefunded) {
      throw Object.assign(
        new Error('Purchase has been refunded — cannot credit mining power'),
        { statusCode: 402 }
      );
    }
  }

  // No matching active purchase found
  throw Object.assign(
    new Error('Purchase could not be verified with RevenueCat'),
    { statusCode: 402 }
  );
}
