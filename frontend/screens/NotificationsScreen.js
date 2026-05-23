// screens/NotificationsScreen.js — per-user notification inbox

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import {
  getNotifications, markNotificationRead, markAllNotificationsRead, getApiErrorMessage,
} from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import { useToast } from '../components/ToastProvider';

const formatTime = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

const iconFor = (type) => {
  if (!type) return '🔔';
  if (type.includes('approved')) return '✅';
  if (type.includes('rejected')) return '❌';
  if (type.includes('location')) return '📍';
  if (type.includes('check_in')) return '🟢';
  if (type.includes('check_out')) return '🔴';
  return '🔔';
};

export default function NotificationsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getNotifications(false);
      setItems(res.data.notifications || []);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleTap = async (item) => {
    if (!item.is_read) {
      try {
        await markNotificationRead(item.id);
        setItems((arr) => arr.map((n) => n.id === item.id ? { ...n, is_read: true } : n));
      } catch {/* non-fatal */}
    }
    if (item.link && navigation) {
      // We can't truly deep-link an arbitrary URL — but if the link matches a
      // known screen name, navigate there.
      const screen = item.link.replace(/^\/+/, '');
      if (screen) {
        try { navigation.navigate(screen); } catch {/* unknown route, ignore */}
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setItems((arr) => arr.map((n) => ({ ...n, is_read: true })));
      toast.success('Marked all as read');
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    }
  };

  const unreadCount = items.filter((n) => !n.is_read).length;

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[
        st.item,
        { backgroundColor: item.is_read ? g.glass : g.accentSoft, borderColor: g.border },
      ]}
      onPress={() => handleTap(item)}
      activeOpacity={0.75}
    >
      <Text style={st.itemIcon}>{iconFor(item.type)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[st.itemTitle, { color: g.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.body ? (
          <Text style={[st.itemBody, { color: g.textMuted }]} numberOfLines={2}>{item.body}</Text>
        ) : null}
        <Text style={[st.itemTime, { color: g.textDim }]}>{formatTime(item.created_at)}</Text>
      </View>
      {!item.is_read && <View style={[st.unreadDot, { backgroundColor: g.accent }]} />}
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={grad.screen} style={{ flex: 1 }}>
      <ScreenHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        onBack={() => navigation.goBack()}
        right={
          unreadCount > 0 ? (
            <TouchableOpacity onPress={handleMarkAllRead} style={st.headerAction}>
              <Text style={{ color: g.accent, fontSize: 12, fontWeight: '700' }}>Mark all read</Text>
            </TouchableOpacity>
          ) : null
        }
      />
      {loading ? (
        <LoadingState message="Loading notifications…" />
      ) : items.length === 0 ? (
        <EmptyState icon="🔕" title="No notifications yet" description="You're all caught up. We'll let you know when something happens." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={g.accent} />}
        />
      )}
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  headerAction: { paddingHorizontal: 10, paddingVertical: 4 },
  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  itemIcon:  { fontSize: 22, marginTop: 2 },
  itemTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  itemBody:  { fontSize: 12, lineHeight: 17, marginTop: 1 },
  itemTime:  { fontSize: 11, fontWeight: '600', marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
});
