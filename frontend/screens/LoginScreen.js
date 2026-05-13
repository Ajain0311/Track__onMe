// screens/LoginScreen.js — Login / Signup with glossy glass UI

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { signIn, signUp } from '../services/authService';
import useThemeStore from '../store/themeStore';

function notifyError(title, message) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

const toAuthEmail = (input) => {
  const t = input.trim().toLowerCase();
  if (!t) return '';
  return t.includes('@') ? t : `${t}@example.com`;
};

function getSupabaseErrorMessage(error) {
  const msg = error?.message || '';
  const status = error?.status;

  if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'Wrong email or password.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'Please confirm your email address before signing in.';
  }
  if (msg.includes('User already registered') || msg.includes('already been registered')) {
    return 'That email is already registered. Try Sign In.';
  }
  if (msg.includes('Password should be')) {
    return 'Password must be at least 6 characters.';
  }
  if (msg.includes('Unable to validate email address')) {
    return 'That email address looks invalid.';
  }
  if (msg.includes('signup_disabled') || msg.includes('Signups not allowed')) {
    return 'Sign-ups are currently disabled. Contact your administrator.';
  }
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return msg || 'Something went wrong. Please try again.';
}

const staticStyles = StyleSheet.create({
  fill: { flex: 1 },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 48 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoRing: { width: 88, height: 88, borderRadius: 44, padding: 3, justifyContent: 'center', alignItems: 'center', marginBottom: 16, elevation: 14 },
  logoInner: { width: '100%', height: '100%', borderRadius: 41, justifyContent: 'center', alignItems: 'center' },
  logoEmoji: { fontSize: 38 },
  appName: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  card: { borderRadius: 24, padding: 26, borderWidth: 1, overflow: 'hidden', elevation: 12 },
  cardGlow: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 24, pointerEvents: 'none' },
  cardTitle: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  cardSubtitle: { fontSize: 14, marginBottom: 22 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 12, marginBottom: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { borderWidth: 1, borderRadius: 14, padding: 16, fontSize: 16 },
  btnOuter: { marginTop: 10, borderRadius: 16, overflow: 'hidden' },
  btnGrad: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  switchBtn: { marginTop: 22, alignItems: 'center' },
  switchText: { fontSize: 14 },
  switchLink: { fontWeight: '800' },
});

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { colors: g, gradients: grad } = useThemeStore();

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      notifyError('Validation', 'Please enter both email/username and password.');
      return;
    }
    const authEmail = toAuthEmail(email);
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(authEmail, password);
      } else {
        await signUp(authEmail, password);
      }
    } catch (error) {
      notifyError('Error', getSupabaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={grad.screen} style={staticStyles.fill}>
      <KeyboardAvoidingView style={staticStyles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={staticStyles.inner} keyboardShouldPersistTaps="handled">
          <View style={staticStyles.header}>
            <LinearGradient colors={grad.button} style={[staticStyles.logoRing, { shadowColor: g.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 24 }]}>
              <View style={[staticStyles.logoInner, { backgroundColor: g.bg1 }]}>
                <Text style={staticStyles.logoEmoji}>⏱</Text>
              </View>
            </LinearGradient>
            <Text style={[staticStyles.appName, { color: g.text }]}>AttendTrack</Text>
            <Text style={[staticStyles.tagline, { color: g.textMuted }]}>Glass-clear attendance, one tap at a time</Text>
          </View>

          <View style={[staticStyles.card, { backgroundColor: g.glass, borderColor: g.border, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 28 }]}>
            <View style={staticStyles.cardGlow} />
            <Text style={[staticStyles.cardTitle, { color: g.text }]}>{isLogin ? 'Welcome back' : 'Create account'}</Text>
            <Text style={[staticStyles.cardSubtitle, { color: g.textMuted }]}>
              {isLogin ? 'Sign in to sync your hours' : 'Join and start tracking time'}
            </Text>

            <View style={staticStyles.inputGroup}>
              <Text style={[staticStyles.label, { color: g.textMuted }]}>Email or username</Text>
              <TextInput
                style={[staticStyles.input, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: g.border, color: g.text }]}
                placeholder="you@company.com"
                placeholderTextColor={g.textDim}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={staticStyles.inputGroup}>
              <Text style={[staticStyles.label, { color: g.textMuted }]}>Password</Text>
              <TextInput
                style={[staticStyles.input, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: g.border, color: g.text }]}
                placeholder="••••••••"
                placeholderTextColor={g.textDim}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity
              style={[staticStyles.btnOuter, loading && staticStyles.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.9}
            >
              <LinearGradient colors={grad.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={staticStyles.btnGrad}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={staticStyles.btnText}>{isLogin ? 'Sign In' : 'Sign Up'}</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={staticStyles.switchBtn}>
              <Text style={[staticStyles.switchText, { color: g.textMuted }]}>
                {isLogin ? 'New here? ' : 'Have an account? '}
                <Text style={[staticStyles.switchLink, { color: g.accent }]}>{isLogin ? 'Sign Up' : 'Sign In'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
