import * as Network from 'expo-network';
import { Platform } from 'react-native';

const ALLOWED_WIFI_NAME = 'realme';

const testInternetConnectivity = async () => {
  // On native: expo-network's isInternetReachable is more reliable than a HEAD fetch
  if (Platform.OS !== 'web') {
    try {
      const state = await Network.getNetworkStateAsync();
      if (state.isInternetReachable === true) return true;
      if (state.isInternetReachable === false) return false;
      // null / unknown — fall through to fetch test below
    } catch {}
  }
  // Web (and native fallback): no-cors GET — any opaque response means reachable, throw means not
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    await fetch('https://clients3.google.com/generate_204', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(id);
    return true;
  } catch {
    return false;
  }
};

export const getWifiInfo = async () => {
  try {
    const networkState = await Network.getNetworkStateAsync();
    return {
      isConnected: networkState.isConnected,
      isWifi: networkState.type === Network.NetworkStateType.WIFI,
      ssid: networkState.ssid,
      type: networkState.type,
      isInternetReachable: networkState.isInternetReachable,
    };
  } catch {
    return { isConnected: false, isWifi: false, ssid: null, type: null, isInternetReachable: false };
  }
};

export const getAllowedWifiName = () => ALLOWED_WIFI_NAME;

export const getNetworkTypeString = async () => {
  try {
    const info = await getWifiInfo();
    switch (info.type) {
      case Network.NetworkStateType.WIFI: return 'WiFi';
      case Network.NetworkStateType.CELLULAR: return 'Mobile data';
      case Network.NetworkStateType.ETHERNET: return 'Ethernet';
      default: return 'Unknown';
    }
  } catch {
    return 'Unknown';
  }
};

export const validateWifiConnection = async () => {
  try {
    const hasInternet = await testInternetConnectivity();
    if (!hasInternet) {
      return { valid: false, message: 'No internet access. Check your connection.' };
    }
    if (Platform.OS === 'web') {
      return { valid: true, message: 'Internet connected' };
    }
    const info = await getWifiInfo();
    const isWifiLike = info.isWifi ||
      info.type === Network.NetworkStateType.ETHERNET ||
      info.type === Network.NetworkStateType.UNKNOWN ||
      info.type === Network.NetworkStateType.OTHER;
    if (!isWifiLike) {
      return { valid: false, message: `On mobile data. Connect to "${ALLOWED_WIFI_NAME}" WiFi to check in.` };
    }
    if (info.ssid && info.ssid !== ALLOWED_WIFI_NAME) {
      return { valid: false, message: `Connected to "${info.ssid}". Switch to "${ALLOWED_WIFI_NAME}" WiFi.` };
    }
    return { valid: true, message: info.ssid ? `Connected to "${info.ssid}"` : 'WiFi connected' };
  } catch {
    return { valid: false, message: 'Could not verify network connection.' };
  }
};
