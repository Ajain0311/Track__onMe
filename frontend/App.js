// App.js
// Root of the app. Handles auth state listening and navigation.

import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Text, Appearance } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from './services/firebaseConfig';
import useAuthStore from './store/authStore';
import useThemeStore from './store/themeStore';
import { useTimeStore } from './store/timeStore';
import { startWifiMonitoring, stopWifiMonitoring } from './services/wifiMonitor';

import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import HistoryScreen from './screens/HistoryScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import SettingsScreen from './screens/SettingsScreen';
import FaceRegistrationScreen from './screens/FaceRegistrationScreen';
import FaceVerificationScreen from './screens/FaceVerificationScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Bottom tab navigator for authenticated users
function MainTabs() {
  const { colors: g, isDark } = useThemeStore();
  
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? 'rgba(10,10,22,0.94)' : 'rgba(255,255,255,0.94)',
          borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarActiveTintColor: g.accent,
        tabBarInactiveTintColor: isDark ? '#4a4a62' : '#9ca3af',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Home', tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} /> }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ tabBarLabel: 'Stats', tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} /> }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarLabel: 'History', tabBarIcon: ({ color }) => <TabIcon emoji="📋" color={color} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings', tabBarIcon: ({ color }) => <TabIcon emoji="⚙️" color={color} /> }}
      />
    </Tab.Navigator>
  );
}

// Simple emoji tab icon
function TabIcon({ emoji, color }) {
  const { colors: g } = useThemeStore();
  const { Text } = require('react-native');
  const active = color === g.accent;
  return <Text style={{ fontSize: 22, opacity: active ? 1 : 0.45 }}>{emoji}</Text>;
}

export default function App() {
  const { user, loading: authLoading, setUser, setLoading: setAuthLoading } = useAuthStore();
  const { initialize: initializeTheme, colors: g, gradients: grad, isDark } = useThemeStore();

  // Initialize theme on mount and clear old global data
  useEffect(() => {
    initializeTheme();
    // Clear old global data (migration to user-isolated storage)
    useTimeStore.getState().clearOldGlobalData();
  }, []);

  // Listen to system theme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(() => {
      const { updateSystemTheme } = useThemeStore.getState();
      updateSystemTheme();
    });
    return () => subscription.remove();
  }, []);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Start/stop WiFi monitoring based on auth state
  useEffect(() => {
    if (user) {
      // User logged in - start monitoring
      startWifiMonitoring();
    } else {
      // User logged out - stop monitoring
      stopWifiMonitoring();
    }
    
    return () => {
      stopWifiMonitoring();
    };
  }, [user]);

  // Show spinner while checking auth or loading theme
  if (authLoading || !g) {
    return (
      <View style={[styles.splash, { backgroundColor: '#06060f' }]}>
        <ActivityIndicator size="large" color="#8b7cff" />
        <Text style={styles.splashHint}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator 
          screenOptions={{ 
            headerShown: false, 
            animation: 'fade',
            contentStyle: { backgroundColor: g.bg0 }
          }}
        >
          {user ? (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="FaceRegistration" component={FaceRegistrationScreen} />
              <Stack.Screen name="FaceVerification" component={FaceVerificationScreen} />
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashHint: { marginTop: 16, color: '#9494ac', fontSize: 14 },
});
