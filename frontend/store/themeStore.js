// store/themeStore.js
// Theme state management with dark mode support and persistence.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

const THEME_STORAGE_KEY = '@app_theme_mode';

// Light theme colors
export const lightTheme = {
  bg0: '#f8f9fa',
  bg1: '#ffffff',
  bg2: '#f1f3f4',
  glass: 'rgba(0,0,0,0.04)',
  glassStrong: 'rgba(0,0,0,0.08)',
  border: 'rgba(0,0,0,0.1)',
  borderGlow: 'rgba(99,102,241,0.3)',
  accent: '#6366f1',
  accentSoft: 'rgba(99,102,241,0.15)',
  mint: '#10b981',
  mintSoft: 'rgba(16,185,129,0.15)',
  coral: '#f43f5e',
  coralSoft: 'rgba(244,63,94,0.15)',
  warn: '#f59e0b',
  text: '#1f2937',
  textMuted: '#6b7280',
  textDim: '#9ca3af',
  errorBg: 'rgba(244,63,94,0.1)',
  errorBorder: 'rgba(244,63,94,0.3)',
  cardBg: '#ffffff',
  cardBorder: 'rgba(0,0,0,0.08)',
  shadowColor: '#000000',
};

// Dark theme colors (original glossy theme)
export const darkTheme = {
  bg0: '#06060f',
  bg1: '#0e0e1c',
  bg2: '#141428',
  glass: 'rgba(255,255,255,0.07)',
  glassStrong: 'rgba(255,255,255,0.11)',
  border: 'rgba(255,255,255,0.14)',
  borderGlow: 'rgba(124,108,245,0.45)',
  accent: '#8b7cff',
  accentSoft: 'rgba(139,124,255,0.25)',
  mint: '#3ee8c7',
  mintSoft: 'rgba(62,232,199,0.2)',
  coral: '#ff7b9c',
  coralSoft: 'rgba(255,123,156,0.2)',
  warn: '#ffb347',
  text: '#f2f2f8',
  textMuted: '#9494ac',
  textDim: '#5c5c78',
  errorBg: 'rgba(255,80,100,0.12)',
  errorBorder: 'rgba(255,100,120,0.35)',
  cardBg: 'rgba(40,38,80,0.55)',
  cardBorder: 'rgba(255,255,255,0.14)',
  shadowColor: '#000000',
};

// Gradients for light theme
export const lightGradients = {
  screen: ['#f8f9fa', '#f1f3f4', '#e5e7eb'],
  card: ['rgba(255,255,255,0.95)', 'rgba(248,249,250,0.9)'],
  button: ['#818cf8', '#6366f1'],
  mintBtn: ['#34d399', '#10b981'],
  coralBtn: ['#fb7185', '#f43f5e'],
};

// Gradients for dark theme
export const darkGradients = {
  screen: ['#06060f', '#101024', '#0a0a18'],
  card: ['rgba(40,38,80,0.55)', 'rgba(18,18,36,0.4)'],
  button: ['#9b8cff', '#6c5ce7'],
  mintBtn: ['#4af0d0', '#2ec4a8'],
  coralBtn: ['#ff8fab', '#ff5c7a'],
};

export const useThemeStore = create((set, get) => ({
  // Theme mode: 'light', 'dark', or 'system'
  themeMode: 'system',
  
  // Actual theme being used (resolved from mode)
  isDark: true,
  
  // Colors and gradients
  colors: darkTheme,
  gradients: darkGradients,
  
  // Loading state
  isLoading: true,

  // Initialize theme from storage
  initialize: async () => {
    try {
      const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      const mode = savedMode || 'system';
      get().setThemeMode(mode, false);
    } catch (error) {
      console.error('[ThemeStore] Error initializing:', error);
      set({ isLoading: false });
    }
  },

  // Set theme mode
  setThemeMode: async (mode, persist = true) => {
    const systemDark = Appearance.getColorScheme() === 'dark';
    const isDark = mode === 'system' ? systemDark : mode === 'dark';
    
    set({
      themeMode: mode,
      isDark,
      colors: isDark ? darkTheme : lightTheme,
      gradients: isDark ? darkGradients : lightGradients,
      isLoading: false,
    });
    
    if (persist) {
      try {
        await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      } catch (error) {
        console.error('[ThemeStore] Error saving theme:', error);
      }
    }
  },

  // Toggle between light and dark
  toggleTheme: async () => {
    const { isDark, themeMode } = get();
    const newMode = isDark ? 'light' : 'dark';
    await get().setThemeMode(newMode);
  },

  // Update when system theme changes
  updateSystemTheme: () => {
    const { themeMode } = get();
    if (themeMode === 'system') {
      const systemDark = Appearance.getColorScheme() === 'dark';
      set({
        isDark: systemDark,
        colors: systemDark ? darkTheme : lightTheme,
        gradients: systemDark ? darkGradients : lightGradients,
      });
    }
  },
}));

export default useThemeStore;
