import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

export type BannerAdWithGamFallbackProps = {
  primaryUnitId: string;
  size: BannerAdSize;
  requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
  onAdFailedToLoad?: (error: Error) => void;
  onAllFailed?: (error?: Error) => void;
};

export function BannerAdWithGamFallback({
  primaryUnitId,
  size,
  requestOptions = { requestNonPersonalizedAdsOnly: true },
  onAdFailedToLoad,
  onAllFailed,
}: BannerAdWithGamFallbackProps) {
  const [adState, setAdState] = useState<'loading' | 'loaded' | 'failed'>('loading');

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
          unitId={primaryUnitId}
          size={size}
          requestOptions={requestOptions}
          onAdLoaded={() => setAdState('loaded')}
          onAdFailedToLoad={(error) => {
            setAdState('failed');
            onAdFailedToLoad?.(error);
            onAllFailed?.(error);
          }}
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
