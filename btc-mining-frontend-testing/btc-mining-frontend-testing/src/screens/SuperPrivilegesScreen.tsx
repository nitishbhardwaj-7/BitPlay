import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  Dimensions,
} from 'react-native';
// react-native's own SafeAreaView is a no-op on Android (iOS only) — always use
// react-native-safe-area-context here, same as HomeScreen/GameZoneScreen do.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Purchases, { PurchasesStoreProduct } from 'react-native-purchases';
import { BannerAdSize } from 'react-native-google-mobile-ads';
import axios from 'axios';
import { RootStackParamList } from '../components/types';
import { useAuth } from '../auth/AuthProvider';
import { useAdConfig } from '../providers/AdConfigProvider';
import { BannerAdWithGamFallback } from '../components/ads/BannerAdWithGamFallback';
import { DEFAULT_ADMOB_BANNER_ID } from '../services/adUnitDefaults';
import { get_data_uri, getMobileSecurityHeaders } from '../config/api';
import { PRIVILEGE_TIERS, PRIVILEGE_PRODUCT_IDS, getTierByProductId, BASE_HASHPOWER_PER_AD } from '../config/superPrivileges';

type NavigationProp = StackNavigationProp<RootStackParamList>;

// Match the app's primary CTA gradient (same as Store.tsx's Mint button).
const PRIMARY_GRADIENT: [string, string] = ['#22D3EE', '#C084FC'];

const SuperPrivilegesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { ads } = useAdConfig();

  const [products, setProducts] = useState<PurchasesStoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [activeTiers, setActiveTiers] = useState<Record<string, string>>({}); // tier -> expires_at
  const [effectiveMultiplier, setEffectiveMultiplier] = useState(1);
  const [selectedTierKey, setSelectedTierKey] = useState<string>(PRIVILEGE_TIERS[0].tier);

  // Same banner-ad fallback pattern as HomeScreen: on total failure, show the
  // static fallback image for 60s before retrying the real ad.
  const [bannerAdError, setBannerAdError] = useState(false);
  useEffect(() => {
    if (!bannerAdError) return;
    const timer = setTimeout(() => setBannerAdError(false), 60000);
    return () => clearTimeout(timer);
  }, [bannerAdError]);

  const selectedTierConfig = PRIVILEGE_TIERS.find(t => t.tier === selectedTierKey) ?? PRIVILEGE_TIERS[0];
  const selectedProduct = products.find(p => p.identifier === selectedTierConfig.productId);
  const selectedIsActive = !!activeTiers[selectedTierConfig.tier];
  const selectedBoostedGh = BASE_HASHPOWER_PER_AD * selectedTierConfig.multiplier;
  const selectedPctLabel = selectedTierConfig.label.replace('+', '');

  const fetchProducts = useCallback(async () => {
    try {
      const storeProducts = await Purchases.getProducts(PRIVILEGE_PRODUCT_IDS);
      setProducts(storeProducts);
    } catch (err) {
      console.warn('[SuperPrivileges] Failed to fetch products:', err);
    }
  }, []);

  const fetchActivePrivileges = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await axios.get(`${get_data_uri('PRIVILEGES')}/${user.id}`, {
        headers: getMobileSecurityHeaders(),
      });
      if (res.data?.success) {
        setEffectiveMultiplier(res.data.effective_multiplier ?? 1);
        const map: Record<string, string> = {};
        (res.data.privileges ?? []).forEach((p: any) => {
          map[p.tier] = p.expires_at;
        });
        setActiveTiers(map);
      }
    } catch (err) {
      console.warn('[SuperPrivileges] Failed to fetch active privileges:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchProducts(), fetchActivePrivileges()]);
      setLoading(false);
    };
    init();
  }, [fetchProducts, fetchActivePrivileges]);

  const handleClaim = async () => {
    if (!user?.id || !selectedProduct || selectedIsActive) return;
    setPurchasing(true);
    try {
      const { customerInfo, productIdentifier } = await Purchases.purchaseStoreProduct(selectedProduct);

      const hasNonSubscriptionPurchase = customerInfo.nonSubscriptionTransactions.length > 0;
      const hasActiveEntitlements = Object.keys(customerInfo.entitlements.active).length > 0;
      const purchaseSuccessful = hasNonSubscriptionPurchase || hasActiveEntitlements;

      if (!purchaseSuccessful) {
        Alert.alert('Purchase Not Completed', 'Please try again.');
        return;
      }

      const tierConfig = getTierByProductId(productIdentifier);
      const payload = {
        tier: tierConfig?.tier ?? selectedTierConfig.tier,
        product_identifier: productIdentifier,
        revenuecat_customer_id: customerInfo?.originalAppUserId || 'dummy',
        price_paid: selectedProduct.price,
        currency: selectedProduct.currencyCode,
        purchase_date: new Date().toISOString(),
      };

      const res = await axios.post(`${get_data_uri('PRIVILEGES')}/${user.id}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...getMobileSecurityHeaders(),
        },
      });

      if (res.data?.success) {
        const newMultiplier = res.data.effective_multiplier ?? effectiveMultiplier;
        setEffectiveMultiplier(newMultiplier);
        await fetchActivePrivileges();
        Alert.alert('Privilege Activated', `Your Super Ad Miner is now boosted by ${newMultiplier}x.`);
      }
    } catch (err: any) {
      if (err?.userCancelled) return;
      console.error('[SuperPrivileges] Purchase failed:', err);
      Alert.alert('Purchase Failed', err?.message || 'Something went wrong. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Super Privileges Store</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22D3EE" />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Summary card — reflects whichever tier is currently selected below */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryLeft}>
                <View style={styles.summaryHeadlineRow}>
                  <Text style={styles.summaryHeadlineValue}>
                    {selectedBoostedGh.toFixed(selectedBoostedGh % 1 === 0 ? 0 : 2)}
                    <Text style={styles.summaryHeadlineUnit}> Gh/s</Text>
                  </Text>
                </View>
                <View style={styles.summaryBadge}>
                  <Text style={styles.summaryBadgeText}>{selectedTierConfig.label}</Text>
                </View>
                <Text style={styles.summaryFormula}>
                  ={BASE_HASHPOWER_PER_AD.toFixed(2)}Gh/s x {selectedPctLabel}
                </Text>
              </View>
              <Image
                source={require('../assets/images/daily_reward_icon.png')}
                style={styles.summaryIcon}
                resizeMode="contain"
              />
            </View>

            {/* Tier selector chips */}
            <View style={styles.tierRow}>
              {PRIVILEGE_TIERS.map(tierConfig => {
                const isSelected = tierConfig.tier === selectedTierKey;
                const isActive = !!activeTiers[tierConfig.tier];
                const product = products.find(p => p.identifier === tierConfig.productId);
                return (
                  <TouchableOpacity
                    key={tierConfig.tier}
                    style={[styles.tierChip, isSelected && styles.tierChipSelected]}
                    activeOpacity={0.85}
                    onPress={() => setSelectedTierKey(tierConfig.tier)}
                  >
                    <Text style={[styles.tierChipLabel, isSelected && styles.tierChipLabelSelected]}>
                      {tierConfig.label}
                    </Text>
                    <Text style={[styles.tierChipSubtitle, isSelected && styles.tierChipSubtitleSelected]}>
                      1 Year
                    </Text>
                    <Text style={[styles.tierChipPrice, isSelected && styles.tierChipPriceSelected]}>
                      {isActive ? 'Active' : product ? product.priceString : '—'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.aboutCard}>
              <Text style={styles.aboutTitle}>About Super Privileges</Text>
              <Text style={styles.aboutText}>
                1. You are purchasing bonus privileges that enhance the Super Ad Miner, obtained by watching ads — not included in this purchase.
              </Text>
              <Text style={styles.aboutText}>
                2. These privileges only increase the hashrate of the Super Ad Miner.
              </Text>
              <Text style={styles.aboutText}>
                3. Each privilege is valid for one year from the date of purchase.
              </Text>
              <Text style={styles.aboutText}>
                4. Once a privilege expires, it can be purchased again. Multiple privileges can be stacked.
              </Text>
            </View>
          </ScrollView>

          {/* Banner ad — same component/fallback pattern as HomeScreen */}
          <View style={styles.bannerContainer}>
            {bannerAdError ? (
              <TouchableOpacity onPress={() => Linking.openURL('https://thecaphevietnam.com/')}>
                <Image
                  source={require('../assets/images/addbanner.png')}
                  style={{ width: Dimensions.get('window').width, height: 60, resizeMode: 'stretch' }}
                />
              </TouchableOpacity>
            ) : (
              <BannerAdWithGamFallback
                primaryUnitId={ads.homeBannerId ?? DEFAULT_ADMOB_BANNER_ID}
                size={BannerAdSize.ADAPTIVE_BANNER}
                onAdFailedToLoad={(error) => {
                  console.warn('[SuperPrivileges] Banner ad failed to load:', error);
                }}
                onAllFailed={() => setBannerAdError(true)}
              />
            )}
          </View>

          {/* Fixed bottom Claim button — acts on whichever tier is selected above */}
          <View style={styles.bottomBar}>
            {selectedIsActive ? (
              <View style={styles.claimButtonActive}>
                <Icon name="checkmark-circle" size={18} color="#22C55E" />
                <Text style={styles.claimButtonActiveText}>Active</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.claimButtonWrap}
                disabled={!selectedProduct || purchasing}
                activeOpacity={0.9}
                onPress={handleClaim}
              >
                <LinearGradient
                  colors={PRIMARY_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.claimButtonGradient, !selectedProduct && styles.claimButtonDisabled]}
                >
                  {purchasing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.claimButtonText}>Claim</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  topBarTitle: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.2 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  summaryLeft: { flex: 1 },
  summaryHeadlineRow: { flexDirection: 'row', alignItems: 'baseline' },
  summaryHeadlineValue: { color: '#fff', fontSize: 26, fontWeight: '800' },
  summaryHeadlineUnit: { color: '#94A3B8', fontSize: 15, fontWeight: '600' },
  summaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FBBF24',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  summaryBadgeText: { color: '#1E293B', fontWeight: '700', fontSize: 12 },
  summaryFormula: { color: '#94A3B8', fontSize: 13, marginTop: 8 },
  summaryIcon: { width: 64, height: 64, marginLeft: 12 },

  tierRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  tierChip: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tierChipSelected: { backgroundColor: '#2563EB', borderColor: '#3B82F6' },
  tierChipLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tierChipLabelSelected: { color: '#fff' },
  tierChipSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  tierChipSubtitleSelected: { color: 'rgba(255,255,255,0.8)' },
  tierChipPrice: { color: '#fff', fontWeight: '700', fontSize: 16, marginTop: 10 },
  tierChipPriceSelected: { color: '#fff' },

  aboutCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  aboutTitle: { color: '#22D3EE', fontWeight: '700', fontSize: 15, marginBottom: 10 },
  aboutText: { color: '#CBD5E1', fontSize: 13, lineHeight: 20, marginBottom: 8 },

  bannerContainer: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  bottomBar: { paddingHorizontal: 16, paddingVertical: 14 },
  claimButtonWrap: { borderRadius: 12, overflow: 'hidden' },
  claimButtonGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  claimButtonDisabled: { opacity: 0.5 },
  claimButtonText: { color: '#0F172A', fontWeight: '700', fontSize: 16 },
  claimButtonActive: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimButtonActiveText: { color: '#22C55E', fontWeight: '700', fontSize: 16 },
});

export default SuperPrivilegesScreen;
