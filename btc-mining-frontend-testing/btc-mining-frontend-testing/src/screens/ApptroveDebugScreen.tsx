import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  trackFirstOpen,
  trackLogin,
  trackSignupCompleted,
  trackLogout,
  trackOnboardingCompleted,
  trackScreenView,
  trackAppOpen,
  trackSessionStart,
  trackSessionEnd,
  trackNotificationReceived,
  trackNotificationClicked,
  trackPaymentInitiated,
  trackSubscriptionStarted,
  trackPaywallViewed,
  trackPaymentFailed,
  trackTrialStarted,
  trackSubscriptionCancelled,
  trackSubscriptionExpired,
  trackPurchaseRestored,
  trackInviteClicked,
  trackInviteShared,
  trackMiningStarted,
  trackMiningStopped,
  trackDailyRewardClaimed,
  trackWithdrawalRequested,
  trackDepositCompleted,
  trackAdRequest,
  trackAdLoaded,
  trackAdImpression,
  trackAdClicked,
  trackAdRevenuePaid,
  trackAdClosed,
  trackAdWatchStarted,
  trackAdWatchCompleted,
  trackAdWatchSkipped,
  trackViewItemList,
  trackViewItem,
  trackSelectItem,
  trackBeginCheckout,
  trackCheckoutCompleted,
  trackSearch,
  trackProfileUpdate,
  trackAchievementUnlock,
  trackContentView,
} from '../services/apptroveAnalytics';

const TEST_USER_ID = 'debug-test-user-001';
const TEST_SESSION_ID = `debug-${Date.now()}`;

type EventResult = { name: string; status: 'ok' | 'fail'; ts: number };

const EVENTS: { label: string; id: string; fn: () => void }[] = [
  // Lifecycle
  { label: 'first_open', id: 'first_open', fn: () => trackFirstOpen(Platform.OS) },
  { label: 'app_open', id: 'app_open', fn: () => trackAppOpen(Platform.OS) },
  { label: 'session_start', id: 'session_start', fn: () => trackSessionStart(TEST_SESSION_ID, Platform.OS) },
  { label: 'session_end', id: 'session_end', fn: () => trackSessionEnd(TEST_SESSION_ID, 42) },
  { label: 'screen_view (0zrztVO54t)', id: 'screen_view', fn: () => trackScreenView('ApptroveDebugScreen') },
  // Auth
  { label: 'login (o91gt1Q0PK)', id: 'login', fn: () => trackLogin(TEST_USER_ID, 'email') },
  { label: 'signup (8ASKXJ1vWO + 3 IDs)', id: 'signup', fn: () => trackSignupCompleted(TEST_USER_ID, 'email') },
  { label: 'logout (pr1kg0PakC)', id: 'logout', fn: () => trackLogout(TEST_USER_ID) },
  { label: 'onboarding_completed', id: 'onboarding', fn: () => trackOnboardingCompleted(TEST_USER_ID) },
  { label: 'update / profile (sEQWVHGThl)', id: 'update', fn: () => trackProfileUpdate(TEST_USER_ID, 'name,avatar') },
  // Notifications
  { label: 'notification_received', id: 'notif_recv', fn: () => trackNotificationReceived('mining_expired') },
  { label: 'notification_clicked', id: 'notif_click', fn: () => trackNotificationClicked('mining_expired', TEST_USER_ID) },
  // Payments / Store
  { label: 'paywall_viewed', id: 'paywall', fn: () => trackPaywallViewed(3) },
  { label: 'view_item_list (xLo5iOmEUm)', id: 'view_list', fn: () => trackViewItemList('mining_plans', 3) },
  { label: 'view_item (XLdSodqgld + 8MvPg9POkj)', id: 'view_item', fn: () => trackViewItem('plan_basic', 'Basic Plan', 9.99, 'USD') },
  { label: 'select_item (5f0BML6LDg)', id: 'select_item', fn: () => trackSelectItem('plan_basic', 'Basic Plan', 9.99, 'USD') },
  { label: 'begin_checkout (rbJmUiy8vZ + 34mjlWJaHL)', id: 'checkout', fn: () => trackBeginCheckout('plan_basic', 'Basic Plan', 9.99, 'USD') },
  { label: 'trial_started', id: 'trial', fn: () => trackTrialStarted('com.bitplay.basic', 'Basic Plan') },
  { label: 'subscription_started', id: 'sub_start', fn: () => trackSubscriptionStarted('Basic Plan', 'com.bitplay.basic', 9.99, 'USD') },
  { label: 'checkout_completed (0i9U00nN6p)', id: 'checkout_done', fn: () => trackCheckoutCompleted('plan_basic', 'Basic Plan', 9.99, 'USD') },
  { label: 'subscription_cancelled', id: 'sub_cancel', fn: () => trackSubscriptionCancelled('com.bitplay.basic') },
  { label: 'subscription_expired', id: 'sub_expire', fn: () => trackSubscriptionExpired('com.bitplay.basic') },
  { label: 'purchase_restored', id: 'restore', fn: () => trackPurchaseRestored(1) },
  { label: 'payment_initiated', id: 'pay_init', fn: () => trackPaymentInitiated('plan_basic', 'bank_transfer', 9.99) },
  { label: 'payment_failed', id: 'pay_fail', fn: () => trackPaymentFailed('com.bitplay.basic', 'PURCHASE_NOT_ALLOWED') },
  // Referral
  { label: 'invite_clicked (7lnE3OclNT)', id: 'invite_click', fn: () => trackInviteClicked('TEST123') },
  { label: 'invite_shared (dxZXGG1qqL + share)', id: 'invite_share', fn: () => trackInviteShared('TEST123', 'whatsapp') },
  // Mining
  { label: 'mining_started', id: 'mine_start', fn: () => trackMiningStarted(100, TEST_USER_ID) },
  { label: 'mining_stopped', id: 'mine_stop', fn: () => trackMiningStopped(100, TEST_USER_ID) },
  { label: 'daily_reward_claimed + achievement', id: 'daily', fn: () => trackDailyRewardClaimed('hashpower', 5, TEST_USER_ID) },
  { label: 'withdrawal_requested', id: 'withdraw', fn: () => trackWithdrawalRequested('BTC', 0.0001, TEST_USER_ID) },
  { label: 'deposit_completed', id: 'deposit', fn: () => trackDepositCompleted(0.001, TEST_USER_ID) },
  // Ads
  { label: 'ad_request', id: 'ad_req', fn: () => trackAdRequest('ca-app-pub-test/001', 'rewarded') },
  { label: 'ad_loaded', id: 'ad_load', fn: () => trackAdLoaded('ca-app-pub-test/001', 'rewarded') },
  { label: 'ad_impression', id: 'ad_imp', fn: () => trackAdImpression('ca-app-pub-test/001', 'rewarded') },
  { label: 'ad_clicked', id: 'ad_click', fn: () => trackAdClicked('ca-app-pub-test/001', 'rewarded') },
  { label: 'ad_revenue_paid', id: 'ad_rev', fn: () => trackAdRevenuePaid('ca-app-pub-test/001', 0.001, 'USD', 'admob') },
  { label: 'ad_closed', id: 'ad_close', fn: () => trackAdClosed('ca-app-pub-test/001', 'rewarded') },
  { label: 'ad_watch_started', id: 'ad_ws', fn: () => trackAdWatchStarted('DebugScreen') },
  { label: 'ad_watch_completed', id: 'ad_wc', fn: () => trackAdWatchCompleted('DebugScreen', 5) },
  { label: 'ad_watch_skipped', id: 'ad_wsk', fn: () => trackAdWatchSkipped('DebugScreen') },
  // Search
  { label: 'search (mH6sqU7t6u + MtXCvY3Bdu)', id: 'search', fn: () => trackSearch('spin game', 5) },
  // Misc
  { label: 'achievement_unlock (xTPvxWuNqm)', id: 'achieve', fn: () => trackAchievementUnlock('debug_test', 1) },
  { label: 'content_view (Jwzois1ays)', id: 'content', fn: () => trackContentView('debug-001', 'announcement') },
];

export default function ApptroveDebugScreen() {
  const navigation = useNavigation();
  const [results, setResults] = useState<EventResult[]>([]);
  const [firing, setFiring] = useState(false);

  const fire = (ev: typeof EVENTS[0]) => {
    try {
      ev.fn();
      setResults(r => [{ name: ev.label, status: 'ok', ts: Date.now() }, ...r]);
    } catch {
      setResults(r => [{ name: ev.label, status: 'fail', ts: Date.now() }, ...r]);
    }
  };

  const fireAll = async () => {
    setFiring(true);
    setResults([]);
    for (const ev of EVENTS) {
      fire(ev);
      await new Promise(r => setTimeout(r, 120)); // 120ms gap between events
    }
    setFiring(false);
    Alert.alert('Done', `${EVENTS.length} events fired. Check your Apptrove dashboard real-time stream.`);
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>🔧 Apptrove Debug</Text>
        <Text style={s.sub}>{EVENTS.length} events • TEST DATA ONLY</Text>
      </View>

      <TouchableOpacity
        style={[s.fireAllBtn, firing && s.fireAllBtnDisabled]}
        onPress={fireAll}
        disabled={firing}
      >
        <Text style={s.fireAllTxt}>{firing ? 'Firing...' : `🚀 Fire ALL ${EVENTS.length} Events`}</Text>
      </TouchableOpacity>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Results */}
        {results.length > 0 && (
          <View style={s.resultsBox}>
            <Text style={s.resultsHeader}>Recent fires</Text>
            {results.slice(0, 8).map((r, i) => (
              <View key={i} style={s.resultRow}>
                <Text style={r.status === 'ok' ? s.ok : s.fail}>
                  {r.status === 'ok' ? '✅' : '❌'} {r.name}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Individual events */}
        {EVENTS.map(ev => (
          <TouchableOpacity key={ev.id} style={s.eventBtn} onPress={() => fire(ev)}>
            <Text style={s.eventTxt}>{ev.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0f1e' },
  header: { paddingTop: Platform.OS === 'ios' ? 54 : 40, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  back: { marginBottom: 8 },
  backTxt: { color: '#22D3EE', fontSize: 14 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  fireAllBtn: { margin: 16, backgroundColor: '#22D3EE', borderRadius: 12, padding: 14, alignItems: 'center' },
  fireAllBtnDisabled: { opacity: 0.5 },
  fireAllTxt: { color: '#0a0f1e', fontWeight: '800', fontSize: 15 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 8 },
  resultsBox: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 16 },
  resultsHeader: { color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  resultRow: { paddingVertical: 2 },
  ok: { color: '#4ade80', fontSize: 12 },
  fail: { color: '#f87171', fontSize: 12 },
  eventBtn: { backgroundColor: '#1e293b', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#334155' },
  eventTxt: { color: '#e2e8f0', fontSize: 13 },
});
