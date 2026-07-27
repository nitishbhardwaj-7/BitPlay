import { ApptroveSDK, ApptroveEvent } from 'react-native-apptrove';

// ─── Event ID constants ────────────────────────────────────────────────────
// The Apptrove SDK (Trackier-based) requires SHORT ALPHANUMERIC IDs for ALL
// events — both predefined catalog IDs and custom dashboard-assigned IDs.
// Event names ('first_open', 'mining_started') are NEVER sent to the SDK.
// Custom event IDs below come from: Apptrove Dashboard → Events → your event → ID column.
const EVENTS = {
  // ─── Apptrove PREDEFINED catalog IDs (standard — same for all accounts) ───
  LOGIN: 'o91gt1Q0PK',
  SIGNUP: '8ASKXJ1vWO',
  REGISTER: '719qCHiv66',
  REGISTRATION: '5I5oZAYZL8',
  LOGOUT: 'pr1kg0PakC',
  SCREEN_VIEW: '0zrztVO54t',
  UPDATE: 'sEQWVHGThl',
  ACHIEVEMENT_UNLOCK: 'xTPvxWuNqm',
  CONTENT_VIEW: 'Jwzois1ays',
  INVITE: '7lnE3OclNT',
  SHARE: 'dxZXGG1qqL',
  VIEW_ITEM_LIST: 'xLo5iOmEUm',
  VIEW_ITEM: 'XLdSodqgld',
  PRODUCT_VIEW: '8MvPg9POkj',
  SELECT_ITEM: '5f0BML6LDg',
  BEGIN_CHECKOUT: 'rbJmUiy8vZ',
  CHECKOUT_STARTED: '34mjlWJaHL',
  CHECKOUT_COMPLETED: '0i9U00nN6p',
  SEARCH: 'mH6sqU7t6u',
  PRODUCT_SEARCH: 'MtXCvY3Bdu',
  APPLY_COUPON: 'AR1argJ9TD',
  REMOVE_COUPON: 'tpJ8NfA1Iv',
  REMOVE_FROM_WISHLIST: 'XyrCtDCVFg',

  // ─── Custom events — dashboard-assigned IDs (Apptrove Dashboard → Events → ID column) ───
  FIRST_OPEN: 'IyaWj0QKSR',
  APP_OPEN: 'xxBpmyOpEv',
  SESSION_START: 'rdl9TwwGyb',
  SESSION_END: 'iCTR16tFOU',
  SIGNUP_COMPLETED_CUSTOM: 'XD54QdsWkN',
  LOGIN_CUSTOM: '7I76gNev5a',
  ONBOARDING_COMPLETED: 'oDZ5TfSDDL',
  NOTIFICATION_RECEIVED: 'jtjp54pbbI',
  NOTIFICATION_CLICKED: '2IWxZ7gNQq',
  PAYMENT_INITIATED: 'bEz4vA3Hvn',
  PAYMENT_FAILED: 'NNYzmvDy1y',
  PAYWALL_VIEWED: 'vvh2DnPBEQ',
  TRIAL_STARTED: 'rPorHRNpdE',
  TRIAL_CONVERTED: 'trial_converted',
  SUBSCRIPTION_STARTED: 'MkksdgwUdK',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  SUBSCRIPTION_CANCELLED: 'UuxE5YgJeJ',
  SUBSCRIPTION_EXPIRED: 'Td8su8wru4',
  PURCHASE_RESTORED: 'dgJ42d23E7',
  INVITE_CLICKED: '50kpKFMyjH',
  INVITE_SHARED_CUSTOM: 'NwoWI3fi4C',
  REFERRAL_REWARD_CLAIMED: 'referral_reward_claimed',
  MINING_STARTED: 'BtBEVKSX3z',
  MINING_STOPPED: 'FS9MuAn2eO',
  DAILY_REWARD_CLAIMED: '408DPuqUHo',
  WITHDRAWAL_REQUESTED: 'P2TiRqB0DL',
  DEPOSIT_COMPLETED: 'Re5w6qUacf',
  AD_WATCH_STARTED: 'ad_watch_started',
  AD_WATCH_COMPLETED: 'ad_watch_completed',
  AD_WATCH_SKIPPED: 'ad_watch_skipped',
  AD_REQUEST: 'Pby9Zcme7g',
  AD_LOADED: '36zHuFe3aA',
  AD_FAILED_TO_LOAD: '98eXaGdP5G',
  AD_IMPRESSION: '9XSKFHOKto',
  AD_CLICKED: 'OfNMisPP2F',
  AD_REVENUE_PAID: 'AnykZ0r0hA',
  AD_CLOSED: '2sgX6f8rDz',
  SCREEN_HOLD: 'screen_hold',
} as const;

function safeTrack(event: ApptroveEvent): void {
  try {
    ApptroveSDK.trackEvent(event);
  } catch (err) {
    if (__DEV__) {
      console.warn(`[Apptrove] trackEvent failed for "${event.eventId}":`, err);
    }
  }
}

// ─── Existing events ───────────────────────────────────────────────────────

export function trackScreenHold(screenName: string, holdDurationMs: number): void {
  const event = new ApptroveEvent(EVENTS.SCREEN_HOLD);
  event.param1 = screenName;
  event.param2 = String(holdDurationMs);
  safeTrack(event);
}

export function trackAdWatchStarted(screenName: string): void {
  const event = new ApptroveEvent(EVENTS.AD_WATCH_STARTED);
  event.param1 = 'rewarded';
  event.param2 = screenName;
  safeTrack(event);
}

export function trackAdWatchCompleted(screenName: string, rewardAmount: number): void {
  const event = new ApptroveEvent(EVENTS.AD_WATCH_COMPLETED);
  event.param1 = 'rewarded';
  event.param2 = screenName;
  event.revenue = rewardAmount;
  safeTrack(event);
}

export function trackAdWatchSkipped(screenName: string): void {
  const event = new ApptroveEvent(EVENTS.AD_WATCH_SKIPPED);
  event.param1 = 'rewarded';
  event.param2 = screenName;
  safeTrack(event);
}

// ─── New events ────────────────────────────────────────────────────────────

/** Fired once ever on first install launch. param1 = platform. */
export function trackFirstOpen(platform: string): void {
  try {
    ApptroveSDK.fireInstall();
  } catch (e) {}
  const event = new ApptroveEvent(EVENTS.FIRST_OPEN);
  event.param1 = platform;
  safeTrack(event);
}

/**
 * Fired after successful account creation.
 * param1 = user_id, param2 = signup method ('email' | 'google' | 'apple').
 */
export function trackSignupCompleted(userId: string, method: string = 'email'): void {
  ApptroveSDK.setUserId(userId);
  // Fire custom event + all Apptrove predefined signup IDs + SDK native constant
  [
    EVENTS.SIGNUP_COMPLETED_CUSTOM,
    EVENTS.SIGNUP,
    EVENTS.REGISTER,
    EVENTS.REGISTRATION,
    ApptroveEvent.COMPLETE_REGISTRATION, // SDK native constant — ensures ✅ in dashboard
  ].forEach(id => {
    const event = new ApptroveEvent(id);
    event.param1 = userId;
    event.param2 = method;
    safeTrack(event);
  });
}

/**
 * Fired on every successful login — fires both custom name + Apptrove predefined Login ID.
 */
export function trackLogin(userId: string, method: string = 'email'): void {
  ApptroveSDK.setUserId(userId);
  [EVENTS.LOGIN, EVENTS.LOGIN_CUSTOM].forEach(id => {
    const event = new ApptroveEvent(id);
    event.param1 = userId;
    event.param2 = method;
    safeTrack(event);
  });
}

/** Fired when user logs out — uses Apptrove predefined Logout event ID. */
export function trackLogout(userId: string): void {
  const event = new ApptroveEvent(EVENTS.LOGOUT);
  event.param1 = userId;
  safeTrack(event);
}

/** Fired when user saves profile changes — uses Apptrove predefined Update event ID. */
export function trackProfileUpdate(userId: string, fieldsChanged: string): void {
  // Custom ID + SDK native constant — ensures ✅ in dashboard
  [EVENTS.UPDATE, ApptroveEvent.UPDATE].forEach(id => {
    const event = new ApptroveEvent(id);
    event.param1 = userId;
    event.param2 = fieldsChanged;
    safeTrack(event);
  });
}

/** Fired on achievements (daily reward, milestones) — uses Apptrove predefined Achievement unlock ID. */
export function trackAchievementUnlock(achievementName: string, value?: number): void {
  // Custom ID + SDK native constant — ensures ✅ in dashboard
  [EVENTS.ACHIEVEMENT_UNLOCK, ApptroveEvent.ACHIEVEMENT_UNLOCKED].forEach(id => {
    const event = new ApptroveEvent(id);
    event.param1 = achievementName;
    if (value !== undefined) event.revenue = value;
    safeTrack(event);
  });
}

/** Fired when user views news/announcements — uses Apptrove predefined Content view ID. */
export function trackContentView(contentId: string, contentType: string): void {
  // Custom ID + SDK native constant — ensures ✅ in dashboard
  [EVENTS.CONTENT_VIEW, ApptroveEvent.CONTENT_VIEW].forEach(id => {
    const event = new ApptroveEvent(id);
    event.param1 = contentId;
    event.param2 = contentType;
    safeTrack(event);
  });
}

/** Fired after successful purchase — uses Apptrove predefined Checkout completed ID. */
export function trackCheckoutCompleted(itemId: string, itemName: string, price: number, currency: string = 'USD'): void {
  const event = new ApptroveEvent(EVENTS.CHECKOUT_COMPLETED);
  event.param1 = itemId;
  event.param2 = itemName;
  event.revenue = price;
  event.currency = currency;
  safeTrack(event);
}

/** Fired on search — fires both Apptrove predefined Search + Product Search IDs. */
export function trackSearch(query: string, resultCount: number): void {
  [EVENTS.SEARCH, EVENTS.PRODUCT_SEARCH].forEach(id => {
    const event = new ApptroveEvent(id);
    event.param1 = query;
    event.param2 = String(resultCount);
    safeTrack(event);
  });
}

/** Fired when the user completes onboarding and reaches the main app. */
export function trackOnboardingCompleted(userId: string): void {
  const event = new ApptroveEvent(EVENTS.ONBOARDING_COMPLETED);
  event.param1 = userId;
  safeTrack(event);
}

/**
 * Fired when a push notification opens the app.
 * param1 = notification type, param2 = user_id (if known).
 */
export function trackNotificationClicked(notificationType: string, userId?: string): void {
  const event = new ApptroveEvent(EVENTS.NOTIFICATION_CLICKED);
  event.param1 = notificationType;
  if (userId) event.param2 = userId;
  safeTrack(event);
}

/**
 * Fired when a crypto/bank payment order is submitted successfully.
 * param1 = plan_id, param2 = payment method, revenue = USD amount.
 */
export function trackPaymentInitiated(planId: string, paymentMethod: string, amountUsd: number): void {
  const event = new ApptroveEvent(EVENTS.PAYMENT_INITIATED);
  event.param1 = planId;
  event.param2 = paymentMethod;
  event.revenue = amountUsd;
  event.currency = 'USD';
  safeTrack(event);
}

/**
 * Fired after a successful in-app purchase via RevenueCat.
 * param1 = plan name, param2 = product identifier, revenue = price paid.
 */
export function trackSubscriptionStarted(
  planName: string,
  productIdentifier: string,
  price: number,
  currency: string,
): void {
  // Custom subscription event
  const ev1 = new ApptroveEvent(EVENTS.SUBSCRIPTION_STARTED);
  ev1.param1 = planName;
  ev1.param2 = productIdentifier;
  ev1.revenue = price;
  ev1.currency = currency;
  safeTrack(ev1);
  // SDK native PURCHASE + SUBSCRIBE constants — ensures ✅ in Apptrove dashboard
  [ApptroveEvent.PURCHASE, ApptroveEvent.SUBSCRIBE].forEach(id => {
    const ev = new ApptroveEvent(id);
    ev.param1 = planName;
    ev.param2 = productIdentifier;
    ev.revenue = price;
    ev.currency = currency;
    safeTrack(ev);
  });
}

/**
 * Fired after the user successfully shares their referral invite.
 * param1 = referral code, param2 = share channel (activityType or 'direct').
 */
export function trackInviteShared(referralCode: string, channel: string = 'direct'): void {
  // Fire custom + predefined IDs + SDK native constants for ✅ in dashboard
  [
    EVENTS.INVITE_SHARED_CUSTOM,
    EVENTS.SHARE,
    EVENTS.INVITE,
    ApptroveEvent.SHARE,   // SDK native constant
    ApptroveEvent.INVITE,  // SDK native constant
  ].forEach(id => {
    const event = new ApptroveEvent(id);
    event.param1 = referralCode;
    event.param2 = channel;
    safeTrack(event);
  });
}

// ─── AdMob lifecycle events ────────────────────────────────────────────────

export function trackAdRequest(adUnitId: string, adFormat: string = 'rewarded'): void {
  const event = new ApptroveEvent(EVENTS.AD_REQUEST);
  event.param1 = adUnitId;
  event.param2 = adFormat;
  safeTrack(event);
}

export function trackAdLoaded(adUnitId: string, adFormat: string = 'rewarded'): void {
  const event = new ApptroveEvent(EVENTS.AD_LOADED);
  event.param1 = adUnitId;
  event.param2 = adFormat;
  safeTrack(event);
}

export function trackAdFailedToLoad(adUnitId: string, errorCode: string = 'unknown'): void {
  const event = new ApptroveEvent(EVENTS.AD_FAILED_TO_LOAD);
  event.param1 = adUnitId;
  event.param2 = errorCode;
  safeTrack(event);
}

export function trackAdImpression(adUnitId: string, adFormat: string = 'rewarded'): void {
  const event = new ApptroveEvent(EVENTS.AD_IMPRESSION);
  event.param1 = adUnitId;
  event.param2 = adFormat;
  safeTrack(event);
}

export function trackAdClicked(adUnitId: string, adFormat: string = 'rewarded'): void {
  const event = new ApptroveEvent(EVENTS.AD_CLICKED);
  event.param1 = adUnitId;
  event.param2 = adFormat;
  safeTrack(event);
}

export function trackAdRevenuePaid(adUnitId: string, revenue: number, currency: string = 'USD', mediationNetwork: string = 'admob'): void {
  const event = new ApptroveEvent(EVENTS.AD_REVENUE_PAID);
  event.param1 = adUnitId;
  event.param2 = mediationNetwork;
  event.revenue = revenue;
  event.currency = currency;
  safeTrack(event);
}

export function trackAdClosed(adUnitId: string, adFormat: string = 'rewarded'): void {
  const event = new ApptroveEvent(EVENTS.AD_CLOSED);
  event.param1 = adUnitId;
  event.param2 = adFormat;
  safeTrack(event);
}

// ─── App lifecycle events ──────────────────────────────────────────────────

export function trackAppOpen(platform: string): void {
  const event = new ApptroveEvent(EVENTS.APP_OPEN);
  event.param1 = platform;
  safeTrack(event);
}

export function trackSessionStart(sessionId: string, platform: string): void {
  const event = new ApptroveEvent(EVENTS.SESSION_START);
  event.param1 = sessionId;
  event.param2 = platform;
  safeTrack(event);
}

export function trackSessionEnd(sessionId: string, durationSeconds: number): void {
  const event = new ApptroveEvent(EVENTS.SESSION_END);
  event.param1 = sessionId;
  event.param2 = String(Math.round(durationSeconds));
  safeTrack(event);
}

// ─── Notification events ───────────────────────────────────────────────────

export function trackNotificationReceived(notificationType: string): void {
  const event = new ApptroveEvent(EVENTS.NOTIFICATION_RECEIVED);
  event.param1 = notificationType;
  safeTrack(event);
}

// ─── RevenueCat subscription events ───────────────────────────────────────

export function trackPaywallViewed(planCount: number): void {
  const event = new ApptroveEvent(EVENTS.PAYWALL_VIEWED);
  event.param1 = String(planCount);
  safeTrack(event);
}

export function trackPaymentFailed(productId: string, errorCode: string): void {
  const event = new ApptroveEvent(EVENTS.PAYMENT_FAILED);
  event.param1 = productId;
  event.param2 = errorCode;
  safeTrack(event);
}

export function trackTrialStarted(productId: string, planName: string): void {
  // Custom trial event
  const ev1 = new ApptroveEvent(EVENTS.TRIAL_STARTED);
  ev1.param1 = productId;
  ev1.param2 = planName;
  safeTrack(ev1);
  // SDK native START_TRIAL constant — ensures ✅ in Apptrove dashboard
  const ev2 = new ApptroveEvent(ApptroveEvent.START_TRIAL);
  ev2.param1 = productId;
  ev2.param2 = planName;
  safeTrack(ev2);
}

export function trackTrialConverted(productId: string, price: number, currency: string): void {
  const event = new ApptroveEvent(EVENTS.TRIAL_CONVERTED);
  event.param1 = productId;
  event.revenue = price;
  event.currency = currency;
  safeTrack(event);
}

export function trackSubscriptionRenewed(productId: string, price: number, currency: string): void {
  const event = new ApptroveEvent(EVENTS.SUBSCRIPTION_RENEWED);
  event.param1 = productId;
  event.revenue = price;
  event.currency = currency;
  safeTrack(event);
}

export function trackSubscriptionCancelled(productId: string): void {
  const event = new ApptroveEvent(EVENTS.SUBSCRIPTION_CANCELLED);
  event.param1 = productId;
  safeTrack(event);
}

export function trackSubscriptionExpired(productId: string): void {
  const event = new ApptroveEvent(EVENTS.SUBSCRIPTION_EXPIRED);
  event.param1 = productId;
  safeTrack(event);
}

export function trackPurchaseRestored(entitlementCount: number): void {
  const event = new ApptroveEvent(EVENTS.PURCHASE_RESTORED);
  event.param1 = String(entitlementCount);
  safeTrack(event);
}

// ─── Referral events ───────────────────────────────────────────────────────

export function trackInviteClicked(referralCode: string): void {
  const event = new ApptroveEvent(EVENTS.INVITE_CLICKED);
  event.param1 = referralCode;
  safeTrack(event);
}

export function trackReferralRewardClaimed(rewardAmount: number, rewardType: string): void {
  const event = new ApptroveEvent(EVENTS.REFERRAL_REWARD_CLAIMED);
  event.param1 = rewardType;
  event.revenue = rewardAmount;
  safeTrack(event);
}

// ─── Mining events ─────────────────────────────────────────────────────────

export function trackMiningStarted(hashPowerGh: number, userId: string): void {
  const event = new ApptroveEvent(EVENTS.MINING_STARTED);
  event.param1 = userId;
  event.param2 = String(hashPowerGh);
  safeTrack(event);
}

export function trackMiningStopped(hashPowerGh: number, userId: string): void {
  const event = new ApptroveEvent(EVENTS.MINING_STOPPED);
  event.param1 = userId;
  event.param2 = String(hashPowerGh);
  safeTrack(event);
}

export function trackDailyRewardClaimed(rewardType: string, amountGh: number, userId: string): void {
  const event = new ApptroveEvent(EVENTS.DAILY_REWARD_CLAIMED);
  event.param1 = userId;
  event.param2 = rewardType;
  event.revenue = amountGh;
  safeTrack(event);
  // Also fire Apptrove predefined Achievement unlock
  trackAchievementUnlock(`daily_reward_${rewardType}`, amountGh);
}

export function trackWithdrawalRequested(method: string, amountBtc: number, userId: string): void {
  const event = new ApptroveEvent(EVENTS.WITHDRAWAL_REQUESTED);
  event.param1 = userId;
  event.param2 = method;
  event.revenue = amountBtc;
  event.currency = 'BTC';
  safeTrack(event);
}

export function trackDepositCompleted(amountBtc: number, userId: string): void {
  const event = new ApptroveEvent(EVENTS.DEPOSIT_COMPLETED);
  event.param1 = userId;
  event.revenue = amountBtc;
  event.currency = 'BTC';
  safeTrack(event);
}

// ─── Apptrove dashboard events (exact IDs from Apptrove account) ─────────────

/** Fire on every screen navigation. param1 = screen name. */
export function trackScreenView(screenName: string): void {
  const event = new ApptroveEvent(EVENTS.SCREEN_VIEW);
  event.param1 = screenName;
  safeTrack(event);
}

/** Fire on signup — Apptrove event ID 8ASKXJ1vWO. param1 = user_id, param2 = method. */
export function trackSignupEvent(userId: string, method: string = 'email'): void {
  const event = new ApptroveEvent(EVENTS.SIGNUP);
  event.param1 = userId;
  event.param2 = method;
  safeTrack(event);
}

/** Fire when a product/plan list is displayed. param1 = list name. */
export function trackViewItemList(listName: string, itemCount: number): void {
  const event = new ApptroveEvent(EVENTS.VIEW_ITEM_LIST);
  event.param1 = listName;
  event.param2 = String(itemCount);
  safeTrack(event);
}

/** Fire when a user views a specific product/plan — fires VIEW_ITEM + PRODUCT_VIEW predefined IDs. */
export function trackViewItem(itemId: string, itemName: string, price: number, currency: string = 'USD'): void {
  [EVENTS.VIEW_ITEM, EVENTS.PRODUCT_VIEW].forEach(id => {
    const event = new ApptroveEvent(id);
    event.param1 = itemId;
    event.param2 = itemName;
    event.revenue = price;
    event.currency = currency;
    safeTrack(event);
  });
}

/** Fire when a user selects/taps a specific product/plan. param1 = item_id, param2 = item_name. */
export function trackSelectItem(itemId: string, itemName: string, price: number, currency: string = 'USD'): void {
  const event = new ApptroveEvent(EVENTS.SELECT_ITEM);
  event.param1 = itemId;
  event.param2 = itemName;
  event.revenue = price;
  event.currency = currency;
  safeTrack(event);
}

/** Fire when a user initiates checkout/purchase — fires BEGIN_CHECKOUT + CHECKOUT_STARTED predefined IDs. */
export function trackBeginCheckout(itemId: string, itemName: string, price: number, currency: string = 'USD'): void {
  [EVENTS.BEGIN_CHECKOUT, EVENTS.CHECKOUT_STARTED].forEach(id => {
    const event = new ApptroveEvent(id);
    event.param1 = itemId;
    event.param2 = itemName;
    event.revenue = price;
    event.currency = currency;
    safeTrack(event);
  });
}

/** Fire when a user searches for a product/game. param1 = query, param2 = result_count. */
export function trackProductSearch(query: string, resultCount: number): void {
  if (!query || query.trim().length < 2) return;
  const event = new ApptroveEvent(EVENTS.PRODUCT_SEARCH);
  event.param1 = query.trim().toLowerCase();
  event.param2 = String(resultCount);
  safeTrack(event);
}

/** Fire when a coupon is applied. param1 = coupon_code. */
export function trackApplyCoupon(couponCode: string): void {
  const event = new ApptroveEvent(EVENTS.APPLY_COUPON);
  event.param1 = couponCode;
  safeTrack(event);
}

/** Fire when a coupon is removed. param1 = coupon_code. */
export function trackRemoveCoupon(couponCode: string): void {
  const event = new ApptroveEvent(EVENTS.REMOVE_COUPON);
  event.param1 = couponCode;
  safeTrack(event);
}

/** Fire when a user removes an item from their wishlist. param1 = item_id, param2 = item_name. */
export function trackRemoveFromWishlist(itemId: string, itemName: string): void {
  const event = new ApptroveEvent(EVENTS.REMOVE_FROM_WISHLIST);
  event.param1 = itemId;
  event.param2 = itemName;
  safeTrack(event);
}
