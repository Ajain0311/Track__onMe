// App.js — Root: Supabase auth, navigation, WiFi monitoring, animated splash

import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet, Text, Appearance, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { supabase } from './services/supabaseConfig';
import useAuthStore from './store/authStore';
import useThemeStore from './store/themeStore';
import { useTimeStore } from './store/timeStore';
import { startWifiMonitoring, stopWifiMonitoring } from './services/wifiMonitor';
import { getMe } from './services/api';

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
import LocationRequestScreen from './screens/LocationRequestScreen';
import MyLocationRequestsScreen from './screens/MyLocationRequestsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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

export default function App() {
  const { user, loading: authLoading, setUser, setLoading: setAuthLoading, setIsAdmin } = useAuthStore();
  const { initialize: initializeTheme, colors: g } = useThemeStore();

  useEffect(() => {
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

    getMe().then((res) => {
      setIsAdmin(res.data?.role === 'admin');
    }).catch(() => setIsAdmin(false));
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
              <Stack.Screen name="LocationRequest" component={LocationRequestScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="MyLocationRequests" component={MyLocationRequestsScreen} options={{ animation: 'slide_from_right' }} />
            </>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
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
