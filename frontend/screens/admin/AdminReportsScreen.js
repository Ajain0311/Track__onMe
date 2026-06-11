// screens/admin/AdminReportsScreen.js — Attendance & Leave reports with CSV export

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Alert, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import {
  adminGetAttendanceReport, adminGetLeaveReport,
  getReportCsvUrl, getReportPdfUrl, getApiErrorMessage,
} from '../../services/api';
import { supabase } from '../../services/supabaseConfig';
import { useToast } from '../../components/ToastProvider';
import ScreenHeader from '../../components/ScreenHeader';

const today    = new Date().toISOString().split('T')[0];
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

function DateInput({ label, value, onChange, g }) {
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1 }}>
        <Text style={[s.lbl, { color: g.textMuted }]}>{label}</Text>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            background: g.glass, border: `1px solid ${g.border}`, color: g.text,
            borderRadius: 10, padding: '10px 12px', fontSize: 13,
            fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
          }}
        />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.lbl, { color: g.textMuted }]}>{label}</Text>
      <TouchableOpacity
        style={[s.dateBtn, { borderColor: g.border, backgroundColor: g.glass }]}
        onPress={() => {
          const today = new Date().toISOString().split('T')[0];
          Alert.alert(
            `Set ${label}`,
            `Current: ${value || 'not set'}`,
            [
              { text: 'Start of month', onPress: () => onChange(monthStart) },
              { text: 'Today', onPress: () => onChange(today) },
              { text: 'Clear', onPress: () => onChange('') },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
        }}
      >
        <Text style={{ color: value ? g.text : g.textDim, fontSize: 13 }}>{value || `Select ${label}`}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SummaryRow({ label, value, color, g }) {
  return (
    <View style={[s.summaryRow, { borderBottomColor: g.border }]}>
      <Text style={[s.summaryLabel, { color: g.textMuted }]}>{label}</Text>
      <Text style={[s.summaryValue, { color: color || g.text }]}>{value}</Text>
    </View>
  );
}

function AttendanceSummaryCard({ summary, g, grad }) {
  if (!summary || summary.length === 0) return null;
  const totalDays = summary.reduce((s, r) => s + r.presentDays, 0);
  const totalHrs  = summary.reduce((s, r) => s + r.totalHours, 0);
  const avgHrs    = summary.length > 0
    ? Math.round(totalHrs / summary.length * 10) / 10
    : 0;

  return (
    <LinearGradient colors={grad.card} style={[s.summaryCard, { borderColor: g.border }]}>
      <Text style={[s.cardTitle, { color: g.text }]}>Summary</Text>
      <View style={s.summaryGrid}>
        <View style={[s.summaryBox, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}>
          <Text style={[s.summaryBig, { color: g.accent }]}>{summary.length}</Text>
          <Text style={[s.summarySmall, { color: g.textMuted }]}>Employees</Text>
        </View>
        <View style={[s.summaryBox, { backgroundColor: 'rgba(62,232,199,0.1)', borderColor: 'rgba(62,232,199,0.3)' }]}>
          <Text style={[s.summaryBig, { color: '#3ee8c7' }]}>{totalDays}</Text>
          <Text style={[s.summarySmall, { color: g.textMuted }]}>Total Days</Text>
        </View>
        <View style={[s.summaryBox, { backgroundColor: 'rgba(255,179,71,0.1)', borderColor: 'rgba(255,179,71,0.3)' }]}>
          <Text style={[s.summaryBig, { color: '#ffb347' }]}>{Math.round(totalHrs * 10) / 10}h</Text>
          <Text style={[s.summarySmall, { color: g.textMuted }]}>Total Hours</Text>
        </View>
        <View style={[s.summaryBox, { backgroundColor: 'rgba(139,124,255,0.1)', borderColor: 'rgba(139,124,255,0.3)' }]}>
          <Text style={[s.summaryBig, { color: g.accent }]}>{avgHrs}h</Text>
          <Text style={[s.summarySmall, { color: g.textMuted }]}>Avg/Person</Text>
        </View>
      </View>

      <Text style={[s.tableTitle, { color: g.textMuted }]}>PER EMPLOYEE</Text>
      {summary.slice(0, 10).map((row, i) => (
        <View key={row.email} style={[s.tableRow, { borderTopColor: g.border, backgroundColor: i % 2 === 0 ? 'transparent' : `${g.glass}66` }]}>
          <Text style={[s.tableCell, { color: g.text, flex: 2 }]} numberOfLines={1}>{row.email}</Text>
          <Text style={[s.tableCell, { color: '#3ee8c7', flex: 1, textAlign: 'center' }]}>{row.presentDays}d</Text>
          <Text style={[s.tableCell, { color: '#ffb347', flex: 1, textAlign: 'center' }]}>{row.totalHours}h</Text>
          <Text style={[s.tableCell, { color: g.textMuted, flex: 1, textAlign: 'right' }]}>{row.avgHours}h/d</Text>
        </View>
      ))}
      {summary.length > 10 && (
        <Text style={[s.moreTxt, { color: g.textMuted }]}>+{summary.length - 10} more in CSV export</Text>
      )}
    </LinearGradient>
  );
}

function LeaveStatsCard({ records, g, grad }) {
  if (!records || records.length === 0) return null;
  const byStatus = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const byType = records.reduce((acc, r) => {
    acc[r.leaveType] = (acc[r.leaveType] || 0) + r.days;
    return acc;
  }, {});

  return (
    <LinearGradient colors={grad.card} style={[s.summaryCard, { borderColor: g.border }]}>
      <Text style={[s.cardTitle, { color: g.text }]}>Leave Summary</Text>
      <View style={s.leaveRow}>
        {Object.entries(byStatus).map(([status, count]) => (
          <View key={status} style={[s.leaveBadge, {
            backgroundColor: status === 'approved' ? 'rgba(62,232,199,0.12)' : status === 'pending' ? 'rgba(255,179,71,0.12)' : 'rgba(255,69,58,0.12)',
            borderColor: status === 'approved' ? '#3ee8c7' : status === 'pending' ? '#ffb347' : '#ff453a',
          }]}>
            <Text style={[s.leaveBadgeNum, { color: status === 'approved' ? '#3ee8c7' : status === 'pending' ? '#ffb347' : '#ff453a' }]}>{count}</Text>
            <Text style={[s.leaveBadgeLbl, { color: g.textMuted }]}>{status}</Text>
          </View>
        ))}
      </View>
      <Text style={[s.tableTitle, { color: g.textMuted, marginTop: 12 }]}>DAYS TAKEN BY TYPE</Text>
      {Object.entries(byType).map(([type, days]) => (
        <View key={type} style={[s.tableRow, { borderTopColor: g.border }]}>
          <Text style={[s.tableCell, { color: g.text, flex: 2 }]}>{type}</Text>
          <Text style={[s.tableCell, { color: g.accent, flex: 1, textAlign: 'right', fontWeight: '800' }]}>{days} days</Text>
        </View>
      ))}
    </LinearGradient>
  );
}

export default function AdminReportsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'leaves'
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate]     = useState(today);
  const [loading, setLoading]     = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [leaveRecords, setLeaveRecords]           = useState(null);
  const [totalRecords, setTotalRecords]           = useState(0);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'attendance') {
        const res = await adminGetAttendanceReport({ startDate, endDate });
        setAttendanceSummary(res.data.summary || []);
        setTotalRecords(res.data.total || 0);
      } else {
        const res = await adminGetLeaveReport({ startDate, endDate });
        setLeaveRecords(res.data.records || []);
        setTotalRecords(res.data.total || 0);
      }
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [activeTab, startDate, endDate]);

  const handleExportCsv = async () => {
    setCsvLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error('Not signed in.'); return; }

      const csvType = activeTab === 'attendance' ? 'attendance' : 'leaves';
      const url = getReportCsvUrl(csvType, { startDate, endDate });

      if (Platform.OS === 'web') {
        // Fetch with auth header and trigger download
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error('Export failed');
        const blob = await resp.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = `${csvType}-report-${startDate}-${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(objUrl);
        toast.success('CSV downloaded!');
      } else {
        // Native: open URL in browser (Render will serve the file with auth header injected via query)
        // For simplicity, we append the token as a query param for native downloads
        const dlUrl = `${url}&token=${token}`;
        const supported = await Linking.canOpenURL(dlUrl);
        if (supported) {
          await Linking.openURL(dlUrl);
        } else {
          toast.error('Cannot open download URL on this device.');
        }
      }
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setCsvLoading(false);
    }
  };

  const handleExportPdf = async () => {
    setPdfLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error('Not signed in.'); return; }

      const pdfType = activeTab === 'attendance' ? 'attendance' : 'leaves';
      const url = getReportPdfUrl(pdfType, { startDate, endDate });

      if (Platform.OS === 'web') {
        // Open in new tab — browser print dialog fires automatically
        const dlUrl = `${url}&token=${token}`;
        window.open(dlUrl, '_blank');
      } else {
        const dlUrl = `${url}&token=${token}`;
        const supported = await Linking.canOpenURL(dlUrl);
        if (supported) {
          await Linking.openURL(dlUrl);
        } else {
          toast.error('Cannot open PDF on this device.');
        }
      }
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setPdfLoading(false);
    }
  };

  const tabs = [
    { key: 'attendance', label: 'Attendance', icon: '📋' },
    { key: 'leaves',     label: 'Leaves',     icon: '🌴' },
  ];

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader title="Reports" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>

        {/* Tab selector */}
        <LinearGradient colors={grad.card} style={[s.tabBar, { borderColor: g.border }]}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[s.tab, activeTab === t.key && { backgroundColor: g.accent }]}
              onPress={() => { setActiveTab(t.key); setAttendanceSummary(null); setLeaveRecords(null); }}
            >
              <Text style={{ fontSize: 16, marginBottom: 2 }}>{t.icon}</Text>
              <Text style={[s.tabTxt, { color: activeTab === t.key ? '#fff' : g.textMuted }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </LinearGradient>

        {/* Date filters */}
        <LinearGradient colors={grad.card} style={[s.filterCard, { borderColor: g.border }]}>
          <Text style={[s.cardTitle, { color: g.text }]}>Date Range</Text>
          <View style={s.dateRow}>
            <DateInput label="From" value={startDate} onChange={setStartDate} g={g} />
            <Text style={[s.dateSep, { color: g.textMuted }]}>→</Text>
            <DateInput label="To" value={endDate} onChange={setEndDate} g={g} />
          </View>

          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.runBtn, { opacity: loading ? 0.7 : 1 }]}
              onPress={loadReport}
              disabled={loading}
            >
              <LinearGradient colors={['#8b7cff', '#6c63ff']} style={s.runGrad}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.runTxt}>Run Report</Text>}
              </LinearGradient>
            </TouchableOpacity>
            {(attendanceSummary !== null || leaveRecords !== null) && (
              <>
                <TouchableOpacity
                  style={[s.csvBtn, { borderColor: g.mint, backgroundColor: 'rgba(62,232,199,0.1)', opacity: csvLoading ? 0.7 : 1 }]}
                  onPress={handleExportCsv}
                  disabled={csvLoading}
                >
                  {csvLoading ? <ActivityIndicator color={g.mint} size="small" /> : <Text style={[s.csvTxt, { color: g.mint }]}>↓ CSV</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.csvBtn, { borderColor: '#8b7cff', backgroundColor: 'rgba(139,124,255,0.1)', opacity: pdfLoading ? 0.7 : 1 }]}
                  onPress={handleExportPdf}
                  disabled={pdfLoading}
                >
                  {pdfLoading ? <ActivityIndicator color="#8b7cff" size="small" /> : <Text style={[s.csvTxt, { color: '#8b7cff' }]}>🖨️ PDF</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </LinearGradient>

        {/* Results */}
        {totalRecords > 0 && (
          <Text style={[s.totalTxt, { color: g.textMuted }]}>{totalRecords} records found</Text>
        )}

        {activeTab === 'attendance' && attendanceSummary !== null && (
          attendanceSummary.length === 0
            ? <View style={[s.empty, { borderColor: g.border }]}><Text style={{ color: g.textMuted }}>No attendance records in this range.</Text></View>
            : <AttendanceSummaryCard summary={attendanceSummary} g={g} grad={grad} />
        )}

        {activeTab === 'leaves' && leaveRecords !== null && (
          leaveRecords.length === 0
            ? <View style={[s.empty, { borderColor: g.border }]}><Text style={{ color: g.textMuted }}>No leave records in this range.</Text></View>
            : <LeaveStatsCard records={leaveRecords} g={g} grad={grad} />
        )}

        {!loading && attendanceSummary === null && leaveRecords === null && (
          <View style={[s.empty, { borderColor: g.border }]}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>📊</Text>
            <Text style={[s.emptyTitle, { color: g.text }]}>Select dates and run a report</Text>
            <Text style={[s.emptyHint, { color: g.textMuted }]}>You can export any report as CSV for Excel/Sheets.</Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:   { flex: 1 },
  scroll: { flex: 1 },
  inner:  { padding: 20, paddingBottom: 100 },

  tabBar: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 6, gap: 6, marginBottom: 16 },
  tab:    { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  tabTxt: { fontSize: 13, fontWeight: '800' },

  filterCard: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 16 },
  cardTitle:  { fontSize: 14, fontWeight: '800', marginBottom: 12 },
  dateRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  dateSep:    { fontSize: 16, fontWeight: '700', paddingTop: 14 },
  dateBtn:    { borderRadius: 10, borderWidth: 1, padding: 11, marginTop: 4 },
  lbl:        { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  btnRow:     { flexDirection: 'row', gap: 10 },
  runBtn:     { flex: 1, borderRadius: 12, overflow: 'hidden' },
  runGrad:    { paddingVertical: 14, alignItems: 'center' },
  runTxt:     { color: '#fff', fontWeight: '800', fontSize: 14 },
  csvBtn:     { flex: 1, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  csvTxt:     { fontSize: 14, fontWeight: '800' },

  totalTxt: { fontSize: 12, color: '#aaa', marginBottom: 8, marginLeft: 4 },

  summaryCard: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  summaryBox:  { flex: 1, minWidth: '40%', padding: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  summaryBig:  { fontSize: 22, fontWeight: '900' },
  summarySmall:{ fontSize: 11, fontWeight: '600', marginTop: 3 },
  tableTitle:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  tableRow:    { flexDirection: 'row', paddingVertical: 8, borderTopWidth: 1 },
  tableCell:   { fontSize: 12, fontWeight: '600' },
  moreTxt:     { fontSize: 12, textAlign: 'center', marginTop: 8 },

  leaveRow:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  leaveBadge:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', minWidth: 70 },
  leaveBadgeNum:{ fontSize: 18, fontWeight: '900' },
  leaveBadgeLbl:{ fontSize: 11, fontWeight: '600', marginTop: 2 },

  summaryRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1 },
  summaryLabel:{ fontSize: 13 },
  summaryValue:{ fontSize: 13, fontWeight: '800' },

  empty:       { borderRadius: 18, borderWidth: 1, padding: 32, alignItems: 'center', marginTop: 8 },
  emptyTitle:  { fontSize: 15, fontWeight: '800', marginTop: 4 },
  emptyHint:   { fontSize: 13, marginTop: 6, textAlign: 'center' },
});
