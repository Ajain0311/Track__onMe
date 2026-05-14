// store/goalStore.js — User-defined work goals and streak tracking

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_GOALS = {
  dailyHoursGoal: 8,
  weeklyDaysGoal: 5,
};

const MIN_SECONDS_FOR_STREAK = 1800; // 30 min minimum to count a day

export const useGoalStore = create((set, get) => ({
  goals: DEFAULT_GOALS,
  isLoaded: false,

  initialize: async (userId) => {
    if (get().isLoaded) return;
    try {
      const key = userId ? `@goals_${userId}` : '@goals';
      const saved = await AsyncStorage.getItem(key);
      if (saved) {
        set({ goals: { ...DEFAULT_GOALS, ...JSON.parse(saved) }, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  updateGoals: async (updates, userId) => {
    const merged = { ...get().goals, ...updates };
    set({ goals: merged });
    try {
      const key = userId ? `@goals_${userId}` : '@goals';
      await AsyncStorage.setItem(key, JSON.stringify(merged));
    } catch {}
  },

  getDailyGoalSeconds: () => get().goals.dailyHoursGoal * 3600,

  getDailyGoalProgress: (todaySeconds) => {
    const goal = get().goals.dailyHoursGoal * 3600;
    return goal > 0 ? Math.min(todaySeconds / goal, 1) : 0;
  },

  // Count consecutive days with attendance (skips today if not yet enough time)
  computeStreak: (dailyTotals) => {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const secs = dailyTotals[dateStr] || 0;
      if (i === 0 && secs < MIN_SECONDS_FOR_STREAK) continue;
      if (secs >= MIN_SECONDS_FOR_STREAK) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  },
}));

export default useGoalStore;
