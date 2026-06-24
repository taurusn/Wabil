import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { color, font, radius } from '../theme';

// Wrap any message so it fades + rises on mount (280ms).
export function Appear({ children }: { children: React.ReactNode }) {
  return <Animated.View entering={FadeInDown.duration(280).easing(Easing.out(Easing.ease))}>{children}</Animated.View>;
}

export function AssistantStatement({ text, dim }: { text: string; dim?: string }) {
  return (
    <Text style={styles.statement}>
      {text}
      {dim ? <Text style={styles.statementDim}>{'\n' + dim}</Text> : null}
    </Text>
  );
}

export function AssistantProse({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.prose}>
      <Text style={styles.glyph}>⌁</Text>
      <Text style={styles.proseText}>{children}</Text>
    </View>
  );
}

export function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.meRow}>
      <Text style={styles.me}>{children}</Text>
    </View>
  );
}

export function EmailPill({ subject }: { subject: string }) {
  return (
    <View style={styles.pillRow}>
      <Text style={styles.pill}>📩 {subject}</Text>
    </View>
  );
}

export function ThinkingDots() {
  return (
    <View style={styles.thinking}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} />
      ))}
    </View>
  );
}

function Dot({ index }: { index: number }) {
  const t = useSharedValue(0.25);
  useEffect(() => {
    t.value = withDelay(
      index * 160,
      withRepeat(withTiming(0.95, { duration: 500, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [t, index]);
  const s = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: -3 * (t.value - 0.25) }] }));
  return <Animated.View style={[styles.dot, s]} />;
}

export function InputBar({ onSend }: { onSend?: (text: string) => void }) {
  const [val, setVal] = React.useState('');
  const submit = () => {
    const t = val.trim();
    if (!t) return;
    setVal('');
    onSend?.(t);
  };
  return (
    <View style={styles.field}>
      <TextInput
        style={styles.input}
        value={val}
        onChangeText={setVal}
        placeholder="say something…"
        placeholderTextColor={color.textDim}
        onSubmitEditing={submit}
        returnKeyType="send"
      />
      <Pressable onPress={submit} hitSlop={10}>
        <Text style={styles.send}>◍</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  statement: { fontFamily: font.light, fontSize: 21, lineHeight: 30, color: color.textPrimary },
  statementDim: { color: color.textDim },
  prose: { flexDirection: 'row', gap: 10, paddingRight: 24 },
  glyph: { color: color.accentGlow, fontSize: 15, lineHeight: 22 },
  proseText: { flex: 1, fontFamily: font.light, fontSize: 14, lineHeight: 22, color: color.textSecondary },
  meRow: { alignItems: 'flex-end' },
  me: {
    maxWidth: '76%',
    backgroundColor: color.bubbleMe,
    borderWidth: 1,
    borderColor: color.bubbleMeEdge,
    borderTopLeftRadius: radius.bubble,
    borderTopRightRadius: radius.bubble,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: radius.bubble,
    color: color.userText,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    overflow: 'hidden',
  },
  pillRow: { alignItems: 'flex-start' },
  pill: {
    backgroundColor: color.surfaceSoft,
    borderWidth: 1,
    borderColor: color.bubbleMeEdge,
    borderRadius: radius.pill,
    color: color.textPrimary,
    fontFamily: font.regular,
    fontSize: 13,
    paddingVertical: 9,
    paddingHorizontal: 13,
    overflow: 'hidden',
  },
  thinking: { flexDirection: 'row', gap: 6, paddingLeft: 2, paddingVertical: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: color.accentGlow },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: 'rgba(130,160,210,0.16)',
    borderRadius: radius.field,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: color.surfaceSoft,
  },
  input: { flex: 1, fontFamily: font.light, fontSize: 14, color: color.textPrimary, padding: 0 },
  send: { color: color.accentGlow, fontSize: 16 },
});
