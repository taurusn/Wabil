import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { color, font, radius } from '../theme';

// Spring a newly-arrived bubble in exactly like iMessage: the bubble INFLATES
// from its bottom corner (by the tail) with a lightly-bouncy spring. Matches the
// reference spring (stiffness 200, mass 0.2, damping 20). Only the FIRST
// appearance animates (tracked in `seen`), so history + scroll never re-animate.
export function MessageIn({
  id,
  seen,
  align = 'left',
  children,
}: {
  id: string;
  seen: Set<string>;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const p = useSharedValue(seen.has(id) ? 1 : 0);
  useEffect(() => {
    if (!seen.has(id)) {
      seen.add(id);
      p.value = withSpring(1, { stiffness: 200, mass: 0.2, damping: 20 });
    }
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 2.2),
    transform: [{ scale: 0.6 + 0.4 * p.value }],
  }));
  // Anchor the inflate at the bottom corner where the tail is.
  const origin = align === 'right' ? 'bottom right' : 'bottom left';
  return <Animated.View style={[{ transformOrigin: origin }, style]}>{children}</Animated.View>;
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

// iMessage-style typing indicator: a left-aligned pill that pops in, with three
// dots doing a staggered wave.
export function ThinkingDots() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(1, { stiffness: 200, mass: 0.2, damping: 20 });
  }, []);
  const pop = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 2.2),
    transform: [{ scale: 0.6 + 0.4 * p.value }],
  }));
  return (
    <Animated.View style={[styles.typing, { transformOrigin: 'bottom left' }, pop]}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} />
      ))}
    </Animated.View>
  );
}

function Dot({ index }: { index: number }) {
  const t = useSharedValue(0.35);
  useEffect(() => {
    t.value = withDelay(
      index * 160,
      withRepeat(withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [t, index]);
  const s = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.7 + 0.4 * t.value }] }));
  return <Animated.View style={[styles.dot, s]} />;
}

export function InputBar({
  onSend,
  onFocus,
  onBlur,
}: {
  onSend?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [val, setVal] = React.useState('');
  const active = val.trim().length > 0;
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
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType="send"
      />
      <Pressable onPress={submit} hitSlop={10} disabled={!active} style={({ pressed }) => pressed && { opacity: 0.85 }}>
        {active ? (
          <LinearGradient colors={[color.btnGradA, color.btnGradB]} style={styles.sendBtn}>
            <Text style={styles.sendIcon}>↑</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.sendBtn, styles.sendBtnIdle]}>
            <Text style={[styles.sendIcon, styles.sendIconIdle]}>↑</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// A calm time separator between sessions (a >5h gap = a fresh conversation).
export function SessionDivider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <Text style={styles.dividerLabel}>{label}</Text>
    </View>
  );
}

// A quoted reference to another message — shown above a reply, and in the
// composer while you're replying (with a cancel ✕).
export function Quoted({
  who,
  text,
  align = 'left',
  onPress,
  onCancel,
}: {
  who: string;
  text: string;
  align?: 'left' | 'right';
  onPress?: () => void;
  onCancel?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.quoted, align === 'right' && styles.quotedRight]}>
      <View style={styles.quotedBar} />
      <View style={styles.quotedBody}>
        <Text style={styles.quotedWho}>{who}</Text>
        <Text style={styles.quotedText} numberOfLines={1}>
          {text}
        </Text>
      </View>
      {onCancel ? (
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={styles.quotedX}>✕</Text>
        </Pressable>
      ) : null}
    </Pressable>
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
  typing: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.surfaceSoft,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.textSecondary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(130,160,210,0.16)',
    borderRadius: radius.field,
    paddingVertical: 7,
    paddingLeft: 18,
    paddingRight: 7,
    backgroundColor: color.surfaceSoft,
  },
  // 16px (not less) so iOS Safari doesn't auto-zoom the page when the field is focused.
  input: { flex: 1, fontFamily: font.light, fontSize: 16, color: color.textPrimary, padding: 0 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.glowBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  sendBtnIdle: { backgroundColor: 'rgba(120,150,200,0.14)', shadowOpacity: 0 },
  sendIcon: { color: color.white, fontSize: 17, fontFamily: font.semibold, lineHeight: 20 },
  sendIconIdle: { color: color.textMuted },
  divider: { alignItems: 'center', paddingVertical: 10 },
  dividerLabel: { fontFamily: font.light, fontSize: 11.5, letterSpacing: 0.4, color: color.textMuted },
  quoted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    alignSelf: 'flex-start',
    maxWidth: '82%',
    backgroundColor: color.surfaceSoft,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  quotedRight: { alignSelf: 'flex-end' },
  quotedBar: { width: 2.5, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color.accentGlow, opacity: 0.7 },
  quotedBody: { flex: 1 },
  quotedWho: { fontFamily: font.medium, fontSize: 11, color: color.accentGlow, marginBottom: 1 },
  quotedText: { fontFamily: font.light, fontSize: 12.5, color: color.textDim },
  quotedX: { color: color.textMuted, fontSize: 13, paddingHorizontal: 2 },
});
