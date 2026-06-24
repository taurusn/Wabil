import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Background } from '../components/Background';
import { Orb } from '../components/Orb';
import {
  Appear,
  AssistantProse,
  AssistantStatement,
  EmailPill,
  InputBar,
  ThinkingDots,
  UserBubble,
} from '../components/chat';
import { color, font, space } from '../theme';
import type { RootStackParamList } from '../types';
import { sanitize, sendChat, type ChatMessage } from '../api';

type Msg =
  | { id: number; kind: 'statement'; text: string; dim?: string }
  | { id: number; kind: 'prose'; text: string }
  | { id: number; kind: 'me'; text: string }
  | { id: number; kind: 'pill'; subject: string }
  | { id: number; kind: 'thinking' };

const SEED: Msg[] = [
  { id: 1, kind: 'statement', text: 'hey.', dim: 'ask me anything about your inbox.' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export function ChatScreen({ navigation }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>(SEED);
  const idRef = useRef(100);
  const scrollRef = useRef<ScrollView>(null);
  // The real conversation sent to the backend (the SEED above is visual-only).
  const history = useRef<ChatMessage[]>([]);

  const scrollEnd = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  const send = async (text: string) => {
    const meId = ++idRef.current;
    const thinkId = ++idRef.current;
    setMsgs((m) => [...m, { id: meId, kind: 'me', text }, { id: thinkId, kind: 'thinking' }]);
    scrollEnd();
    history.current.push({ role: 'user', content: text });
    try {
      const raw = await sendChat(history.current);
      history.current.push({ role: 'assistant', content: raw });
      const clean = sanitize(raw) || '…';
      setMsgs((m) => m.filter((x) => x.id !== thinkId).concat({ id: ++idRef.current, kind: 'prose', text: clean }));
    } catch (e) {
      setMsgs((m) =>
        m.filter((x) => x.id !== thinkId).concat({
          id: ++idRef.current,
          kind: 'prose',
          text: "can't reach the brain right now. is the server running?",
        }),
      );
    }
    scrollEnd();
  };

  return (
    <Background>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Pressable style={styles.head} onPress={() => navigation.navigate('Connections')}>
          <Orb size={13} />
          <Text style={styles.name}>
            wabil<Text style={styles.nameDim}> · listening</Text>
          </Text>
        </Pressable>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.chat}
            onContentSizeChange={scrollEnd}
            showsVerticalScrollIndicator={false}
          >
            {msgs.map((m) => (
              <Appear key={m.id}>
                {m.kind === 'statement' ? (
                  <AssistantStatement text={m.text} dim={m.dim} />
                ) : m.kind === 'prose' ? (
                  <AssistantProse>{m.text}</AssistantProse>
                ) : m.kind === 'me' ? (
                  <UserBubble>{m.text}</UserBubble>
                ) : m.kind === 'pill' ? (
                  <EmailPill subject={m.subject} />
                ) : (
                  <ThinkingDots />
                )}
              </Appear>
            ))}
          </ScrollView>
          <View style={styles.inbar}>
            <InputBar onSend={send} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Background>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 26, paddingTop: 12, paddingBottom: 6 },
  name: { fontFamily: font.medium, fontSize: 14, color: color.textSecondary },
  nameDim: { fontFamily: font.light, color: color.textMuted },
  chat: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 8, gap: space.gapChat },
  inbar: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26 },
});
