import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Background } from '../components/Background';
import { affectToFace, FACE_STATUS, Watcher, type FaceState } from '../components/Watcher';
import { AssistantProse, InputBar, MessageIn, Quoted, SessionDivider, ThinkingDots, UserBubble } from '../components/chat';
import { color, font, space } from '../theme';
import type { RootStackParamList } from '../types';
import {
  beaconInactive,
  getHistory,
  pingPresence,
  sanitize,
  sendChat,
  streamUrl,
  type Affect,
  type ChatMsg,
  type StreamEvent,
} from '../api';

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
  const [connState, setConnState] = useState<'connecting' | 'live' | 'down'>('connecting');
  const sending = useRef(false);
  const queue = useRef<ChatMsg[]>([]); // streamed bubbles waiting to be revealed
  const draining = useRef(false);
  const animSeen = useRef<Set<string>>(new Set()); // ids that have already animated in

  // ---- the face. One state machine, resolved by priority from live signals:
  // error > wake > alert > reveal(affect) > affect hold > thinking > listening > sleepy/idle
  const [face, setFace] = useState<FaceState>('wake');
  const faceCtl = useRef({
    working: false,
    revealUntil: 0,
    affect: 'neutral' as Affect,
    affectUntil: 0,
    alertUntil: 0,
    wakeUntil: Date.now() + 1500,
  });
  const inputFocusedRef = useRef(false);
  const [inputFocused, setInputFocused] = useState(false);
  const lastSendTs = useRef(0);
  const faceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connRef = useRef<'connecting' | 'live' | 'down'>('connecting');

  const recomputeFace = useCallback(() => {
    const c = faceCtl.current;
    const now = Date.now();
    let f: FaceState;
    if (connRef.current === 'down') f = 'error';
    else if (now < c.wakeUntil) f = 'wake';
    else if (now < c.alertUntil) f = 'alert';
    else if (now < c.revealUntil) f = affectToFace(c.affect);
    else if (now < c.affectUntil && c.affect !== 'neutral') f = affectToFace(c.affect);
    else if (c.working) f = 'thinking';
    else if (inputFocusedRef.current) f = 'listening';
    else {
      const h = new Date().getHours();
      f = h >= 23 || h < 5 ? 'sleepy' : 'idle';
    }
    setFace(f);
    // wake ourselves exactly when the nearest timed window expires
    const next = [c.wakeUntil, c.alertUntil, c.revealUntil, c.affectUntil].filter((x) => x > now);
    if (faceTimer.current) clearTimeout(faceTimer.current);
    if (next.length) faceTimer.current = setTimeout(recomputeFace, Math.min(...next) - now + 30);
  }, []);

  // boot: play wake once; keep the sleepy window fresh with a slow tick
  useEffect(() => {
    recomputeFace();
    const iv = setInterval(recomputeFace, 60000);
    return () => {
      clearInterval(iv);
      if (faceTimer.current) clearTimeout(faceTimer.current);
    };
  }, [recomputeFace]);

  // conn transitions: down → error face; recovery → wake again
  useEffect(() => {
    const prev = connRef.current;
    connRef.current = connState;
    if (prev === 'down' && connState === 'live') faceCtl.current.wakeUntil = Date.now() + 1400;
    recomputeFace();
  }, [connState, recomputeFace]);

  // hero band collapses while the keyboard is up: the face yields to the conversation
  const heroH = useSharedValue(104);
  useEffect(() => {
    heroH.value = withTiming(inputFocused ? 0 : 104, { duration: 260 });
  }, [inputFocused, heroH]);
  const heroStyle = useAnimatedStyle(() => ({ height: heroH.value, opacity: heroH.value / 104 }));

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
    const c = faceCtl.current;
    while (queue.current.length) {
      const next = queue.current[0];
      const delay = Math.min(900, 360 + next.content.length * 6);
      // the face performs this bubble's flavor while it lands
      c.affect = next.affect ?? 'neutral';
      c.revealUntil = Date.now() + delay + 700;
      recomputeFace();
      setThinking(true); // dots = a message is landing right now (not "busy")
      await sleep(delay);
      setThinking(false);
      queue.current.shift();
      addMsg({ ...next, content: sanitize(next.content) });
      if (queue.current.length) await sleep(220); // a beat between texts
    }
    // hold a non-neutral affect for a beat after the last bubble, then settle
    if (c.affect !== 'neutral') c.affectUntil = Date.now() + 2200;
    c.revealUntil = 0;
    recomputeFace();
    draining.current = false;
  }, [addMsg, recomputeFace]);

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
      if (e.type === 'working') {
        // the worker is digging: the face narrows its eyes until it reports back
        faceCtl.current.working = e.on;
        recomputeFace();
      }
      if (e.type === 'bubble') {
        // a bubble with no recent user message = a proactive poke: perk first
        if (Date.now() - lastSendTs.current > 90000 && queue.current.length === 0 && !draining.current) {
          faceCtl.current.alertUntil = Date.now() + 1100;
          recomputeFace();
        }
        queue.current.push(e.message);
        drain();
      }
    };
    es.onopen = () => {
      setConnState('live');
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
    // EventSource auto-reconnects; onerror fires on drop, onopen again on recovery.
    es.onerror = () => setConnState('down');
    return () => es.close();
  }, [drain]);

  // Presence heartbeat: while the app is on-screen, tell the server every few
  // seconds; the moment it backgrounds, fire an immediate "gone" beacon. The
  // server pushes replies only when we're absent.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const beat = () => {
      if (document.visibilityState === 'visible') pingPresence(true);
    };
    beat();
    // Beat every 5s against the server's 15s presence window, so a single missed
    // or throttled beat (iOS Safari throttles timers) still can't slip us past
    // the window and trigger a push while the screen is right here. Also re-ping
    // on focus so returning to the tab marks us present immediately.
    const iv = setInterval(beat, 5000);
    const onVis = () => (document.visibilityState === 'visible' ? pingPresence(true) : beaconInactive());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', beat);
    window.addEventListener('pagehide', beaconInactive);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', beat);
      window.removeEventListener('pagehide', beaconInactive);
      beaconInactive();
    };
  }, []);

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
    lastSendTs.current = Date.now(); // replies to this are answers, not pokes
    pingPresence(true); // mark present now so the reply streams here, not a push
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
          <Watcher size={22} state={face} />
          <Text style={styles.name}>
            wabil
            <Text style={styles.nameDim}>
              {' · '}
              {connState === 'connecting' ? 'connecting…' : FACE_STATUS[face]}
            </Text>
          </Text>
        </Pressable>

        <Animated.View style={[styles.heroBand, heroStyle]}>
          <Watcher size={92} state={face} />
        </Animated.View>

        {!ready ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={color.textMuted} />
          </View>
        ) : msgs.length === 0 ? (
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
          <InputBar
            onSend={send}
            onFocus={() => {
              inputFocusedRef.current = true;
              setInputFocused(true);
              recomputeFace();
            }}
            onBlur={() => {
              inputFocusedRef.current = false;
              setInputFocused(false);
              recomputeFace();
            }}
          />
        </View>
      </SafeAreaView>
    </Background>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 26, paddingTop: 12, paddingBottom: 6 },
  heroBand: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { fontFamily: font.medium, fontSize: 14, color: color.textSecondary },
  nameDim: { fontFamily: font.light, color: color.textMuted },
  list: { paddingHorizontal: 22, paddingVertical: 12, gap: space.gapChat },
  more: { marginVertical: 14 },
  thinkRow: { paddingVertical: 2 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, paddingHorizontal: 22, paddingTop: 24 },
  empty: { fontFamily: font.light, fontSize: 21, lineHeight: 30, color: color.textPrimary },
  emptyDim: { color: color.textDim },
  composer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 26 },
});
