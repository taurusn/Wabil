import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * The watcher — wabil's face. Two eyes of light in the dark, no body.
 * Ported from face-lab round 3; one component, any size (hero band, header dot).
 *
 * All motion runs in one rAF loop writing shared values (the shipped app is the
 * web build, where this is exactly how the lab ran). The glow is a blurred
 * layer animated by opacity/scale — never per-frame shadow strings.
 */

export type FaceState =
  | 'wake'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'talking'
  | 'roast'
  | 'happy'
  | 'laughing'
  | 'alert'
  | 'sleepy'
  | 'error';

export type Affect = 'neutral' | 'roast' | 'warm' | 'laugh';

export const affectToFace = (a: Affect | undefined): FaceState =>
  a === 'roast' ? 'roast' : a === 'laugh' ? 'laughing' : a === 'warm' ? 'happy' : 'talking';

/** Header status line per face state. */
export const FACE_STATUS: Record<FaceState, string> = {
  wake: 'waking up',
  idle: 'listening',
  listening: 'listening',
  thinking: 'digging…',
  talking: 'typing…',
  roast: 'typing…',
  happy: 'typing…',
  laughing: 'laughing',
  alert: 'one new thing',
  sleepy: 'up late',
  error: 'reconnecting…',
};

// State targets in the 168px design space (same numbers as the approved lab).
type T = { h: number; w: number; rL: number; rR: number; dx: number; dy: number; br: number; glow: number; hL: number | null; happy: number; err: number; laugh: number };
const D: T = { h: 1, w: 1, rL: 0, rR: 0, dx: 0, dy: 0, br: 1, glow: 0.3, hL: null, happy: 0, err: 0, laugh: 0 };
const ST: Record<FaceState, T> = {
  wake: { ...D, br: 1.05, glow: 0.4 },
  idle: { ...D },
  listening: { ...D, h: 1.08, w: 1.02, dy: 5, br: 1.08, glow: 0.36 },
  thinking: { ...D, h: 0.32, dy: 2, br: 0.95, glow: 0.34 },
  talking: { ...D, h: 0.92, br: 1.05, glow: 0.44 },
  roast: { ...D, h: 0.95, hL: 0.48, rL: -9, dx: 11, dy: 1, br: 0.95, glow: 0.3 },
  happy: { ...D, h: 0.52, dy: -3, br: 1.18, glow: 0.52, happy: 1 },
  laughing: { ...D, h: 0.52, dy: -2, br: 1.2, glow: 0.55, happy: 1, laugh: 1 },
  alert: { ...D, h: 1.22, w: 1.08, dy: -2, br: 1.4, glow: 0.85 },
  sleepy: { ...D, h: 0.3, rL: -22, rR: 22, dy: 7, br: 0.6, glow: 0.12 },
  error: { ...D, h: 0.85, rL: -4, rR: 3, dy: 2, br: 0.55, glow: 0.15, err: 1 },
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// Design-space constants (168px reference frame, like the lab).
const EYE_W = 30;
const EYE_H = 46;
const EYE_GAP = 34;

type EyeSV = {
  tx: ReturnType<typeof useSharedValue<number>>;
  ty: ReturnType<typeof useSharedValue<number>>;
  rot: ReturnType<typeof useSharedValue<number>>;
  sx: ReturnType<typeof useSharedValue<number>>;
  sy: ReturnType<typeof useSharedValue<number>>;
  clip: ReturnType<typeof useSharedValue<number>>; // 0..1 fraction of height kept
  over: ReturnType<typeof useSharedValue<number>>; // bright overlay opacity
  dim: ReturnType<typeof useSharedValue<number>>; // whole-eye opacity
};

function Eye({ k, sv }: { k: number; sv: EyeSV }) {
  const outer = useAnimatedStyle(() => ({
    opacity: sv.dim.value,
    transform: [
      { translateX: sv.tx.value },
      { translateY: sv.ty.value },
      { rotate: `${sv.rot.value}deg` },
      { scaleX: sv.sx.value },
      { scaleY: sv.sy.value },
    ],
  }));
  const clip = useAnimatedStyle(() => ({ height: EYE_H * k * sv.clip.value }));
  const over = useAnimatedStyle(() => ({ opacity: sv.over.value }));
  return (
    <Animated.View
      style={[
        {
          width: EYE_W * k,
          height: EYE_H * k,
          justifyContent: 'flex-start',
          shadowColor: '#6BA8FF',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 14 * k,
        },
        outer,
      ]}
    >
      <Animated.View style={[{ width: EYE_W * k, overflow: 'hidden', borderRadius: 15 * k }, clip]}>
        <LinearGradient
          colors={['#E4F3FF', '#A6D2FF', '#5E9BE8']}
          locations={[0, 0.42, 1]}
          start={{ x: 0.35, y: 0 }}
          end={{ x: 0.65, y: 1 }}
          style={{ width: EYE_W * k, height: EYE_H * k, borderRadius: 15 * k }}
        />
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderRadius: 15 * k },
            over,
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

export function Watcher({ size = 92, state }: { size?: number; state: FaceState }) {
  const k = size / 168;

  const mk = (): EyeSV => ({
    // eslint-disable-next-line react-hooks/rules-of-hooks
    tx: useSharedValue(0), ty: useSharedValue(0), rot: useSharedValue(0),
    sx: useSharedValue(1), sy: useSharedValue(1), clip: useSharedValue(1),
    over: useSharedValue(0), dim: useSharedValue(1),
  });
  const L = mk();
  const R = mk();
  const haloOp = useSharedValue(0.3);
  const haloScale = useSharedValue(1);

  const stateRef = useRef(state);
  const stateAtRef = useRef(performance.now());
  if (stateRef.current !== state) {
    stateRef.current = state;
    stateAtRef.current = performance.now();
  }

  useEffect(() => {
    // one driver loop per mounted face; all mutable sim state lives here
    const s: Record<string, number> = {};
    const smooth = (key: string, target: number, dt: number, rate: number) => {
      const cur = s[key] ?? target;
      s[key] = cur + (target - cur) * (1 - Math.exp(-rate * dt));
      return s[key];
    };
    const blink = { start: -1e9, next: performance.now() + rand(1800, 4500) };
    const sac = { at: 0, target: 0, x: 0 };
    const talk = { at: 0, target: 0, amp: 0 };
    const wander = { at: 0, tx: 0, ty: 0, x: 0, y: 0 };
    const phase = rand(0, 3);

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const state = stateRef.current;
      const stateAt = stateAtRef.current;
      const st = ST[state];

      // blink
      const sleepy = state === 'sleepy';
      if (now >= blink.next) {
        blink.start = now;
        blink.next = now + (sleepy ? rand(2000, 3800) : rand(3200, 7000));
      }
      const bdur = sleepy ? 680 : 250;
      const bp = (now - blink.start) / bdur;
      let b = bp < 0 || bp > 1 ? 0 : bp < 0.4 ? bp / 0.4 : 1 - (bp - 0.4) / 0.6;
      if (state === 'roast') {
        const rt = now - stateAt; // the disdain blink
        if (rt > 500 && rt < 1150) b = Math.max(b, Math.sin((Math.PI * (rt - 500)) / 650) * 0.92);
      }

      // wake overshoot
      let wakeF = 1;
      if (state === 'wake') {
        const wt = (now - stateAt) / 1000;
        wakeF = clamp(1 - Math.exp(-wt * 5.5) * Math.cos(wt * 9), 0.04, 1.18);
      }

      // sleepy nod-off
      let nod = 0;
      if (sleepy) {
        const n = Math.sin(t * 0.55);
        nod = Math.max(0, n * n * n) * 6;
      }

      // idle wander (the phone has no cursor; this is where the life comes from)
      if (state === 'idle' && now > wander.at) {
        wander.tx = rand(-7, 7);
        wander.ty = rand(-3, 4);
        wander.at = now + rand(2500, 5000);
      }
      if (state !== 'idle') {
        wander.tx = 0;
        wander.ty = 0;
      }
      wander.x += (wander.tx - wander.x) * (1 - Math.exp(-4 * dt));
      wander.y += (wander.ty - wander.y) * (1 - Math.exp(-4 * dt));

      // thinking saccade
      if (state === 'thinking' && now > sac.at) {
        sac.target = (Math.random() < 0.5 ? -1 : 1) * rand(7, 14);
        sac.at = now + rand(340, 720);
      }
      if (state !== 'thinking') sac.target = 0;
      sac.x += (sac.target - sac.x) * (1 - Math.exp(-14 * dt));

      // speech envelope (slow phrasing, real rests)
      if (state === 'talking' || state === 'roast') {
        if (now > talk.at) {
          talk.target = Math.random() < 0.3 ? 0 : rand(0.3, 1);
          talk.at = now + rand(140, 300);
        }
      } else talk.target = 0;
      talk.amp += (talk.target - talk.amp) * (1 - Math.exp(-12 * dt));
      const amp = talk.amp;

      // laughing bounce + shake
      const lf = smooth('lf', st.laugh, dt, 10);
      const laughBounce = lf > 0.02 ? -Math.abs(Math.sin(t * 11)) * 4 * lf : 0;
      const laughTilt = lf > 0.02 ? Math.sin(t * 11) * 3 * lf : 0;

      const bob = sleepy ? 3 * Math.sin(t * 0.9) : 0;
      const sway = state === 'idle' ? 2 * Math.sin(t * 0.8) : 0;
      const wanderScale = state === 'listening' ? 0.3 : 1;

      const dx = smooth('dx', st.dx, dt, 10) + wander.x * wanderScale + (state === 'thinking' ? sac.x : 0) + sway;
      const dy = smooth('dy', st.dy, dt, 10) + wander.y * wanderScale + bob + nod + laughBounce;

      const hL = smooth('hL', st.hL ?? st.h, dt, 10) * (1 - b * 0.95) * wakeF;
      const hR = smooth('hR', st.h, dt, 10) * (1 - b * 0.95) * wakeF;
      const w = smooth('w', st.w, dt, 10);
      const rL = smooth('rL', st.rL, dt, 10) - laughTilt;
      const rR = smooth('rR', st.rR, dt, 10) + laughTilt;

      // the light carries the voice: slow shimmer, per-eye phase
      const vibL = amp * (0.85 + 0.15 * Math.sin(t * 16 + phase));
      const vibR = amp * (0.85 + 0.15 * Math.sin(t * 16 + phase + 1.7));
      const amp2 = smooth('amp2', amp, dt, 9);

      let br = smooth('br', st.br, dt, 8);
      if (state === 'alert') {
        const ft = now - stateAt;
        br += Math.exp(-ft / 350) * 0.5 * Math.abs(Math.sin(ft / 70));
      }
      const errF = smooth('err', st.err, dt, 8);
      if (errF > 0.02) br *= 1 - errF * (0.25 + 0.15 * Math.sin(t * 7) + (Math.sin(t * 23.7) > 0.965 ? 0.3 : 0));
      if (lf > 0.02) br += lf * 0.08 * Math.sin(t * 22);

      const hp = smooth('hp', st.happy, dt, 10);

      // write shared values (px values scaled to this mount's size)
      L.tx.value = (dx) * k;
      L.ty.value = (dy - amp * 3) * k;
      L.rot.value = rL;
      L.sx.value = w + vibL * 0.02;
      L.sy.value = Math.max(0.04, hL + vibL * 0.03);
      R.tx.value = dx * k;
      R.ty.value = (dy - amp2 * 3) * k;
      R.rot.value = rR;
      R.sx.value = w + vibR * 0.02;
      R.sy.value = Math.max(0.04, hR + vibR * 0.03);

      const clip = 1 - hp * 0.46; // happy/laugh crescent: flat cut from the bottom
      L.clip.value = clip;
      R.clip.value = clip;

      const brL = br + vibL * 0.3;
      const brR = br + vibR * 0.3;
      L.over.value = clamp((brL - 1) * 0.7, 0, 0.6);
      R.over.value = clamp((brR - 1) * 0.7, 0, 0.6);
      L.dim.value = clamp(brL, 0.35, 1);
      R.dim.value = clamp(brR, 0.35, 1);

      haloOp.value = smooth('glow', st.glow, dt, 8) + Math.max(vibL, vibR) * 0.25;
      haloScale.value = 1 + amp * 0.18;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOp.value,
    transform: [{ scale: haloScale.value }],
  }));

  const boxH = Math.max(EYE_H * k + 26 * k, 18);
  const haloSize = size * 0.95;

  return (
    <View style={{ width: size, height: boxH, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: haloSize,
            height: haloSize,
            borderRadius: haloSize / 2,
            backgroundColor: 'rgba(107,168,255,0.38)',
            // web build: a real gaussian glow. Native ignores filter; the halo
            // still reads as a soft disc at low opacity.
            ...(Platform.OS === 'web' ? ({ filter: `blur(${Math.max(10, size * 0.16)}px)` } as object) : null),
          },
          haloStyle,
        ]}
      />
      <View style={{ flexDirection: 'row', gap: EYE_GAP * k, alignItems: 'center' }}>
        <Eye k={k} sv={L} />
        <Eye k={k} sv={R} />
      </View>
    </View>
  );
}
