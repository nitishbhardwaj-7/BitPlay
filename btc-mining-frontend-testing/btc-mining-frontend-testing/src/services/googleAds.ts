import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';
import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
} from 'react-native-google-mobile-ads';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { DEFAULT_ADMOB_REWARDED_ID } from './adUnitDefaults';
import {
  trackAdFailedToLoad,
} from './apptroveAnalytics';

export type RewardedVideoOptions = {
  /** AdMob rewarded from API (`rewardedVideoId`), else {@link DEFAULT_ADMOB_REWARDED_ID}. */
  primaryUnitId?: string | null;
};

const initializeGoogleAds = async () => {
  await mobileAds().setRequestConfiguration({
    maxAdContentRating: MaxAdContentRating.PG,
  });
  await mobileAds().initialize();
};

/**
 * Backoff between load retries after a failed request, in ms. Repeats the last
 * value indefinitely.
 *
 * A rewarded request failing with `no-fill` is routine on a real device once a
 * user has watched a few ads -- fill is never guaranteed. Before this, a single
 * failure was terminal: ERROR left the ad unloaded and nothing retried, so the
 * button said "still loading" until the app was killed and the hook remounted.
 */
const RETRY_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/** If a load neither succeeds nor errors within this, rebuild the request. */
const LOAD_WATCHDOG_MS = 45_000;

type Subscriber = {
  onReward?: (amount: number, type: string) => void;
  onClosed?: () => void;
  notify: () => void;
};

/**
 * One in-flight rewarded ad per ad unit, shared by every screen asking for it.
 *
 * Each `useRewardedVideoAd` call used to own a private RewardedAd, so a single
 * game screen fired two identical requests (claim + retry) and Home fired
 * three. Measured on a device: four requests for the same unit inside one
 * second. Beyond the waste, it makes thin inventory look worse than it is --
 * two requests competing for the same scarce fill, where one cached ad would
 * have served whichever button the user actually pressed.
 *
 * Rewards and close events are routed ONLY to the subscriber that called
 * show() (the `presenter`), so sharing an instance never crosses the claim and
 * retry callbacks over.
 */
type AdSlot = {
  unitId: string;
  ad: RewardedAd | null;
  loaded: boolean;
  loading: boolean;
  retry: number;
  /** Bumped on every rebuild so a stale instance's events are ignored. */
  generation: number;
  timers: Set<ReturnType<typeof setTimeout>>;
  unsubs: Array<() => void>;
  subs: Set<Subscriber>;
  presenter: Subscriber | null;
};

const slots = new Map<string, AdSlot>();

function getSlot(unitId: string): AdSlot {
  let slot = slots.get(unitId);
  if (!slot) {
    slot = {
      unitId, ad: null, loaded: false, loading: true, retry: 0, generation: 0,
      timers: new Set(), unsubs: [], subs: new Set(), presenter: null,
    };
    slots.set(unitId, slot);
  }
  return slot;
}

function notify(slot: AdSlot) {
  slot.subs.forEach(sub => sub.notify());
}

function clearTimers(slot: AdSlot) {
  slot.timers.forEach(clearTimeout);
  slot.timers.clear();
}

function schedule(slot: AdSlot, fn: () => void, ms: number) {
  const timer = setTimeout(() => {
    slot.timers.delete(timer);
    fn();
  }, ms);
  slot.timers.add(timer);
}

function detach(slot: AdSlot) {
  slot.unsubs.forEach(u => { try { u(); } catch { /* already gone */ } });
  slot.unsubs = [];
  slot.ad = null;
}

/** Builds a fresh RewardedAd for the slot and requests an ad. */
function build(slot: AdSlot) {
  // Nothing on screen wants this unit; don't churn in the background.
  if (slot.subs.size === 0) return;
  clearTimers(slot);
  detach(slot);

  const generation = ++slot.generation;
  const isStale = () => slot.generation !== generation;

  const ad = RewardedAd.createForAdRequest(slot.unitId);
  slot.ad = ad;
  slot.loaded = false;
  slot.loading = true;
  notify(slot);

  slot.unsubs = [
    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      if (isStale()) return;
      slot.retry = 0;
      slot.loaded = true;
      slot.loading = false;
      notify(slot);
    }),
    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, reward => {
      if (isStale()) return;
      slot.presenter?.onReward?.(reward.amount, reward.type);
    }),
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      if (isStale()) return;
      const presenter = slot.presenter;
      slot.presenter = null;
      slot.loaded = false;
      slot.loading = true;
      notify(slot);
      presenter?.onClosed?.();
      // Don't rebuild synchronously: the ad's native Activity is still tearing
      // down and control is still returning to MainActivity. Doing it
      // immediately is a known trigger for the Activity transition getting
      // stuck (app appears frozen, close/back stop responding) on some Android
      // devices. A short delay lets the transition finish first.
      schedule(slot, () => build(slot), 500);
    }),
    ad.addAdEventListener(AdEventType.ERROR, error => {
      if (isStale()) return;
      slot.loaded = false;
      slot.loading = false;
      notify(slot);
      trackAdFailedToLoad(slot.unitId, String((error as any)?.code ?? 'unknown'));
      // Keep trying. Fill often returns on its own a little later, and the
      // alternative is a button that never works again this session.
      const delay = RETRY_BACKOFF_MS[Math.min(slot.retry, RETRY_BACKOFF_MS.length - 1)];
      slot.retry += 1;
      schedule(slot, () => build(slot), delay);
    }),
  ];

  // Belt and braces: if the request neither loads nor errors, rebuild.
  schedule(slot, () => { if (!isStale()) build(slot); }, LOAD_WATCHDOG_MS);

  ad.load();
}

// Coming back to the foreground is the other natural moment to try again --
// and it is what users do by hand when the button stops working.
let appStateBound = false;
function bindAppState() {
  if (appStateBound) return;
  appStateBound = true;
  AppState.addEventListener('change', state => {
    if (state !== 'active') return;
    slots.forEach(slot => {
      if (slot.subs.size === 0 || slot.loaded || slot.presenter) return;
      slot.retry = 0;
      build(slot);
    });
  });
}

export function useRewardedVideoAd(
  onReward?: (amount: number, type: string) => void,
  options?: RewardedVideoOptions,
  onAdClosed?: () => void,
) {
  const admobId =
    (options?.primaryUnitId && options.primaryUnitId.trim()) ||
    DEFAULT_ADMOB_REWARDED_ID;

  const [, forceRender] = useState(0);
  const onRewardRef = useRef(onReward);
  onRewardRef.current = onReward;
  const onAdClosedRef = useRef(onAdClosed);
  onAdClosedRef.current = onAdClosed;
  const subRef = useRef<Subscriber | null>(null);

  useEffect(() => {
    bindAppState();
    const slot = getSlot(admobId);
    const sub: Subscriber = {
      onReward: (amount, type) => onRewardRef.current?.(amount, type),
      onClosed: () => onAdClosedRef.current?.(),
      notify: () => forceRender(n => n + 1),
    };
    subRef.current = sub;
    slot.subs.add(sub);

    // First subscriber for this unit starts the request; later ones join the
    // one already in flight (or use the ad it already produced).
    if (!slot.ad) build(slot);

    return () => {
      slot.subs.delete(sub);
      if (slot.presenter === sub) slot.presenter = null;
      subRef.current = null;
      if (slot.subs.size === 0) {
        clearTimers(slot);
        detach(slot);
        slot.loaded = false;
        slot.loading = true;
        slot.retry = 0;
      }
    };
  }, [admobId]);

  const slot = getSlot(admobId);

  const show = useCallback(() => {
    const current = getSlot(admobId);
    const sub = subRef.current;
    if (!sub) return;
    if (!current.loaded || !current.ad || current.presenter) {
      // Not ready: make sure something is actually in flight rather than
      // leaving the user with a button that silently does nothing.
      current.retry = 0;
      build(current);
      return;
    }
    current.presenter = sub;
    current.loading = true;
    current.ad.show();
    notify(current);
  }, [admobId]);

  return { show, loading: slot.loading, loaded: slot.loaded };
}

/** @deprecated Use `useRewardedVideoAd` */
export const showRewardedAd = useRewardedVideoAd;

export { initializeGoogleAds };

/** @deprecated Use API `homeBannerId` + `DEFAULT_ADMOB_BANNER_ID` from `adUnitDefaults` */
export { DEFAULT_ADMOB_BANNER_ID as HOMEBANNER_AD_UNIT_ID } from './adUnitDefaults';
