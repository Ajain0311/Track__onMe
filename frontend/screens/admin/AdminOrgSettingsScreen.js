// screens/admin/AdminOrgSettingsScreen.js — Organization configuration

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import { getOrgSettings, updateOrgSettings, getApiErrorMessage } from '../../services/api';
import { useToast } from '../../components/ToastProvider';

const pad2 = (n) => String(n).padStart(2, '0');

const WEEKDAYS = [
  { label: 'Mon', iso: 1 },
  { label: 'Tue', iso: 2 },
  { label: 'Wed', iso: 3 },
  { label: 'Thu', iso: 4 },
  { label: 'Fri', iso: 5 },
  { label: 'Sat', iso: 6 },
  { label: 'Sun', iso: 7 },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({ title, children, g, grad }) {
  return (
    <View style={ss.section}>
      <Text style={[ss.sectionTitle, { color: g.textMuted }]}>{title}</Text>
      <LinearGradient colors={grad.card} style={[ss.sectionCard, { borderColor: g.border }]}>
        {children}
      </LinearGradient>
    </View>
  );
}

function SettingRow({ label, hint, children }) {
  const { colors: g } = useThemeStore();
  return (
    <View style={ss.row}>
      <View style={{ flex: 1 }}>
        <Text style={[ss.rowLabel, { color: g.text }]}>{label}</Text>
        {hint && <Text style={[ss.rowHint, { color: g.textDim }]}>{hint}</Text>}
      </View>
      <View style={ss.rowControl}>{children}</View>
    </View>
  );
}

function NumInput({ value, onChange, min = 0, max = 999, width = 64, g }) {
  return (
    <TextInput
      style={[ss.numInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text, width }]}
      value={String(value)}
      onChangeText={(t) => {
        const n = parseInt(t.replace(/\D/g, ''), 10);
        if (!isNaN(n) && n >= min && n <= max) onChange(n);
        else if (t === '') onChange(min);
      }}
      keyboardType="numeric"
      maxLength={3}
    />
  );
}

function TimeInput({ hour, minute, onHourChange, onMinuteChange, g }) {
  return (
    <View style={ss.timeRow}>
      <NumInput value={hour} onChange={onHourChange} min={0} max={23} width={52} g={g} />
      <Text style={[ss.timeSep, { color: g.textMuted }]}>:</Text>
      <NumInput value={minute} onChange={onMinuteChange} min={0} max={59} width={52} g={g} />
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function AdminOrgSettingsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [loading, setSaving]     = useState(false);
  const [fetching, setFetching]  = useState(true);

  // Settings state
  const [orgName, setOrgName]           = useState('');
  const [startHour, setStartHour]       = useState(9);
  const [startMin, setStartMin]         = useState(0);
  const [endHour, setEndHour]           = useState(18);
  const [endMin, setEndMin]             = useState(0);
  const [lateGrace, setLateGrace]       = useState(15);
  const [earlyBuffer, setEarlyBuffer]   = useState(30);
  const [workDays, setWorkDays]         = useState(new Set([1, 2, 3, 4, 5]));
  const [minSession, setMinSession]     = useState(30);
  const [timezone, setTimezone]         = useState('Asia/Kolkata');

  const loadSettings = useCallback(async () => {
    try {
      const res = await getOrgSettings();
      const s = res.data?.settings || {};
      setOrgName(s.org_name || 'AttendTrack');
      setStartHour(parseInt(s.work_start_hour || '9', 10));
      setStartMin(parseInt(s.work_start_minute || '0', 10));
      setEndHour(parseInt(s.work_end_hour || '18', 10));
      setEndMin(parseInt(s.work_end_minute || '0', 10));
      setLateGrace(parseInt(s.late_threshold_minutes || '15', 10));
      setEarlyBuffer(parseInt(s.early_checkout_buffer || '30', 10));
      setMinSession(parseInt(s.min_session_minutes || '30', 10));
      setTimezone(s.timezone || 'Asia/Kolkata');
      const wd = (s.working_days || '1,2,3,4,5').split(',').map((d) => parseInt(d.trim(), 10));
      setWorkDays(new Set(wd));
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setFetching(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadSettings(); }, [loadSettings]));

  const toggleWorkday = (iso) => {
    setWorkDays((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const save = async () => {
    if (!orgName.trim()) { toast.error('Organization name is required'); return; }
    setSaving(true);
    try {
      await updateOrgSettings({
        org_name:               orgName.trim(),
        work_start_hour:        startHour,
        work_start_minute:      startMin,
        work_end_hour:          endHour,
        work_end_minute:        endMin,
        late_threshold_minutes: lateGrace,
        early_checkout_buffer:  earlyBuffer,
        working_days:           [...workDays].sort().join(','),
        min_session_minutes:    minSession,
        timezone,
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Computed values
  const lateTime = () => {
    const totalMin = startHour * 60 + startMin + lateGrace;
    return `${pad2(Math.floor(totalMin / 60))}:${pad2(totalMin % 60)}`;
  };
  const earlyTime = () => {
    const totalMin = endHour * 60 + endMin - earlyBuffer;
    return `${pad2(Math.max(0, Math.floor(totalMin / 60)))}:${pad2(Math.max(0, totalMin % 60))}`;
  };

  if (fetching) {
    return (
      <LinearGradient colors={grad.screen} style={ss.fill}>
        <View style={ss.centered}>
          <ActivityIndicator size="large" color={g.accent} />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={grad.screen} style={ss.fill}>
      {/* Header */}
      <View style={ss.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={ss.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[ss.title, { color: g.text }]}>Organization Settings</Text>
        <TouchableOpacity
          onPress={save}
          disabled={loading}
          style={[ss.saveBtn, { backgroundColor: g.accent, opacity: loading ? 0.6 : 1 }]}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={ss.content} showsVerticalScrollIndicator={false}>

        {/* General */}
        <SectionCard title="GENERAL" g={g} grad={grad}>
          <SettingRow label="Organization Name" hint="Shown in reports and exports">
            <TextInput
              style={[ss.textInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
              value={orgName}
              onChangeText={setOrgName}
              placeholderTextColor={g.textDim}
            />
          </SettingRow>
          <View style={[ss.divider, { backgroundColor: g.border }]} />
          <SettingRow label="Timezone" hint="Used for date/time display">
            <TextInput
              style={[ss.textInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text, width: 160 }]}
              value={timezone}
              onChangeText={setTimezone}
              placeholderTextColor={g.textDim}
              autoCapitalize="none"
            />
          </SettingRow>
        </SectionCard>

        {/* Work hours */}
        <SectionCard title="WORK HOURS" g={g} grad={grad}>
          <SettingRow label="Work Start" hint={`Employees should check in by ${pad2(startHour)}:${pad2(startMin)}`}>
            <TimeInput hour={startHour} minute={startMin} onHourChange={setStartHour} onMinuteChange={setStartMin} g={g} />
          </SettingRow>
          <View style={[ss.divider, { backgroundColor: g.border }]} />
          <SettingRow label="Work End" hint={`Expected end of work day ${pad2(endHour)}:${pad2(endMin)}`}>
            <TimeInput hour={endHour} minute={endMin} onHourChange={setEndHour} onMinuteChange={setEndMin} g={g} />
          </SettingRow>
        </SectionCard>

        {/* Attendance rules */}
        <SectionCard title="ATTENDANCE RULES" g={g} grad={grad}>
          <SettingRow
            label="Late Arrival Grace"
            hint={`Check-in after ${lateTime()} = late`}
          >
            <View style={ss.inlineRow}>
              <NumInput value={lateGrace} onChange={setLateGrace} min={0} max={120} width={60} g={g} />
              <Text style={[{ color: g.textMuted, fontSize: 12, marginLeft: 6 }]}>min</Text>
            </View>
          </SettingRow>
          <View style={[ss.divider, { backgroundColor: g.border }]} />
          <SettingRow
            label="Early Checkout Buffer"
            hint={`Checkout before ${earlyTime()} = early`}
          >
            <View style={ss.inlineRow}>
              <NumInput value={earlyBuffer} onChange={setEarlyBuffer} min={0} max={180} width={60} g={g} />
              <Text style={[{ color: g.textMuted, fontSize: 12, marginLeft: 6 }]}>min</Text>
            </View>
          </SettingRow>
          <View style={[ss.divider, { backgroundColor: g.border }]} />
          <SettingRow
            label="Min. Session Length"
            hint="Below this = session not counted as present"
          >
            <View style={ss.inlineRow}>
              <NumInput value={minSession} onChange={setMinSession} min={0} max={240} width={60} g={g} />
              <Text style={[{ color: g.textMuted, fontSize: 12, marginLeft: 6 }]}>min</Text>
            </View>
          </SettingRow>
        </SectionCard>

        {/* Working days */}
        <SectionCard title="WORKING DAYS" g={g} grad={grad}>
          <View style={ss.daysRow}>
            {WEEKDAYS.map((d) => (
              <TouchableOpacity
                key={d.iso}
                onPress={() => toggleWorkday(d.iso)}
                style={[ss.dayBtn, {
                  backgroundColor: workDays.has(d.iso) ? g.accent : g.glass,
                  borderColor:     workDays.has(d.iso) ? g.accent : g.border,
                }]}
              >
                <Text style={{ color: workDays.has(d.iso) ? '#fff' : g.textMuted, fontWeight: '700', fontSize: 12 }}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[ss.daysHint, { color: g.textDim }]}>
            {workDays.size} working day{workDays.size !== 1 ? 's' : ''} per week selected
          </Text>
        </SectionCard>

        <View style={{ height: 50 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const ss = StyleSheet.create({
  fill:     { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, gap: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title:   { flex: 1, fontSize: 22, fontWeight: '900' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, minWidth: 60, alignItems: 'center' },

  content: { paddingHorizontal: 20, paddingBottom: 20, gap: 0 },

  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  sectionCard:  { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },

  row:        { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowLabel:   { fontSize: 14, fontWeight: '700' },
  rowHint:    { fontSize: 11, marginTop: 2 },
  rowControl: { alignItems: 'flex-end', justifyContent: 'center' },

  divider: { height: 1, marginHorizontal: 14 },

  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, minWidth: 140 },
  numInput:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, textAlign: 'center', fontVariant: ['tabular-nums'] },

  timeRow:   { flexDirection: 'row', alignItems: 'center' },
  timeSep:   { fontSize: 18, fontWeight: '900', marginHorizontal: 4 },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },

  daysRow:  { flexDirection: 'row', padding: 14, gap: 8, flexWrap: 'wrap' },
  dayBtn:   { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  daysHint: { fontSize: 12, paddingHorizontal: 14, paddingBottom: 12 },
});
