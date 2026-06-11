// screens/MySalaryScreen.js — employee's salary, test bank, and payout history.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../store/themeStore';
import { getMySalary, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';

const fmtMoney = (n, cur = 'INR') =>
  `${cur === 'INR' ? '₹' : cur + ' '}${Number(n).toLocaleString('en-IN')}`;

const STATUS_STYLE = {
  paid:    { color: '#3ee8c7', bg: 'rgba(62,232,199,0.15)', label: '✓ Paid' },
  failed:  { color: '#e5534b', bg: 'rgba(229,83,75,0.15)',  label: '✗ Failed' },
  pending: { color: '#e8b53e', bg: 'rgba(232,181,62,0.15)', label: '⋯ Pending' },
};

export default function MySalaryScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();
  const [salary, setSalary]   = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getMySalary();
      setSalary(res.data.salary);
      setPayouts(res.data.payouts || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: g.text }]}>My Salary</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={g.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={g.accent} />}
        >
          {salary ? (
            <LinearGradient colors={grad.card} style={[s.heroCard, { borderColor: g.border }]}>
              <Text style={[s.heroLabel, { color: g.textMuted }]}>MONTHLY SALARY</Text>
              <Text style={[s.heroAmount, { color: g.text }]}>{fmtMoney(salary.base_salary, salary.currency)}</Text>
              {salary.bank_account ? (
                <Text style={[s.heroBank, { color: g.textDim }]}>
                  🏦 {salary.bank_name} ••{String(salary.bank_account).slice(-4)} · {salary.bank_ifsc}
                </Text>
              ) : null}
            </LinearGradient>
          ) : (
            <LinearGradient colors={grad.card} style={[s.heroCard, { borderColor: g.border }]}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>💼</Text>
              <Text style={[s.heroLabel, { color: g.textMuted }]}>
                No salary configured yet — ask your admin to set it up in Payroll.
              </Text>
            </LinearGradient>
          )}

          <Text style={[s.sectionTitle, { color: g.textMuted }]}>PAYOUT HISTORY</Text>
          {payouts.length === 0 ? (
            <Text style={[s.empty, { color: g.textDim }]}>No payouts yet.</Text>
          ) : payouts.map((p) => {
            const st = STATUS_STYLE[p.status] || STATUS_STYLE.pending;
            return (
              <LinearGradient key={p.id} colors={grad.card} style={[s.payoutCard, { borderColor: g.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.payoutPeriod, { color: g.text }]}>{p.period}</Text>
                  <Text style={[s.payoutMeta, { color: g.textDim }]}>
                    {p.method === 'stripe_test' ? 'Stripe (test)' : 'Test gateway'}
                    {p.bank_ref ? ` → ${p.bank_ref}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 5 }}>
                  <Text style={[s.payoutAmount, { color: g.text }]}>{fmtMoney(p.amount, p.currency)}</Text>
                  <View style={[s.badge, { backgroundColor: st.bg }]}>
                    <Text style={{ color: st.color, fontSize: 11, fontWeight: '800' }}>{st.label}</Text>
                  </View>
                </View>
              </LinearGradient>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:    { flex: 1 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 10, gap: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title:   { flex: 1, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  centered:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  heroCard:   { borderRadius: 18, padding: 22, borderWidth: 1, alignItems: 'center', marginBottom: 18 },
  heroLabel:  { fontSize: 11, fontWeight: '800', letterSpacing: 1, textAlign: 'center' },
  heroAmount: { fontSize: 34, fontWeight: '900', marginTop: 6 },
  heroBank:   { fontSize: 12, marginTop: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  empty:    { fontSize: 13, marginTop: 4 },
  payoutCard: { borderRadius: 14, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  payoutPeriod: { fontSize: 15, fontWeight: '800' },
  payoutMeta:   { fontSize: 11, marginTop: 3 },
  payoutAmount: { fontSize: 15, fontWeight: '900' },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
});
