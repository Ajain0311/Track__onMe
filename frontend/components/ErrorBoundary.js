// components/ErrorBoundary.js — top-level crash safety net
//
// Catches synchronous render errors anywhere below it in the tree. Async
// rejections still need their own try/catch (or a per-screen handler).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';

export default class ErrorBoundary extends React.Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null, info: null });

  reload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
    else this.reset();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={s.fill}>
        <ScrollView contentContainerStyle={s.inner}>
          <Text style={s.icon}>💥</Text>
          <Text style={s.title}>Something went wrong</Text>
          <Text style={s.msg}>
            The app encountered an unexpected error. Reloading often fixes it. If the problem persists, please tell us what you were doing.
          </Text>
          <View style={s.actions}>
            <TouchableOpacity onPress={this.reload} style={[s.btn, s.btnPrimary]}>
              <Text style={s.btnPrimaryText}>Reload</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={this.reset} style={s.btn}>
              <Text style={s.btnText}>Try again</Text>
            </TouchableOpacity>
          </View>
          {this.state.error?.message ? (
            <View style={s.errBox}>
              <Text style={s.errText} numberOfLines={6}>{String(this.state.error.message)}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#06060f' },
  inner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  icon: { fontSize: 56, marginBottom: 18 },
  title: { color: '#f2f2f8', fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  msg:   { color: '#9c9caf', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 380 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn:    { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 12, borderWidth: 1, borderColor: '#2c2c44' },
  btnText:{ color: '#cfcfdc', fontSize: 14, fontWeight: '700' },
  btnPrimary: { backgroundColor: '#8b7cff', borderColor: '#8b7cff' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  errBox: { marginTop: 28, padding: 14, borderRadius: 10, backgroundColor: 'rgba(229,83,75,0.12)', borderColor: 'rgba(229,83,75,0.4)', borderWidth: 1, maxWidth: 480 },
  errText: { color: '#ffb4c0', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
