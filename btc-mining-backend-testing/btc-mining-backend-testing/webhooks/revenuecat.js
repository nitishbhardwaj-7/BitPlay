/**
 * RevenueCat Webhook Handler
 *
 * Listens on POST /webhooks/revenuecat
 * Fires Apptrove S2S events for:
 *   - trial_converted       (TRIAL_CONVERTED event type)
 *   - subscription_renewed  (RENEWAL event type)
 *
 * Setup in RevenueCat dashboard:
 *   Integrations → Webhooks → Add webhook → https://your-backend.com/webhooks/revenuecat
 *   Authorization header: set REVENUECAT_WEBHOOK_SECRET in your env
 *
 * RevenueCat event docs: https://www.revenuecat.com/docs/webhooks
 */

import express from 'express';
import { trackTrialConverted, trackSubscriptionRenewed } from '../services/apptroveService.js';

const router = express.Router();

const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error('[RevenueCat Webhook] WARNING: REVENUECAT_WEBHOOK_SECRET is not set — webhook endpoint is open to anyone. Set this env var immediately.');
}

// POST /webhooks/revenuecat
router.post('/', (req, res) => {
  // Always verify shared secret — reject if not configured (fail-secure)
  if (!WEBHOOK_SECRET) {
    console.error('[RevenueCat Webhook] Rejected — REVENUECAT_WEBHOOK_SECRET not configured');
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  const authHeader = req.headers['authorization'];
  if (authHeader !== WEBHOOK_SECRET) {
    console.warn('[RevenueCat Webhook] Rejected — invalid authorization header');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body?.event;
  if (!event) {
    return res.status(400).json({ error: 'Missing event payload' });
  }

  // Acknowledge immediately — RevenueCat expects a fast 2xx response
  res.status(200).json({ received: true });

  // Process asynchronously so we don't block the HTTP response
  setImmediate(() => handleRevenueCatEvent(event));
});

async function handleRevenueCatEvent(event) {
  const type = event.type;
  const appUserId = event.app_user_id || event.aliases?.[0];
  const productId = event.product_id;
  const transactionId = event.transaction_id;
  const price = event.price;
  const currency = event.currency;
  const store = event.store; // PLAY_STORE or APP_STORE
  const countryCode = event.country_code;
  const entitlementId = event.entitlement_ids?.[0];

  console.log(`[RevenueCat Webhook] Received event type: ${type} for user: ${appUserId}`);

  switch (type) {
    case 'TRIAL_CONVERTED':
      await trackTrialConverted({
        userId: appUserId,
        productId,
        transactionId,
        amount: price,
        currency,
        store,
        country: countryCode,
      });
      break;

    case 'RENEWAL':
      await trackSubscriptionRenewed({
        userId: appUserId,
        productId,
        transactionId,
        amount: price,
        currency,
        store,
        country: countryCode,
        entitlementId,
      });
      break;

    default:
      // Other event types (INITIAL_PURCHASE, CANCELLATION, etc.) handled by mobile client
      console.log(`[RevenueCat Webhook] Skipping untracked event type: ${type}`);
  }
}

export default router;
