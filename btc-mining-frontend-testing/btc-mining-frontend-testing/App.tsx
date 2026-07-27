// App.tsx
// Fixed SDK initialization and Navigation crash
import React, { useEffect, useRef, useState } from 'react';
import { createNavigationContainerRef, NavigationContainer, useNavigationState } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Alert, AppState, AppStateStatus, Platform, StatusBar, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { initializeRevenueCat } from './src/config/revenuecat';
import analytics from '@react-native-firebase/analytics';
import mobileAds, { AdsConsent, AdsConsentDebugGeography, MaxAdContentRating } from 'react-native-google-mobile-ads';
import { ApptroveConfig, ApptroveSDK } from 'react-native-apptrove';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  trackFirstOpen,
  trackNotificationClicked,
  trackNotificationReceived,
  trackAppOpen,
  trackSessionStart,
  trackSessionEnd,
  trackScreenView,
} from './src/services/apptroveAnalytics';

// Screens
import SplashScreen, { SplashContent } from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import OTPVerificationScreen from './src/screens/OTPVerificationScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import MainTabNavigator from './src/navigation/MainTabNavigator';
import TwofactorOTP from './src/screens/TwofactorOTP';
import ReferralScreen from './src/screens/referral_code';
import { RootStackParamList } from './src/components/types';
import AllActivity from './src/screens/AllActivity';
import InternalReferralScreen from './src/screens/MainReferralScreen';
// import WalletScreen from './src/screens/Wallet';
import DepositScreen from './src/screens/DepositScreen';
// import WithdrawScreen from './src/screens/WithdrawScreen';
import MyProfileScreen from './src/screens/MyProfileScreen';
import FAQScreen from './src/screens/FAQScreen';
import SupportScreen from './src/screens/SupportScreen';
import StoreScreen from './src/screens/Store';
import MakePaymentScreen from './src/screens/PaymentScreen';
import CustomQuote from './src/screens/CustomQuote';
import DeleteAccountScreen from './src/screens/DeleteAccount';
import NotificationScreen from './src/screens/NotificationsScreen';
import AchievementsScreen from './src/screens/AchievementsScreen';
import WatchVideoScreen from './src/screens/WatchVideoScreen';
import TwoFactorScreen from './src/screens/TwoFactorScreen';
import NotificationPreferencesScreen from './src/screens/NotificationPreferencesScreen';
import DailyRewardsScreen from './src/screens/DailyRewardsScreen';
import CryptoDepositScreen from './src/screens/CryptoDepositScreen';
import BalanceHistoryScreen from './src/screens/BalanceHistoryScreen';
import MyMinerScreen from './src/screens/MyMiner';
import { HashPowerProvider } from "./src/stores/HashPowerStore";

import messaging from '@react-native-firebase/messaging';
import UpdateEmailScreen from './src/screens/UpdateEmailScreen';
import { AdConfigProvider } from './src/providers/AdConfigProvider';
import TwoFactorLoginScreen from './src/screens/TwoFactorLoginScreen';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import WalletNewScreen from './src/screens/WalletNewScreen';
import WithdrawalScreenNew from './src/screens/WithdrawalScreenNew';
import MyMiner from './src/screens/MyMiner';
import WebViewScreen from './src/screens/WebViewScreen';
import AboutUsScreen from './src/screens/AboutUsScreen';
import MyProfileEditScreen from './src/screens/MyProfileEditScreen';
import TradingScreen from './src/screens/TradingScreen';
import SpinAndWinScreen from './src/screens/SpinAndWinScreen';
import MemoryCardMatchScreen from './src/screens/MemoryCardMatchScreen';
import GameErrorBoundary from './src/components/GameErrorBoundary';
import GameZoneScreen from './src/screens/GameZoneScreen';
import ForceUpdateModal from './src/components/ForceUpdateModal';
import { checkForceUpdate, type ForceUpdateResult } from './src/services/versionCheckService';
import { initializeGoogleAds } from './src/services/googleAds';
import { useScreenHoldTracking } from './src/hooks/useScreenHoldTracking';
import ApptroveDebugScreen from './src/screens/ApptroveDebugScreen';

const RootStack = createStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef();

/**
 * Apptrove uses a different app token per platform in most setups.
 * Keep both explicit so Android and iOS attribution can work independently.
 */
const APPTROVE_APP_TOKENS = {
  android: '87bf4385-5b55-4975-ab9e-829b6e9c409d',
  ios: '65bc3898-6683-4945-bad3-199f7d4cc5af',
} as const;

const AppNavigator = () => {
  const { authenticated, loading } = useAuth(); 

  if (loading) {
    return <SplashContent showLoader={false} />;
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {authenticated ? (
        <>
          <RootStack.Screen name="Main" component={MainTabNavigator} />
          <RootStack.Screen name="BalanceHistoryScreen" component={BalanceHistoryScreen} />
          {/* <RootStack.Screen name="DailyRewardsScreen" component={DailyRewardsScreen} /> */}
          <RootStack.Screen name="MyProfileScreen" component={MyProfileScreen} />
          <RootStack.Screen name="AllActivity" component={AllActivity} />
          <RootStack.Screen name="InternalReferral" component={InternalReferralScreen} />
          <RootStack.Screen name="Store" component={StoreScreen} />
          <RootStack.Screen name="Wallet" component={WalletNewScreen} />
          <RootStack.Screen name="DepositScreen" component={DepositScreen} />
          <RootStack.Screen name="CryptoDepositScreen" component={CryptoDepositScreen} />
          <RootStack.Screen name="WithdrawScreen" component={WithdrawalScreenNew} />
          <RootStack.Screen name="FAQScreen" component={FAQScreen} />
          <RootStack.Screen name="SupportScreen" component={SupportScreen} />
          <RootStack.Screen name="MakePaymentScreen" component={MakePaymentScreen} />
          <RootStack.Screen name="CustomQuote" component={CustomQuote} />
          <RootStack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
          <RootStack.Screen name="NotificationScreen" component={NotificationScreen} />
          <RootStack.Screen name="AchievementsScreen" component={AchievementsScreen} />
          <RootStack.Screen name="WatchVideoScreen" component={WatchVideoScreen} />
          <RootStack.Screen name="TwoFactorScreen" component={TwoFactorScreen} />
          <RootStack.Screen name="NotificationPreferencesScreen" component={NotificationPreferencesScreen} />
          <RootStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <RootStack.Screen name="OTPVerification" component={OTPVerificationScreen} />
          <RootStack.Screen name="ChangePasswordScreen" component={ChangePasswordScreen} />
          <RootStack.Screen name="UpdateEmail" component={UpdateEmailScreen} />
          <RootStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <RootStack.Screen name="ReferralScreen" component={ReferralScreen} />
          <RootStack.Screen name="MyMiner" component={MyMiner} />
          <RootStack.Screen name="WebViewScreen" component={WebViewScreen} />
          <RootStack.Screen name="AboutUsScreen" component={AboutUsScreen} />
          <RootStack.Screen name="MyProfileEditScreen" component={MyProfileEditScreen} />
          <RootStack.Screen name="TradingScreen" component={TradingScreen} />
          <RootStack.Screen name="SpinAndWin">{p => <GameErrorBoundary><SpinAndWinScreen {...p} /></GameErrorBoundary>}</RootStack.Screen>
          <RootStack.Screen name="MemoryCardMatch">{p => <GameErrorBoundary><MemoryCardMatchScreen {...p} /></GameErrorBoundary>}</RootStack.Screen>
          <RootStack.Screen name="GameZone">{p => <GameErrorBoundary><GameZoneScreen {...p} /></GameErrorBoundary>}</RootStack.Screen>
          <RootStack.Screen name="ApptroveDebug" component={ApptroveDebugScreen} />
        </>
      ) : (
        <>
          <RootStack.Screen name="SignUp" component={SignUpScreen} />
          <RootStack.Screen name="Login" component={LoginScreen} />
          <RootStack.Screen
            name="TwoFactorLoginScreen"
            component={TwoFactorLoginScreen}
          />
          <RootStack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
          <RootStack.Screen
            name="OTPVerification"
            component={OTPVerificationScreen}
          />
          <RootStack.Screen
            name="ChangePassword"
            component={ChangePasswordScreen}
          />
          <RootStack.Screen name="TwofactorOTP" component={TwofactorOTP} />
          <RootStack.Screen name="ReferralScreen" component={ReferralScreen} />
        </>
      )}
    </RootStack.Navigator>
  );
};

const App = () => {
  const isDarkMode = useColorScheme() === 'dark';
  const { onTouchStart, onTouchEnd, onTouchCancel } = useScreenHoldTracking();
  const sessionIdRef = useRef<string>('');
  const sessionStartRef = useRef<number>(0);

  // Session tracking via AppState — only after SDK is initialized
  useEffect(() => {
    if (!isSdkReady) return;
    const startSession = () => {
      sessionIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStartRef.current = Date.now();
      trackAppOpen(Platform.OS);
      trackSessionStart(sessionIdRef.current, Platform.OS);
    };
    const endSession = () => {
      if (sessionStartRef.current > 0) {
        const durationSec = (Date.now() - sessionStartRef.current) / 1000;
        trackSessionEnd(sessionIdRef.current, durationSec);
        sessionStartRef.current = 0;
      }
    };
    startSession();
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') startSession();
      else if (nextState === 'background' || nextState === 'inactive') endSession();
    });
    return () => { sub.remove(); endSession(); };
  }, [isSdkReady]);

  useEffect(() => {

    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('FCM message received in foreground:', remoteMessage);
      trackNotificationReceived(remoteMessage.data?.type as string ?? 'unknown');

      const notificationType = remoteMessage.data?.type;
      const title = remoteMessage.notification?.title || 'Notification';
      const body = remoteMessage.notification?.body || '';

      // Show notification alert
      Alert.alert(
        title,
        body,
        [
          {
            text: 'Dismiss',
            style: 'cancel',
          },
          {
            text: 'Open',
            onPress: () => {
              if (notificationType) trackNotificationClicked(String(notificationType));
              // Handle notification action based on type
              if (notificationType === 'mining_expired' || notificationType === 'clock_reset' || notificationType === 'video_reminder') {
                // Navigate to home screen to watch videos
                if (navigationRef.isReady()) {
                  navigationRef.navigate('Main' as never, { screen: 'Home' } as never);
                }
              } else if (notificationType === 'daily_reward') {
                // Navigate to daily rewards screen
                if (navigationRef.isReady()) {
                  navigationRef.navigate('DailyRewardsScreen' as never);
                }
              }
            },
          },
        ]
      );
    });

    return unsubscribe; // cleanup foreground listener
  }, []);

  useEffect(() => {
    // Background & Quit state notification handler
    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('Notification opened app from background state:', remoteMessage);

      const notificationType = remoteMessage.data?.type;
      if (notificationType) trackNotificationClicked(String(notificationType));

      // Navigate based on notification type
      if (notificationType === 'mining_expired' || notificationType === 'clock_reset' || notificationType === 'video_reminder') {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Main' as never, { screen: 'Home' } as never);
        }
      } else if (notificationType === 'daily_reward') {
        if (navigationRef.isReady()) {
          navigationRef.navigate('DailyRewardsScreen' as never);
        }
      }
    });

    // Check if app was opened from a notification when app was quit
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage) {
          console.log('Notification opened app from quit state:', remoteMessage);

          const notificationType = remoteMessage.data?.type;
          if (notificationType) trackNotificationClicked(String(notificationType));

          // Navigate based on notification type
          if (notificationType === 'mining_expired' || notificationType === 'clock_reset' || notificationType === 'video_reminder') {
            if (navigationRef.isReady()) {
              navigationRef.navigate('Main' as never, { screen: 'Home' } as never);
            }
          } else if (notificationType === 'daily_reward') {
            if (navigationRef.isReady()) {
              navigationRef.navigate('DailyRewardsScreen' as never);
            }
          }
        }
      });
  }, []);

  async function requestUserPermission() {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Firebase Authorization status:', authStatus);
    }
  }

  // // Create notification channel for Android 8.0+
  // function createNotificationChannel() {
  //   if (Platform.OS === 'android') {
  //     // Set the default notification channel ID
  //     // React Native Firebase will use this channel ID for notifications
  //     messaging().setNotificationChannelId('default_channel');
  //
  //     // Note: React Native Firebase automatically creates the channel with default settings
  //     // if it doesn't exist. The channel is created with:
  //     // - Name: "General Notifications" (default)
  //     // - Importance: High (default)
  //     // - Description: empty (default)
  //
  //     // If you need custom settings, you would need to create it via native code
  //     // or use react-native-notifications library
  //     console.log('Android notification channel ID set to: default_channel');
  //   }
  // }

  const [isSdkReady, setIsSdkReady] = useState(false);
  const [forceUpdate, setForceUpdate] = useState<ForceUpdateResult | null>(null);
  const isMobileAdsStartCalledRef = useRef(false);

  async function startGoogleMobileAdsSDK() {
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds || isMobileAdsStartCalledRef.current) {
      return;
    }

    isMobileAdsStartCalledRef.current = true;

    const gdprApplies = await AdsConsent.getGdprApplies();
    const hasConsentForPurposeOne =
      gdprApplies &&
      (await AdsConsent.getPurposeConsents()).startsWith('1');
    if (!gdprApplies || hasConsentForPurposeOne) {
      // ATT handling could go here for iOS
    }

    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
    });
    await mobileAds().initialize();
  }

  useEffect(() => {
    const init = async () => {
      try {
        // Reset previous consent in dev so the form always shows for testing
        if (__DEV__) {
          AdsConsent.reset();
        }

        AdsConsent.gatherConsent(__DEV__ ? {
            debugGeography: AdsConsentDebugGeography.EEA,
            testDeviceIdentifiers: ['TEST-DEVICE-HASHED-ID'],
          } : undefined)
          .then(startGoogleMobileAdsSDK)
          .catch((error) => console.error('Consent gathering failed:', error));

        // Attempt to load ads using consent obtained in a previous session
        startGoogleMobileAdsSDK();

        try {
          const appToken = Platform.select({
            ios: APPTROVE_APP_TOKENS.ios,
            android: APPTROVE_APP_TOKENS.android,
            default: '',
          });

          if (!appToken) {
            console.warn(`[Apptrove] No app token configured for platform: ${Platform.OS}`);
          } else {
            // iOS 14+: tell Apptrove to wait up to 10s for ATT dialog result
            // before sending any attribution requests. Must be called BEFORE initialize().
            if (Platform.OS === 'ios') {
              ApptroveSDK.waitForATTUserAuthorization(10);
            }

            const apptroveConfig = new ApptroveConfig(
              appToken,
              __DEV__ ? ApptroveConfig.EnvironmentDevelopment : ApptroveConfig.EnvironmentProduction,
            );
            apptroveConfig.setAppSecret('6a65edf3b62e0b2e8a92903d', 'c6a3c7d1-a431-4898-8aa9-6d3822ecd30f');
            ApptroveSDK.initialize(apptroveConfig);
            ApptroveSDK.fireInstall();
            const apptroveId = await ApptroveSDK.getApptroveId();
          }

          // first_open — fire on every cold start; Apptrove deduplicates
          // installs server-side using device fingerprint. Do NOT gate this
          // with AsyncStorage — the SDK needs to receive it to attribute installs.
          trackFirstOpen(Platform.OS);
        } catch (apptroveError) {
          console.error(`[Apptrove] SDK init failed on ${Platform.OS}:`, apptroveError);
        }

        await Promise.all([
          initializeRevenueCat(),
          requestUserPermission(),
        ]);
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setIsSdkReady(true);
      }
    };
    init();
  }, []);


  useEffect(() => {
    if (!isSdkReady) return;
    let cancelled = false;
    checkForceUpdate().then((result) => {
      if (!cancelled && result.forceUpdate) {
        setForceUpdate(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isSdkReady]);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId:
        '1063839909090-eq6h8v5p2h8o9bj4omdj7hm0m7le0e3h.apps.googleusercontent.com',
    });
  }, []);

  const splashBg = { flex: 1, backgroundColor: '#1a1a2e' };

  if (!isSdkReady) {
    return (
      <View style={splashBg}>
        <SplashContent />
      </View>
    );
  }

  return (
    <View style={splashBg} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}>
    {forceUpdate != null && (
      <ForceUpdateModal
        visible
        storeUrl={forceUpdate.storeUrl}
        currentVersion={forceUpdate.currentVersion}
        latestVersion={forceUpdate.latestVersion}
        onDismiss={() => setForceUpdate(null)}
      />
    )} 
    <AuthProvider>
      <HashPowerProvider>
        <AdConfigProvider>
          <NavigationContainer
            onReady={async () => {
              const currentRoute = navigationRef.getCurrentRoute();
              if (currentRoute) {
                await analytics().logScreenView({
                  screen_name: currentRoute.name,
                  screen_class: currentRoute.name,
                });
                trackScreenView(currentRoute.name);
              }
            }}
            onStateChange={async () => {
              const currentRoute = navigationRef.getCurrentRoute();
              if (currentRoute) {
                await analytics().logScreenView({
                  screen_name: currentRoute.name,
                  screen_class: currentRoute.name,
                });
                trackScreenView(currentRoute.name);
              }
            }}
            ref={navigationRef}
          >
            <StatusBar
              barStyle={isDarkMode ? 'light-content' : 'dark-content'}
            />
            <AppNavigator />
          </NavigationContainer>
        </AdConfigProvider>
      </HashPowerProvider>
    </AuthProvider>
    </View>
  );
};

// Root-level error boundary — catches any unhandled JS error so the app
// shows a recovery screen instead of crashing to Android's uninstall dialog
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) console.error('[RootErrorBoundary]', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0f1e', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#f8fafc', fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Something went wrong</Text>
        <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 32 }}>
          Tap below to restart the app.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#0e7490', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 }}
          onPress={() => this.setState({ hasError: false })}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Restart App</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const AppWithBoundary = () => (
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);

export default AppWithBoundary;
