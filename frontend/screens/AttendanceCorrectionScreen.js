// screens/AttendanceCorrectionScreen.js — Submit attendance correction request

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import { submitCorrection, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';
import ScreenHeader from '../components/ScreenHeader';

const fmtDateTime = (iso) => {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const toLocalDatetimeInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function TimeField({ label, value, onChange, g }) {
  if (Platform.OS === 'web') {
    return (
      <View style={s.field}>
        <Text style={[s.label, { color: g.textMuted }]}>{label}</Text>
        <input
          type="datetime-local"
          value={value}
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
  return (
    <View style={s.field}>
      <Text style={[s.label, { color: g.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DDTHH:MM"
        placeholderTextColor={g.textDim}
        style={[s.input, { color: g.text, backgroundColor: g.glass, borderColor: g.border }]}
        keyboardType="numbers-and-punctuation"
        maxLength={16}
      />
    </View>
  );
}

export default function AttendanceCorrectionScreen({ route, navigation }) {
  const { session, date } = route.params || {};
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [proposedCheckIn, setProposedCheckIn]   = useState(toLocalDatetimeInput(session?.checkInTime));
  const [proposedCheckOut, setProposedCheckOut] = useState(toLocalDatetimeInput(session?.checkOutTime));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = proposedCheckIn.length >= 16 && reason.trim().length >= 10 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const proposedIn  = new Date(proposedCheckIn).toISOString();
    const proposedOut = proposedCheckOut.length >= 16 ? new Date(proposedCheckOut).toISOString() : null;

    if (proposedOut && proposedOut <= proposedIn) {
      const msg = 'Proposed check-out must be after check-in.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Invalid times', msg);
      return;
    }

    setSubmitting(true);
    try {
      await submitCorrection({
        attendanceId:      session.id,
        originalCheckIn:   session.checkInTime,
        originalCheckOut:  session.checkOutTime ?? null,
        proposedCheckIn:   proposedIn,
        proposedCheckOut:  proposedOut,
        reason:            reason.trim(),
      });
      toast.success('Correction request submitted!');
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
      <ScreenHeader title="Request Correction" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">

        {/* Original record */}
        <Text style={[s.sectionTitle, { color: g.textMuted }]}>ORIGINAL RECORD</Text>
        <LinearGradient colors={grad.card} style={[s.originalCard, { borderColor: g.border }]}>
          <View style={s.originalRow}>
            <Text style={[s.origLabel, { color: g.textMuted }]}>Date</Text>
            <Text style={[s.origValue, { color: g.text }]}>{date || '—'}</Text>
          </View>
          <View style={s.originalRow}>
            <Text style={[s.origLabel, { color: g.textMuted }]}>Check-in</Text>
            <Text style={[s.origValue, { color: g.text }]}>{fmtDateTime(session?.checkInTime)}</Text>
          </View>
          <View style={s.originalRow}>
            <Text style={[s.origLabel, { color: g.textMuted }]}>Check-out</Text>
            <Text style={[s.origValue, { color: g.text }]}>{fmtDateTime(session?.checkOutTime)}</Text>
          </View>
        </LinearGradient>

        {/* Proposed correction */}
        <Text style={[s.sectionTitle, { color: g.textMuted, marginTop: 20 }]}>PROPOSED CORRECTION</Text>
        <TimeField label="Correct Check-in Time" value={proposedCheckIn} onChange={setProposedCheckIn} g={g} />
        <TimeField label="Correct Check-out Time (optional)" value={proposedCheckOut} onChange={setProposedCheckOut} g={g} />

        {/* Reason */}
        <Text style={[s.sectionTitle, { color: g.textMuted, marginTop: 20 }]}>REASON</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Explain why a correction is needed (min. 10 characters)…"
          placeholderTextColor={g.textDim}
          multiline
          numberOfLines={4}
          style={[s.textarea, {
            color: g.text, backgroundColor: g.glass,
            borderColor: reason.length >= 10 ? g.border : (reason.length > 0 ? '#ff7b9c' : g.border),
          }]}
        />
        <Text style={{ color: reason.length >= 10 ? g.textDim : '#ff7b9c', fontSize: 11, marginTop: 4, textAlign: 'right' }}>
          {reason.length}/1000
        </Text>

        {/* Info note */}
        <View style={[s.noteCard, { backgroundColor: g.glass, borderColor: g.border }]}>
          <Text style={{ color: g.textMuted, fontSize: 12, lineHeight: 18 }}>
            ℹ️  Your request will be reviewed by an admin. If approved, the attendance record will be updated automatically. You'll receive a notification with the outcome.
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
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitText}>Submit Correction Request</Text>
            }
          </LinearGradient>
        </TouchableOpacity>

        {!canSubmit && !submitting && (
          <Text style={{ color: g.textDim, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
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

  originalCard: { borderRadius: 14, padding: 16, borderWidth: 1, gap: 10 },
  originalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  origLabel:    { fontSize: 12, fontWeight: '600' },
  origValue:    { fontSize: 13, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 12 },

  field:    { marginBottom: 14 },
  label:    { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input:    { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14 },
  textarea: {
    borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14,
    minHeight: 110, textAlignVertical: 'top',
  },

  noteCard: { borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1 },

  submitBtn:  { borderRadius: 16, overflow: 'hidden', marginTop: 20 },
  submitGrad: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
