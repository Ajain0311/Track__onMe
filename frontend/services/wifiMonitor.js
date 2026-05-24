// services/wifiMonitor.js
// Auto check-out when the user leaves the office (WiFi disconnect or GPS out-of-range).
//
// RULES:
//  1. Only auto-checkout if checked in on the allowed WiFi SSID (WiFi method) OR
//     within the registered GPS geofence (location method).
//  2. Grace period: never auto-checkout within GRACE_PERIOD_MS of check-in.
//  3. Debounce: require CONSECUTIVE_FAILURES consecutive off-network/out-of-range
//     readings before triggering (avoids false positives on brief signal drops).
//  4. GPS checks only run while the app is in the foreground (AppState = 'active'),
//     to avoid draining the battery in the background.

import { Alert, Platform, AppState } from 'react-native';
import * as Network from 'expo-network';
import * as Location from 'expo-location';
import useTimeStore from '../store/timeStore';
import { autoCheckOut } from './api';
import { getAllowedWifiName } from './wifiService';

const ALLOWED_WIFI_NAME    = getAllowedWifiName();
const CHECK_INTERVAL_MS    = 8000;   // poll every 8 s
const GRACE_PERIOD_MS      = 120000; // 2-minute grace after check-in
const CONSECUTIVE_FAILURES = 3;      // readings before auto-checkout
const GPS_BUFFER_M         = 50;     // extra metres of tolerance on top of geofence radius

// Haversine distance in metres
const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

let monitorInterval      = null;
let isMonitoring         = false;
let offWifiCount         = 0;
let offLocationCount     = 0;
let appStateSubscription = null;

// ─── Shared auto-checkout action ─────────────────────────────────────────────

const doAutoCheckout = async (reason) => {
  try {
    console.log('[WiFiMonitor] Auto checkout triggered, reason:', reason);
    await autoCheckOut(reason); // server-side (no faceToken needed)
    await useTimeStore.getState().checkOut(); // local store
    if (AppState.currentState === 'active') {
      Alert.alert(
        'Auto Check-out',
        reason === 'wifi_disconnect'
          ? 'You have been automatically checked out because you left the office WiFi network.'
          : 'You have been automatically checked out because you moved out of the office area.',
        [{ text: 'OK' }],
      );
    }
  } catch (err) {
    console.error('[WiFiMonitor] Auto check-out failed:', err?.message || err);
  }
};

// ─── Main monitoring loop ─────────────────────────────────────────────────────

const checkAndAutoCheckout = async () => {
  try {
    const state = useTimeStore.getState();
    const {
      isCheckedIn, checkInSsid, checkInTimestamp,
      checkInMethod, checkInLocationLat, checkInLocationLon, checkInLocationRadius,
    } = state;

    if (!isCheckedIn) {
      offWifiCount = 0;
      offLocationCount = 0;
      return;
    }

    // Grace period — don't auto-checkout right after checking in
    if (checkInTimestamp && Date.now() - checkInTimestamp < GRACE_PERIOD_MS) {
      offWifiCount = 0;
      offLocationCount = 0;
      return;
    }

    // ── WiFi monitoring (check-in was via WiFi) ───────────────────────────────
    if (checkInSsid && checkInSsid === ALLOWED_WIFI_NAME) {
      try {
        const networkState = await Network.getNetworkStateAsync();
        const isWifi = networkState.type === Network.NetworkStateType.WIFI;
        let isOnAllowedWifi = false;
        if (networkState.isConnected && isWifi) {
          // If SSID is unreadable (permission missing) assume still on same WiFi
          isOnAllowedWifi = networkState.ssid
            ? networkState.ssid === ALLOWED_WIFI_NAME
            : true;
        }

        if (isOnAllowedWifi) {
          offWifiCount = 0;
        } else {
          offWifiCount += 1;
          console.log(`[WiFiMonitor] Off WiFi (${offWifiCount}/${CONSECUTIVE_FAILURES})`);
          if (offWifiCount >= CONSECUTIVE_FAILURES) {
            offWifiCount = 0;
            await doAutoCheckout('wifi_disconnect');
            return;
          }
        }
      } catch (wifiErr) {
        console.warn('[WiFiMonitor] WiFi check failed:', wifiErr?.message);
      }
    }

    // ── GPS monitoring (check-in was via GPS geofence) ────────────────────────
    // Only run in foreground to avoid battery drain
    if (
      checkInMethod === 'location' &&
      checkInLocationLat != null &&
      checkInLocationLon != null &&
      checkInLocationRadius != null &&
      AppState.currentState === 'active'
    ) {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const distance = haversineMeters(
          loc.coords.latitude, loc.coords.longitude,
          checkInLocationLat, checkInLocationLon,
        );
        const allowed = checkInLocationRadius + GPS_BUFFER_M;

        if (distance <= allowed) {
          offLocationCount = 0;
        } else {
          offLocationCount += 1;
          console.log(`[WiFiMonitor] Out of geofence ${Math.round(distance)}m/${allowed}m (${offLocationCount}/${CONSECUTIVE_FAILURES})`);
          if (offLocationCount >= CONSECUTIVE_FAILURES) {
            offLocationCount = 0;
            await doAutoCheckout('location_disconnect');
            return;
          }
        }
      } catch (locErr) {
        // Can't get GPS right now — don't checkout on error, just wait
        console.warn('[WiFiMonitor] GPS check failed:', locErr?.message);
      }
    }
  } catch (err) {
    console.error('[WiFiMonitor] Monitor error:', err?.message || err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const startWifiMonitoring = () => {
  if (isMonitoring) return;
  console.log('[WiFiMonitor] Starting (allowed SSID:', ALLOWED_WIFI_NAME, ')');
  isMonitoring     = true;
  offWifiCount     = 0;
  offLocationCount = 0;

  // ⚠️  Do NOT run an immediate check — state may not be restored yet
  monitorInterval = setInterval(checkAndAutoCheckout, CHECK_INTERVAL_MS);

  if (Platform.OS !== 'web') {
    appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        offWifiCount     = 0;
        offLocationCount = 0;
        checkAndAutoCheckout();
      }
    });
  }
};

export const stopWifiMonitoring = () => {
  if (!isMonitoring) return;
  console.log('[WiFiMonitor] Stopping');
  isMonitoring     = false;
  offWifiCount     = 0;
  offLocationCount = 0;

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
export const forceWifiCheck = async () => { await checkAndAutoCheckout(); };
export const getOffWifiCount = () => offWifiCount;
