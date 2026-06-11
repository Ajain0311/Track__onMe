// screens/AttendanceCalendarScreen.js — Monthly attendance calendar view

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../store/themeStore';
import { getAttendance, getMyLeaves, getHolidays, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';
import ScreenHeader from '../components/ScreenHeader';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
const formatDuration = (secs) => {
  if (!secs) return '--';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return `${h}h ${pad2(m)}m`;
};

function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = [];
  let week = new Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { grid.push(week); week = []; }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    grid.push(week);
  }
  return grid;
}

function dayStatus(dateStr, attendanceMap, leaveMap, holidaySet) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  const isWeekend = dow === 0 || dow === 6;
  if (holidaySet?.has(dateStr)) return { type: 'holiday', data: null };
  if (leaveMap[dateStr]) return { type: 'leave', data: leaveMap[dateStr] };
  if (attendanceMap[dateStr]) return { type: 'present', data: attendanceMap[dateStr] };
  const today = toDateStr(new Date());
  if (dateStr > today) return { type: 'future', data: null };
  if (isWeekend) return { type: 'weekend', data: null };
  return { type: 'absent', data: null };
}

export default function AttendanceCalendarScreen({ navigation }) {
  const { colors: g, gradients: grad, isDark } = useThemeStore();
  const toast = useToast();

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);

  const [attendanceSessions, setAttendanceSessions] = useState([]);
  const [leaves, setLeaves]                         = useState([]);
  const [holidaySet, setHolidaySet]                 = useState(new Set());
  const [holidayNames, setHolidayNames]             = useState({});
  const [selectedDay, setSelectedDay]               = useState(null); // { dateStr, status }

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getAttendance(),
      getMyLeaves({ status: 'all', year }),
      getHolidays(year).catch(() => ({ data: { holidays: [] } })),
    ])
      .then(([attRes, leavesRes, holRes]) => {
        setAttendanceSessions(attRes.data?.sessions || attRes.data?.attendance || []);
        setLeaves(leavesRes.data?.leaves || []);
        const hols = holRes.data?.holidays || [];
        setHolidaySet(new Set(hols.map((h) => h.date)));
        const names = {};
        for (const h of hols) names[h.date] = h.name;
        setHolidayNames(names);
      })
      .catch((e) => toast.error(getApiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [year]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Build lookup maps
  const { attendanceMap, leaveMap } = useMemo(() => {
    const aMap = {};
    for (const s of attendanceSessions) {
      const d = (s.checkInTime || s.check_in_time || '').split('T')[0];
      if (d) {
        if (!aMap[d]) aMap[d] = [];
        aMap[d].push(s);
      }
    }
    const lMap = {};
    for (const l of leaves) {
      if (l.status !== 'approved') continue;
      const start = new Date(l.startDate || l.start_date);
      const end   = new Date(l.endDate   || l.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        lMap[toDateStr(d)] = l;
      }
    }
    return { attendanceMap: aMap, leaveMap: lMap };
  }, [attendanceSessions, leaves]);

  const grid = useMemo(() => buildCalendarGrid(year, month), [year, month]);

  // Month navigation
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    const today = new Date();
    if (year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth())) return;
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Summary for current month
  const summary = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = toDateStr(new Date());
    let present = 0, absent = 0, leave = 0, holidays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      if (ds > today) break;
      const s = dayStatus(ds, attendanceMap, leaveMap, holidaySet);
      if (s.type === 'present')       present++;
      else if (s.type === 'absent')   absent++;
      else if (s.type === 'leave')    leave++;
      else if (s.type === 'holiday')  holidays++;
    }
    const workdays = present + absent + leave;
    const pct = workdays > 0 ? Math.round(present / workdays * 100) : null;
    return { present, absent, leave, holidays, pct };
  }, [year, month, attendanceMap, leaveMap, holidaySet]);

  const statusColor = (type) => {
    if (type === 'present') return g.mint;
    if (type === 'absent')  return '#ff453a';
    if (type === 'leave')   return '#8b7cff';
    if (type === 'holiday') return '#ffb347';
    if (type === 'weekend') return g.textDim;
    if (type === 'future')  return 'transparent';
    return 'transparent';
  };

  const isToday = (d) => {
    if (!d) return false;
    return toDateStr(new Date()) === `${year}-${pad2(month + 1)}-${pad2(d)}`;
  };

  const handleDayPress = (d) => {
    if (!d) return;
    const ds = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    const status = dayStatus(ds, attendanceMap, leaveMap, holidaySet);
    if (status.type === 'future' || status.type === 'weekend') return;
    if (status.type === 'holiday') {
      setSelectedDay({ dateStr: ds, type: 'holiday', data: { name: holidayNames[ds] || 'Holiday' } });
      return;
    }
    setSelectedDay({ dateStr: ds, ...status });
  };

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader title="Attendance Calendar" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color={g.accent} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>

          {/* Month navigator */}
          <View style={s.monthRow}>
            <TouchableOpacity onPress={prevMonth} style={[s.navBtn, { borderColor: g.border, backgroundColor: g.glass }]}>
              <Text style={{ color: g.text, fontSize: 18 }}>‹</Text>
            </TouchableOpacity>
            <Text style={[s.monthTitle, { color: g.text }]}>{MONTH_NAMES[month]} {year}</Text>
            <TouchableOpacity
              onPress={nextMonth}
              style={[s.navBtn, { borderColor: g.border, backgroundColor: g.glass }]}
              disabled={year === now.getFullYear() && month >= now.getMonth()}
            >
              <Text style={{ color: (year === now.getFullYear() && month >= now.getMonth()) ? g.textDim : g.text, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Summary strip */}
          <LinearGradient colors={grad.card} style={[s.summaryStrip, { borderColor: g.border }]}>
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: g.mint }]}>{summary.present}</Text>
              <Text style={[s.summaryLbl, { color: g.textMuted }]}>Present</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: g.border }]} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: '#ff453a' }]}>{summary.absent}</Text>
              <Text style={[s.summaryLbl, { color: g.textMuted }]}>Absent</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: g.border }]} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: '#8b7cff' }]}>{summary.leave}</Text>
              <Text style={[s.summaryLbl, { color: g.textMuted }]}>On Leave</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: g.border }]} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: '#ffb347' }]}>{summary.holidays || 0}</Text>
              <Text style={[s.summaryLbl, { color: g.textMuted }]}>Holidays</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: g.border }]} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: summary.pct >= 80 ? g.mint : summary.pct >= 60 ? '#ffb347' : '#ff453a' }]}>
                {summary.pct !== null ? `${summary.pct}%` : '--'}
              </Text>
              <Text style={[s.summaryLbl, { color: g.textMuted }]}>Rate</Text>
            </View>
          </LinearGradient>

          {/* Calendar grid */}
          <LinearGradient colors={grad.card} style={[s.calCard, { borderColor: g.border }]}>
            {/* Day name headers */}
            <View style={s.weekRow}>
              {DAY_NAMES.map((dn, i) => (
                <View key={dn} style={s.dayHeader}>
                  <Text style={[s.dayHeaderTxt, { color: (i === 0 || i === 6) ? g.textDim : g.textMuted }]}>{dn}</Text>
                </View>
              ))}
            </View>

            {/* Weeks */}
            {grid.map((week, wi) => (
              <View key={wi} style={s.weekRow}>
                {week.map((d, di) => {
                  if (!d) return <View key={di} style={s.dayCellEmpty} />;
                  const ds = `${year}-${pad2(month + 1)}-${pad2(d)}`;
                  const st = dayStatus(ds, attendanceMap, leaveMap, holidaySet);
                  const color = statusColor(st.type);
                  const todayCell = isToday(d);
                  const isWeekend = di === 0 || di === 6;
                  return (
                    <TouchableOpacity
                      key={di}
                      style={[s.dayCell, todayCell && [s.todayCell, { borderColor: g.accent }]]}
                      onPress={() => handleDayPress(d)}
                      activeOpacity={st.type === 'future' || st.type === 'weekend' ? 1 : 0.7}
                    >
                      <Text style={[s.dayNum, {
                        color: todayCell ? g.accent : isWeekend ? g.textDim : g.text,
                        fontWeight: todayCell ? '900' : '600',
                      }]}>{d}</Text>
                      {st.type !== 'future' && st.type !== 'weekend' && (
                        <View style={[s.dot, { backgroundColor: color }]} />
                      )}
                      {st.type === 'present' && (attendanceMap[ds] || []).length > 1 && (
                        <Text style={[s.multiTxt, { color: g.mint }]}>{(attendanceMap[ds] || []).length}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </LinearGradient>

          {/* Legend */}
          <View style={s.legend}>
            {[
              { type: 'present', label: 'Present' },
              { type: 'absent',  label: 'Absent' },
              { type: 'leave',   label: 'On Leave' },
              { type: 'holiday', label: 'Holiday' },
            ].map((l) => (
              <View key={l.type} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: statusColor(l.type) }]} />
                <Text style={[s.legendTxt, { color: g.textMuted }]}>{l.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Day Detail Modal */}
      <Modal
        visible={!!selectedDay}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDay(null)}
      >
        <View style={s.modalOverlay}>
          <LinearGradient colors={grad.card} style={[s.modal, { borderColor: g.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalDate, { color: g.text }]}>{selectedDay?.dateStr}</Text>
              <TouchableOpacity onPress={() => setSelectedDay(null)}>
                <Text style={{ color: g.textMuted, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedDay?.type === 'present' && (selectedDay.data || []).map((sess, i) => (
              <LinearGradient key={i} colors={['rgba(62,232,199,0.08)', 'transparent']} style={[s.sessionCard, { borderColor: 'rgba(62,232,199,0.35)' }]}>
                <View style={s.sessionRow}>
                  <View style={s.sessionTime}>
                    <Text style={[s.timeLabel, { color: g.textMuted }]}>Check In</Text>
                    <Text style={[s.timeValue, { color: g.mint }]}>{formatTime(sess.checkInTime || sess.check_in_time)}</Text>
                  </View>
                  <Text style={{ color: g.textDim, fontSize: 20 }}>→</Text>
                  <View style={s.sessionTime}>
                    <Text style={[s.timeLabel, { color: g.textMuted }]}>Check Out</Text>
                    <Text style={[s.timeValue, { color: g.mint }]}>
                      {sess.checkOutTime || sess.check_out_time
                        ? formatTime(sess.checkOutTime || sess.check_out_time)
                        : 'Active'}
                    </Text>
                  </View>
                  <View style={s.sessionTime}>
                    <Text style={[s.timeLabel, { color: g.textMuted }]}>Duration</Text>
                    <Text style={[s.timeValue, { color: g.text }]}>{formatDuration(sess.totalDuration || sess.total_duration)}</Text>
                  </View>
                </View>
                {(sess.locationName || sess.location_name) && (
                  <Text style={[s.locTxt, { color: g.textMuted }]}>📍 {sess.locationName || sess.location_name}</Text>
                )}
              </LinearGradient>
            ))}

            {selectedDay?.type === 'holiday' && (
              <View style={[s.sessionCard, { borderColor: '#ffb34755', backgroundColor: 'rgba(255,179,71,0.08)' }]}>
                <Text style={{ color: '#ffb347', fontWeight: '900', fontSize: 16, marginBottom: 4 }}>
                  🎉 {selectedDay.data?.name || 'Holiday'}
                </Text>
                <Text style={{ color: g.textMuted, fontSize: 13 }}>Public holiday — not counted as absent</Text>
              </View>
            )}

            {selectedDay?.type === 'absent' && (
              <View style={[s.sessionCard, { borderColor: '#ff453a33', backgroundColor: 'rgba(255,69,58,0.05)' }]}>
                <Text style={{ color: '#ff453a', textAlign: 'center', fontWeight: '700', fontSize: 15 }}>Absent</Text>
                <Text style={{ color: g.textMuted, textAlign: 'center', fontSize: 13, marginTop: 6 }}>No attendance recorded for this day.</Text>
              </View>
            )}

            {selectedDay?.type === 'leave' && selectedDay.data && (
              <View style={[s.sessionCard, { borderColor: '#8b7cff55', backgroundColor: 'rgba(139,124,255,0.06)' }]}>
                <Text style={{ color: '#8b7cff', fontWeight: '800', fontSize: 14, marginBottom: 6 }}>
                  {selectedDay.data.leaveTypeName || selectedDay.data.leave_type_name || 'Leave'}
                </Text>
                <Text style={{ color: g.textMuted, fontSize: 13 }}>
                  {selectedDay.data.startDate || selectedDay.data.start_date} → {selectedDay.data.endDate || selectedDay.data.end_date}
                  {'  '}({selectedDay.data.days} day{selectedDay.data.days !== 1 ? 's' : ''})
                </Text>
                {selectedDay.data.reason && (
                  <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 8 }}>{selectedDay.data.reason}</Text>
                )}
              </View>
            )}

            <TouchableOpacity
              onPress={() => setSelectedDay(null)}
              style={[s.closeBtn, { borderColor: g.border }]}
            >
              <Text style={{ color: g.text, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inner:  { padding: 16, paddingBottom: 80 },

  monthRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14 },
  navBtn:     { width: 40, height: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  monthTitle: { fontSize: 18, fontWeight: '900', minWidth: 160, textAlign: 'center' },

  summaryStrip: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14 },
  summaryItem:  { flex: 1, alignItems: 'center' },
  summaryNum:   { fontSize: 20, fontWeight: '900' },
  summaryLbl:   { fontSize: 10, fontWeight: '600', marginTop: 2 },
  summaryDivider: { width: 1, alignSelf: 'stretch' },

  calCard:  { borderRadius: 18, borderWidth: 1, padding: 12, marginBottom: 14 },
  weekRow:  { flexDirection: 'row' },
  dayHeader:{ flex: 1, alignItems: 'center', paddingVertical: 8 },
  dayHeaderTxt: { fontSize: 11, fontWeight: '800' },

  dayCell:   { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, minHeight: 50, justifyContent: 'center' },
  dayCellEmpty: { flex: 1 },
  todayCell: { borderWidth: 1.5, borderRadius: 10 },
  dayNum:    { fontSize: 14 },
  dot:       { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  multiTxt:  { fontSize: 8, fontWeight: '900', marginTop: 1 },

  legend:     { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendTxt:  { fontSize: 12 },

  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modal:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 36 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalDate:    { fontSize: 16, fontWeight: '900' },
  sessionCard:  { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  sessionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  sessionTime:  { alignItems: 'center' },
  timeLabel:    { fontSize: 11, fontWeight: '600' },
  timeValue:    { fontSize: 14, fontWeight: '900', marginTop: 3 },
  locTxt:       { fontSize: 12, marginTop: 8 },
  closeBtn:     { borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
});
