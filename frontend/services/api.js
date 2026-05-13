// services/api.js
// Axios instance configured to talk to the backend.
// Automatically attaches the Supabase access token to every request.

import axios from 'axios';
import { Platform } from 'react-native';
import { getIdToken } from './authService';

function resolveBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) {
    const trimmed = fromEnv.replace(/\/$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  if (!__DEV__) {
    return 'https://track-onme.onrender.com/api';
  }
  // Android emulator uses 10.0.2.2 to reach the host machine.
  // Expo Go on a physical Android device needs the host machine's LAN IP;
  // set EXPO_PUBLIC_API_URL=http://192.168.x.x:5000 in frontend/.env for that.
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }
  return 'http://localhost:5000/api';
}

export const BASE_URL = resolveBaseUrl();

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// Attach Bearer token before every request
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      return Promise.reject(
        new Error('You are not signed in, or the session token could not be read. Try signing in again.')
      );
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/** Human-readable message for failed API calls. */
export function getApiErrorMessage(error) {
  const msg = error?.message || '';
  if (msg.includes('not signed in') || msg.includes('session token')) return msg;
  if (error?.response?.status === 401) {
    return 'The server rejected your login session. Sign out and sign in again.';
  }
  if (error?.code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout')) {
    return 'Request timed out. Is the backend running? From the project folder run:\ncd backend && npm run dev\n(must listen on port 5000)';
  }
  if (error?.response?.data?.error) return String(error.response.data.error);
  if (msg === 'Network Error' || !error?.response) {
    return `Cannot reach the API. Start the backend on port 5000.\nWeb → http://localhost:5000/api\nPhysical Android → set EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:5000 in frontend/.env`;
  }
  return msg || 'Something went wrong.';
}

// ─── API Calls ────────────────────────────────────────────────────────────────

export const checkIn = () => api.post('/checkin');

export const checkOut = () => api.post('/checkout');

export const getAttendance = () => api.get('/attendance');

export const getAttendanceDaily = () => api.get('/attendance/daily');

export const getStatus = () => api.get('/status');
