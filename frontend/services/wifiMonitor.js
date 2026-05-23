// services/wifiMonitor.js
// WiFi-aware auto check-out.
//
// CRITICAL RULES:
//  1. Only auto-checkout if the user checked in while on the allowed WiFi SSID.
//     GPS / location check-ins require manual checkout — never auto-checkout.
//  2. Grace period: never auto-checkout within GRACE_PERIOD_MS after check-in.
//     This prevents the immediate-checkout bug on app launch / first check.
//  3. Debounce: require CONSECUTIVE_FAILURES consecutive checks off allowed WiFi
//     before triggering (prevents false positives from brief signal drops).

import { Alert, Platform, AppState } from 'react-native';
import * as Network from 'expo-network';
import useTimeStore from '../store/timeStore';
import { checkOut } from './api';
import { getAllowedWifiName } from './wifiService';

const ALLOWED_WIFI_NAME = getAllowedWifiName();
const CHECK_INTERVAL_MS   = 8000;   // poll every 8 seconds
const GRACE_PERIOD_MS     = 120000; // 2 minutes grace after check-in
const CONSECUTIVE_FAILURES = 3;     // off-WiFi detections before auto-checkout

let monitorInterval = null;
let isMonitoring = false;
let offWifiCount = 0;
let appStateSubscription = null;

// ─────────────────────────────────────────────────────────────────────────────

const checkWifiAndAutoCheckout = async () => {
  try {
    const state = useTimeStore.getState();
    const { isCheckedIn, checkInSsid, checkInTimestamp } = state;

    // 1. Only proceed if actually checked in
    if (!isCheckedIn) {
      offWifiCount = 0;
      return;
    }

    // 2. Only auto-checkout if the user checked in ON the allowed WiFi
    if (!checkInSsid || checkInSsid !== ALLOWED_WIFI_NAME) {
      // GPS / location check-in — never auto-checkout
      offWifiCount = 0;
      return;
    }

    // 3. Grace period — don't touch within 2 minutes of check-in
    if (checkInTimestamp && Date.now() - checkInTimestamp < GRACE_PERIOD_MS) {
      offWifiCount = 0;
      return;
    }

    // 4. Check current WiFi
    const networkState = await Network.getNetworkStateAsync();
    const isWifi = networkState.type === Network.NetworkStateType.WIFI;
    const ssid   = networkState.ssid;

    let isOnAllowedWifi = false;
    if (networkState.isConnected && isWifi) {
      if (ssid) {
        isOnAllowedWifi = ssid === ALLOWED_WIFI_NAME;
      } else {
        // SSID unreadable (permission missing) — assume still on same WiFi
        isOnAllowedWifi = true;
      }
    }

    if (isOnAllowedWifi) {
      // Back on allowed WiFi — reset failure counter
      offWifiCount = 0;
      return;
    }

    // 5. Off allowed WiFi — increment failure count
    offWifiCount += 1;
    console.log(`[WiFiMonitor] Off allowed WiFi (${offWifiCount}/${CONSECUTIVE_FAILURES})`);

    if (offWifiCount < CONSECUTIVE_FAILURES) return; // wait for more failures

    // 6. CONSECUTIVE_FAILURES reached — perform auto check-out
    offWifiCount = 0;
    console.log('[WiFiMonitor] Consecutive off-WiFi threshold reached — auto checkout');

    try {
      await checkOut();
      await useTimeStore.getState().checkOut();
      console.log('[WiFiMonitor] Auto check-out successful');

      if (AppState.currentState === 'active') {
        Alert.alert(
          'Auto Check-out',
          'You have been automatically checked out because you left the office WiFi network.',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      console.error('[WiFiMonitor] Auto check-out failed:', err?.message || err);
    }
  } catch (err) {
    console.error('[WiFiMonitor] Monitor error:', err?.message || err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const startWifiMonitoring = () => {
  if (isMonitoring) return;
  console.log('[WiFiMonitor] Starting (allowed SSID:', ALLOWED_WIFI_NAME, ')');
  isMonitoring = true;
  offWifiCount = 0;

  // ⚠️  Do NOT run an immediate check here — it causes auto-checkout on app open
  // before the check-in state has been properly restored.
  monitorInterval = setInterval(checkWifiAndAutoCheckout, CHECK_INTERVAL_MS);

  if (Platform.OS !== 'web') {
    appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // App foregrounded — reset failure counter to avoid stale counts
        offWifiCount = 0;
        checkWifiAndAutoCheckout();
      }
    });
  }
};

export const stopWifiMonitoring = () => {
  if (!isMonitoring) return;
  console.log('[WiFiMonitor] Stopping');
  isMonitoring = false;
  offWifiCount = 0;

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
};

export const isWifiMonitoringActive = () => isMonitoring;

export const forceWifiCheck = async () => {
  await checkWifiAndAutoCheckout();
};

export const getOffWifiCount = () => offWifiCount;
