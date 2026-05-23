// screens/LocationRequestScreen.js
// Users submit a request for a new work location.
// Admin reviews and approves/rejects. Approved locations appear only for that user.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import { submitLocationRequest, getApiErrorMessage } from '../services/api';
import { getCurrentLocation, reverseGeocode } from '../services/locationService';
import Toast from '../components/Toast';
import MapPreview from '../components/MapPreview';

export default function LocationRequestScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const [form, setForm] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    accuracy: null,
    capturedAt: null,
    radiusMeters: '200',
    notes: '',
    wifiSsids: [],
  });
  const [wifiInput, setWifiInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') =>
    setToast({ visible: true, message, type });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setMany = (patch) => setForm((f) => ({ ...f, ...patch }));

  const useCurrentLocation = async () => {
    setGpsLoading(true);
    try {
      const result = await getCurrentLocation();
      if (!result.success) {
        showToast(result.error || 'Could not read GPS', 'error');
        return;
      }
      setMany({
        latitude:   String(result.latitude.toFixed(7)),
        longitude:  String(result.longitude.toFixed(7)),
        accuracy:   result.accuracy ?? null,
        capturedAt: result.timestamp ? new Date(result.timestamp).toISOString() : new Date().toISOString(),
      });
      showToast(`GPS fixed (±${Math.round(result.accuracy || 0)}m)`, 'success');

      // Best-effort reverse geocode (only fills empty address)
      setGeocoding(true);
      try {
        const addr = await reverseGeocode(result.latitude, result.longitude);
        if (addr) {
          setForm((f) => (f.address ? f : { ...f, address: addr }));
        }
      } finally {
        setGeocoding(false);
      }
    } catch (e) {
      showToast('GPS error: ' + e.message, 'error');
    } finally {
      setGpsLoading(false);
    }
  };

  const addWifi = () => {
    const ssid = wifiInput.trim();
    if (!ssid) return;
    if (form.wifiSsids.includes(ssid)) {
      showToast('SSID already added', 'error'); return;
    }
    set('wifiSsids', [...form.wifiSsids, ssid]);
    setWifiInput('');
  };

  const removeWifi = (ssid) => set('wifiSsids', form.wifiSsids.filter((s) => s !== ssid));

  const validate = () => {
    if (!form.name.trim()) return 'Location name is required.';
    const lat = parseFloat(form.latitude);
    const lon = parseFloat(form.longitude);
    if (isNaN(lat) || lat < -90  || lat > 90)  return 'Enter a valid latitude (-90 to 90).';
    if (isNaN(lon) || lon < -180 || lon > 180) return 'Enter a valid longitude (-180 to 180).';
    const r = parseInt(form.radiusMeters);
    if (isNaN(r) || r < 10 || r > 10000) return 'Radius must be 10–10000 meters.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { showToast(err, 'error'); return; }

    setSubmitting(true);
    try {
      await submitLocationRequest({
        name:          form.name.trim(),
        address:       form.address.trim(),
        latitude:      parseFloat(form.latitude),
        longitude:     parseFloat(form.longitude),
        accuracy:      form.accuracy ?? undefined,
        capturedAt:    form.capturedAt || undefined,
        radiusMeters:  parseInt(form.radiusMeters, 10),
        wifiSsids:     form.wifiSsids,
        notes:         form.notes.trim() || undefined,
      });
      showToast('Request submitted! Admin will review it.', 'success');
      setTimeout(() => navigation.goBack(), 1800);
    } catch (e) {
      showToast(getApiErrorMessage(e), 'error');
      setSubmitting(false);
    }
  };

  const inputStyle = [st.input, { backgroundColor: g.glass, borderColor: g.border, color: g.text }];
  const labelStyle = { color: g.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 5, letterSpacing: 0.4 };

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      <Toast
        message={toast.message} type={toast.type} visible={toast.visible}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.back}>
            <Text style={{ color: g.accent, fontSize: 15, fontWeight: '700' }}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={[st.title, { color: g.text }]}>Request a Location</Text>
          <Text style={[st.subtitle, { color: g.textMuted }]}>
            Submit a work location for admin approval. Once approved, it will appear in your location picker.
          </Text>
        </View>

        <ScrollView contentContainerStyle={st.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Name */}
          <Text style={labelStyle}>LOCATION NAME *</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. Head Office, Client Site"
            placeholderTextColor={g.textDim}
            value={form.name}
            onChangeText={(v) => set('name', v)}
          />

          {/* Address */}
          <Text style={[labelStyle, { marginTop: 14 }]}>ADDRESS</Text>
          <TextInput
            style={inputStyle}
            placeholder="Street, City (optional)"
            placeholderTextColor={g.textDim}
            value={form.address}
            onChangeText={(v) => set('address', v)}
          />

          {/* Coordinates */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 5 }}>
            <Text style={labelStyle}>GPS COORDINATES *</Text>
            <TouchableOpacity onPress={useCurrentLocation} disabled={gpsLoading} style={[st.gpsBtn, { borderColor: g.accent }]}>
              {gpsLoading
                ? <ActivityIndicator size="small" color={g.accent} />
                : <Text style={{ color: g.accent, fontSize: 12, fontWeight: '700' }}>📍 Use My Location</Text>}
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              placeholder="Latitude"
              placeholderTextColor={g.textDim}
              keyboardType="numeric"
              value={form.latitude}
              onChangeText={(v) => set('latitude', v)}
            />
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              placeholder="Longitude"
              placeholderTextColor={g.textDim}
              keyboardType="numeric"
              value={form.longitude}
              onChangeText={(v) => set('longitude', v)}
            />
          </View>
          {(form.accuracy != null || form.capturedAt) && (
            <View style={[st.gpsMetaRow, { backgroundColor: g.glass, borderColor: g.border }]}>
              {form.accuracy != null && (
                <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '600' }}>
                  Accuracy: ±{Math.round(form.accuracy)}m
                </Text>
              )}
              {form.capturedAt && (
                <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '600' }}>
                  Captured: {new Date(form.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
              {geocoding && (
                <Text style={{ color: g.accent, fontSize: 11, fontWeight: '700' }}>resolving address…</Text>
              )}
            </View>
          )}

          {/* Map preview */}
          {form.latitude && form.longitude && !isNaN(parseFloat(form.latitude)) && !isNaN(parseFloat(form.longitude)) && (
            <View style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: g.border }}>
              <MapPreview
                latitude={parseFloat(form.latitude)}
                longitude={parseFloat(form.longitude)}
                radius={parseInt(form.radiusMeters, 10) || 200}
                height={200}
              />
            </View>
          )}

          {/* Radius */}
          <Text style={[labelStyle, { marginTop: 14 }]}>CHECK-IN RADIUS (METERS)</Text>
          <TextInput
            style={inputStyle}
            placeholder="200"
            placeholderTextColor={g.textDim}
            keyboardType="numeric"
            value={form.radiusMeters}
            onChangeText={(v) => set('radiusMeters', v)}
          />

          {/* WiFi SSIDs */}
          <Text style={[labelStyle, { marginTop: 14 }]}>WIFI NETWORKS (OPTIONAL)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              placeholder='e.g. "OfficeWiFi"'
              placeholderTextColor={g.textDim}
              value={wifiInput}
              onChangeText={setWifiInput}
              onSubmitEditing={addWifi}
            />
            <TouchableOpacity
              style={[st.addBtn, { backgroundColor: g.accent }]}
              onPress={addWifi}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>+</Text>
            </TouchableOpacity>
          </View>
          {form.wifiSsids.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {form.wifiSsids.map((ssid) => (
                <TouchableOpacity
                  key={ssid}
                  onPress={() => removeWifi(ssid)}
                  style={[st.ssidChip, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}
                >
                  <Text style={{ color: g.accent, fontSize: 12, fontWeight: '700' }}>📶 {ssid}  ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Notes */}
          <Text style={[labelStyle, { marginTop: 14 }]}>REASON / NOTES</Text>
          <TextInput
            style={[inputStyle, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            placeholder="Why do you need this location? (optional)"
            placeholderTextColor={g.textDim}
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            multiline
          />

          {/* Info banner */}
          <View style={[st.infoBanner, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>ℹ️</Text>
            <Text style={{ color: g.accent, fontSize: 12, flex: 1, fontWeight: '600' }}>
              Once approved by admin, this location will appear only in your check-in picker.
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[st.submitBtn, { backgroundColor: submitting ? g.textDim : g.accent }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={st.submitText}>Submit Request</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  back: { marginBottom: 14 },
  title: { fontSize: 24, fontWeight: '900' },
  subtitle: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  body: { paddingHorizontal: 20, paddingBottom: 50 },
  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, marginBottom: 4,
  },
  gpsBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  gpsMetaRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 14,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, marginTop: 8,
  },
  addBtn: {
    width: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  ssidChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 12, padding: 12, borderWidth: 1,
    marginTop: 18, marginBottom: 14,
  },
  submitBtn: {
    borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginBottom: 10,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
