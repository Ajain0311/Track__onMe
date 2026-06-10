// screens/LeaveRequestScreen.js — Submit a new leave request

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import { getLeaveTypes, submitLeave, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';
import ScreenHeader from '../components/ScreenHeader';

const toISODate = (d) => d.toISOString().split('T')[0];

const addDays = (dateStr, n) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

const diffDays = (start, end) => {
  const s = new Date(start), e = new Date(end);
  const diff = Math.round((e - s) / 86400000) + 1;
  return Math.max(1, diff);
};

const fmtDisplay = (iso) =>
  new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function DateField({ label, value, onChange, minDate, g }) {
  if (Platform.OS === 'web') {
    return (
      <View style={s.field}>
        <Text style={[s.label, { color: g.textMuted }]}>{label}</Text>
        <input
          type="date"
          value={value}
          min={minDate}
          onChange={(e) => onChange(e.target.value)}
          style={{
            background: g.glass, border: `1px solid ${g.border}`,
            color: g.text, borderRadius: 10, padding: '10px 14px',
            fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
          }}
        />
      </View>
    );
  }
  // Native: simple text input showing date, user types YYYY-MM-DD
  return (
    <View style={s.field}>
      <Text style={[s.label, { color: g.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={g.textDim}
        style={[s.input, { color: g.text, backgroundColor: g.glass, borderColor: g.border }]}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      {value ? <Text style={{ color: g.textMuted, fontSize: 11, marginTop: 3 }}>{fmtDisplay(value)}</Text> : null}
    </View>
  );
}

export default function LeaveRequestScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const today = toISODate(new Date());

  const [leaveTypes, setLeaveTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [selectedType, setSelectedType] = useState(null);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getLeaveTypes()
      .then((r) => { setLeaveTypes(r.data.types || []); })
      .catch(() => toast.error('Could not load leave types.'))
      .finally(() => setTypesLoading(false));
  }, []);

  const days = diffDays(startDate, endDate);
  const canSubmit = selectedType && startDate <= endDate && reason.trim().length >= 10 && !submitting;

  const handleEndDateChange = (val) => {
    if (val < startDate) setEndDate(startDate);
    else setEndDate(val);
  };

  const handleStartDateChange = (val) => {
    setStartDate(val);
    if (endDate < val) setEndDate(val);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitLeave({
        leaveTypeId: selectedType.id,
        startDate,
        endDate,
        days,
        reason: reason.trim(),
      });
      toast.success('Leave request submitted!');
      navigation.goBack();
    } catch (e) {
      const msg = getApiErrorMessage(e);
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Submission failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader title="New Leave Request" onBack={() => navigation.goBack()} />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.inner}
        keyboardShouldPersistTaps="handled"
      >

        {/* Leave type selector */}
        <Text style={[s.sectionTitle, { color: g.textMuted }]}>LEAVE TYPE</Text>
        {typesLoading ? (
          <ActivityIndicator color={g.accent} style={{ marginVertical: 16 }} />
        ) : (
          <View style={s.typeGrid}>
            {leaveTypes.map((t) => {
              const selected = selectedType?.id === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setSelectedType(t)}
                  style={[
                    s.typeCard,
                    {
                      borderColor: selected ? t.color : g.border,
                      backgroundColor: selected ? `${t.color}22` : g.glass,
                    },
                  ]}
                >
                  <View style={[s.typeDot, { backgroundColor: t.color }]} />
                  <Text style={[s.typeName, { color: selected ? t.color : g.text }]}>{t.name}</Text>
                  {t.maxDays ? (
                    <Text style={[s.typeMax, { color: g.textDim }]}>Max {t.maxDays}d</Text>
                  ) : null}
                  {!t.isPaid ? (
                    <Text style={[s.typeMax, { color: '#9ca3af' }]}>Unpaid</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Dates */}
        <Text style={[s.sectionTitle, { color: g.textMuted, marginTop: 20 }]}>DATES</Text>
        <DateField label="Start Date" value={startDate} onChange={handleStartDateChange} minDate={today} g={g} />
        <DateField label="End Date" value={endDate} onChange={handleEndDateChange} minDate={startDate} g={g} />

        {/* Duration summary */}
        <LinearGradient colors={grad.card} style={[s.summaryCard, { borderColor: g.border }]}>
          <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '700' }}>DURATION</Text>
          <Text style={{ color: g.text, fontSize: 26, fontWeight: '900', marginTop: 2 }}>
            {days} <Text style={{ fontSize: 14, fontWeight: '600', color: g.textMuted }}>day{days !== 1 ? 's' : ''}</Text>
          </Text>
          <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 2 }}>
            {fmtDisplay(startDate)}{days > 1 ? ` → ${fmtDisplay(endDate)}` : ''}
          </Text>
        </LinearGradient>

        {/* Reason */}
        <Text style={[s.sectionTitle, { color: g.textMuted, marginTop: 20 }]}>REASON</Text>
        <View style={s.field}>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Describe the reason for your leave (min. 10 characters)…"
            placeholderTextColor={g.textDim}
            multiline
            numberOfLines={4}
            style={[s.textarea, { color: g.text, backgroundColor: g.glass, borderColor: reason.length >= 10 ? g.border : (reason.length > 0 ? '#ff7b9c' : g.border) }]}
          />
          <Text style={{ color: reason.length >= 10 ? g.textDim : '#ff7b9c', fontSize: 11, marginTop: 4, textAlign: 'right' }}>
            {reason.length}/1000
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, { opacity: canSubmit ? 1 : 0.45 }]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={canSubmit ? ['#8b7cff', '#6c63ff'] : ['#2a2a3e', '#1a1a2e']}
            style={s.submitGrad}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.submitText}>Submit Leave Request</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {!canSubmit && !submitting && (
          <Text style={{ color: g.textDim, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            {!selectedType ? 'Select a leave type · ' : ''}
            {reason.trim().length < 10 ? 'Add a reason (min. 10 chars)' : ''}
          </Text>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:   { flex: 1 },
  scroll: { flex: 1 },
  inner:  { padding: 20, paddingBottom: 100 },

  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: {
    flexBasis: '47%', borderRadius: 12, padding: 12,
    borderWidth: 1.5, alignItems: 'flex-start', gap: 4,
  },
  typeDot:  { width: 10, height: 10, borderRadius: 5 },
  typeName: { fontSize: 13, fontWeight: '800' },
  typeMax:  { fontSize: 11, fontWeight: '600' },

  field:    { marginBottom: 14 },
  label:    { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input:    { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14 },
  textarea: {
    borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14,
    minHeight: 110, textAlignVertical: 'top',
  },

  summaryCard: { borderRadius: 14, padding: 16, marginTop: 6, borderWidth: 1 },

  submitBtn:  { borderRadius: 16, overflow: 'hidden', marginTop: 24 },
  submitGrad: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
