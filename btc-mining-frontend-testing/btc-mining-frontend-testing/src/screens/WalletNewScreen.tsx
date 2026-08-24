import {
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Text,
  View,
  BackHandler,
  Pressable,
} from 'react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import BalanceCard from '../components/NewWallet/BalanceCard';
import { useAuth } from '../auth/AuthProvider';
import { get_data_uri } from '../config/api';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../components/types';
import axios from 'axios';
import { Transaction } from '../types/transaction';
import TransactionHistory from '../components/NewWallet/TransactionHistory';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { getBtcUsdPriceCached } from '../services/btcPriceService';

type WalletNav = StackNavigationProp<RootStackParamList, 'Wallet'>;

async function getBTCPrice() {
  try {
    return await getBtcUsdPriceCached();
  } catch (err: any) {
    return 0;
  }
}

type WITHDRAW_OPTIONS = {
  id: number;
  name: 'BTC' | 'Lightning';
  method: 'Lightining' | 'BTC';
  subText: string;
};

const DEFAULT_MIN_BTC = 0.0000005;
const DEFAULT_MAX_BTC = 0.000009;

const withdrawMethods: (limits: { minBtc: number; maxBtc: number }) => WITHDRAW_OPTIONS[] = (
  limits,
) => [
  {
    id: 1,
    name: 'Lightning',
    subText: `${limits.minBtc} - ${limits.maxBtc} BTC`,
    method: 'Lightining',
  },
  {
    id: 2,
    name: 'BTC',
    subText: `${limits.minBtc} - ${limits.maxBtc} BTC`,
    method: 'BTC',
  },
];

const WalletNewScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<WalletNav>();

  const [btcBalance, setBtcBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [_balanceLoading, setBalanceLoading] = useState(false);
  const [showUSD, _setShowUSD] = useState(false);
  const [methodModal, setMethodModal] = useState(false);
  const [displayedBalance, setDisplayedBalance] =
    useState<string>('Loading...');
  const [withdrawalLimits, setWithdrawalLimits] = useState({
    minBtc: DEFAULT_MIN_BTC,
    maxBtc: DEFAULT_MAX_BTC,
  });

  /** ─── Fetch withdrawal limits (min/max BTC) ───────────── */
  const fetchWithdrawalLimits = useCallback(async () => {
    try {
      const res = await fetch(get_data_uri('GET_WITHDRAWAL_LIMITS'));
      const data = await res.json();
      if (res.ok && typeof data.minBtc === 'number' && typeof data.maxBtc === 'number') {
        setWithdrawalLimits({ minBtc: data.minBtc, maxBtc: data.maxBtc });
      }
    } catch (err) {
    }
  }, []);

  /** ─── Fetch BTC balance ─────────────────────────────── */
  const fetchBalance = useCallback(async () => {
    try {
      if (!user?.id) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      const res = await fetch(
        `${get_data_uri('GET_WALLET_BALANCE')}?userId=${user.id}`,
      );
      const data = await res.json();



      if (res.ok && data.balance) {
        const btcVal = parseFloat(
          data.balance.BTC?.$numberDecimal ?? data.balance.BTC ?? '0',
        );
        const btcValueDeposited = parseFloat(
          data.balance.BTC_DEPOSIT?.$numberDecimal ??
            data.balance.BTC_DEPOSIT ??
            '0',
        );
        setBtcBalance(btcVal + btcValueDeposited);
      }
    } catch (err) {
    }
  }, [user?.id, navigation]);

  /** ─── Fetch Transactions ───────────────────────────── */
  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch(`${get_data_uri('GET_TRANSACTIONS')}/${user.id}`);
      const data = await res.json();

      if (res.ok && Array.isArray(data.transactions)) {
        const txns: Transaction[] = data.transactions.map((txn: any) => ({
          type: txn.type,
          method: txn.method,
          date: txn.date,
          amountNumeric: txn.amount || txn.amountNumeric,
          isPositive: parseFloat(txn.amountNumeric?.$numberDecimal ?? '0') >= 0,
          status: txn?.status,
          credited: txn?.credited,
        }));
        setTransactions(txns);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      setTransactions([]);
    }
  }, [user?.id]);

  /** ─── Load Balance + Transactions + Limits ───────────── */
  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchBalance();
      await fetchTransactions();
      await fetchWithdrawalLimits();
    } catch (err) {
    } finally {
      setRefreshing(false);
    }
  }, [fetchBalance, fetchTransactions, fetchWithdrawalLimits]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** ─── Convert BTC to USD Display ──────────────────── */
  useEffect(() => {
    async function updateBalance() {
      const final_balance = btcBalance;
      if (showUSD) {
        setBalanceLoading(true);
        const price = await getBTCPrice();
        const dollar_balance = final_balance * price;
        setDisplayedBalance(`${dollar_balance.toFixed(2)}`);
        setBalanceLoading(false);
      } else {
        setDisplayedBalance(`${final_balance.toFixed(16)}`);
      }
    }
    updateBalance();
  }, [btcBalance, showUSD]);

  const onRefresh = async () => loadData();

  /** ─── Withdraw Actions ─────────────────────────────── */
  const handleWithdraw = () => {
    Vibration.vibrate([0, 100, 200]);
    setMethodModal(true);
  };

  const handleWithdrawSelect = (method: 'BTC' | 'Lightining') => {
    Vibration.vibrate([0, 100, 200]);
    setMethodModal(false);
    navigation.navigate('WithdrawScreen', { method });
  };

  /** ─── Android Back Button Modal Close ──────────────── */
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (methodModal) {
        setMethodModal(false);
        return true;
      }
      return false;
    });

    return () => listener.remove();
  }, [methodModal]);

  /** ─── UI ───────────────────────────────────────────── */
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ffffffff"
          />
        }
        contentContainerStyle={styles.scrollViewContentContainer}
      >
        <BalanceCard
          balance={displayedBalance}
          showUSd={showUSD}
          handleButtonPress={handleWithdraw}
          buttonText="Withdraw"
        />

        <TouchableOpacity
          style={styles.bitrefillCard}
          activeOpacity={0.85}
          onPress={() =>
            navigation.navigate('WebViewScreen', {
              url: 'https://www.bitrefill.com/',
              title: 'Bitrefill',
            })
          }
        >
          <View style={styles.bitrefillIconWrap}>
            <Icon name="card-giftcard" size={22} color="#22D3EE" />
          </View>
          <View style={styles.bitrefillTextWrap}>
            <Text style={styles.bitrefillTitle}>Spend on Bitrefill</Text>
            <Text style={styles.bitrefillSubtitle}>
              Buy gift cards & mobile top-ups with your BTC — pick one on Bitrefill,
              then withdraw here using the Lightning invoice they give you.
            </Text>
          </View>
          <Icon name="arrow-forward-ios" size={14} color="#bcbcbc" />
        </TouchableOpacity>

        <TransactionHistory transactions={transactions} />
      </ScrollView>

      {methodModal && (
        <View style={styles.modalWrapper}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setMethodModal(false)}
          />
          <View style={styles.modalDropdown}>
            <Text style={styles.modalTitle}>Select a network</Text>

            {withdrawMethods(withdrawalLimits).map(item => (
              <TouchableOpacity
                key={item.id}
                onPress={() => handleWithdrawSelect(item.method)}
                style={styles.modalOption}
              >
                <View style={styles.modalOptionTextWrapper}>
                  <Text style={styles.dropdownOption}>{item.name}</Text>
                  <Text style={styles.dropdownSubText}>{item.subText}</Text>
                </View>
                <Icon name="arrow-forward-ios" size={14} color="#bcbcbc" />
                {item.name === 'Lightning' && (
                  <View style={styles.recommendTag}>
                    <Text style={styles.recommendText}>Recommend</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default WalletNewScreen;

/* ──────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#15213B',
  },
  scrollViewContentContainer: {
    padding: 20,
    flexGrow: 1,
  },
  bitrefillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    gap: 12,
  },
  bitrefillIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bitrefillTextWrap: {
    flex: 1,
  },
  bitrefillTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  bitrefillSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
  },
  modalWrapper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 9999,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalDropdown: {
    backgroundColor: '#1E293B',
    borderRadius: 15,
    paddingVertical: 20,
    paddingHorizontal: 15,
    elevation: 5,
  },
  modalTitle: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 18,
    marginVertical: 16,
    fontWeight: '500',
  },
  modalOption: {
    backgroundColor: '#343744',
    marginBottom: 12,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalOptionTextWrapper: {
    gap: 2,
  },
  dropdownOption: {
    color: '#fff',
    fontSize: 15,
  },
  dropdownSubText: {
    color: '#fff',
    opacity: 0.5,
    fontSize: 12,
  },
  recommendTag: {
    position: 'absolute',
    top: -1,
    left: 0,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#22D3EE',
    borderBottomEndRadius: 8,
  },
  recommendText: {
    color: '#fff',
    fontSize: 10,
  },
});
