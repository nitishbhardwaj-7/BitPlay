import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

export type BannerAdWithGamFallbackProps = {
  primaryUnitId: string;
  size: BannerAdSize;
  requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
  onAdFailedToLoad?: (error: Error) => void;
  onAllFailed?: (error?: Error) => void;
};

/**
 * Retry schedule (ms) after a failed load. AdMob's most common banner failure
 * is NO_FILL, which is transient -- inventory that isn't available now often is
 * a minute later. Previously a single failure permanently blanked the slot for
 * the life of the mount, so a screen that happened to ask during a no-fill
 * window showed no ad at all until the user navigated away and back. Backs off
 * so a genuinely dead unit isn't hammered.
 */
const RETRY_DELAYS_MS = [20_000, 45_000, 90_000, 180_000];

export function BannerAdWithGamFallback({
  primaryUnitId,
  size,
  // No forced NPA-only default — once AdsConsent.gatherConsent() (App.tsx) has
  // run, the SDK reads the on-device TCF consent signal automatically and
  // requests personalized ads where the user/region allows it. Only pass
  // requestOptions explicitly if you need to force a specific behavior.
  requestOptions,
  onAdFailedToLoad,
  onAllFailed,
}: BannerAdWithGamFallbackProps) {
  const [adState, setAdState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  // Bumping this remounts <BannerAd/>, which is what actually issues a fresh
  // ad request -- calling load() again on the same instance is not exposed.
  const [attempt, setAttempt] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  // A changed unit id is a different ad slot entirely -- reset back to loading
  // so a previously-failed slot doesn't stay collapsed under the new id.
  useEffect(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setAdState('loading');
    setAttempt(0);
  }, [primaryUnitId]);

  const handleFailed = useCallback((error: Error) => {
    console.warn(
      `[BannerAd] Failed to load unitId=${primaryUnitId} attempt=${attempt}: ` +
      `code=${(error as any)?.code} message=${error?.message}`,
    );
    setAdState('failed');
    onAdFailedToLoad?.(error);

    const delay = RETRY_DELAYS_MS[attempt];
    if (delay != null) {
      retryTimerRef.current = setTimeout(() => {
        setAttempt(a => a + 1);
        setAdState('loading');
      }, delay);
    } else {
      // Retries exhausted -- only now is this slot really considered dead, so
      // screens with their own static-image fallback swap to it at this point
      // rather than after a single transient no-fill.
      onAllFailed?.(error);
    }
  }, [primaryUnitId, attempt, onAdFailedToLoad, onAllFailed]);

  // Collapse the slot while failed so it never leaves an empty gap; a pending
  // retry will flip this back to 'loading' and re-render the ad.
  if (adState === 'failed') return null;

  return (
    <View style={styles.container}>
      {/* Skeleton while ad is loading */}
      {adState === 'loading' && (
        <View style={styles.skeleton}>
          <View style={styles.skeletonBar} />
        </View>
      )}

      {/* Ad is always mounted so it starts loading immediately; hidden until ready */}
      <View style={adState === 'loading' ? styles.hidden : styles.visible}>
        <BannerAd
          key={`${primaryUnitId}:${attempt}`}
          unitId={primaryUnitId}
          size={size}
          requestOptions={requestOptions}
          onAdLoaded={() => setAdState('loaded')}
          onAdFailedToLoad={handleFailed}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', minHeight: 52 },
  skeleton: {
    width: '100%',
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonBar: {
    width: '55%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
  },
  hidden: { position: 'absolute', opacity: 0 },
  visible: {},
});
