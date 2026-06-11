// services/api.js
// Axios instance + all API calls for AttendTrack.

import axios from 'axios';
import { Platform } from 'react-native';
import { getIdToken } from './authService';

function resolveBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) {
    const trimmed = fromEnv.replace(/\/$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  if (!__DEV__) return 'https://track-onme.onrender.com/api';
  if (Platform.OS === 'android') return 'http://10.0.2.2:5000/api';
  return 'http://localhost:5000/api';
}

export const BASE_URL = resolveBaseUrl();

const api = axios.create({ baseURL: BASE_URL, timeout: 30000 });

api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch {
      return Promise.reject(new Error('Not signed in. Please sign in again.'));
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export function getApiErrorMessage(error) {
  const msg = error?.message || '';
  if (msg.includes('Not signed in')) return msg;
  if (error?.response?.status === 401) return 'Session expired. Sign out and sign in again.';
  if (error?.response?.status === 403) return error?.response?.data?.error || 'You don\'t have permission to do that.';
  if (error?.code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout'))
    return 'Request timed out. The server may be waking up — try again in a moment.';
  if (error?.response?.data?.error) return String(error.response.data.error);
  if (msg === 'Network Error' || !error?.response)
    return 'Cannot reach the server. Check your internet connection.';
  return msg || 'Something went wrong.';
}

// ─── Face verification ────────────────────────────────────────────────────────
// Must be called BEFORE checkIn/checkOut — returns a signed faceToken

/** Register face features on the server (native only, call after AsyncStorage save) */
export const registerFaceOnServer = (features) =>
  api.post('/face/register', { features });

/** Verify face features server-side, get a signed token for check-in/out (native) */
export const verifyFaceWithServer = (features, mode) =>
  api.post('/face/verify', { features, mode });

/** Verify identity via password server-side, get a signed token for check-in/out (web) */
export const verifyWebWithServer = (password, mode) =>
  api.post('/face/verify-web', { password, mode });

/** Check if the user has registered face data on the server */
export const getFaceStatusFromServer = () =>
  api.get('/face/status');

/** Delete face data from the server */
export const deleteFaceFromServer = () =>
  api.delete('/face');

// ─── Attendance ───────────────────────────────────────────────────────────────
// faceToken is required — obtain it from verifyFaceWithServer or verifyWebWithServer first.

export const checkIn = (location = null, faceToken) =>
  api.post('/checkin', {
    faceToken,
    ...(location ? {
      latitude:     location.latitude,
      longitude:    location.longitude,
      accuracy:     location.accuracy  ?? null,
      locationId:   location.locationId  ?? null,
      locationName: location.locationName ?? null,
    } : {}),
  });

export const checkOut = (faceToken) =>
  api.post('/checkout', { faceToken });

/** System-triggered checkout — no faceToken required (WiFi/GPS leave event) */
export const autoCheckOut = (reason = 'auto') =>
  api.post('/auto-checkout', { reason });

export const getAttendance      = () => api.get('/attendance');
export const getAttendanceDaily = () => api.get('/attendance/daily');
export const getStatus          = () => api.get('/status');

// ─── Current user ─────────────────────────────────────────────────────────────

export const getMe         = () => api.get('/me');
export const trackLogin    = (platform) => api.post('/me/track-login', { platform });

// ─── Locations (user-facing) ──────────────────────────────────────────────────

export const getActiveLocations = () => api.get('/locations');

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminGetStats          = () => api.get('/admin/stats');
export const adminGetActiveSessions = () => api.get('/admin/active-sessions');
export const adminGetUsers = (page = 1) => api.get('/admin/users', { params: { page } });
export const adminGetUserAttendance = (userId) => api.get(`/admin/users/${userId}/attendance`);
export const adminUpdateUserRole = (userId, role) => api.patch(`/admin/users/${userId}/role`, { role });

export const adminGetLocations = () => api.get('/admin/locations');
export const adminGetLocation  = (id) => api.get(`/admin/locations/${id}`);
export const adminCreateLocation = (payload) => api.post('/admin/locations', payload);
export const adminUpdateLocation = (id, payload) => api.put(`/admin/locations/${id}`, payload);
export const adminToggleLocation = (id) => api.patch(`/admin/locations/${id}/toggle`);
export const adminDeleteLocation = (id) => api.delete(`/admin/locations/${id}`);

// ─── Location Requests (user) ─────────────────────────────────────────────────

export const getMyLocationRequests   = () => api.get('/location-requests');
export const submitLocationRequest   = (payload) => api.post('/location-requests', payload);
export const cancelLocationRequest   = (id) => api.delete(`/location-requests/${id}`);

// ─── Notifications ────────────────────────────────────────────────────────────

export const getNotifications = (unreadOnly = false) =>
  api.get('/notifications', { params: { unread: unreadOnly ? 1 : undefined } });
export const markNotificationRead     = (id) => api.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all');

// ─── Activity ─────────────────────────────────────────────────────────────────

export const getMyActivity = (limit = 50) =>
  api.get('/activity', { params: { limit } });

// ─── Audit logs (admin) ───────────────────────────────────────────────────────

export const adminGetAuditLogs = (params = {}) =>
  api.get('/admin/audit-logs', { params });

// ─── Reports (admin) ─────────────────────────────────────────────────────────

export const adminGetAttendanceReport = (params = {}) =>
  api.get('/admin/reports/attendance', { params });
export const adminGetLeaveReport = (params = {}) =>
  api.get('/admin/reports/leaves', { params });
export const getReportCsvUrl = (type, params = {}) => {
  const qs = new URLSearchParams({ ...params }).toString();
  return `${BASE_URL}/admin/reports/${type}/csv?${qs}`;
};

// ─── Location Requests (admin) ────────────────────────────────────────────────

export const adminGetLocationRequests    = (status = 'pending') =>
  api.get('/admin/location-requests', { params: { status } });
export const adminApproveLocationRequest = (id, adminNote) =>
  api.patch(`/admin/location-requests/${id}/approve`, { adminNote });
export const adminRejectLocationRequest  = (id, adminNote) =>
  api.patch(`/admin/location-requests/${id}/reject`, { adminNote });

// ─── Departments + Profiles (user) ───────────────────────────────────────────

export const getDepartments    = () => api.get('/departments');
export const getMyProfile      = () => api.get('/departments/profile');
export const updateMyProfile   = (patch) => api.patch('/departments/profile', patch);

// ─── Departments + Profiles (admin) ──────────────────────────────────────────

export const adminGetDepartments    = () => api.get('/admin/departments');
export const adminCreateDepartment  = (payload) => api.post('/admin/departments', payload);
export const adminUpdateDepartment  = (id, payload) => api.put(`/admin/departments/${id}`, payload);
export const adminDeleteDepartment  = (id) => api.delete(`/admin/departments/${id}`);
export const adminGetProfiles       = () => api.get('/admin/profiles');
export const adminSetUserDepartment = (userId, departmentId) =>
  api.patch(`/admin/users/${userId}/department`, { departmentId });

// ─── Attendance Corrections (user) ───────────────────────────────────────────

export const getMyCorrections    = (params = {}) => api.get('/corrections', { params });
export const submitCorrection    = (payload) => api.post('/corrections', payload);
export const cancelCorrection    = (id) => api.delete(`/corrections/${id}`);

// ─── Attendance Corrections (admin) ──────────────────────────────────────────

export const adminGetCorrections    = (params = {}) => api.get('/admin/corrections', { params });
export const adminApproveCorrection = (id, adminNote) =>
  api.patch(`/admin/corrections/${id}/approve`, { adminNote });
export const adminRejectCorrection  = (id, adminNote) =>
  api.patch(`/admin/corrections/${id}/reject`, { adminNote });

// ─── Leaves (user) ────────────────────────────────────────────────────────────

export const getLeaveTypes    = () => api.get('/leaves/types');
export const getMyLeaves      = (params = {}) => api.get('/leaves', { params });
export const getLeaveBalance  = (year) => api.get('/leaves/balance', { params: { year } });
export const submitLeave      = (payload) => api.post('/leaves', payload);
export const cancelLeave      = (id) => api.delete(`/leaves/${id}`);

// ─── Leaves (admin) ───────────────────────────────────────────────────────────

export const adminGetLeaves        = (params = {}) => api.get('/admin/leaves', { params });
export const adminApproveLeave     = (id, adminNote) =>
  api.patch(`/admin/leaves/${id}/approve`, { adminNote });
export const adminRejectLeave      = (id, adminNote) =>
  api.patch(`/admin/leaves/${id}/reject`, { adminNote });
export const adminSetLeaveAllowance = (payload) => api.post('/admin/leaves/allowances', payload);
export const adminGetUserLeaveBalance = (userId, year) =>
  api.get(`/admin/users/${userId}/leave-balance`, { params: { year } });

// ─── Analytics ───────────────────────────────────────────────────────────────

// ─── Org Settings ────────────────────────────────────────────────────────────

export const getOrgSettings    = () => api.get('/admin/settings');
export const updateOrgSettings = (settings) => api.put('/admin/settings', settings);

export const getPersonalAnalytics  = () => api.get('/analytics/summary');
export const getPersonalPunctuality = (months = 3) => api.get('/analytics/punctuality', { params: { months } });
export const adminGetAnalytics     = (days = 30) => api.get('/admin/analytics', { params: { days } });
export const adminGetPunctuality   = (days = 30) => api.get('/admin/punctuality', { params: { days } });

// ─── Holidays ────────────────────────────────────────────────────────────────

export const getHolidays = (year) => api.get('/holidays', { params: { year } });

// ─── Shifts ──────────────────────────────────────────────────────────────────

export const getShifts             = () => api.get('/shifts');
export const adminGetShifts        = () => api.get('/admin/shifts');
export const adminCreateShift      = (payload) => api.post('/admin/shifts', payload);
export const adminUpdateShift      = (id, payload) => api.put(`/admin/shifts/${id}`, payload);
export const adminDeleteShift      = (id) => api.delete(`/admin/shifts/${id}`);
export const adminGetAssignments   = () => api.get('/admin/shifts/assignments');
export const adminAssignShift      = (userId, shiftId) => api.post('/admin/shifts/assignments', { userId, shiftId });
export const adminRemoveAssignment = (userId) => api.delete(`/admin/shifts/assignments/${userId}`);

// ─── Manager ─────────────────────────────────────────────────────────────────

export const getManagerTeam = () => api.get('/manager/team');
export const adminGetHolidays    = () => api.get('/admin/holidays');
export const adminCreateHoliday  = (payload) => api.post('/admin/holidays', payload);
export const adminUpdateHoliday  = (id, payload) => api.put(`/admin/holidays/${id}`, payload);
export const adminDeleteHoliday  = (id) => api.delete(`/admin/holidays/${id}`);
