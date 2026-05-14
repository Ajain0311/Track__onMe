import * as Location from 'expo-location';
import { Platform } from 'react-native';

const getLocationWeb = () =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ success: false, error: 'Geolocation not supported in this browser' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          success: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) => resolve({ success: false, error: err.message }),
      { timeout: 10000, enableHighAccuracy: false, maximumAge: 60000 }
    );
  });

export const requestLocationPermission = async () => {
  if (Platform.OS === 'web') {
    const result = await getLocationWeb();
    return { granted: result.success, error: result.error };
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  return { granted: status === 'granted' };
};

export const getCurrentLocation = async () => {
  if (Platform.OS === 'web') {
    return getLocationWeb();
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { success: false, error: 'Location permission denied' };
  }
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      success: true,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      timestamp: loc.timestamp,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const validateAttendanceLocation = async () => {
  const loc = await getCurrentLocation();
  if (!loc.success) {
    return {
      valid: false,
      message: `Location unavailable: ${loc.error}`,
      location: null,
    };
  }
  return {
    valid: true,
    message: `GPS located (±${Math.round(loc.accuracy || 0)}m)`,
    location: {
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      timestamp: loc.timestamp,
    },
  };
};
