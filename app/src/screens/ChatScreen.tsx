import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Background } from '../components/Background';
import { Orb } from '../components/Orb';
import { AssistantProse, InputBar, MessageIn, Quoted, SessionDivider, ThinkingDots, UserBubble } from '../components/chat';
import { color, font, space } from '../theme';
import type { RootStackParamList } from '../types';
import { getHistory, sanitize, sendChat, streamUrl, type ChatMsg, type StreamEvent } from '../api';

const PAGE = 40;
const GAP_MS = 5 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
type Row = ChatMsg | { id: string; role: 'thinking' };

// iMessage-style separator label for a session boundary.
function dividerLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `yesterday · ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`;
}

export function ChatScreen({ navigation }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]); // oldest → newest
  const [thinking, setThinking] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);
  const [ready, setReady] = useState(false);
  const sending = useRef(false);
  const queue = useRef<ChatMsg[]>([]); // streamed bubbles waiting to be revealed
  const draining = useRef(false);
  const animSeen = useRef<Set<string>>(new Set()); // ids that have already animated in

  const clean = (list: ChatMsg[]) => list.map((m) => ({ ...m, content: sanitize(m.content) }));
  // History + paginated messages should appear instantly; only live-streamed
  // bubbles spring in. Mark loaded ids as already-seen.
  const markSeen = (list: ChatMsg[]) => list.forEach((m) => animSeen.current.add(m.id));

  // Add a message, deduped by id, kept in ts order.
  const addMsg = useCallback((m: ChatMsg) => {
    setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m].sort((a, b) => a.ts - b.ts)));
  }, []);

  // Reveal streamed bubbles one at a time with a short typing delay, so a
  // multi-bubble answer arrives like someone firing off several texts.
  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    while (queue.current.length) {
      const next = queue.current[0];
      setThinking(true); // dots = a message is landing right now (not "busy")
      await sleep(Math.min(900, 360 + next.content.length * 6));
      setThinking(false);
      queue.current.shift();
      addMsg({ ...next, content: sanitize(next.content) });
      if (queue.current.length) await sleep(220); // a beat between texts
    }
    draining.current = false;
  }, [addMsg]);

  // Initial history.
  useEffect(() => {
    getHistory()
      .then((h) => {
        markSeen(h);
        setMsgs(clean(h));
        if (h.length < PAGE) setReachedStart(true);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Live assistant stream (SSE). Web-only (the shipped app is the web build).
  useEffect(() => {
    const ES = (globalThis as any).EventSource;
    if (!ES) return;
    const es = new ES(streamUrl());
    let first = true;
    es.onmessage = (ev: any) => {
      let e: StreamEvent;
      try {
        e = JSON.parse(ev.data);
      } catch {
        return;
      }
      // 'typing' is ignored on purpose: dots are a per-bubble reveal, driven
      // locally when a real bubble arrives — never a backend-busy spinner.
      if (e.type === 'bubble') {
        queue.current.push(e.message);
        drain();
      }
    };
    es.onopen = () => {
      // On reconnect, catch up on anything missed while disconnected.
      if (first) {
        first = false;
        return;
      }
      getHistory()
        .then((h) => {
          markSeen(h);
          setMsgs((cur) => {
            const have = new Set(cur.map((m) => m.id));
            const merged = [...cur, ...clean(h).filter((m) => !have.has(m.id))];
            return merged.sort((a, b) => a.ts - b.ts);
          });
          if (queue.current.length === 0) setThinking(false);
        })
        .catch(() => {});
    };
    return () => es.close();
  }, [drain]);

  const findById = useCallback((id?: string | null) => (id ? msgs.find((m) => m.id === id) : undefined), [msgs]);

  const loadOlder = useCallback(async () => {
    if (loadingMore || reachedStart || msgs.length === 0) return;
    setLoadingMore(true);
    try {
      const older = clean(await getHistory(msgs[0].ts, PAGE));
      markSeen(older);
      setMsgs((cur) => {
        const have = new Set(cur.map((m) => m.id));
        const fresh = older.filter((m) => !have.has(m.id));
        if (fresh.length < PAGE) setReachedStart(true);
        return fresh.length ? [...fresh, ...cur] : cur;
      });
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, reachedStart, msgs]);

  // Fire-and-forget: ACK updates the optimistic user bubble; replies stream in.
  const send = async (text: string) => {
    if (sending.current) return;
    sending.current = true;
    const rTo = replyTo;
    setReplyTo(null);
    const tempId = `tmp-${Date.now()}`;
    const optimistic: ChatMsg = {
      id: tempId,
      role: 'user',
      content: text,
      ts: Date.now(),
      sessionId: msgs.length ? msgs[msgs.length - 1].sessionId : 'pending',
      replyToId: rTo?.id ?? null,
    };
    setMsgs((m) => [...m, optimistic]);
    // No dots on send: the dots only flash right before a real bubble lands.
    try {
      const ack = await sendChat(text, rTo?.id);
      animSeen.current.add(ack.id); // the temp bubble already popped; don't re-animate on the id swap
      setMsgs((m) => m.map((x) => (x.id === tempId ? { ...x, id: ack.id, ts: ack.ts, sessionId: ack.sessionId } : x)));
    } catch {
      setThinking(false);
      setMsgs((m) =>
        m.concat({
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: "can't reach the brain right now. is the server running?",
          ts: Date.now(),
          sessionId: optimistic.sessionId,
          replyToId: null,
        }),
      );
    } finally {
      sending.current = false;
    }
  };

  // newest-first for the inverted list; thinking row pinned at the bottom.
  const data: Row[] = useMemo(() => {
    const rows: Row[] = [...msgs].reverse();
    return thinking ? [{ id: 'thinking', role: 'thinking' }, ...rows] : rows;
  }, [msgs, thinking]);

  const renderItem = ({ item, index }: { item: Row; index: number }) => {
    if ((item as any).role === 'thinking') {
      return (
        <View style={styles.thinkRow}>
          <ThinkingDots />
        </View>
      );
    }
    const m = item as ChatMsg;
    const olderRow = data[index + 1];
    const older = olderRow && (olderRow as any).role !== 'thinking' ? (olderRow as ChatMsg) : undefined;
    const newSession = !!older && (older.sessionId !== m.sessionId || m.ts - older.ts > GAP_MS);
    const repliedTo = findById(m.replyToId);
    const quote = repliedTo ? (
      <Quoted align={m.role === 'user' ? 'right' : 'left'} who={repliedTo.role === 'user' ? 'you' : 'wabil'} text={repliedTo.content} />
    ) : null;

    return (
      <View>
        {newSession ? <SessionDivider label={dividerLabel(m.ts)} /> : null}
        <Pressable onLongPress={() => setReplyTo(m)} delayLongPress={300}>
          {m.role === 'user' ? (
            <MessageIn id={m.id} seen={animSeen.current} align="right">
              {quote}
              <UserBubble>{m.content}</UserBubble>
            </MessageIn>
          ) : (
            <MessageIn id={m.id} seen={animSeen.current}>
              {quote}
              <AssistantProse>{m.content}</AssistantProse>
            </MessageIn>
          )}
        </Pressable>
      </View>
    );
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

        {ready && msgs.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>
              hey.<Text style={styles.emptyDim}>{'\n'}ask me anything about your inbox.</Text>
            </Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={data}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={color.textMuted} style={styles.more} /> : null}
          />
        )}

        <View style={styles.composer}>
          {replyTo ? (
            <Quoted who={replyTo.role === 'user' ? 'you' : 'wabil'} text={replyTo.content} onCancel={() => setReplyTo(null)} />
          ) : null}
          <InputBar onSend={send} />
        </View>
      </SafeAreaView>
    </Background>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 26, paddingTop: 12, paddingBottom: 6 },
  name: { fontFamily: font.medium, fontSize: 14, color: color.textSecondary },
  nameDim: { fontFamily: font.light, color: color.textMuted },
  list: { paddingHorizontal: 22, paddingVertical: 12, gap: space.gapChat },
  more: { marginVertical: 14 },
  thinkRow: { paddingVertical: 2 },
  emptyWrap: { flex: 1, paddingHorizontal: 22, paddingTop: 24 },
  empty: { fontFamily: font.light, fontSize: 21, lineHeight: 30, color: color.textPrimary },
  emptyDim: { color: color.textDim },
  composer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 26 },
});
