// screens/admin/AdminUsersScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, Alert, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import { adminGetUsers, adminUpdateUserRole, getApiErrorMessage } from '../../services/api';

const fmtMinutes = (m) => {
  const h = Math.floor((m || 0) / 60), min = (m || 0) % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
};

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Never';

export default function AdminUsersScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const [users, setUsers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminGetUsers();
      setUsers(res.data.users || []);
      setFiltered(res.data.users || []);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search.trim()) { setFiltered(users); return; }
    const q = search.toLowerCase();
    setFiltered(users.filter((u) => u.email?.toLowerCase().includes(q)));
  }, [search, users]);

  const handleRoleToggle = (user) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const msg = `Make ${user.email} ${newRole === 'admin' ? 'an admin' : 'a regular user'}?`;
    const proceed = async () => {
      try {
        await adminUpdateUserRole(user.id, newRole);
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
      } catch (err) {
        if (Platform.OS === 'web') window.alert(getApiErrorMessage(err));
        else Alert.alert('Error', getApiErrorMessage(err));
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) proceed();
    } else {
      Alert.alert('Change Role', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: proceed },
      ]);
    }
  };

  const renderUser = ({ item: u }) => (
    <TouchableOpacity
      style={[st.row, { backgroundColor: u.isActiveNow ? 'rgba(62,232,199,0.06)' : 'transparent', borderColor: u.isActiveNow ? 'rgba(62,232,199,0.3)' : g.border }]}
      onPress={() => navigation.navigate('AdminUserDetail', { userId: u.id, email: u.email })}
      activeOpacity={0.8}
    >
      {/* Avatar */}
      <View style={[st.avatar, { backgroundColor: u.role === 'admin' ? 'rgba(255,179,71,0.2)' : g.accentSoft }]}>
        <Text style={{ color: u.role === 'admin' ? '#ffb347' : g.accent, fontSize: 16, fontWeight: '900' }}>
          {u.email?.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[st.email, { color: g.text }]} numberOfLines={1}>{u.email}</Text>
          {u.isActiveNow && (
            <View style={[st.liveChip, { backgroundColor: 'rgba(62,232,199,0.18)', borderColor: 'rgba(62,232,199,0.4)' }]}>
              <Text style={{ color: g.mint, fontSize: 9, fontWeight: '800' }}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={[st.meta, { color: g.textMuted }]}>
          {fmtMinutes(u.totalMinutes)} total · {u.sessionCount} sessions · Last: {fmtDate(u.lastSeen)}
        </Text>
      </View>

      {/* Role badge */}
      <TouchableOpacity
        style={[st.roleBadge, {
          backgroundColor: u.role === 'admin' ? 'rgba(255,179,71,0.18)' : g.glass,
          borderColor: u.role === 'admin' ? 'rgba(255,179,71,0.4)' : g.border,
        }]}
        onPress={() => handleRoleToggle(u)}
      >
        <Text style={{ color: u.role === 'admin' ? '#ffb347' : g.textMuted, fontSize: 10, fontWeight: '800' }}>
          {u.role === 'admin' ? '⚡ Admin' : 'User'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={{ color: g.accent, fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[st.title, { color: g.text }]}>Users</Text>
        <Text style={[st.subtitle, { color: g.textMuted }]}>{users.length} registered</Text>
        <TextInput
          style={[st.searchInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
          placeholder="Search by email…"
          placeholderTextColor={g.textDim}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      {error && (
        <View style={[st.errorBox, { backgroundColor: g.errorBg, borderColor: g.errorBorder, marginHorizontal: 20, marginBottom: 10 }]}>
          <Text style={{ color: g.coral, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[{ color: g.textMuted, marginTop: 12, fontSize: 14 }]}>Loading users…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          renderItem={renderUser}
          contentContainerStyle={st.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={g.accent} />}
          ListEmptyComponent={
            <View style={st.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>👥</Text>
              <Text style={{ color: g.textMuted, fontSize: 16 }}>No users found</Text>
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
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  searchInput: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  errorBox: { borderRadius: 12, padding: 12, borderWidth: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  email: { fontSize: 14, fontWeight: '700', flex: 1 },
  meta: { fontSize: 11, marginTop: 3 },
  liveChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, marginLeft: 8 },
});
