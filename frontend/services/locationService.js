// services/locationService.js
// Cross-platform geolocation (Expo native + Web).
// Returns: { success, latitude, longitude, accuracy, timestamp, error? }

import * as Location from 'expo-location';
import { Platform } from 'react-native';

// ─── Web geolocation ─────────────────────────────────────────────────────────

const getLocationWeb = () =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ success: false, error: 'Geolocation not supported by this browser.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          success: true,
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:  pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) => {
        // Surface a friendly reason
        const reasons = {
          1: 'Permission denied. Please allow location access in your browser settings.',
          2: 'Location unavailable. Check that you have a stable internet/GPS signal.',
          3: 'Location request timed out. Please try again.',
        };
        resolve({ success: false, error: reasons[err.code] || err.message });
      },
      { timeout: 12_000, enableHighAccuracy: true, maximumAge: 60_000 }
    );
  });

// ─── Permission helper ───────────────────────────────────────────────────────

export const requestLocationPermission = async () => {
  if (Platform.OS === 'web') {
    // Web has no separate "ask" — the prompt happens on first getCurrentPosition.
    const r = await getLocationWeb();
    return { granted: r.success, error: r.error };
  }
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  return { granted: status === 'granted', canAskAgain };
};

// ─── Get current position ────────────────────────────────────────────────────

export const getCurrentLocation = async () => {
  if (Platform.OS === 'web') return getLocationWeb();

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { success: false, error: 'Location permission denied' };
  }
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      success:   true,
      latitude:  loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy:  loc.coords.accuracy,
      timestamp: loc.timestamp,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ─── Reverse-geocode (cross-platform best-effort) ───────────────────────────
// On native: uses Expo's built-in geocoder. On web: Nominatim (OpenStreetMap).

export const reverseGeocode = async (lat, lon) => {
  try {
    if (Platform.OS === 'web') {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!r.ok) return null;
      const data = await r.json();
      return data.display_name || null;
    }
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    if (!results?.length) return null;
    const r = results[0];
    return [r.name, r.street, r.city, r.region, r.country]
      .filter(Boolean).join(', ');
  } catch {
    return null;
  }
};

// ─── Validate that GPS works (for the dashboard preflight banner) ────────────

export const validateAttendanceLocation = async () => {
  const loc = await getCurrentLocation();
  if (!loc.success) {
    return { valid: false, message: `Location unavailable: ${loc.error}`, location: null };
  }
  return {
    valid: true,
    message: `GPS located (±${Math.round(loc.accuracy || 0)}m)`,
    location: {
      latitude:  loc.latitude,
      longitude: loc.longitude,
      accuracy:  loc.accuracy,
      timestamp: loc.timestamp,
    },
  };
};
