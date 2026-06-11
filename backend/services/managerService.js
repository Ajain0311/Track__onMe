// services/managerService.js — Manager team attendance overview

const { supabase } = require('./supabase');

const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Monday of current week
const weekStart = (now) => {
  const d = new Date(now);
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
};

const isWeekday = (ds) => {
  const dow = new Date(ds + 'T00:00:00').getDay();
  return dow !== 0 && dow !== 6;
};

const getTeamOverview = async (userId) => {
  const now = new Date();
  const todayStr = toDateStr(now);
  const weekStartStr = weekStart(now);

  // 1. Find departments managed by this user
  const { data: managedDepts } = await supabase
    .from('departments')
    .select('id, name, color')
    .eq('manager_id', userId)
    .eq('is_active', true);

  let teamDeptIds = (managedDepts || []).map((d) => d.id);
  let department  = (managedDepts || [])[0] || null;

  // Fallback: if no managed dept, find this user's own department
  if (teamDeptIds.length === 0) {
    const { data: myProfile } = await supabase
      .from('employee_profiles')
      .select('department_id, departments(id, name, color)')
      .eq('user_id', userId)
      .maybeSingle();
    if (myProfile?.department_id) {
      teamDeptIds = [myProfile.department_id];
      department  = myProfile.departments;
    }
  }

  if (teamDeptIds.length === 0) {
    return { department: null, members: [], summary: { total: 0, present: 0, absent: 0 } };
  }

  // 2. Get all team members
  const { data: profiles } = await supabase
    .from('employee_profiles')
    .select('user_id, display_name, designation, employee_id, department_id')
    .in('department_id', teamDeptIds);

  const memberIds = (profiles || []).map((p) => p.user_id);
  if (memberIds.length === 0) {
    return { department, members: [], summary: { total: 0, present: 0, absent: 0 } };
  }

  // 3. Fetch emails
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = Object.fromEntries((authUsers || []).map((u) => [u.id, u.email]));

  // 4. Fetch this week's attendance for team
  const { data: weekAttendance } = await supabase
    .from('attendance')
    .select('user_id, check_in_time, check_out_time, total_duration, date')
    .in('user_id', memberIds)
    .gte('check_in_time', `${weekStartStr}T00:00:00`)
    .order('check_in_time', { ascending: false });

  // Build per-user maps
  const todayMap  = {}; // userId → today's session
  const weekMap   = {}; // userId → Set of days present

  for (const s of (weekAttendance || [])) {
    const d = s.date || s.check_in_time?.split('T')[0];
    if (!d) continue;
    if (!weekMap[s.user_id]) weekMap[s.user_id] = new Set();
    weekMap[s.user_id].add(d);
    if (d === todayStr && !todayMap[s.user_id]) {
      todayMap[s.user_id] = s;
    }
  }

  // Count weekdays so far this week (including today)
  const weekDates = [];
  for (let d = new Date(weekStartStr + 'T00:00:00'); toDateStr(d) <= todayStr; d.setDate(d.getDate() + 1)) {
    if (isWeekday(toDateStr(d))) weekDates.push(toDateStr(d));
  }

  const members = (profiles || []).map((p) => {
    const todaySession = todayMap[p.user_id];
    const isCheckedIn  = todaySession && !todaySession.check_out_time;
    const isPresent    = !!todaySession;
    const weekDaysPresent = weekMap[p.user_id]?.size || 0;

    return {
      userId:        p.user_id,
      email:         emailMap[p.user_id] || p.user_id,
      displayName:   p.display_name || null,
      designation:   p.designation || null,
      employeeId:    p.employee_id || null,
      today: {
        present:       isPresent,
        checkedIn:     isCheckedIn,
        checkInTime:   todaySession?.check_in_time || null,
        checkOutTime:  todaySession?.check_out_time || null,
        duration:      todaySession?.total_duration || 0,
      },
      week: {
        daysPresent:  weekDaysPresent,
        daysTotal:    weekDates.length,
        rate:         weekDates.length > 0 ? Math.round((weekDaysPresent / weekDates.length) * 100) : 0,
      },
    };
  });

  // Sort: checked-in first, then present today, then absent
  members.sort((a, b) => {
    if (a.today.checkedIn !== b.today.checkedIn) return a.today.checkedIn ? -1 : 1;
    if (a.today.present !== b.today.present)     return a.today.present ? -1 : 1;
    return (a.displayName || a.email).localeCompare(b.displayName || b.email);
  });

  const presentToday = members.filter((m) => m.today.present).length;

  return {
    department,
    managedDepts: (managedDepts || []).map((d) => ({ id: d.id, name: d.name, color: d.color })),
    members,
    summary: {
      total:   members.length,
      present: presentToday,
      absent:  members.length - presentToday,
      weekDates,
    },
  };
};

module.exports = { getTeamOverview };
