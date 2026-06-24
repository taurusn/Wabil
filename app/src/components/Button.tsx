import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { color, font, radius } from '../theme';

type Props = {
  label: string;
  onPress?: () => void;
  icon?: React.ReactNode;
};

export function PrimaryButton({ label, onPress }: Props) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [styles.primaryWrap, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={[color.btnGradA, color.btnGradB]}
        style={styles.primary}
      >
        <View style={styles.topHighlight} />
        <Text style={styles.primaryText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, icon }: Props) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
    >
      {icon}
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primaryWrap: {
    borderRadius: radius.button,
    shadowColor: color.glowBlue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
  },
  primary: {
    borderRadius: radius.button,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  primaryText: { color: color.white, fontFamily: font.medium, fontSize: 15 },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: color.surfaceSoft,
    borderWidth: 1,
    borderColor: color.bubbleMeEdge,
    borderRadius: radius.button,
    paddingVertical: 15,
  },
  ghostText: { color: '#CDD6E8', fontFamily: font.medium, fontSize: 15 },
  pressed: { opacity: 0.82 },
});
