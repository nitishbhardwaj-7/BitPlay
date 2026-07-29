import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Animated, Dimensions, Platform, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import LinearGradient from 'react-native-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { StatusBar } from 'react-native';
import { RootStackParamList } from '../components/types';
import { get_data_uri, getMobileSecurityHeaders } from '../config/api';
import { BannerAdWithGamFallback } from '../components/ads/BannerAdWithGamFallback';
import { BannerAdSize } from 'react-native-google-mobile-ads';
import { DEFAULT_ADMOB_BANNER_ID } from '../services/adUnitDefaults';
import { trackProductSearch, trackSearch } from '../services/apptroveAnalytics';

type Nav = StackNavigationProp<RootStackParamList>;
const { width: W } = Dimensions.get('window');

interface GameEntry {
  name: string;
  icon: string;
  iconImage?: any;
  color: string;
  gradient: [string, string];
  route: keyof RootStackParamList;
  category: string;
  desc: string;
  emoji: string;
}

const GAMES: GameEntry[] = [
  { name: 'BTC Trading', icon: 'bitcoin', iconImage: require('../assets/images/icon_btc_trading.png'), color: '#f59e0b', gradient: ['#f59e0b', '#d97706'], route: 'TradingScreen', category: 'Featured', desc: 'Trade BTC and earn rewards', emoji: '₿' },
  { name: 'Spin & Win', icon: 'rotate-3d-variant', iconImage: require('../assets/images/icon_spin_win.png'), color: '#22d3ee', gradient: ['#0e7490', '#164e63'], route: 'SpinAndWin', category: 'Featured', desc: 'Spin the wheel, win rewards', emoji: '🎡' },
  { name: 'Memory Match', icon: 'cards', iconImage: require('../assets/images/icon_memory_match.png'), color: '#7c3aed', gradient: ['#7c3aed', '#6d28d9'], route: 'MemoryCardMatch', category: 'Featured', desc: 'Match all the pairs', emoji: '🃏' },
];

const CATEGORIES = [
  { key: 'All', emoji: '🎮' },
  { key: 'Featured', emoji: '⭐' },
];

interface PopularGame {
  gameName: string;
  totalSessions: number;
  uniquePlayers: number;
  popularityScore: number;
}

function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
    ])).start();
  }, [anim]);
  return (
    <Animated.View style={[sk.card, { opacity: anim }]}>
      <View style={sk.iconBox} />
      <View style={sk.line1} />
      <View style={sk.line2} />
    </Animated.View>
  );
}

const sk = StyleSheet.create({
  card: { width: '47%', backgroundColor: '#1e293b', borderRadius: 16, padding: 14, marginBottom: 14 },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#334155', marginBottom: 10 },
  line1: { height: 14, backgroundColor: '#334155', borderRadius: 6, marginBottom: 6, width: '70%' },
  line2: { height: 10, backgroundColor: '#2d3748', borderRadius: 6, width: '90%' },
});

export default function GameZoneScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [popular, setPopular] = useState<PopularGame[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (text.trim().length >= 2) {
      searchDebounceRef.current = setTimeout(() => {
        const matches = GAMES.filter(g => g.name.toLowerCase().includes(text.toLowerCase())).length;
        trackProductSearch(text, matches);
        trackSearch(text, matches);
      }, 800);
    }
  }, []);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const gridAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(gridAnim, { toValue: 1, duration: 700, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const fetchPopular = useCallback(async () => {
    try {
      const url = `${get_data_uri('GAME_SESSIONS_POPULAR')}?limit=30`;
      const res = await fetch(url, { headers: getMobileSecurityHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.popular)) {
        setPopular(data.popular.slice(0, 3));
        const counts: Record<string, number> = {};
        data.popular.forEach((g: PopularGame) => { counts[g.gameName] = g.totalSessions; });
        setSessionCounts(counts);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchPopular(); }, [fetchPopular]));

  const hotNames = new Set(popular.map(g => g.gameName));
  const filtered = GAMES.filter(g => {
    const matchCat = activeCategory === 'All' || g.category === activeCategory;
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={styles.gradient}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>

        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <View style={styles.backCircle}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#f8fafc" />
            </View>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>🎮 Game Zone</Text>
            <Text style={styles.headerSub}>{GAMES.length} games · win GH/s</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeTxt}>{GAMES.length}</Text>
          </View>
        </Animated.View>

        {/* Banner Ad below header, outside ScrollView for reliable rendering */}
        <View style={styles.bannerTop}>
          <BannerAdWithGamFallback
            primaryUnitId={DEFAULT_ADMOB_BANNER_ID}
            size={BannerAdSize.ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

          {/* Hot / Popular section */}
          {(loading || popular.length > 0) && (
            <View style={styles.hotSection}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>🔥 Most Played This Month</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hotRow}>
                {loading ? (
                  [0, 1, 2].map(i => (
                    <View key={i} style={styles.hotCardSkeleton}>
                      <Animated.View style={{ flex: 1, opacity: headerAnim }} />
                    </View>
                  ))
                ) : popular.map((p, idx) => {
                  const game = GAMES.find(g => g.name === p.gameName);
                  if (!game) return null;
                  return (
                    <TouchableOpacity
                      key={game.route}
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate(game.route as any)}
                    >
                      <LinearGradient
                        colors={[game.gradient[0] + 'cc', game.gradient[1] + 'cc']}
                        style={styles.hotCard}
                      >
                        <View style={styles.hotMedal}>
                          <Text style={styles.hotMedalTxt}>{MEDAL[idx]}</Text>
                        </View>
                        <View style={[styles.hotIconBg, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                          <MaterialCommunityIcons name={game.icon} size={28} color="#fff" />
                        </View>
                        <Text style={styles.hotName} numberOfLines={1}>{game.name}</Text>
                        <Text style={styles.hotPlays}>{p.totalSessions.toLocaleString()} plays</Text>
                        <View style={styles.playNowBadge}>
                          <Text style={styles.playNowTxt}>PLAY</Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Search */}
          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color="#64748b" style={styles.searchIcon} />
            <TextInput
              style={styles.search}
              placeholder="Search games..."
              placeholderTextColor="#475569"
              value={search}
              onChangeText={handleSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <MaterialCommunityIcons name="close-circle" size={16} color="#64748b" />
              </TouchableOpacity>
            )}
          </View>

          {/* Category filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catRow}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={[styles.catChip, activeCategory === cat.key && styles.catChipActive]}
                onPress={() => setActiveCategory(cat.key)}
                activeOpacity={0.75}
              >
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <Text style={[styles.catText, activeCategory === cat.key && styles.catTextActive]}>
                  {cat.key}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Section label */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>
              {activeCategory === 'All' ? '🕹️ All Games' : `${CATEGORIES.find(c => c.key === activeCategory)?.emoji} ${activeCategory}`}
            </Text>
            <Text style={styles.sectionCount}>{filtered.length} games</Text>
          </View>

          {/* Game grid */}
          <Animated.View style={[styles.grid, { opacity: gridAnim, transform: [{ translateY: gridAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
            {loading ? (
              <View style={styles.skeletonRow}>
                {[0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
              </View>
            ) : (
              <View style={styles.cardRow}>
                {filtered.map(game => {
                  const isHot = hotNames.has(game.name);
                  const plays = sessionCounts[game.name];
                  return (
                    <TouchableOpacity
                      key={game.route}
                      style={styles.card}
                      activeOpacity={0.82}
                      onPress={() => navigation.navigate(game.route as any)}
                    >
                      {/* Top color bar */}
                      <LinearGradient colors={[game.gradient[0], game.gradient[1]]} style={styles.cardTopBar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />

                      {/* HOT badge */}
                      {isHot && (
                        <View style={styles.hotBadge}>
                          <Text style={styles.hotBadgeTxt}>🔥</Text>
                        </View>
                      )}

                      {/* Icon */}
                      <View style={[styles.iconBox, { backgroundColor: '#0a0f1d', borderWidth: 1, borderColor: '#d97706', overflow: 'hidden' }]}>
                        {game.iconImage ? (
                          <Image source={game.iconImage} style={{ width: '100%', height: '100%', borderRadius: 10 }} resizeMode="cover" />
                        ) : (
                          <MaterialCommunityIcons name={game.icon} size={26} color={game.color} />
                        )}
                      </View>

                      <Text style={styles.cardName} numberOfLines={1}>{game.name}</Text>
                      <Text style={styles.cardDesc} numberOfLines={2}>{game.desc}</Text>

                      <View style={styles.cardFooter}>
                        <View style={[styles.catTag, { backgroundColor: game.color + '15' }]}>
                          <Text style={[styles.catTagTxt, { color: game.color }]}>{game.emoji}</Text>
                        </View>
                        {plays != null && plays > 0 && (
                          <Text style={styles.playsText}>{plays >= 1000 ? `${(plays / 1000).toFixed(1)}k` : plays} plays</Text>
                        )}
                      </View>

                      <View style={styles.playArrow}>
                        <MaterialCommunityIcons name="play-circle-outline" size={18} color={game.color} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {!loading && filtered.length === 0 && (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No games found</Text>
                <Text style={styles.emptyDesc}>Try a different search or category</Text>
                <TouchableOpacity style={styles.clearBtn} onPress={() => { setSearch(''); setActiveCategory('All'); }}>
                  <Text style={styles.clearBtnTxt}>Clear filters</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Bottom banner ad */}
        <View style={[styles.bottomBanner, { paddingBottom: insets.bottom || 8 }]}>
          <BannerAdWithGamFallback
            primaryUnitId={DEFAULT_ADMOB_BANNER_ID}
            size={BannerAdSize.ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: { padding: 4, marginRight: 10 },
  backCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#f8fafc', letterSpacing: 0.3 },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 1 },
  countBadge: {
    backgroundColor: '#22d3ee', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  countBadgeTxt: { color: '#0f172a', fontWeight: '900', fontSize: 13 },

  bannerTop: { alignItems: 'center', marginVertical: 4 },

  hotSection: { paddingTop: 16, paddingHorizontal: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10, marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#f59e0b' },
  sectionCount: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  hotRow: { flexDirection: 'row', gap: 12, paddingBottom: 4 },
  hotCard: {
    width: 130, borderRadius: 16, padding: 14, alignItems: 'center',
    position: 'relative', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  hotCardSkeleton: { width: 130, height: 150, borderRadius: 16, backgroundColor: '#1e293b' },
  hotMedal: { position: 'absolute', top: 8, left: 8 },
  hotMedalTxt: { fontSize: 18 },
  hotIconBg: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  hotName: { fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 2 },
  hotPlays: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  playNowBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  playNowTxt: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },

  searchWrap: {
    marginHorizontal: 16, marginVertical: 10,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e293b', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 4,
    borderWidth: 1, borderColor: '#334155',
  },
  searchIcon: { marginRight: 8 },
  search: { flex: 1, color: '#f8fafc', fontSize: 14 },

  catScroll: { maxHeight: 48 },
  catRow: { paddingHorizontal: 16, paddingVertical: 4, gap: 8, flexDirection: 'row' },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#1e293b',
    borderWidth: 1, borderColor: '#334155',
  },
  catChipActive: { backgroundColor: '#22d3ee', borderColor: '#22d3ee' },
  catEmoji: { fontSize: 12 },
  catText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  catTextActive: { color: '#0f172a', fontWeight: '700' },

  grid: { paddingHorizontal: 12, paddingTop: 4 },
  skeletonRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    width: '47%', backgroundColor: '#1e293b', borderRadius: 16,
    marginBottom: 14, overflow: 'hidden', position: 'relative',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
    paddingHorizontal: 12, paddingBottom: 12, paddingTop: 16,
  },
  cardTopBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  hotBadge: { position: 'absolute', top: 8, right: 8 },
  hotBadgeTxt: { fontSize: 14 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  cardName: { fontSize: 14, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  cardDesc: { fontSize: 11, color: '#64748b', lineHeight: 16, marginBottom: 10, flex: 1 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catTag: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  catTagTxt: { fontSize: 14 },
  playsText: { fontSize: 10, color: '#475569', fontWeight: '600' },
  playArrow: { position: 'absolute', bottom: 10, right: 10 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc', marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  clearBtn: { backgroundColor: '#22d3ee', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  clearBtnTxt: { color: '#0f172a', fontWeight: '700', fontSize: 14 },

  bottomBanner: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center',
  },
});
