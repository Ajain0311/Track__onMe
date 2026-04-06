// services/wifiService.js
// WiFi network detection and validation

import * as Network from 'expo-network';
import { Platform } from 'react-native';

const ALLOWED_WIFI_NAME = 'realme';

/**
 * Get current network information
 * @returns {Promise<Object>} Network state info
 */
export const getWifiInfo = async () => {
  try {
    const networkState = await Network.getNetworkStateAsync();
    return {
      isConnected: networkState.isConnected,
      isWifi: networkState.type === Network.NetworkStateType.WIFI,
      ssid: networkState.ssid, // May be null on some platforms without proper permissions
      type: networkState.type,
      isInternetReachable: networkState.isInternetReachable,
    };
  } catch (error) {
    console.error('[WiFi] Error getting network info:', error);
    return {
      isConnected: false,
      isWifi: false,
      ssid: null,
      type: null,
      isInternetReachable: false,
      error: error.message,
    };
  }
};

/**
 * Check if currently connected to the allowed WiFi network
 * Note: On some platforms, SSID may be null without location permissions
 * @returns {Promise<boolean>}
 */
export const isAllowedWifi = async () => {
  try {
    const info = await getWifiInfo();
    
    // Must be connected to WiFi
    if (!info.isConnected || !info.isWifi) {
      return false;
    }
    
    // Check SSID if available
    if (info.ssid) {
      return info.ssid === ALLOWED_WIFI_NAME;
    }
    
    // If SSID is not available (common on web or without permissions),
    // we can only verify it's WiFi connection
    // In production, you might want to use IP range validation as fallback
    console.warn('[WiFi] SSID not available - allowing WiFi connection without SSID verification');
    return true; // Allow if on WiFi but SSID unknown
  } catch (error) {
    console.error('[WiFi] Error checking allowed WiFi:', error);
    return false;
  }
};

/**
 * Get the allowed WiFi network name
 * @returns {string}
 */
export const getAllowedWifiName = () => ALLOWED_WIFI_NAME;

/**
 * Check if device is connected to any WiFi network
 * @returns {Promise<boolean>}
 */
export const isWifiConnected = async () => {
  try {
    const info = await getWifiInfo();
    return info.isConnected && info.isWifi;
  } catch (error) {
    console.error('[WiFi] Error checking WiFi connection:', error);
    return false;
  }
};

/**
 * Get current network type as string
 * @returns {Promise<string>}
 */
export const getNetworkTypeString = async () => {
  try {
    const info = await getWifiInfo();
    switch (info.type) {
      case Network.NetworkStateType.WIFI:
        return 'WiFi';
      case Network.NetworkStateType.CELLULAR:
        return 'Cellular';
      case Network.NetworkStateType.ETHERNET:
        return 'Ethernet';
      case Network.NetworkStateType.BLUETOOTH:
        return 'Bluetooth';
      case Network.NetworkStateType.WIMAX:
        return 'WiMAX';
      case Network.NetworkStateType.VPN:
        return 'VPN';
      case Network.NetworkStateType.OTHER:
        return 'Other';
      case Network.NetworkStateType.NONE:
        return 'None';
      default:
        return 'Unknown';
    }
  } catch (error) {
    return 'Unknown';
  }
};

/**
 * Validate WiFi connection with detailed error message
 * @returns {Promise<{valid: boolean, message: string}>}
 */
export const validateWifiConnection = async () => {
  try {
    const info = await getWifiInfo();
    
    console.log('[WiFi] Network info:', info);
    
    if (!info.isConnected) {
      return {
        valid: false,
        message: 'No network connection. Please connect to WiFi.',
      };
    }
    
    // On web, the network type might be UNKNOWN or OTHER even when on WiFi
    // So we allow any connection type if SSID matches or if we're on a known WiFi type
    const isLikelyWifi = info.isWifi || 
                         info.type === Network.NetworkStateType.UNKNOWN ||
                         info.type === Network.NetworkStateType.OTHER;
    
    // On web platform, we can't reliably detect WiFi vs cellular
    const isWeb = Platform.OS === 'web';
    
    if (!isLikelyWifi && !isWeb) {
      return {
        valid: false,
        message: `Connected via ${await getNetworkTypeString()}. Please connect to WiFi.`,
      };
    }
    
    // If SSID is available, verify it's the allowed network
    // Skip SSID check on web since we can't reliably get it
    if (!isWeb && info.ssid && info.ssid !== ALLOWED_WIFI_NAME) {
      return {
        valid: false,
        message: `Connected to "${info.ssid}". Please connect to "${ALLOWED_WIFI_NAME}" WiFi.`,
      };
    }
    
    // If SSID is null (common on web), we can't verify the network name
    // but we allow it since we're connected
    return {
      valid: true,
      message: isWeb 
        ? 'Network connected (WiFi validation skipped on web)' 
        : info.ssid 
          ? `Connected to "${info.ssid}"` 
          : `Connected to network`,
    };
  } catch (error) {
    console.error('[WiFi] Validation error:', error);
    return {
      valid: false,
      message: 'Error checking WiFi connection: ' + error.message,
    };
  }
};
