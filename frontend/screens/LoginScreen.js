// screens/LoginScreen.js — Login / Signup with animated glass UI

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Animated, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { signIn, signUp, sendPasswordReset } from '../services/authService';
import useThemeStore from '../store/themeStore';

// ── Android APK download URL ──────────────────────────────────────────────────
// Update this after each EAS build (grab the URL from the EAS dashboard).
const APK_DOWNLOAD_URL = 'https://expo.dev/artifacts/eas/PENDING_BUILD.apk';

const toAuthEmail = (input) => {
  const t = input.trim().toLowerCase();
  if (!t) return '';
  return t.includes('@') ? t : `${t}@example.com`;
};

function getSupabaseErrorMessage(error) {
  const msg = error?.message || '';
  const status = error?.status;
  if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) return 'Wrong email or password. Please try again.';
  if (msg.includes('Email not confirmed')) return 'Please confirm your email before signing in.';
  if (msg.includes('User already registered') || msg.includes('already been registered')) return 'Email already registered — try Sign In.';
  if (msg.includes('Password should be')) return 'Password must be at least 6 characters.';
  if (msg.includes('Unable to validate email address')) return 'That email address looks invalid.';
  if (msg.includes('signup_disabled') || msg.includes('Signups not allowed')) return 'Sign-ups are currently disabled.';
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many requests')) return 'Too many attempts. Please wait a moment.';
  return msg || 'Something went wrong. Please try again.';
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { colors: g, gradients: grad } = useThemeStore();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(48)).current;
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const errorAnim = useRef(new Animated.Value(0)).current;
  const passwordRef = useRef(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 8, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 65, friction: 7, useNativeDriver: true }),
    ]).start();
  }, []);

  const showError = (msg) => {
    setErrorMsg(msg);
    errorAnim.setValue(0);
    Animated.spring(errorAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }).start();
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      showError('Please enter both email and password.');
      return;
    }
    setErrorMsg('');
    const authEmail = toAuthEmail(email);
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(authEmail, password);
      } else {
        await signUp(authEmail, password);
      }
    } catch (error) {
      showError(getSupabaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin((v) => !v);
    setErrorMsg('');
  };

  const [resetSent, setResetSent] = useState(false);
  const handleForgotPassword = async () => {
    if (!email.trim()) { showError('Enter your email above first.'); return; }
    const authEmail = toAuthEmail(email);
    if (!authEmail.includes('@')) { showError('Email looks invalid.'); return; }
    setLoading(true);
    try {
      await sendPasswordReset(authEmail);
      setResetSent(true);
      setErrorMsg('');
    } catch (error) {
      showError(getSupabaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const eyeBg = g.glass || 'rgba(255,255,255,0.07)';

  return (
    <LinearGradient colors={grad.screen} style={ss.fill}>
      <KeyboardAvoidingView style={ss.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={ss.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo / Header ── */}
          <Animated.View style={[ss.header, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}>
            <LinearGradient
              colors={grad.button}
              style={[ss.logoRing, {
                shadowColor: g.accent,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.7,
                shadowRadius: 32,
                elevation: 16,
              }]}
            >
              <View style={[ss.logoInner, { backgroundColor: g.bg1 }]}>
                <Text style={ss.logoEmoji}>⏱</Text>
              </View>
            </LinearGradient>
            <Text style={[ss.appName, { color: g.text }]}>AttendTrack</Text>
            <Text style={[ss.tagline, { color: g.textMuted }]}>
              Smart attendance, one tap at a time
            </Text>
          </Animated.View>

          {/* ── Auth Card ── */}
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={[ss.card, {
              backgroundColor: g.glass,
              borderColor: g.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 16 },
              shadowOpacity: 0.45,
              shadowRadius: 36,
              elevation: 14,
            }]}>
              <View style={ss.cardGlow} />

              <Text style={[ss.cardTitle, { color: g.text }]}>
                {isLogin ? 'Welcome back' : 'Create account'}
              </Text>
              <Text style={[ss.cardSubtitle, { color: g.textMuted }]}>
                {isLogin ? 'Sign in to sync your hours' : 'Join and start tracking time'}
              </Text>

              {/* Error banner */}
              {errorMsg ? (
                <Animated.View style={[
                  ss.errorBanner,
                  { backgroundColor: g.errorBg, borderColor: g.errorBorder },
                  { transform: [{ scale: errorAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }], opacity: errorAnim },
                ]}>
                  <Text style={{ fontSize: 13, color: g.coral, fontWeight: '600', lineHeight: 18 }}>
                    ⚠  {errorMsg}
                  </Text>
                </Animated.View>
              ) : null}

              {/* Email */}
              <View style={ss.inputGroup}>
                <Text style={[ss.label, { color: g.textMuted }]}>Email or username</Text>
                <TextInput
                  style={[ss.input, { backgroundColor: 'rgba(0,0,0,0.32)', borderColor: g.border, color: g.text }]}
                  placeholder="you@company.com"
                  placeholderTextColor={g.textDim}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setErrorMsg(''); }}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>

              {/* Password */}
              <View style={ss.inputGroup}>
                <Text style={[ss.label, { color: g.textMuted }]}>Password</Text>
                <View style={ss.passwordRow}>
                  <TextInput
                    ref={passwordRef}
                    style={[ss.input, ss.passwordInput, { backgroundColor: 'rgba(0,0,0,0.32)', borderColor: g.border, color: g.text }]}
                    placeholder="••••••••"
                    placeholderTextColor={g.textDim}
                    secureTextEntry={!showPassword}
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setErrorMsg(''); }}
                  />
                  <TouchableOpacity
                    style={[ss.eyeBtn, { backgroundColor: 'rgba(0,0,0,0.32)', borderColor: g.border }]}
                    onPress={() => setShowPassword((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 17 }}>{showPassword ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[ss.btnOuter, loading && ss.btnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={grad.button}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={ss.btnGrad}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={ss.btnText}>{isLogin ? 'Sign In' : 'Create Account'}</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>

              {/* Forgot password (only in login mode) */}
              {isLogin && (
                resetSent ? (
                  <Text style={[ss.resetSentNote, { color: g.mint }]}>
                    ✓ Reset link sent — check your inbox.
                  </Text>
                ) : (
                  <TouchableOpacity onPress={handleForgotPassword} style={ss.forgotBtn} activeOpacity={0.7}>
                    <Text style={[ss.forgotText, { color: g.textMuted }]}>
                      Forgot password? <Text style={{ color: g.accent, fontWeight: '700' }}>Send reset link</Text>
                    </Text>
                  </TouchableOpacity>
                )
              )}

              {/* Switch mode */}
              <TouchableOpacity onPress={switchMode} style={ss.switchBtn} activeOpacity={0.7}>
                <Text style={[ss.switchText, { color: g.textMuted }]}>
                  {isLogin ? "Don't have an account? " : 'Already have an account? '}
                  <Text style={[ss.switchLink, { color: g.accent }]}>
                    {isLogin ? 'Sign Up' : 'Sign In'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── Download App banner (web only) ── */}
          {Platform.OS === 'web' && (
            <Animated.View style={[ss.downloadBanner, { opacity: fadeAnim }]}>
              <LinearGradient
                colors={['rgba(62,232,199,0.12)', 'rgba(79,140,255,0.10)']}
                style={[ss.downloadCard, { borderColor: 'rgba(62,232,199,0.35)' }]}
              >
                <View style={ss.downloadRow}>
                  <Text style={{ fontSize: 26, marginRight: 12 }}>📱</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[ss.downloadTitle, { color: g.text }]}>
                      Get the Android App
                    </Text>
                    <Text style={[ss.downloadSub, { color: g.textMuted }]}>
                      Face biometric check-in · works offline
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[ss.downloadBtn, { backgroundColor: g.mint }]}
                    onPress={() => {
                      if (APK_DOWNLOAD_URL.includes('PENDING_BUILD')) {
                        alert('APK build in progress — check back soon!');
                      } else {
                        Linking.openURL(APK_DOWNLOAD_URL);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={ss.downloadBtnText}>⬇ Download</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          {/* Footer */}
          <Animated.View style={[ss.footer, { opacity: fadeAnim }]}>
            <Text style={[ss.footerText, { color: g.textDim }]}>
              Secure · Private · Always in sync
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const ss = StyleSheet.create({
  fill: { flex: 1 },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 56 },

  header: { alignItems: 'center', marginBottom: 36 },
  logoRing: {
    width: 96, height: 96, borderRadius: 48,
    padding: 3.5, justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  logoInner: {
    width: '100%', height: '100%', borderRadius: 45,
    justifyContent: 'center', alignItems: 'center',
  },
  logoEmoji: { fontSize: 40 },
  appName: { fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  card: {
    borderRadius: 28, padding: 28, borderWidth: 1, overflow: 'hidden',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.055)',
    borderRadius: 28, pointerEvents: 'none',
  },
  cardTitle: { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  cardSubtitle: { fontSize: 14, marginBottom: 22, lineHeight: 20 },

  errorBanner: {
    borderRadius: 12, padding: 13, marginBottom: 18, borderWidth: 1,
  },

  inputGroup: { marginBottom: 18 },
  label: {
    fontSize: 11, marginBottom: 8, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.7,
  },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16 },

  passwordRow: { flexDirection: 'row', alignItems: 'stretch' },
  passwordInput: { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  eyeBtn: {
    paddingHorizontal: 16,
    borderWidth: 1, borderLeftWidth: 0,
    borderTopRightRadius: 14, borderBottomRightRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },

  btnOuter: { marginTop: 8, borderRadius: 16, overflow: 'hidden' },
  btnDisabled: { opacity: 0.5 },
  btnGrad: { paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },

  forgotBtn: { marginTop: 16, alignItems: 'center' },
  forgotText: { fontSize: 13 },
  resetSentNote: { marginTop: 16, fontSize: 13, fontWeight: '700', textAlign: 'center' },

  switchBtn: { marginTop: 18, alignItems: 'center' },
  switchText: { fontSize: 14, lineHeight: 20 },
  switchLink: { fontWeight: '800' },

  footer: { marginTop: 16, alignItems: 'center' },
  footerText: { fontSize: 12 },

  downloadBanner: { marginTop: 20 },
  downloadCard: { borderRadius: 18, padding: 16, borderWidth: 1 },
  downloadRow: { flexDirection: 'row', alignItems: 'center' },
  downloadTitle: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  downloadSub: { fontSize: 12, lineHeight: 16 },
  downloadBtn: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, marginLeft: 10,
  },
  downloadBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
