// screens/admin/AdminLocationsScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import { adminGetLocations, adminToggleLocation, adminDeleteLocation, getApiErrorMessage } from '../../services/api';

export default function AdminLocationsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminGetLocations();
      setLocations(res.data.locations || []);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (loc) => {
    try {
      const res = await adminToggleLocation(loc.id);
      setLocations((prev) => prev.map((l) => l.id === loc.id ? res.data.location : l));
    } catch (err) {
      const msg = getApiErrorMessage(err);
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const handleDelete = (loc) => {
    const proceed = async () => {
      try {
        await adminDeleteLocation(loc.id);
        setLocations((prev) => prev.filter((l) => l.id !== loc.id));
      } catch (err) {
        const msg = getApiErrorMessage(err);
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Error', msg);
      }
    };
    const msg = `Delete "${loc.name}"? This cannot be undone.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) proceed();
    } else {
      Alert.alert('Delete Location?', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: proceed },
      ]);
    }
  };

  const renderLocation = ({ item: loc }) => (
    <LinearGradient
      colors={loc.isActive ? grad.card : ['rgba(30,28,60,0.4)', 'rgba(18,18,36,0.3)']}
      style={[st.locCard, { borderColor: loc.isActive ? g.border : 'rgba(255,255,255,0.06)', opacity: loc.isActive ? 1 : 0.65 }]}
    >
      {/* Status bar */}
      <View style={[st.locStatusBar, { backgroundColor: loc.isActive ? g.mint : g.textDim }]} />

      <View style={{ flex: 1, padding: 14 }}>
        <View style={st.locTop}>
          <View style={{ flex: 1 }}>
            <Text style={[st.locName, { color: g.text }]}>{loc.name}</Text>
            {loc.address ? (
              <Text style={[st.locAddress, { color: g.textMuted }]}>{loc.address}</Text>
            ) : null}
          </View>
          <View style={[st.statusBadge, {
            backgroundColor: loc.isActive ? g.mintSoft : 'rgba(255,255,255,0.06)',
            borderColor: loc.isActive ? 'rgba(62,232,199,0.3)' : g.border,
          }]}>
            <Text style={{ color: loc.isActive ? g.mint : g.textDim, fontSize: 10, fontWeight: '800' }}>
              {loc.isActive ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={st.locDetails}>
          <View style={[st.detailChip, { backgroundColor: g.glass, borderColor: g.border }]}>
            <Text style={{ color: g.textMuted, fontSize: 11 }}>
              📍 {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
            </Text>
          </View>
          <View style={[st.detailChip, { backgroundColor: g.glass, borderColor: g.border }]}>
            <Text style={{ color: g.textMuted, fontSize: 11 }}>⭕ {loc.radiusMeters}m radius</Text>
          </View>
        </View>

        {loc.wifiSsids && loc.wifiSsids.length > 0 && (
          <View style={st.wifiRow}>
            <Text style={{ color: g.textDim, fontSize: 11 }}>📶 WiFi: </Text>
            {loc.wifiSsids.map((ssid) => (
              <View key={ssid} style={[st.ssidChip, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}>
                <Text style={{ color: g.accent, fontSize: 10, fontWeight: '700' }}>{ssid}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={st.locActions}>
          <TouchableOpacity
            style={[st.actionBtn, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}
            onPress={() => navigation.navigate('AdminLocationForm', { location: loc })}
          >
            <Text style={{ color: g.accent, fontSize: 12, fontWeight: '700' }}>✏️ Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.actionBtn, {
              backgroundColor: loc.isActive ? 'rgba(255,179,71,0.12)' : g.mintSoft,
              borderColor: loc.isActive ? 'rgba(255,179,71,0.3)' : 'rgba(62,232,199,0.3)',
            }]}
            onPress={() => handleToggle(loc)}
          >
            <Text style={{ color: loc.isActive ? '#ffb347' : g.mint, fontSize: 12, fontWeight: '700' }}>
              {loc.isActive ? '⏸ Disable' : '▶ Enable'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.actionBtn, { backgroundColor: g.coralSoft, borderColor: 'rgba(255,123,156,0.3)' }]}
            onPress={() => handleDelete(loc)}
          >
            <Text style={{ color: g.coral, fontSize: 12, fontWeight: '700' }}>🗑 Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={{ color: g.accent, fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <View style={st.headerRow}>
          <View>
            <Text style={[st.title, { color: g.text }]}>Locations</Text>
            <Text style={[st.subtitle, { color: g.textMuted }]}>
              {locations.filter((l) => l.isActive).length} active · {locations.length} total
            </Text>
          </View>
          <TouchableOpacity
            style={[st.addBtn, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}
            onPress={() => navigation.navigate('AdminLocationForm', { location: null })}
          >
            <Text style={{ color: g.accent, fontSize: 14, fontWeight: '800' }}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error && (
        <View style={[st.errorBox, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
          <Text style={{ color: g.coral, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator size="large" color={g.accent} />
        </View>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(l) => l.id}
          renderItem={renderLocation}
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={g.accent} />}
          ListEmptyComponent={
            <View style={st.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📍</Text>
              <Text style={[{ color: g.textMuted, fontSize: 16, marginBottom: 8 }]}>No locations yet</Text>
              <TouchableOpacity
                style={[{ backgroundColor: g.accentSoft, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: g.borderGlow }]}
                onPress={() => navigation.navigate('AdminLocationForm', { location: null })}
              >
                <Text style={{ color: g.accent, fontWeight: '700' }}>+ Add First Location</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14 },
  backBtn: { marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 13, marginTop: 4 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  errorBox: { borderRadius: 12, padding: 12, borderWidth: 1, marginHorizontal: 20, marginBottom: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 20, paddingBottom: 40 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  locCard: { flexDirection: 'row', borderRadius: 18, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  locStatusBar: { width: 5 },
  locTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  locName: { fontSize: 16, fontWeight: '800' },
  locAddress: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, marginLeft: 8 },
  locDetails: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  detailChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  wifiRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 12 },
  ssidChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  locActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
});
