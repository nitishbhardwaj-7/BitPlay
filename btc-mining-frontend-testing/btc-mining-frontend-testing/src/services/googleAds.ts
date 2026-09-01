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
 * failure was terminal: ERROR left `loaded` false and nothing ever retried, so
 * the button said "still loading" until the app was killed and the hook
 * remounted. That is the "after 2 or 3 ads, ads stop loading, restart fixes it"
 * report.
 */
const RETRY_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/** If a load neither succeeds nor errors within this, rebuild the instance. */
const LOAD_WATCHDOG_MS = 45_000;

export function useRewardedVideoAd(
  onReward?: (amount: number, type: string) => void,
  options?: RewardedVideoOptions,
  onAdClosed?: () => void,
) {
  const admobId =
    (options?.primaryUnitId && options.primaryUnitId.trim()) ||
    DEFAULT_ADMOB_REWARDED_ID;

  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const instanceRef = useRef<RewardedAd | null>(null);
  const onRewardRef = useRef(onReward);
  onRewardRef.current = onReward;
  const onAdClosedRef = useRef(onAdClosed);
  onAdClosedRef.current = onAdClosed;
  const earnedRef = useRef(false);

  const mountedRef = useRef(true);
  const unsubsRef = useRef<Array<() => void>>([]);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const retryCountRef = useRef(0);
  /** Recreated on every load, so callbacks from a stale instance are ignored. */
  const generationRef = useRef(0);
  const buildRef = useRef<() => void>(() => {});

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timersRef.current = timersRef.current.filter(x => x !== t);
      if (mountedRef.current) fn();
    }, ms);
    timersRef.current.push(t);
  }, []);

  const teardownListeners = useCallback(() => {
    unsubsRef.current.forEach(u => { try { u(); } catch { /* already gone */ } });
    unsubsRef.current = [];
  }, []);

  /** Builds a fresh RewardedAd, wires it up and requests an ad. */
  const build = useCallback(() => {
    if (!mountedRef.current) return;
    clearTimers();
    teardownListeners();

    const generation = ++generationRef.current;
    const isStale = () => !mountedRef.current || generationRef.current !== generation;

    const instance = RewardedAd.createForAdRequest(admobId);
    instanceRef.current = instance;
    setLoaded(false);
    setLoading(true);

    unsubsRef.current = [
      instance.addAdEventListener(RewardedAdEventType.LOADED, () => {
        if (isStale()) return;
        retryCountRef.current = 0;
        setLoaded(true);
        setLoading(false);
      }),
      instance.addAdEventListener(RewardedAdEventType.EARNED_REWARD, reward => {
        if (isStale()) return;
        earnedRef.current = true;
        onRewardRef.current?.(reward.amount, reward.type);
      }),
      instance.addAdEventListener(AdEventType.CLOSED, () => {
        if (isStale()) return;
        earnedRef.current = false;
        setLoaded(false);
        setLoading(true);
        onAdClosedRef.current?.();
        // Don't rebuild synchronously here — the ad's native Activity is still
        // tearing down and control is still returning to MainActivity. Doing it
        // immediately is a known trigger for the Activity transition getting
        // stuck (app appears frozen, close/back stop responding) on some
        // Android devices. A short delay lets the transition finish first.
        later(() => buildRef.current(), 500);
      }),
      instance.addAdEventListener(AdEventType.ERROR, error => {
        if (isStale()) return;
        setLoaded(false);
        setLoading(false);
        trackAdFailedToLoad(admobId, String(error?.code ?? 'unknown'));
        // Keep trying. Fill often returns on its own a little later, and the
        // alternative is a button that never works again this session.
        const delay =
          RETRY_BACKOFF_MS[Math.min(retryCountRef.current, RETRY_BACKOFF_MS.length - 1)];
        retryCountRef.current += 1;
        later(() => buildRef.current(), delay);
      }),
    ];

    // Belt and braces: if the request neither loads nor errors, rebuild.
    later(() => {
      if (isStale()) return;
      if (!instanceRef.current) return;
      buildRef.current();
    }, LOAD_WATCHDOG_MS);

    instance.load();
  }, [admobId, clearTimers, later, teardownListeners]);

  buildRef.current = build;

  useEffect(() => {
    mountedRef.current = true;
    build();
    return () => {
      mountedRef.current = false;
      clearTimers();
      teardownListeners();
      instanceRef.current = null;
    };
  }, [build, clearTimers, teardownListeners]);

  const loadedRef = useRef(false);
  loadedRef.current = loaded;

  // Coming back to the foreground is the other natural moment to try again --
  // and it is what users do by hand when the button stops working.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' || !mountedRef.current) return;
      if (instanceRef.current && !loadedRef.current) {
        retryCountRef.current = 0;
        buildRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  const show = useCallback(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (!loaded) {
      // Not ready: make sure something is actually in flight rather than
      // leaving the user with a button that silently does nothing.
      setLoading(true);
      retryCountRef.current = 0;
      buildRef.current();
      return;
    }
    instance.show();
    setLoading(true);
  }, [loaded]);

  return { show, loading, loaded };
}

/** @deprecated Use `useRewardedVideoAd` */
export const showRewardedAd = useRewardedVideoAd;

export { initializeGoogleAds };

/** @deprecated Use API `homeBannerId` + `DEFAULT_ADMOB_BANNER_ID` from `adUnitDefaults` */
export { DEFAULT_ADMOB_BANNER_ID as HOMEBANNER_AD_UNIT_ID } from './adUnitDefaults';
