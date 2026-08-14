import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import Purchases, { PurchasesStoreProduct } from 'react-native-purchases';
import axios from 'axios';
import { RootStackParamList } from '../components/types';
import { useAuth } from '../auth/AuthProvider';
import { get_data_uri, getMobileSecurityHeaders } from '../config/api';
import { PRIVILEGE_TIERS, PRIVILEGE_PRODUCT_IDS, getTierByProductId } from '../config/superPrivileges';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const SuperPrivilegesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();

  const [products, setProducts] = useState<PurchasesStoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingTier, setPurchasingTier] = useState<string | null>(null);
  const [activeTiers, setActiveTiers] = useState<Record<string, string>>({}); // tier -> expires_at
  const [effectiveMultiplier, setEffectiveMultiplier] = useState(1);

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

  const handlePurchase = async (tier: string, product: PurchasesStoreProduct) => {
    if (!user?.id) return;
    setPurchasingTier(tier);
    try {
      const { customerInfo, productIdentifier } = await Purchases.purchaseStoreProduct(product);

      const hasNonSubscriptionPurchase = customerInfo.nonSubscriptionTransactions.length > 0;
      const hasActiveEntitlements = Object.keys(customerInfo.entitlements.active).length > 0;
      const purchaseSuccessful = hasNonSubscriptionPurchase || hasActiveEntitlements;

      if (!purchaseSuccessful) {
        Alert.alert('Purchase Not Completed', 'Please try again.');
        return;
      }

      const tierConfig = getTierByProductId(productIdentifier);
      const payload = {
        tier: tierConfig?.tier ?? tier,
        product_identifier: productIdentifier,
        revenuecat_customer_id: customerInfo?.originalAppUserId || 'dummy',
        price_paid: product.price,
        currency: product.currencyCode,
        purchase_date: new Date().toISOString(),
      };

      const res = await axios.post(`${get_data_uri('PRIVILEGES')}/${user.id}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...getMobileSecurityHeaders(),
        },
      });

      if (res.data?.success) {
        setEffectiveMultiplier(res.data.effective_multiplier ?? effectiveMultiplier);
        await fetchActivePrivileges();
        Alert.alert('Privilege Activated', `Your Super Ad Miner is now boosted by ${effectiveMultiplier}x.`);
      }
    } catch (err: any) {
      if (err?.userCancelled) return;
      console.error('[SuperPrivileges] Purchase failed:', err);
      Alert.alert('Purchase Failed', err?.message || 'Something went wrong. Please try again.');
    } finally {
      setPurchasingTier(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Super Privileges Store</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22D3EE" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Current Super Ad Miner Boost</Text>
            <Text style={styles.summaryValue}>{effectiveMultiplier}x</Text>
          </View>

          {PRIVILEGE_TIERS.map(tierConfig => {
            const product = products.find(p => p.identifier === tierConfig.productId);
            const isActive = !!activeTiers[tierConfig.tier];
            const isPurchasing = purchasingTier === tierConfig.tier;

            return (
              <View key={tierConfig.tier} style={styles.tierCard}>
                <View style={styles.tierBadge}>
                  <Text style={styles.tierBadgeText}>{tierConfig.label}</Text>
                </View>
                <Text style={styles.tierSubtitle}>1 Year</Text>
                <Text style={styles.tierPrice}>
                  {product ? product.priceString : '—'}
                </Text>

                {isActive ? (
                  <View style={[styles.claimButton, styles.claimButtonActive]}>
                    <Text style={styles.claimButtonText}>Active</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.claimButton}
                    disabled={!product || isPurchasing}
                    onPress={() => product && handlePurchase(tierConfig.tier, product)}
                  >
                    {isPurchasing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.claimButtonText}>Claim</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

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
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  summaryCard: {
    backgroundColor: '#1A202C',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  summaryLabel: { color: '#94A3B8', fontSize: 13 },
  summaryValue: { color: '#22D3EE', fontSize: 28, fontWeight: '800', marginTop: 4 },
  tierCard: {
    backgroundColor: '#1A202C',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  tierBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  tierBadgeText: { color: '#FBBF24', fontWeight: '700', fontSize: 14 },
  tierSubtitle: { color: '#94A3B8', fontSize: 13, marginBottom: 4 },
  tierPrice: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  claimButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  claimButtonActive: { backgroundColor: '#16A34A' },
  claimButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  aboutCard: {
    backgroundColor: '#1A202C',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  aboutTitle: { color: '#22D3EE', fontWeight: '700', fontSize: 15, marginBottom: 10 },
  aboutText: { color: '#CBD5E1', fontSize: 13, lineHeight: 20, marginBottom: 8 },
});

export default SuperPrivilegesScreen;
