import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Background } from '../components/Background';
import { Orb } from '../components/Orb';
import { PrimaryButton } from '../components/Button';
import { color, font } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <Background>
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <Orb size={96} />
          <Text style={styles.hero}>A quiet presence{'\n'}on your inbox.</Text>
          <Text style={styles.sub}>
            It watches what matters and speaks up only when it counts. The rest, it keeps to itself.
          </Text>
        </View>
        <View style={styles.foot}>
          <PrimaryButton label="Get started" onPress={() => navigation.navigate('Connect')} />
          <Text style={styles.signin}>
            already here? <Text style={styles.signinLink} onPress={() => navigation.navigate('Connect')}>sign in</Text>
          </Text>
        </View>
      </SafeAreaView>
    </Background>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 38 },
  hero: {
    fontFamily: font.serif,
    fontSize: 30,
    lineHeight: 37,
    color: color.textBright,
    textAlign: 'center',
    marginTop: 46,
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: font.light,
    fontSize: 15,
    lineHeight: 23,
    color: color.textSecondary,
    textAlign: 'center',
    marginTop: 18,
  },
  foot: { paddingHorizontal: 28, paddingBottom: 12 },
  signin: { textAlign: 'center', marginTop: 18, fontSize: 13.5, color: '#6F7D97', fontFamily: font.light },
  signinLink: { color: color.accentGlow, fontFamily: font.medium },
});
