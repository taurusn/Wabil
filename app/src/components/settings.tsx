import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { color, font, radius } from '../theme';

export function SectionLabel({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={[styles.section, muted && styles.sectionMuted]}>{children}</Text>;
}

export function Card({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return <View style={[styles.card, dim && styles.cardDim]}>{children}</View>;
}

export function StatusDot({ label }: { label: string }) {
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusDot} />
      <Text style={styles.statusLabel}>{label}</Text>
    </View>
  );
}

export function Toggle({ value, disabled, onChange }: { value: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  const toggle = () => {
    if (disabled) return;
    Haptics.selectionAsync();
    onChange?.(!value);
  };
  const Knob = <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />;
  return (
    <Pressable onPress={toggle} disabled={disabled} hitSlop={8}>
      {value ? (
        <LinearGradient colors={[color.btnGradA, color.btnGradB]} style={[styles.track, styles.trackOn]}>
          {Knob}
        </LinearGradient>
      ) : (
        <View style={[styles.track, styles.trackOff]}>{Knob}</View>
      )}
    </Pressable>
  );
}

export function AddRow({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]}>
      <Text style={styles.addText}>＋ {label}</Text>
    </Pressable>
  );
}

export function AccountChip({ letter }: { letter: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: color.textMuted,
    marginTop: 14,
    marginBottom: 4,
    marginHorizontal: 4,
  },
  sectionMuted: { color: '#4A5468' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderColor: 'rgba(140,170,220,0.14)',
    borderRadius: radius.card,
    padding: 14,
    backgroundColor: 'rgba(120,150,200,0.04)',
  },
  cardDim: { opacity: 0.55 },
  statusRow: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: color.success,
    shadowColor: color.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  statusLabel: { fontSize: 12, color: color.success, fontFamily: font.regular },
  track: { width: 42, height: 25, borderRadius: 13, justifyContent: 'center' },
  trackOn: { shadowColor: color.glowBlue, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 12 },
  trackOff: { backgroundColor: 'rgba(120,150,200,0.14)' },
  knob: { width: 19, height: 19, borderRadius: 10, position: 'absolute', top: 3 },
  knobOn: { left: 20, backgroundColor: color.white },
  knobOff: { left: 3, backgroundColor: '#8492AC' },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(127,176,255,0.3)',
    borderStyle: 'dashed',
    borderRadius: radius.card,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  addText: { color: '#7FB0FF', fontFamily: font.regular, fontSize: 14 },
  chip: { width: 30, height: 30, borderRadius: 8, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  chipText: { color: '#EA4335', fontFamily: font.semibold, fontSize: 15 },
});
