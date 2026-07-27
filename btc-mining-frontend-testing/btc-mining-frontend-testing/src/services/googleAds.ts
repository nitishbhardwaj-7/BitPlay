import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';
import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
} from 'react-native-google-mobile-ads';
import { useEffect, useState, useCallback, useRef } from 'react';
import { DEFAULT_ADMOB_REWARDED_ID } from './adUnitDefaults';
import {
  trackAdWatchStarted,
  trackAdWatchCompleted,
  trackAdWatchSkipped,
  trackAdRequest,
  trackAdLoaded,
  trackAdFailedToLoad,
  trackAdImpression,
  trackAdClicked,
  trackAdRevenuePaid,
  trackAdClosed,
} from './apptroveAnalytics';
import { navigationRef } from '../../App';

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

  useEffect(() => {
    const instance = RewardedAd.createForAdRequest(admobId);
    instanceRef.current = instance;
    setLoaded(false);
    setLoading(true);
    trackAdRequest(admobId);

    const unsubLoaded = instance.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        setLoaded(true);
        setLoading(false);
        trackAdLoaded(admobId);
      }
    );
    const unsubEarned = instance.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      (reward) => {
        earnedRef.current = true;
        const screen = navigationRef.getCurrentRoute()?.name ?? 'Unknown';
        trackAdWatchCompleted(screen, reward.amount);
        onRewardRef.current?.(reward.amount, reward.type);
      }
    );
    const unsubOpened = instance.addAdEventListener(AdEventType.OPENED, () => {
      trackAdImpression(admobId);
    });
    const unsubClicked = instance.addAdEventListener(AdEventType.CLICKED, () => {
      trackAdClicked(admobId);
    });
    const unsubClosed = instance.addAdEventListener(AdEventType.CLOSED, () => {
      const didEarn = earnedRef.current;
      earnedRef.current = false;
      trackAdClosed(admobId);
      setLoaded(false);
      setLoading(true);
      instance.load();
      trackAdRequest(admobId);
      if (!didEarn) {
        const screen = navigationRef.getCurrentRoute()?.name ?? 'Unknown';
        trackAdWatchSkipped(screen);
      }
      onAdClosedRef.current?.();
    });
    const unsubError = instance.addAdEventListener(AdEventType.ERROR, (error) => {
      setLoading(false);
      setLoaded(false);
      trackAdFailedToLoad(admobId, String(error?.code ?? 'unknown'));
    });
    // Track actual ad revenue when Google Mobile Ads reports it
    const unsubPaid = (instance as any).addAdEventListener?.('paid', (event: any) => {
      if (event?.value != null) {
        trackAdRevenuePaid(admobId, event.value / 1_000_000, event.currencyCode ?? 'USD', event.precisionType ?? 'admob');
      }
    }) ?? (() => {});

    instance.load();

    return () => {
      unsubLoaded();
      unsubEarned();
      unsubOpened();
      unsubClicked();
      unsubClosed();
      unsubError();
      unsubPaid();
      instanceRef.current = null;
    };
  }, [admobId]);

  const show = useCallback(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (!loaded) {
      setLoading(true);
      instance.load();
      return;
    }
    const screen = navigationRef.getCurrentRoute()?.name ?? 'Unknown';
    trackAdWatchStarted(screen);
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
