/**
 * Free (non-purchasing) users: total effective mining power cannot exceed this (Gh/s),
 * regardless of ads, streaks, mini-games, or other rewards.
 * Anyone with purchasedHashpower > 0 is uncapped on the client display/earn rate.
 */
export const MAX_FREE_USER_TOTAL_HASHPOWER_GH = 400;

export function capFreeUserTotalMiningPowerGh(
  rawTotalGh: number,
  purchasedHashpowerGh: number
): number {
  if (!Number.isFinite(rawTotalGh)) return 0;
  if (purchasedHashpowerGh > 0) return rawTotalGh;
  return Math.min(MAX_FREE_USER_TOTAL_HASHPOWER_GH, Math.max(0, rawTotalGh));
}
