// screens/LocationPickerScreen.js — select work location before check-in

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import { getActiveLocations, getApiErrorMessage } from '../services/api';
import { getCurrentLocation } from '../services/locationService';
import { getWifiInfo } from '../services/wifiService';

// Haversine distance in meters
const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const fmtDistance = (m) => m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;

export default function LocationPickerScreen({ navigation, route }) {
  const { mode } = route.params ?? { mode: 'checkin' };
  const { colors: g, gradients: grad } = useThemeStore();
  const [locations, setLocations] = useState([]);
  const [userGps, setUserGps] = useState(null);
  const [currentSsid, setCurrentSsid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selecting, setSelecting] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [locRes, gpsRes, wifiRes] = await Promise.all([
        getActiveLocations(),
        getCurrentLocation(),
        getWifiInfo(),
      ]);
      setLocations(locRes.data.locations || []);
      if (gpsRes.success) setUserGps(gpsRes);
      setCurrentSsid(wifiRes.ssid ?? null);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Enrich locations with distance + wifi match
  const enriched = locations.map((loc) => {
    const distanceM = userGps
      ? haversineMeters(userGps.latitude, userGps.longitude, loc.latitude, loc.longitude)
      : null;
    const gpsValid = distanceM != null && distanceM <= loc.radiusMeters;
    const wifiMatch = !!(
      currentSsid &&
      loc.wifiSsids?.length > 0 &&
      loc.wifiSsids.includes(currentSsid)
    );
    const canCheckIn = gpsValid || wifiMatch;
    return { ...loc, distanceM, gpsValid, wifiMatch, canCheckIn };
  }).sort((a, b) => {
    // Sort: valid first, then by distance
    if (a.canCheckIn !== b.canCheckIn) return a.canCheckIn ? -1 : 1;
    if (a.distanceM != null && b.distanceM != null) return a.distanceM - b.distanceM;
    return 0;
  });

  const handleSelect = async (loc) => {
    if (!loc.canCheckIn) return;
    setSelecting(loc.id);
    const locationData = loc.wifiMatch
      ? { locationId: loc.id, locationName: loc.name }
      : {
          latitude: userGps.latitude,
          longitude: userGps.longitude,
          accuracy: userGps.accuracy ?? null,
          locationId: loc.id,
          locationName: loc.name,
        };
    // Replace this screen with FaceVerification so back goes to Dashboard
    navigation.replace('FaceVerification', { mode, location: locationData });
  };

  const renderLocation = ({ item: loc }) => {
    const isSelecting = selecting === loc.id;
    return (
      <TouchableOpacity
        onPress={() => handleSelect(loc)}
        disabled={!loc.canCheckIn || !!selecting}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={loc.canCheckIn ? grad.card : ['rgba(20,18,40,0.3)', 'rgba(12,12,24,0.25)']}
          style={[st.card, {
            borderColor: loc.canCheckIn
              ? loc.wifiMatch ? 'rgba(62,232,199,0.5)' : 'rgba(74,144,226,0.5)'
              : g.border,
            opacity: loc.canCheckIn ? 1 : 0.5,
          }]}
        >
          {/* Left accent bar */}
          <View style={[st.accentBar, {
            backgroundColor: loc.canCheckIn
              ? loc.wifiMatch ? g.mint : '#4a90e2'
              : g.textDim,
          }]} />

          <View style={{ flex: 1, padding: 14 }}>
            <View style={st.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={[st.locName, { color: g.text }]}>{loc.name}</Text>
                {loc.address ? (
                  <Text style={[st.locAddr, { color: g.textMuted }]}>{loc.address}</Text>
                ) : null}
              </View>

              {/* Status badge */}
              {loc.canCheckIn ? (
                <View style={[st.badge, {
                  backgroundColor: loc.wifiMatch ? g.mintSoft : 'rgba(74,144,226,0.15)',
                  borderColor: loc.wifiMatch ? 'rgba(62,232,199,0.4)' : 'rgba(74,144,226,0.4)',
                }]}>
                  <Text style={{ color: loc.wifiMatch ? g.mint : '#4a90e2', fontSize: 9, fontWeight: '800' }}>
                    {loc.wifiMatch ? '📶 WiFi' : '📍 GPS'}
                  </Text>
                </View>
              ) : (
                <View style={[st.badge, { backgroundColor: 'rgba(255,123,156,0.1)', borderColor: 'rgba(255,123,156,0.3)' }]}>
                  <Text style={{ color: g.coral, fontSize: 9, fontWeight: '800' }}>OUT OF RANGE</Text>
                </View>
              )}
            </View>

            {/* Distance + radius info */}
            <View style={st.metaRow}>
              {loc.distanceM != null && (
                <View style={[st.chip, { backgroundColor: g.glass, borderColor: g.border }]}>
                  <Text style={{ color: loc.gpsValid ? '#4a90e2' : g.textDim, fontSize: 11 }}>
                    📍 {fmtDistance(loc.distanceM)} away
                  </Text>
                </View>
              )}
              <View style={[st.chip, { backgroundColor: g.glass, borderColor: g.border }]}>
                <Text style={{ color: g.textDim, fontSize: 11 }}>⭕ {loc.radiusMeters}m</Text>
              </View>
              {loc.wifiSsids?.length > 0 && (
                <View style={[st.chip, { backgroundColor: g.glass, borderColor: g.border }]}>
                  <Text style={{ color: g.textDim, fontSize: 11 }}>📶 {loc.wifiSsids.length} net{loc.wifiSsids.length > 1 ? 's' : ''}</Text>
                </View>
              )}
            </View>

            {/* Reason can't check in */}
            {!loc.canCheckIn && loc.distanceM != null && (
              <Text style={{ color: g.coral, fontSize: 11, marginTop: 4 }}>
                {fmtDistance(loc.distanceM)} away — must be within {loc.radiusMeters}m{loc.wifiSsids?.length > 0 ? ' or on WiFi' : ''}
              </Text>
            )}
          </View>

          {/* Chevron / loading */}
          {loc.canCheckIn && (
            <View style={st.chevronArea}>
              {isSelecting
                ? <ActivityIndicator size="small" color={g.accent} />
                : <Text style={{ color: g.accent, fontSize: 20 }}>›</Text>
              }
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={{ color: g.accent, fontSize: 16 }}>✕ Cancel</Text>
        </TouchableOpacity>
        <Text style={[st.title, { color: g.text }]}>Select Location</Text>
        <Text style={[st.subtitle, { color: g.textMuted }]}>Choose your work location to check in</Text>

        {currentSsid && (
          <View style={[st.wifiBanner, { backgroundColor: g.mintSoft, borderColor: 'rgba(62,232,199,0.3)' }]}>
            <Text style={{ color: g.mint, fontSize: 12, fontWeight: '700' }}>
              📶 Connected to "{currentSsid}"
            </Text>
          </View>
        )}
      </View>

      {error && (
        <View style={[st.errorBox, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
          <Text style={{ color: g.coral, fontSize: 13 }}>{error}</Text>
          <TouchableOpacity onPress={load} style={{ marginTop: 8 }}>
            <Text style={{ color: g.accent, fontWeight: '700', fontSize: 13 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={{ color: g.textMuted, marginTop: 12, fontSize: 14 }}>Getting locations…</Text>
        </View>
      ) : (
        <FlatList
          data={enriched}
          keyExtractor={(l) => l.id}
          renderItem={renderLocation}
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={st.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📍</Text>
              <Text style={{ color: g.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
                No active locations yet.{'\n'}Request one and admin will approve it.
              </Text>
              <TouchableOpacity
                style={[st.reqBtn, { backgroundColor: g.accent }]}
                onPress={() => navigation.navigate('LocationRequest')}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>+ Request a Location</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={
            enriched.length > 0 ? (
              <View style={st.footer}>
                <TouchableOpacity
                  style={[st.footerBtn, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}
                  onPress={() => navigation.navigate('LocationRequest')}
                >
                  <Text style={{ color: g.accent, fontWeight: '700', fontSize: 13 }}>+ Request a new location</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.footerBtn, { backgroundColor: g.glass, borderColor: g.border, marginTop: 8 }]}
                  onPress={() => navigation.navigate('MyLocationRequests')}
                >
                  <Text style={{ color: g.textMuted, fontWeight: '600', fontSize: 13 }}>📋 My location requests</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  backBtn: { marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '900' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  wifiBanner: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, alignSelf: 'flex-start' },
  errorBox: { borderRadius: 12, padding: 12, borderWidth: 1, marginHorizontal: 20, marginBottom: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 20, paddingBottom: 40 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  card: { flexDirection: 'row', borderRadius: 16, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  accentBar: { width: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  locName: { fontSize: 15, fontWeight: '800' },
  locAddr: { fontSize: 11, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, marginLeft: 8 },
  metaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  chevronArea: { justifyContent: 'center', paddingHorizontal: 14 },
  footer: { paddingTop: 10, paddingBottom: 20 },
  footerBtn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
  reqBtn: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 },
});
