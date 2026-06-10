// screens/EmployeeDirectoryScreen.js — Browse all employees with dept/designation filter

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../store/themeStore';
import { adminGetProfiles, getDepartments, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';

function Avatar({ name, email, color, size = 44, g }) {
  const initials = (name || email || '?').charAt(0).toUpperCase();
  const bg = color ? `${color}22` : g.accentSoft;
  const fg = color || g.accent;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg, borderWidth: 1.5, borderColor: fg,
      justifyContent: 'center', alignItems: 'center',
    }}>
      <Text style={{ color: fg, fontSize: size * 0.38, fontWeight: '900' }}>{initials}</Text>
    </View>
  );
}

function EmployeeCard({ profile, deptColor, onPress, g, grad }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <LinearGradient colors={grad.card} style={[s.card, { borderColor: g.border }]}>
        <Avatar
          name={profile.displayName}
          email={profile.email}
          color={deptColor}
          g={g}
        />
        <View style={{ flex: 1 }}>
          <Text style={[s.name, { color: g.text }]} numberOfLines={1}>
            {profile.displayName || profile.email?.split('@')[0] || 'Unknown'}
          </Text>
          <Text style={[s.email, { color: g.textMuted }]} numberOfLines={1}>{profile.email || ''}</Text>
          <View style={s.tagsRow}>
            {!!profile.designation && (
              <View style={[s.tag, { backgroundColor: g.glass, borderColor: g.border }]}>
                <Text style={[s.tagTxt, { color: g.textMuted }]}>{profile.designation}</Text>
              </View>
            )}
            {!!profile.departmentName && (
              <View style={[s.tag, { backgroundColor: deptColor ? `${deptColor}22` : g.glass, borderColor: deptColor || g.border }]}>
                <Text style={[s.tagTxt, { color: deptColor || g.textMuted }]}>{profile.departmentName}</Text>
              </View>
            )}
            {!!profile.employeeId && (
              <View style={[s.tag, { backgroundColor: g.glass, borderColor: g.border }]}>
                <Text style={[s.tagTxt, { color: g.textDim }]}>{profile.employeeId}</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function EmployeeDirectoryScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [profiles, setProfiles]     = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [deptFilter, setDeptFilter] = useState(null);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([adminGetProfiles(), getDepartments()])
      .then(([pRes, dRes]) => {
        const depts = dRes.data.departments || [];
        setDepartments(depts);
        const deptMap = Object.fromEntries(depts.map((d) => [d.id, d]));
        const enriched = (pRes.data.profiles || []).map((p) => ({
          ...p,
          departmentName:  deptMap[p.departmentId]?.name || null,
          departmentColor: deptMap[p.departmentId]?.color || null,
        }));
        setProfiles(enriched);
      })
      .catch((e) => toast.error(getApiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []));

  const filtered = useMemo(() => {
    let list = profiles;
    if (deptFilter) list = list.filter((p) => p.departmentId === deptFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        (p.displayName || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.designation || '').toLowerCase().includes(q) ||
        (p.employeeId || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [profiles, deptFilter, search]);

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader title="Employee Directory" onBack={() => navigation.goBack()} />

      {/* Search */}
      <View style={[s.searchRow, { borderBottomColor: g.border }]}>
        <View style={[s.searchBox, { backgroundColor: g.glass, borderColor: g.border }]}>
          <Text style={{ fontSize: 14, marginRight: 8 }}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, email, role…"
            placeholderTextColor={g.textDim}
            style={{ flex: 1, color: g.text, fontSize: 14 }}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={{ color: g.textMuted, fontSize: 16, marginLeft: 8 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Department filter chips */}
      {departments.length > 0 && (
        <View style={s.chipRow}>
          <TouchableOpacity
            onPress={() => setDeptFilter(null)}
            style={[s.chip, !deptFilter && { backgroundColor: g.accent, borderColor: g.accent }]}
          >
            <Text style={[s.chipTxt, { color: !deptFilter ? '#fff' : g.textMuted }]}>All</Text>
          </TouchableOpacity>
          {departments.map((d) => (
            <TouchableOpacity
              key={d.id}
              onPress={() => setDeptFilter(deptFilter === d.id ? null : d.id)}
              style={[s.chip, deptFilter === d.id && { backgroundColor: `${d.color}22`, borderColor: d.color }]}
            >
              <View style={[s.chipDot, { backgroundColor: d.color }]} />
              <Text style={[s.chipTxt, { color: deptFilter === d.id ? d.color : g.textMuted }]}>{d.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={s.center}><ActivityIndicator color={g.accent} size="large" /></View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || deptFilter ? 'No matches' : 'No Employees'}
          description={search || deptFilter ? 'Try a different search or filter.' : 'No employee profiles found.'}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.userId || p.email}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <EmployeeCard
              profile={item}
              deptColor={item.departmentColor}
              g={g}
              grad={grad}
              onPress={() => {}} // future: navigate to employee detail
            />
          )}
          ListFooterComponent={
            <Text style={[s.footerTxt, { color: g.textDim }]}>{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</Text>
          }
        />
      )}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:   { padding: 16, paddingBottom: 80 },

  searchRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'transparent' },
  chipDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  chipTxt: { fontSize: 12, fontWeight: '700' },

  card:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10 },
  name:    { fontSize: 14, fontWeight: '800' },
  email:   { fontSize: 12, marginTop: 1 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  tag:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  tagTxt:  { fontSize: 11, fontWeight: '600' },

  footerTxt: { textAlign: 'center', fontSize: 12, marginTop: 8 },
});
