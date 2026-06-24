import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { color } from '../theme';

/**
 * Full-bleed nocturnal background:
 * radial-gradient(135% 75% at 72% 6%, #1A2536 0%, #0B0D13 54%)
 * Renders behind everything; children layer on top.
 */
export function Background({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="bg" cx="72%" cy="6%" rx="135%" ry="75%">
            <Stop offset="0%" stopColor={color.bgGlowFrom} />
            <Stop offset="54%" stopColor={color.bgGlowTo} />
            <Stop offset="100%" stopColor={color.bgGlowTo} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
});
