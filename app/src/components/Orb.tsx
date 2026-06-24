import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { color } from '../theme';

/**
 * The brand mark + "listening" indicator.
 * Radial-gradient sphere with a slow breathing glow (iOS shadow), 4.5s loop.
 */
export function Orb({ size = 96 }: { size?: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 4500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [t]);

  const animStyle = useAnimatedStyle(() => {
    const k = t.value; // 0 → 1 → 0
    return {
      transform: [{ scale: 1 + 0.03 * k }],
      // iOS renders the glow; harmless no-op elsewhere.
      shadowOpacity: 0.42 + 0.18 * k,
      shadowRadius: 16 + 12 * k,
    };
  });

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          shadowColor: color.glowBlue,
          shadowOffset: { width: 0, height: 0 },
          ...(Platform.OS === 'android' ? { elevation: 0 } : null),
        },
        animStyle,
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="orb" cx="36%" cy="30%" r="75%">
            <Stop offset="0%" stopColor={color.accentHi} />
            <Stop offset="55%" stopColor={color.accentCoreA} />
            <Stop offset="100%" stopColor={color.accentCoreB} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#orb)" />
      </Svg>
    </Animated.View>
  );
}
