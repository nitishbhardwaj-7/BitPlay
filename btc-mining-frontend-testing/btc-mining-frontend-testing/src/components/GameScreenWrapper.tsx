import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { BannerAdWithGamFallback } from './ads/BannerAdWithGamFallback';
import { BannerAdSize } from 'react-native-google-mobile-ads';
import { DEFAULT_ADMOB_BANNER_ID } from '../services/adUnitDefaults';

interface Props {
  title: string;
  iconName: string;
  iconColor: string;
  children: React.ReactNode;
  rightContent?: React.ReactNode;
  gradientColors?: string[];
  scrollable?: boolean;
}

export default function GameScreenWrapper({
  title,
  iconName,
  iconColor,
  children,
  rightContent,
  gradientColors = ['#0f172a', '#1e1b4b', '#0f172a'],
  scrollable = true,
}: Props) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" translucent={false} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <View style={styles.backCircle}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#f8fafc" />
            </View>
          </TouchableOpacity>

          <View style={styles.titleWrap}>
            <View style={[styles.iconBadge, { backgroundColor: iconColor + '22', borderColor: iconColor + '44' }]}>
              <MaterialCommunityIcons name={iconName} size={18} color={iconColor} />
            </View>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>

          <View style={styles.rightSlot}>
            {rightContent ?? null}
          </View>
        </View>

        {/* Top banner ad — loads immediately, skeleton shown until ready */}
        <View style={styles.topBannerWrap}>
          <BannerAdWithGamFallback
            primaryUnitId={DEFAULT_ADMOB_BANNER_ID}
            size={BannerAdSize.BANNER}
          />
        </View>

        {/* Game content */}
        {scrollable ? (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.contentInner]}>
            {children}
          </View>
        )}

        {/* Bottom banner ad pinned above safe area */}
        <View style={[styles.bannerWrap, { paddingBottom: insets.bottom || 8 }]}>
          <BannerAdWithGamFallback
            primaryUnitId={DEFAULT_ADMOB_BANNER_ID}
            size={BannerAdSize.ADAPTIVE_BANNER}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: { padding: 4 },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: 0.2,
    flex: 1,
  },
  rightSlot: { width: 44, alignItems: 'flex-end' },
  topBannerWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  content: { flex: 1 },
  contentInner: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  bannerWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
});
