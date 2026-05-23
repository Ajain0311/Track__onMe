// components/MapPreview.js — read-only map preview for a single point.
//
// Web: dynamically loads Leaflet (free OSM tiles, no API key needed)
// Native: shows a coordinate readout (a real native map would require
// expo-maps or react-native-maps which are heavyweight)

import React, { useEffect, useRef } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import useThemeStore from '../store/themeStore';

const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletLoadPromise = null;
const loadLeaflet = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;
  leafletLoadPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS_URL;
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = LEAFLET_JS_URL;
    script.async = true;
    script.onload  = () => resolve(window.L);
    script.onerror = (e) => { leafletLoadPromise = null; reject(e); };
    document.head.appendChild(script);
  });
  return leafletLoadPromise;
};

export default function MapPreview({ latitude, longitude, radius = 200, height = 200 }) {
  const { colors: g } = useThemeStore();

  // Native fallback — just show coordinates
  if (Platform.OS !== 'web') {
    return (
      <View style={[s.nativeCard, { backgroundColor: g.glass, borderColor: g.border, height }]}>
        <Text style={{ fontSize: 28, marginBottom: 8 }}>🗺</Text>
        <Text style={{ color: g.text, fontSize: 14, fontWeight: '700' }}>Map preview (web only)</Text>
        {latitude != null && longitude != null && (
          <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 6 }}>
            {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
          </Text>
        )}
      </View>
    );
  }
  return <WebMap latitude={latitude} longitude={longitude} radius={radius} height={height} />;
}

function WebMap({ latitude, longitude, radius, height }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  // Initialize once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await loadLeaflet();
      if (!L || cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          attributionControl: true,
          scrollWheelZoom: false,
          zoomControl: true,
        }).setView([latitude || 0, longitude || 0], 16);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        }).addTo(mapRef.current);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // React to latitude/longitude/radius changes
  useEffect(() => {
    if (!mapRef.current || latitude == null || longitude == null) return;
    const lat = Number(latitude), lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    const L = window.L;
    mapRef.current.setView([lat, lng], 16);

    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    else markerRef.current = L.marker([lat, lng]).addTo(mapRef.current);

    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng]);
      circleRef.current.setRadius(Number(radius) || 200);
    } else {
      circleRef.current = L.circle([lat, lng], {
        radius: Number(radius) || 200,
        color: '#8b7cff', fillColor: '#8b7cff', fillOpacity: 0.15, weight: 2,
      }).addTo(mapRef.current);
    }
  }, [latitude, longitude, radius]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height, borderRadius: 14, overflow: 'hidden' }}
    />
  );
}

const s = StyleSheet.create({
  nativeCard: {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, borderWidth: 1, padding: 16,
  },
});
