import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Platform } from 'react-native';

export default function Toast({ message, type = 'success', visible, onHide }) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || !message) return;
    translateY.setValue(-100);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -100, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => onHide && onHide());
    }, 2800);
    return () => clearTimeout(timer);
  }, [visible, message]);

  if (!visible) return null;

  const bg = type === 'success' ? '#1db98a' : type === 'error' ? '#e5534b' : '#4a90e2';
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

  return (
    <Animated.View style={[styles.toast, { backgroundColor: bg, opacity, transform: [{ translateY }] }]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    right: 16,
    zIndex: 9999,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  icon: { color: '#fff', fontSize: 16, fontWeight: '900', marginRight: 10 },
  text: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
});
