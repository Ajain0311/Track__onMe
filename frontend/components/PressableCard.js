// components/PressableCard.js
// Touchable wrapper with web-aware focus/hover states.
// Following the UI/UX skill's interactive feedback guidance:
//   - cursor: pointer on web
//   - 150-300ms transition
//   - visible focus state for keyboard nav (accessibility)

import React, { useState } from 'react';
import { Pressable, Platform, View } from 'react-native';

const SCALE_PRESSED = 0.98;
const SCALE_HOVER = 1.005;

export default function PressableCard({
  onPress,
  children,
  style,
  hoverStyle,
  disabled,
  accessibilityLabel,
  accessibilityRole = 'button',
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const webProps = Platform.OS === 'web' ? {
    onHoverIn:  () => setHovered(true),
    onHoverOut: () => setHovered(false),
    onFocus:    () => setFocused(true),
    onBlur:     () => setFocused(false),
  } : {};

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessible
      {...webProps}
      style={({ pressed }) => [
        Platform.OS === 'web' && { cursor: disabled ? 'not-allowed' : 'pointer', transition: 'transform 180ms, box-shadow 180ms, border-color 180ms' },
        { transform: [{ scale: pressed ? SCALE_PRESSED : hovered ? SCALE_HOVER : 1 }] },
        focused && Platform.OS === 'web' && { outlineWidth: 2, outlineStyle: 'solid', outlineColor: '#8b7cff', outlineOffset: 2 },
        style,
        hovered && hoverStyle,
      ]}
    >
      {children}
    </Pressable>
  );
}
