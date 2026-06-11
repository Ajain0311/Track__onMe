// App.js — Root: Supabase auth, navigation, WiFi monitoring, animated splash

import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet, Text, Appearance, Animated, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './utils/webAlertShim'; // makes Alert.alert work in the browser
import { supabase } from './services/supabaseConfig';
import useAuthStore from './store/authStore';
import useThemeStore from './store/themeStore';
import { useTimeStore } from './store/timeStore';
import { startWifiMonitoring, stopWifiMonitoring } from './services/wifiMonitor';
import { getMe, trackLogin } from './services/api';

import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import HistoryScreen from './screens/HistoryScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import SettingsScreen from './screens/SettingsScreen';
import FaceRegistrationScreen from './screens/FaceRegistrationScreen';
import FaceVerificationScreen from './screens/FaceVerificationScreen';
import LocationPickerScreen from './screens/LocationPickerScreen';
import AdminDashboardScreen from './screens/admin/AdminDashboardScreen';
import AdminUsersScreen from './screens/admin/AdminUsersScreen';
import AdminUserDetailScreen from './screens/admin/AdminUserDetailScreen';
import AdminLocationsScreen from './screens/admin/AdminLocationsScreen';
import AdminLocationFormScreen from './screens/admin/AdminLocationFormScreen';
import AdminLocationRequestsScreen from './screens/admin/AdminLocationRequestsScreen';
import AdminAuditLogsScreen from './screens/admin/AdminAuditLogsScreen';
import AdminLiveAttendanceScreen from './screens/admin/AdminLiveAttendanceScreen';
import AdminLeavesScreen from './screens/admin/AdminLeavesScreen';
import AdminCorrectionsScreen from './screens/admin/AdminCorrectionsScreen';
import AdminDepartmentsScreen from './screens/admin/AdminDepartmentsScreen';
import AdminReportsScreen from './screens/admin/AdminReportsScreen';
import AdminAnalyticsScreen from './screens/admin/AdminAnalyticsScreen';
import AdminHolidaysScreen from './screens/admin/AdminHolidaysScreen';
import TeamDashboardScreen from './screens/TeamDashboardScreen';
import AdminOrgSettingsScreen from './screens/admin/AdminOrgSettingsScreen';
import AdminShiftsScreen from './screens/admin/AdminShiftsScreen';
import AdminAbsenteeismScreen from './screens/admin/AdminAbsenteeismScreen';
import AdminDesignationsScreen from './screens/admin/AdminDesignationsScreen';
import AdminAnomaliesScreen from './screens/admin/AdminAnomaliesScreen';
import AdminLeaveAnalyticsScreen from './screens/admin/AdminLeaveAnalyticsScreen';
import AdminEmployeeDetailScreen from './screens/admin/AdminEmployeeDetailScreen';
import AdminLocationQrScreen from './screens/admin/AdminLocationQrScreen';
import AdminSalariesScreen from './screens/admin/AdminSalariesScreen';
import MySalaryScreen from './screens/MySalaryScreen';
import QrScanScreen from './screens/QrScanScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import LeaveBalanceScreen from './screens/LeaveBalanceScreen';
import EmployeeDirectoryScreen from './screens/EmployeeDirectoryScreen';
import AttendanceCalendarScreen from './screens/AttendanceCalendarScreen';
import LocationRequestScreen from './screens/LocationRequestScreen';
import MyLocationRequestsScreen from './screens/MyLocationRequestsScreen';
import LeaveRequestScreen from './screens/LeaveRequestScreen';
import MyLeavesScreen from './screens/MyLeavesScreen';
import AttendanceCorrectionScreen from './screens/AttendanceCorrectionScreen';
import MyCorrectionRequestsScreen from './screens/MyCorrectionRequestsScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ActivityScreen from './screens/ActivityScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import { ToastProvider } from './components/ToastProvider';
import ErrorBoundary from './components/ErrorBoundary';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Track a single login event per browser session (web) / per app launch (native)
let _loginTracked = false;
const recordLoginOnce = () => {
  if (_loginTracked) return;
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (sessionStorage.getItem('loginRecorded') === '1') { _loginTracked = true; return; }
      sessionStorage.setItem('loginRecorded', '1');
    }
    _loginTracked = true;
    trackLogin(Platform.OS).catch(() => {}); // best-effort, never blocks UI
  } catch { /* sessionStorage may not exist in private mode */ }
};

function TabIcon({ emoji, focused }) {
  const { Text: RNText } = require('react-native');
  return (
    <RNText style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.45 }}>
      {emoji}
    </RNText>
  );
}

function MainTabs() {
  const { colors: g, isDark } = useThemeStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? 'rgba(8,8,20,0.96)' : 'rgba(255,255,255,0.96)',
          borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarActiveTintColor: g.accent,
        tabBarInactiveTintColor: isDark ? '#3a3a52' : '#9ca3af',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Home', tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ tabBarLabel: 'Stats', tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarLabel: 'History', tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings', tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} /> }}
      />
      {isAdmin && (
        <Tab.Screen
          name="Admin"
          component={AdminDashboardScreen}
          options={{ tabBarLabel: 'Admin', tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" focused={focused} /> }}
        />
      )}
    </Tab.Navigator>
  );
}

function SplashScreen() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.splash, { opacity: fadeAnim }]}>
      <Animated.Text style={[styles.splashEmoji, { transform: [{ scale: pulseAnim }] }]}>⏱</Animated.Text>
      <Text style={styles.splashTitle}>AttendTrack</Text>
      <ActivityIndicator size="small" color="#8b7cff" style={{ marginTop: 28 }} />
      <Text style={styles.splashHint}>Loading your workspace…</Text>
    </Animated.View>
  );
}

// Inject web-only CSS once on mount: smooth fonts, scroll behavior, focus rings.
// Implements the UI/UX skill's accessibility + transition guidelines without
// having to touch every screen.
const injectWebStyles = () => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('attendtrack-web-styles')) return;
  const css = `
    html, body, #root { height: 100%; }
    body {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      scroll-behavior: smooth;
      background: #06060f;
    }
    *:focus-visible {
      outline: 2px solid #8b7cff !important;
      outline-offset: 2px;
      border-radius: 4px;
    }
    button, [role="button"] { cursor: pointer; transition: transform 180ms ease, opacity 180ms ease; }
    button:active, [role="button"]:active { transform: scale(0.98); }
    input, textarea { transition: border-color 180ms ease, background 180ms ease; }
    /* Respect users who prefer less motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }
    /* Scrollbar polish on web */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(139,124,255,0.3); border-radius: 8px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(139,124,255,0.5); }

    /* Desktop SaaS layout: subtle radial backdrop + soft card glow on cards */
    @media (min-width: 1024px) {
      body::before {
        content: '';
        position: fixed; inset: 0; pointer-events: none; z-index: 0;
        background:
          radial-gradient(800px 600px at 10% -10%, rgba(139,124,255,0.10), transparent 60%),
          radial-gradient(700px 500px at 110% 20%, rgba(62,232,199,0.07), transparent 60%),
          radial-gradient(900px 700px at 50% 120%, rgba(229,83,75,0.06), transparent 60%);
      }
    }
  `;
  const style = document.createElement('style');
  style.id = 'attendtrack-web-styles';
  style.textContent = css;
  document.head.appendChild(style);
};

export default function App() {
  const { user, loading: authLoading, setUser, setLoading: setAuthLoading, setIsAdmin } = useAuthStore();
  const { initialize: initializeTheme, colors: g } = useThemeStore();

  useEffect(() => {
    injectWebStyles();
    initializeTheme();
    useTimeStore.getState().clearOldGlobalData();
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      useThemeStore.getState().updateSystemTheme();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setIsAdmin(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch role + initialize time store whenever user changes
  useEffect(() => {
    if (!user) {
      // Clear user-specific time store data on logout
      useTimeStore.getState().setCurrentUser(null);
      return;
    }
    // Load user-specific attendance data from AsyncStorage
    useTimeStore.getState().setCurrentUser(user.id);

    // Retry with backoff — Render free tier cold-starts can take 30-50 s.
    // Cumulative wait: 0 → 5 → 15 → 30 → 50 s (covers worst-case cold start).
    const fetchRole = async () => {
      const delays = [0, 5000, 10000, 15000, 20000];
      for (let i = 0; i < delays.length; i++) {
        if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
        try {
          const res = await getMe();
          setIsAdmin(res.data?.role === 'admin');
          // Record login activity once per browser session (fire-and-forget)
          recordLoginOnce();
          return; // success — stop retrying
        } catch {
          if (i === delays.length - 1) setIsAdmin(false); // all retries exhausted
        }
      }
    };
    fetchRole();
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      startWifiMonitoring();
    } else {
      stopWifiMonitoring();
    }
    return () => stopWifiMonitoring();
  }, [user]);

  if (authLoading || !g) {
    return <SplashScreen />;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ToastProvider>
          <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: g.bg0 },
            }}
          >
            {user ? (
              <>
                <Stack.Screen name="Main" component={MainTabs} />
                <Stack.Screen name="FaceRegistration" component={FaceRegistrationScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="FaceVerification" component={FaceVerificationScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminLocations" component={AdminLocationsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminLocationForm" component={AdminLocationFormScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminLocationRequests" component={AdminLocationRequestsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminAuditLogs" component={AdminAuditLogsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminLiveAttendance" component={AdminLiveAttendanceScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminLeaves" component={AdminLeavesScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminCorrections" component={AdminCorrectionsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AttendanceCorrection" component={AttendanceCorrectionScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="MyCorrectionRequests" component={MyCorrectionRequestsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="MyLeaves" component={MyLeavesScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="LeaveRequest" component={LeaveRequestScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="LocationRequest" component={LocationRequestScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="MyLocationRequests" component={MyLocationRequestsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="Activity" component={ActivityScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminDepartments" component={AdminDepartmentsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminReports" component={AdminReportsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminHolidays" component={AdminHolidaysScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="TeamDashboard" component={TeamDashboardScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminOrgSettings" component={AdminOrgSettingsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminShifts" component={AdminShiftsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminAbsenteeism" component={AdminAbsenteeismScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminDesignations" component={AdminDesignationsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminAnomalies" component={AdminAnomaliesScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminLeaveAnalytics" component={AdminLeaveAnalyticsScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminEmployeeDetail" component={AdminEmployeeDetailScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminLocationQr" component={AdminLocationQrScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AdminSalaries" component={AdminSalariesScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="MySalary" component={MySalaryScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="QrScan" component={QrScanScreen} options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }} />
                <Stack.Screen name="LeaveBalance" component={LeaveBalanceScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="EmployeeDirectory" component={EmployeeDirectoryScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="AttendanceCalendar" component={AttendanceCalendarScreen} options={{ animation: 'slide_from_right' }} />
              </>
            ) : (
              <Stack.Screen name="Login" component={LoginScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
        </ToastProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#06060f',
  },
  splashEmoji: { fontSize: 54, marginBottom: 16 },
  splashTitle: {
    fontSize: 28, fontWeight: '900', color: '#f2f2f8',
    letterSpacing: -0.5,
  },
  splashHint: {
    marginTop: 10, color: '#5c5c78', fontSize: 13, fontWeight: '500',
  },
});
