// components/ResponsiveContainer.js
// Constrains content width on desktop browsers so the app doesn't sprawl
// across ultrawide monitors. On mobile, behaves like a normal flex view.
//
// Implements the UI/UX skill's responsive breakpoint guidance:
//   < 768px  : mobile  — full width
//   < 1024px : tablet  — full width
//   ≥ 1024px : desktop — center with max-width

import React from 'react';
import { View, useWindowDimensions } from 'react-native';

const DEFAULT_MAX = 1100;

export default function ResponsiveContainer({ children, maxWidth = DEFAULT_MAX, style }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  if (!isDesktop) return <View style={[{ flex: 1 }, style]}>{children}</View>;

  return (
    <View style={[{ flex: 1, alignItems: 'center' }, style]}>
      <View style={{ flex: 1, width: '100%', maxWidth, paddingHorizontal: 8 }}>
        {children}
      </View>
    </View>
  );
}
