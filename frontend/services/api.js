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
  if (error?.response?.status === 403) return 'You don\'t have permission to do that.';
  if (error?.code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout'))
    return 'Request timed out. The server may be waking up — try again in a moment.';
  if (error?.response?.data?.error) return String(error.response.data.error);
  if (msg === 'Network Error' || !error?.response)
    return 'Cannot reach the server. Check your internet connection.';
  return msg || 'Something went wrong.';
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export const checkIn = (location = null) =>
  api.post('/checkin', location ? {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    locationId: location.locationId ?? null,
    locationName: location.locationName ?? null,
  } : {});

export const checkOut = () => api.post('/checkout');
export const getAttendance = () => api.get('/attendance');
export const getAttendanceDaily = () => api.get('/attendance/daily');
export const getStatus = () => api.get('/status');

// ─── Current user ─────────────────────────────────────────────────────────────

export const getMe = () => api.get('/me');

// ─── Locations (user-facing) ──────────────────────────────────────────────────

export const getActiveLocations = () => api.get('/locations');

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminGetStats = () => api.get('/admin/stats');
export const adminGetUsers = (page = 1) => api.get('/admin/users', { params: { page } });
export const adminGetUserAttendance = (userId) => api.get(`/admin/users/${userId}/attendance`);
export const adminUpdateUserRole = (userId, role) => api.patch(`/admin/users/${userId}/role`, { role });

export const adminGetLocations = () => api.get('/admin/locations');
export const adminGetLocation = (id) => api.get(`/admin/locations/${id}`);
export const adminCreateLocation = (payload) => api.post('/admin/locations', payload);
export const adminUpdateLocation = (id, payload) => api.put(`/admin/locations/${id}`, payload);
export const adminToggleLocation = (id) => api.patch(`/admin/locations/${id}/toggle`);
export const adminDeleteLocation = (id) => api.delete(`/admin/locations/${id}`);

// ─── Location Requests (user) ─────────────────────────────────────────────────

export const getMyLocationRequests = () => api.get('/location-requests');
export const submitLocationRequest = (payload) => api.post('/location-requests', payload);
export const cancelLocationRequest = (id) => api.delete(`/location-requests/${id}`);

// ─── Notifications ────────────────────────────────────────────────────────────

export const getNotifications = (unreadOnly = false) =>
  api.get('/notifications', { params: { unread: unreadOnly ? 1 : undefined } });
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all');

// ─── Activity ─────────────────────────────────────────────────────────────────

export const getMyActivity = (limit = 50) =>
  api.get('/activity', { params: { limit } });

// ─── Audit logs (admin) ───────────────────────────────────────────────────────

export const adminGetAuditLogs = (params = {}) =>
  api.get('/admin/audit-logs', { params });

// ─── Location Requests (admin) ────────────────────────────────────────────────

export const adminGetLocationRequests = (status = 'pending') =>
  api.get('/admin/location-requests', { params: { status } });
export const adminApproveLocationRequest = (id, adminNote) =>
  api.patch(`/admin/location-requests/${id}/approve`, { adminNote });
export const adminRejectLocationRequest = (id, adminNote) =>
  api.patch(`/admin/location-requests/${id}/reject`, { adminNote });
