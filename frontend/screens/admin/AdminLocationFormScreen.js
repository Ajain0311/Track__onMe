// screens/admin/AdminLocationFormScreen.js

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Platform, Switch,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import { adminCreateLocation, adminUpdateLocation, getApiErrorMessage } from '../../services/api';

const getLocation = async () => {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => reject(new Error(err.message)),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    );
  }
  const Location = require('expo-location');
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission denied');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
};

export default function AdminLocationFormScreen({ route, navigation }) {
  const { location } = route.params ?? {};
  const isEditing = !!location;
  const { colors: g, gradients: grad } = useThemeStore();

  const [name, setName] = useState(location?.name ?? '');
  const [address, setAddress] = useState(location?.address ?? '');
  const [latitude, setLatitude] = useState(location?.latitude != null ? String(location.latitude) : '');
  const [longitude, setLongitude] = useState(location?.longitude != null ? String(location.longitude) : '');
  const [radius, setRadius] = useState(location?.radiusMeters != null ? String(location.radiusMeters) : '200');
  const [wifiSsids, setWifiSsids] = useState(location?.wifiSsids ?? []);
  const [newSsid, setNewSsid] = useState('');
  const [isActive, setIsActive] = useState(location?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);

  const addressRef = useRef(null);
  const latRef = useRef(null);
  const lonRef = useRef(null);
  const radiusRef = useRef(null);
  const ssidRef = useRef(null);

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const pos = await getLocation();
      setLatitude(String(pos.latitude.toFixed(6)));
      setLongitude(String(pos.longitude.toFixed(6)));
    } catch (err) {
      const msg = err.message || 'Could not get location';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Location Error', msg);
    } finally {
      setLocating(false);
    }
  };

  const handleAddSsid = () => {
    const trimmed = newSsid.trim();
    if (!trimmed) return;
    if (wifiSsids.includes(trimmed)) {
      setNewSsid('');
      return;
    }
    setWifiSsids((prev) => [...prev, trimmed]);
    setNewSsid('');
  };

  const handleRemoveSsid = (ssid) => {
    setWifiSsids((prev) => prev.filter((s) => s !== ssid));
  };

  const validate = () => {
    if (!name.trim()) return 'Location name is required.';
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) return 'Enter a valid latitude (-90 to 90).';
    if (isNaN(lon) || lon < -180 || lon > 180) return 'Enter a valid longitude (-180 to 180).';
    const r = parseInt(radius, 10);
    if (isNaN(r) || r < 10 || r > 10000) return 'Radius must be between 10 and 10000 meters.';
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);
    const payload = {
      name: name.trim(),
      address: address.trim() || null,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radiusMeters: parseInt(radius, 10),
      wifiSsids: wifiSsids.length > 0 ? wifiSsids : null,
      isActive,
    };
    try {
      if (isEditing) {
        await adminUpdateLocation(location.id, payload);
      } else {
        await adminCreateLocation(payload);
      }
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, children }) => (
    <View style={st.fieldGroup}>
      <Text style={[st.fieldLabel, { color: g.textMuted }]}>{label}</Text>
      {children}
    </View>
  );

  const inputStyle = [st.input, { backgroundColor: g.glass, borderColor: g.border, color: g.text }];

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
            <Text style={{ color: g.accent, fontSize: 16 }}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={[st.title, { color: g.text }]}>{isEditing ? 'Edit Location' : 'New Location'}</Text>
          <Text style={[st.subtitle, { color: g.textMuted }]}>
            {isEditing ? 'Update location details' : 'Add a work location for check-in'}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={st.form}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {error && (
            <View style={[st.errorBox, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
              <Text style={{ color: g.coral, fontSize: 13 }}>{error}</Text>
            </View>
          )}

          {/* Name */}
          <Field label="LOCATION NAME *">
            <TextInput
              style={inputStyle}
              placeholder="e.g. Main Office, HQ, Branch A"
              placeholderTextColor={g.textDim}
              value={name}
              onChangeText={setName}
              returnKeyType="next"
              onSubmitEditing={() => addressRef.current?.focus()}
            />
          </Field>

          {/* Address */}
          <Field label="ADDRESS (optional)">
            <TextInput
              ref={addressRef}
              style={inputStyle}
              placeholder="e.g. 123 Business Ave, City"
              placeholderTextColor={g.textDim}
              value={address}
              onChangeText={setAddress}
              returnKeyType="next"
              onSubmitEditing={() => latRef.current?.focus()}
            />
          </Field>

          {/* GPS */}
          <Field label="GPS COORDINATES *">
            <TouchableOpacity
              style={[st.gpsBtn, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}
              onPress={handleUseCurrentLocation}
              disabled={locating}
            >
              {locating
                ? <ActivityIndicator size="small" color={g.accent} />
                : <Text style={{ color: g.accent, fontSize: 13, fontWeight: '700' }}>📍 Use My Current Location</Text>
              }
            </TouchableOpacity>
            <View style={st.coordRow}>
              <View style={{ flex: 1 }}>
                <Text style={[st.coordLabel, { color: g.textDim }]}>Latitude</Text>
                <TextInput
                  ref={latRef}
                  style={inputStyle}
                  placeholder="e.g. 28.6139"
                  placeholderTextColor={g.textDim}
                  value={latitude}
                  onChangeText={setLatitude}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => lonRef.current?.focus()}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.coordLabel, { color: g.textDim }]}>Longitude</Text>
                <TextInput
                  ref={lonRef}
                  style={inputStyle}
                  placeholder="e.g. 77.2090"
                  placeholderTextColor={g.textDim}
                  value={longitude}
                  onChangeText={setLongitude}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => radiusRef.current?.focus()}
                />
              </View>
            </View>
          </Field>

          {/* Radius */}
          <Field label="CHECK-IN RADIUS (meters)">
            <TextInput
              ref={radiusRef}
              style={inputStyle}
              placeholder="200"
              placeholderTextColor={g.textDim}
              value={radius}
              onChangeText={setRadius}
              keyboardType="number-pad"
              returnKeyType="done"
            />
            <Text style={[st.hint, { color: g.textDim }]}>Users must be within this distance to check in via GPS</Text>
          </Field>

          {/* WiFi SSIDs */}
          <Field label="ALLOWED WIFI NETWORKS (optional)">
            <View style={st.ssidInputRow}>
              <TextInput
                ref={ssidRef}
                style={[inputStyle, { flex: 1 }]}
                placeholder="WiFi network name (SSID)"
                placeholderTextColor={g.textDim}
                value={newSsid}
                onChangeText={setNewSsid}
                returnKeyType="done"
                onSubmitEditing={handleAddSsid}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[st.addSsidBtn, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}
                onPress={handleAddSsid}
              >
                <Text style={{ color: g.accent, fontSize: 18, fontWeight: '900' }}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={[st.hint, { color: g.textDim }]}>Users connected to any of these networks can check in without GPS</Text>
            {wifiSsids.length > 0 && (
              <View style={st.ssidList}>
                {wifiSsids.map((ssid) => (
                  <View key={ssid} style={[st.ssidTag, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}>
                    <Text style={{ color: g.accent, fontSize: 12, fontWeight: '700' }}>📶 {ssid}</Text>
                    <TouchableOpacity onPress={() => handleRemoveSsid(ssid)} style={st.ssidRemove}>
                      <Text style={{ color: g.coral, fontSize: 14, fontWeight: '900', lineHeight: 16 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </Field>

          {/* Active toggle */}
          <LinearGradient colors={grad.card} style={[st.toggleCard, { borderColor: g.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: g.text, fontSize: 14, fontWeight: '700' }}>Active</Text>
              <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 2 }}>Users can check in at this location</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: g.glass, true: 'rgba(62,232,199,0.4)' }}
              thumbColor={isActive ? g.mint : g.textDim}
            />
          </LinearGradient>

          {/* Save button */}
          <TouchableOpacity
            style={[st.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={grad.mintBtn ?? ['#3ee8c7', '#2da8ff']}
              style={st.saveBtnGrad}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={st.saveBtnText}>{isEditing ? '✓ Save Changes' : '+ Create Location'}</Text>
              }
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={st.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={{ color: g.textMuted, fontSize: 14, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14 },
  backBtn: { marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '900' },
  subtitle: { fontSize: 13, marginTop: 4 },
  form: { padding: 20, paddingBottom: 50 },
  errorBox: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 16 },
  fieldGroup: { marginBottom: 20 },
  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14 },
  hint: { fontSize: 11, marginTop: 6, lineHeight: 16 },
  gpsBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  coordRow: { flexDirection: 'row', gap: 10 },
  coordLabel: { fontSize: 10, fontWeight: '700', marginBottom: 5 },
  ssidInputRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  addSsidBtn: { borderWidth: 1, borderRadius: 12, width: 46, alignItems: 'center', justifyContent: 'center' },
  ssidList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  ssidTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, gap: 6 },
  ssidRemove: { padding: 2 },
  toggleCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 24 },
  saveBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  saveBtnGrad: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
});
