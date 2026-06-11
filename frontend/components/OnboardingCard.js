// components/OnboardingCard.js — First-time setup checklist card

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';

const STEPS = [
  {
    key:     'profile',
    emoji:   '👤',
    title:   'Complete Your Profile',
    desc:    'Add your name, designation & department',
    screen:  'EditProfile',
  },
  {
    key:     'face',
    emoji:   '📷',
    title:   'Register Your Face',
    desc:    'Required for check-in & check-out',
    screen:  'FaceRegistration',
  },
];

export default function OnboardingCard({ steps = {}, navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();

  const incomplete = STEPS.filter((s) => !steps[s.key]);
  if (incomplete.length === 0) return null;

  const done  = STEPS.length - incomplete.length;
  const pct   = Math.round((done / STEPS.length) * 100);

  return (
    <LinearGradient
      colors={['rgba(139,124,255,0.12)', 'rgba(62,232,199,0.06)']}
      style={[ob.card, { borderColor: 'rgba(139,124,255,0.4)' }]}
    >
      {/* Header */}
      <View style={ob.header}>
        <Text style={{ fontSize: 22 }}>🚀</Text>
        <View style={{ flex: 1 }}>
          <Text style={[ob.title, { color: g.text }]}>Get Started</Text>
          <Text style={[ob.sub, { color: g.textMuted }]}>{done}/{STEPS.length} steps complete</Text>
        </View>
        <Text style={[ob.pct, { color: g.accent }]}>{pct}%</Text>
      </View>

      {/* Progress bar */}
      <View style={[ob.barBg, { backgroundColor: g.glass }]}>
        <View style={[ob.barFill, { width: `${pct}%`, backgroundColor: g.accent }]} />
      </View>

      {/* Incomplete steps */}
      {incomplete.map((step, i) => (
        <TouchableOpacity
          key={step.key}
          onPress={() => navigation.navigate(step.screen)}
          style={[ob.stepRow, { borderColor: g.border }, i > 0 && { borderTopWidth: 1 }]}
          activeOpacity={0.75}
        >
          <View style={[ob.stepIcon, { backgroundColor: g.glass }]}>
            <Text style={{ fontSize: 18 }}>{step.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[ob.stepTitle, { color: g.text }]}>{step.title}</Text>
            <Text style={[ob.stepDesc, { color: g.textMuted }]}>{step.desc}</Text>
          </View>
          <Text style={{ color: g.accent, fontSize: 18, fontWeight: '900' }}>›</Text>
        </TouchableOpacity>
      ))}
    </LinearGradient>
  );
}

const ob = StyleSheet.create({
  card:    { borderRadius: 20, padding: 16, borderWidth: 1, marginBottom: 16 },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title:   { fontSize: 15, fontWeight: '900' },
  sub:     { fontSize: 12, marginTop: 1 },
  pct:     { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  barBg:   { height: 5, borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  stepIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 13, fontWeight: '800' },
  stepDesc:  { fontSize: 11, marginTop: 1 },
});
