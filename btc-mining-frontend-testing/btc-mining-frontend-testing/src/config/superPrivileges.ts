import { Platform } from 'react-native';

/**
 * "Super Privileges" — one-time-purchase (renewable annually), stacking
 * multipliers on the special ad-watch track's per-claim reward.
 * Store side: Android = Consumable one-time product, iOS = Non-Renewing
 * Subscription. Both are "products only" in RevenueCat (no Offering), so
 * they're fetched directly via Purchases.getProducts(), not getOfferings().
 *
 * Keep `tier` and `multiplier` in sync with the backend's TIER_CATALOG in
 * routes/api_routes/privileges.js.
 */
export type PrivilegeTier = '5000pct' | '10000pct';

export type PrivilegeTierConfig = {
  tier: PrivilegeTier;
  multiplier: number; // factor added to the base 1x, e.g. 50 for +5000%
  label: string; // display label, e.g. "+5000%"
  productId: string; // platform-specific store identifier
};

export const PRIVILEGE_TIERS: PrivilegeTierConfig[] = [
  {
    tier: '5000pct',
    multiplier: 50,
    label: '+5000%',
    productId: Platform.select({
      android: 'bitplay.super_privilege_5000pct:super-privilege-5000pct-offer',
      ios: 'com.bitplaypro.bitplaypro.super_privilegeplan_5000pct',
    })!,
  },
  {
    tier: '10000pct',
    multiplier: 100,
    label: '+10000%',
    productId: Platform.select({
      android: 'bitplay.super_privilege_10000pct:super-privilege-10000pct-offer',
      ios: 'com.bitplaypro.bitplaypro.super_privilegeplan_10000pct',
    })!,
  },
];

export const PRIVILEGE_PRODUCT_IDS = PRIVILEGE_TIERS.map(t => t.productId);

export function getTierByProductId(productId: string): PrivilegeTierConfig | undefined {
  return PRIVILEGE_TIERS.find(t => t.productId === productId);
}
