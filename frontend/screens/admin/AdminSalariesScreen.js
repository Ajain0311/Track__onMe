// screens/admin/AdminSalariesScreen.js — Payroll: salaries, dispatch, autopay.
//
// Payments go through the payment provider on the backend: Stripe TEST mode
// when STRIPE_SECRET_KEY is configured, otherwise the built-in simulated
// gateway. Every employee gets auto-generated TEST bank details.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import {
  adminGetUsers, adminGetProfiles,
  adminGetSalaries, adminSetSalary, adminDispatchSalary, adminDispatchAllSalaries,
  adminGetSalaryPayouts, adminGetSalarySettings, adminSetSalarySettings,
  getApiErrorMessage,
} from '../../services/api';
import { useToast } from '../../components/ToastProvider';

const currentPeriod = () => new Date().toISOString().slice(0, 7);

const shiftPeriod = (period, delta) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

const fmtMoney = (n, cur = 'INR') =>
  `${cur === 'INR' ? '₹' : cur + ' '}${Number(n).toLocaleString('en-IN')}`;

export default function AdminSalariesScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [users, setUsers]       = useState([]);
  const [salaries, setSalaries] = useState({});   // userId → salary row
  const [payouts, setPayouts]   = useState({});   // userId → payout row (selected period)
  const [settings, setSettings] = useState(null);
  const [provider, setProvider] = useState('simulated');
  const [period, setPeriod]     = useState(currentPeriod());
  const [loading, setLoading]   = useState(true);
  const [dispatching, setDispatching] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser]   = useState(null);
  const [salaryInput, setSalaryInput]   = useState('');
  const [saving, setSaving]             = useState(false);

  const load = useCallback(async (forPeriod = period) => {
    setLoading(true);
    try {
      const [usersRes, profilesRes, salariesRes, payoutsRes, settingsRes] = await Promise.all([
        adminGetUsers(1),
        adminGetProfiles(),
        adminGetSalaries(),
        adminGetSalaryPayouts({ period: forPeriod }),
        adminGetSalarySettings(),
      ]);
      const profileMap = Object.fromEntries(
        (profilesRes.data.profiles || []).map((p) => [p.user_id, p])
      );
      setUsers(
        (usersRes.data.users || []).map((u) => ({
          ...u,
          displayName: profileMap[u.id]?.display_name || u.email?.split('@')[0],
        }))
      );
      setSalaries(Object.fromEntries((salariesRes.data.salaries || []).map((s) => [s.user_id, s])));
      setPayouts(Object.fromEntries((payoutsRes.data.payouts || []).map((p) => [p.user_id, p])));
      setSettings(settingsRes.data.settings);
      setProvider(settingsRes.data.provider || 'simulated');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changePeriod = (delta) => {
    const next = shiftPeriod(period, delta);
    setPeriod(next);
    load(next);
  };

  const toggleAutopay = async () => {
    try {
      const res = await adminSetSalarySettings({ autopayEnabled: !settings?.autopay_enabled });
      setSettings(res.data.settings);
      toast.success(res.data.settings.autopay_enabled
        ? `Autopay ON — salaries dispatch on day ${res.data.settings.autopay_day} of each month`
        : 'Autopay OFF');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setSalaryInput(String(salaries[user.id]?.base_salary ?? ''));
    setModalVisible(true);
  };

  const handleSaveSalary = async () => {
    const amount = Number(salaryInput);
    if (!Number.isFinite(amount) || amount < 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await adminSetSalary(editingUser.id, { baseSalary: amount });
      toast.success(`Salary set for ${editingUser.displayName}`);
      setModalVisible(false);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const payOne = async (user) => {
    try {
      const res = await adminDispatchSalary(user.id, period);
      if (res.data.skipped) toast.info(`${user.displayName} is already paid for ${period}`);
      else if (res.data.payout?.status === 'paid') toast.success(`Paid ${user.displayName} for ${period} 💸`);
      else toast.error(`Payment failed for ${user.displayName}`);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const payAll = () => {
    const run = async () => {
      setDispatching(true);
      try {
        const res = await adminDispatchAllSalaries(period);
        const { paid, skipped, failed } = res.data;
        toast.success(`${period}: ${paid} paid, ${skipped} already paid${failed ? `, ${failed} failed` : ''}`);
        await load();
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      } finally {
        setDispatching(false);
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Dispatch ALL configured salaries for ${period}?`)) run();
    } else {
      Alert.alert('Dispatch payroll', `Dispatch ALL configured salaries for ${period}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Dispatch', onPress: run },
      ]);
    }
  };

  const autopayOn = !!settings?.autopay_enabled;

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: g.text }]}>Payroll</Text>
        <TouchableOpacity
          onPress={toggleAutopay}
          style={[s.autopayBtn, {
            backgroundColor: autopayOn ? 'rgba(62,232,199,0.15)' : g.glass,
            borderColor: autopayOn ? '#3ee8c7' : g.border,
          }]}
        >
          <Text style={{ color: autopayOn ? '#3ee8c7' : g.textMuted, fontWeight: '800', fontSize: 12 }}>
            {autopayOn ? '⚡ Autopay ON' : 'Autopay OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[s.hint, { color: g.textDim }]}>
        Gateway: {provider === 'simulated' ? 'Simulated (set STRIPE_SECRET_KEY for Stripe test mode)' : 'Stripe — test mode'} ·
        Test bank accounts are auto-created. No real money moves.
      </Text>

      <View style={s.periodRow}>
        <TouchableOpacity onPress={() => changePeriod(-1)} style={[s.periodArrow, { backgroundColor: g.glass }]}>
          <Text style={{ color: g.text, fontSize: 16 }}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.periodText, { color: g.text }]}>{period}</Text>
        <TouchableOpacity onPress={() => changePeriod(1)} style={[s.periodArrow, { backgroundColor: g.glass }]}>
          <Text style={{ color: g.text, fontSize: 16 }}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={payAll}
          disabled={dispatching}
          style={[s.payAllBtn, { backgroundColor: g.accent, opacity: dispatching ? 0.6 : 1 }]}
        >
          {dispatching
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>💸 Dispatch all</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={g.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {users.map((u) => {
            const sal = salaries[u.id];
            const pay = payouts[u.id];
            return (
              <LinearGradient key={u.id} colors={grad.card} style={[s.card, { borderColor: g.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { color: g.text }]} numberOfLines={1}>{u.displayName}</Text>
                  <Text style={[s.email, { color: g.textDim }]} numberOfLines={1}>{u.email}</Text>
                  {sal?.bank_account ? (
                    <Text style={[s.bank, { color: g.textDim }]}>
                      🏦 {sal.bank_name} ••{String(sal.bank_account).slice(-4)}
                    </Text>
                  ) : null}
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <TouchableOpacity onPress={() => openEdit(u)}>
                    <Text style={[s.amount, { color: sal ? g.text : g.textDim }]}>
                      {sal ? fmtMoney(sal.base_salary, sal.currency) : '+ Set salary'}
                    </Text>
                  </TouchableOpacity>
                  {pay ? (
                    <View style={[s.badge, {
                      backgroundColor: pay.status === 'paid' ? 'rgba(62,232,199,0.15)' : 'rgba(229,83,75,0.15)',
                    }]}>
                      <Text style={{
                        color: pay.status === 'paid' ? '#3ee8c7' : '#e5534b',
                        fontSize: 11, fontWeight: '800',
                      }}>
                        {pay.status === 'paid' ? `✓ Paid ${period}` : '✗ Failed'}
                      </Text>
                    </View>
                  ) : sal ? (
                    <TouchableOpacity onPress={() => payOne(u)} style={[s.payBtn, { backgroundColor: g.accentSoft }]}>
                      <Text style={{ color: g.accent, fontWeight: '800', fontSize: 12 }}>Pay {period}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </LinearGradient>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={m.overlay}>
          <LinearGradient colors={grad.card} style={[m.sheet, { borderColor: g.border }]}>
            <Text style={[m.title, { color: g.text }]}>Salary — {editingUser?.displayName}</Text>
            <Text style={[m.label, { color: g.textMuted }]}>Monthly salary (INR)</Text>
            <TextInput
              style={[m.input, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
              value={salaryInput}
              onChangeText={setSalaryInput}
              keyboardType="numeric"
              placeholder="e.g. 50000"
              placeholderTextColor={g.textDim}
            />
            <Text style={[m.note, { color: g.textDim }]}>
              A test bank account is created automatically on first save.
            </Text>
            <View style={m.btnRow}>
              <TouchableOpacity onPress={() => setModalVisible(false)}
                style={[m.btn, { backgroundColor: g.glass, borderColor: g.border }]}>
                <Text style={{ color: g.textMuted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveSalary} disabled={saving}
                style={[m.btn, { backgroundColor: g.accent, opacity: saving ? 0.6 : 1 }]}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:    { flex: 1 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8, gap: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title:   { flex: 1, fontSize: 22, fontWeight: '900' },
  autopayBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  hint:    { fontSize: 11, paddingHorizontal: 20, marginBottom: 10, lineHeight: 16 },
  periodRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 10, marginBottom: 10 },
  periodArrow: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  periodText:  { fontSize: 15, fontWeight: '800', minWidth: 72, textAlign: 'center' },
  payAllBtn:   { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  centered:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20, gap: 8 },
  card:    { borderRadius: 14, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name:    { fontSize: 14, fontWeight: '800' },
  email:   { fontSize: 11, marginTop: 1 },
  bank:    { fontSize: 11, marginTop: 4 },
  amount:  { fontSize: 15, fontWeight: '900' },
  badge:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  payBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, gap: 10 },
  title:   { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  label:   { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:   { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  note:    { fontSize: 11, lineHeight: 16 },
  btnRow:  { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn:     { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
});
