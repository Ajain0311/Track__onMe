// store/timeStore.js
// User-isolated time tracking state using Zustand with AsyncStorage persistence.
// Each user has their own isolated data using UID-scoped storage keys.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys are now scoped per user - will be set during initialization
let STORAGE_KEY = '@attendance_total_time';
let SESSIONS_KEY = '@attendance_sessions_history';

export const useTimeStore = create((set, get) => ({
  // Current user ID for data isolation
  currentUserId: null,
  
  // Current session tracking
  isCheckedIn: false,
  currentSessionStart: null,
  currentSessionSeconds: 0,
  checkInSsid: null,       // WiFi SSID active at the time of check-in (null = not via WiFi)
  checkInTimestamp: null,  // epoch ms of check-in — used for grace period in WiFi monitor
  
  // Total accumulated time (in seconds) - per user
  totalTimeSeconds: 0,
  
  // Session history for analytics - per user
  sessions: [],
  
  // Daily totals for analytics - per user
  dailyTotals: {},
  
  // Loading state
  isLoading: true,

  // Set current user and load their data
  setCurrentUser: async (userId) => {
    if (!userId) {
      set({
        currentUserId: null,
        isCheckedIn: false,
        currentSessionStart: null,
        currentSessionSeconds: 0,
        checkInSsid: null,
        checkInTimestamp: null,
        totalTimeSeconds: 0,
        sessions: [],
        dailyTotals: {},
        isLoading: false
      });
      return;
    }
    
    // Update storage keys to be user-specific
    STORAGE_KEY = `@attendance_total_time_${userId}`;
    SESSIONS_KEY = `@attendance_sessions_history_${userId}`;
    
    set({ currentUserId: userId, isLoading: true });
    
    // Load this user's data
    await get().loadUserData();
  },

  // Load user-specific data from AsyncStorage
  loadUserData: async () => {
    try {
      const userId = get().currentUserId;
      if (!userId) {
        set({ isLoading: false });
        return;
      }
      
      const [totalTimeJson, sessionsJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(SESSIONS_KEY),
      ]);
      
      const totalTimeSeconds = totalTimeJson ? parseInt(totalTimeJson, 10) : 0;
      const sessions = sessionsJson ? JSON.parse(sessionsJson) : [];
      
      // Calculate daily totals from sessions
      const dailyTotals = get().calculateDailyTotals(sessions);
      
      set({ 
        totalTimeSeconds, 
        sessions, 
        dailyTotals,
        isLoading: false 
      });
    } catch (error) {
      console.error('[TimeStore] Error loading user data:', error);
      set({ isLoading: false });
    }
  },

  // Initialize store (call this on app start, then call setCurrentUser after login)
  initialize: async () => {
    // Just set loading to false - actual data loading happens in setCurrentUser
    set({ isLoading: false });
  },

  // Calculate daily totals from sessions
  calculateDailyTotals: (sessions) => {
    const totals = {};
    sessions.forEach(session => {
      if (session.duration && session.date) {
        if (!totals[session.date]) {
          totals[session.date] = 0;
        }
        totals[session.date] += session.duration;
      }
    });
    return totals;
  },

  // Check in - start a new session.
  // ssid: the WiFi network name the user was on when checking in (null = not via WiFi).
  // initialSeconds: elapsed seconds to seed the timer with (used when syncing from server
  //   after an app restart so the timer shows real elapsed time instead of starting at 0).
  checkIn: (ssid = null, initialSeconds = 0) => {
    const now = new Date();
    set({
      isCheckedIn: true,
      currentSessionStart: now.toISOString(),
      currentSessionSeconds: Math.max(0, Math.floor(initialSeconds)),
      checkInSsid: ssid,
      checkInTimestamp: now.getTime(),
    });
  },

  // Check out - end session and add to total
  checkOut: async () => {
    const state = get();
    const { currentSessionStart, currentSessionSeconds, totalTimeSeconds, sessions } = state;
    
    if (!currentSessionStart) return;
    
    const now = new Date();
    const sessionDate = new Date(currentSessionStart).toISOString().split('T')[0];
    
    // Create session record
    const sessionRecord = {
      id: `session_${Date.now()}`,
      date: sessionDate,
      checkInTime: currentSessionStart,
      checkOutTime: now.toISOString(),
      duration: currentSessionSeconds,
    };
    
    // Add to total time
    const newTotalTime = totalTimeSeconds + currentSessionSeconds;
    
    // Add to sessions history
    const updatedSessions = [sessionRecord, ...sessions].slice(0, 100); // Keep last 100 sessions
    
    // Update daily totals
    const updatedDailyTotals = { ...state.dailyTotals };
    if (!updatedDailyTotals[sessionDate]) {
      updatedDailyTotals[sessionDate] = 0;
    }
    updatedDailyTotals[sessionDate] += currentSessionSeconds;
    
    // Persist to storage
    try {
      await AsyncStorage.setItem(STORAGE_KEY, newTotalTime.toString());
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updatedSessions));
    } catch (error) {
      console.error('[TimeStore] Error saving data:', error);
    }
    
    set({
      isCheckedIn: false,
      currentSessionStart: null,
      currentSessionSeconds: 0,
      totalTimeSeconds: newTotalTime,
      sessions: updatedSessions,
      dailyTotals: updatedDailyTotals,
      checkInSsid: null,
      checkInTimestamp: null,
    });
  },

  // Update current session timer
  tick: () => {
    const state = get();
    if (state.isCheckedIn) {
      set({ currentSessionSeconds: state.currentSessionSeconds + 1 });
    }
  },

  // Reset all data (for testing/debugging)
  resetAll: async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.removeItem(SESSIONS_KEY);
    } catch (error) {
      console.error('[TimeStore] Error resetting data:', error);
    }
    
    set({
      isCheckedIn: false,
      currentSessionStart: null,
      currentSessionSeconds: 0,
      totalTimeSeconds: 0,
      sessions: [],
      dailyTotals: {},
    });
  },

  // Get today's total time
  getTodayTotal: () => {
    const today = new Date().toISOString().split('T')[0];
    return get().dailyTotals[today] || 0;
  },

  // Get this week's total time
  getWeekTotal: () => {
    const state = get();
    const today = new Date();
    let weekTotal = 0;
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      weekTotal += state.dailyTotals[dateStr] || 0;
    }
    
    return weekTotal;
  },

  // Get this month's total time
  getMonthTotal: () => {
    const state = get();
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM
    
    return Object.entries(state.dailyTotals).reduce((total, [date, seconds]) => {
      if (date.startsWith(currentMonth)) {
        return total + seconds;
      }
      return total;
    }, 0);
  },

  // Clear old global data (migration utility)
  clearOldGlobalData: async () => {
    try {
      await AsyncStorage.multiRemove([
        '@attendance_total_time',
        '@attendance_sessions_history',
      ]);
      console.log('[TimeStore] Old global data cleared');
    } catch (error) {
      console.error('[TimeStore] Error clearing old data:', error);
    }
  },

  // Sync with server data (if available)
  syncWithServer: async (serverSessions) => {
    if (!serverSessions || serverSessions.length === 0) return;
    
    const state = get();
    
    // Merge server sessions with local
    const mergedSessions = [...state.sessions];
    let totalAdded = 0;
    
    serverSessions.forEach(serverSession => {
      const exists = mergedSessions.some(s => s.id === serverSession.id);
      if (!exists && serverSession.duration) {
        mergedSessions.push({
          ...serverSession,
          id: serverSession.id || `server_${Date.now()}_${Math.random()}`,
        });
        totalAdded += serverSession.duration;
      }
    });
    
    // Sort by date descending
    mergedSessions.sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));
    
    const newTotalTime = state.totalTimeSeconds + totalAdded;
    const dailyTotals = state.calculateDailyTotals(mergedSessions);
    
    // Persist
    try {
      await AsyncStorage.setItem(STORAGE_KEY, newTotalTime.toString());
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(mergedSessions.slice(0, 100)));
    } catch (error) {
      console.error('[TimeStore] Error syncing data:', error);
    }
    
    set({
      totalTimeSeconds: newTotalTime,
      sessions: mergedSessions.slice(0, 100),
      dailyTotals,
    });
  },
}));

export default useTimeStore;
