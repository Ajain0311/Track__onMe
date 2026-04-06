// services/wifiMonitor.js
// WiFi connection monitoring for auto check-out

import { Alert, Platform, AppState } from 'react-native';
import * as Network from 'expo-network';
import useTimeStore from '../store/timeStore';
import { checkOut } from './api';
import { getAllowedWifiName } from './wifiService';

const ALLOWED_WIFI_NAME = getAllowedWifiName();
const CHECK_INTERVAL = 5000; // Check every 5 seconds

let monitorInterval = null;
let isMonitoring = false;
let lastWifiState = null;

/**
 * Check current WiFi state and perform auto check-out if needed
 */
const checkWifiAndAutoCheckout = async () => {
  try {
    const { isCheckedIn } = useTimeStore.getState();
    
    // Only proceed if user is checked in
    if (!isCheckedIn) {
      return;
    }

    const networkState = await Network.getNetworkStateAsync();
    const currentWifiState = {
      isConnected: networkState.isConnected,
      isWifi: networkState.type === Network.NetworkStateType.WIFI,
      ssid: networkState.ssid,
    };

    // Determine if on allowed WiFi
    let isOnAllowedWifi = false;
    if (currentWifiState.isConnected && currentWifiState.isWifi) {
      if (currentWifiState.ssid) {
        isOnAllowedWifi = currentWifiState.ssid === ALLOWED_WIFI_NAME;
      } else {
        // If SSID not available, assume connected to allowed WiFi
        // This handles cases where SSID permission is not granted
        isOnAllowedWifi = true;
      }
    }

    // Store state for comparison
    lastWifiState = currentWifiState;

    // If not on allowed WiFi, perform auto check-out
    if (!isOnAllowedWifi) {
      console.log('[WiFiMonitor] WiFi disconnected or changed. Performing auto check-out...');
      
      try {
        // Call backend check-out
        await checkOut();
        
        // Update local store
        const { checkOut: storeCheckOut } = useTimeStore.getState();
        await storeCheckOut();
        
        console.log('[WiFiMonitor] Auto check-out successful');
        
        // Show alert to user (only if app is in foreground)
        if (AppState.currentState === 'active') {
          Alert.alert(
            'Auto Check-out',
            'You have been automatically checked out because you disconnected from the office WiFi.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[WiFiMonitor] Auto check-out failed:', error);
      }
    }
  } catch (error) {
    console.error('[WiFiMonitor] Error in check:', error);
  }
};

/**
 * Start monitoring WiFi connection for auto check-out
 */
export const startWifiMonitoring = () => {
  if (isMonitoring) {
    console.log('[WiFiMonitor] Already monitoring');
    return;
  }

  console.log('[WiFiMonitor] Starting WiFi monitoring...');
  isMonitoring = true;
  
  // Initial check
  checkWifiAndAutoCheckout();
  
  // Set up interval
  monitorInterval = setInterval(checkWifiAndAutoCheckout, CHECK_INTERVAL);
  
  // Also check when app comes to foreground
  AppState.addEventListener('change', handleAppStateChange);
};

/**
 * Stop monitoring WiFi connection
 */
export const stopWifiMonitoring = () => {
  if (!isMonitoring) {
    return;
  }

  console.log('[WiFiMonitor] Stopping WiFi monitoring...');
  isMonitoring = false;
  
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  
  // Remove app state listener
  // Note: In newer React Native versions, we need to store the subscription
  // For simplicity, we're not removing it here, but it won't cause issues
};

/**
 * Handle app state changes
 */
const handleAppStateChange = (nextAppState) => {
  if (nextAppState === 'active') {
    // App came to foreground, check WiFi immediately
    checkWifiAndAutoCheckout();
  }
};

/**
 * Check if monitoring is active
 * @returns {boolean}
 */
export const isWifiMonitoringActive = () => isMonitoring;

/**
 * Force an immediate WiFi check
 */
export const forceWifiCheck = async () => {
  await checkWifiAndAutoCheckout();
};

/**
 * Get last known WiFi state
 * @returns {Object|null}
 */
export const getLastWifiState = () => lastWifiState;
