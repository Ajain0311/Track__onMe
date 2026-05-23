// components/ToastProvider.js
// Global toast notifications via React Context.
// Wrap the app once; call useToast() anywhere.
//
// Usage:
//   <ToastProvider><App/></ToastProvider>
//   const toast = useToast();
//   toast.success('Saved!'); toast.error('Oops'); toast.info('FYI');

import React, { createContext, useCallback, useContext, useRef, useState, useEffect } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

const ToastContext = createContext(null);

let nextId = 1;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => setToasts((arr) => arr.filter((t) => t.id !== id)), []);

  const show = useCallback((message, type = 'info', duration = 2800) => {
    const id = nextId++;
    setToasts((arr) => [...arr, { id, message, type }]);
    setTimeout(() => remove(id), duration);
    return id;
  }, [remove]);

  const value = {
    show,
    success: (m, d) => show(m, 'success', d),
    error:   (m, d) => show(m, 'error',   d ?? 4000),
    info:    (m, d) => show(m, 'info',    d),
    warn:    (m, d) => show(m, 'warn',    d),
    dismiss: remove,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="none" style={styles.layer}>
        {toasts.map((t, i) => (
          <ToastView key={t.id} index={i} toast={t} />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

// ─── Internal animated toast view ────────────────────────────────────────────

const ToastView = ({ toast, index }) => {
  const ty = useRef(new Animated.Value(-80)).current;
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(ty, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const palette = {
    success: { bg: '#1db98a', icon: '✓' },
    error:   { bg: '#e5534b', icon: '✕' },
    warn:    { bg: '#ffa726', icon: '!' },
    info:    { bg: '#4a90e2', icon: 'ℹ' },
  }[toast.type] || { bg: '#4a90e2', icon: 'ℹ' };

  return (
    <Animated.View style={[styles.toast, {
      backgroundColor: palette.bg,
      opacity: op,
      transform: [{ translateY: ty }],
      top: (Platform.OS === 'ios' ? 60 : 40) + index * 70,
    }]}>
      <Text style={styles.icon}>{palette.icon}</Text>
      <Text style={styles.text} numberOfLines={3}>{toast.message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: 'none' },
  toast: {
    position: 'absolute', left: 16, right: 16,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  icon: { color: '#fff', fontSize: 16, fontWeight: '900', marginRight: 10 },
  text: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
});

export default ToastProvider;
