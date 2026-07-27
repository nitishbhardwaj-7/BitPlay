/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';

messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    console.log('Firebase FCM message received in background:', remoteMessage);
  } catch (error) {
    console.error('Error handling background message:', error);
  }
});

AppRegistry.registerComponent('BitPlay', () => App);
AppRegistry.registerComponent('BitPlayPro', () => App);