import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Background } from '../components/Background';
import { Orb } from '../components/Orb';
import { GhostButton } from '../components/Button';
import { color, font } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Connect'>;

function Chip({ bg, fg, letter }: { bg: string; fg: string; letter: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{letter}</Text>
    </View>
  );
}

export function ConnectScreen({ navigation }: Props) {
  // Pull-first MVP: mock the OAuth result and move on.
  const connect = () => navigation.replace('Chat');
  return (
    <Background>
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <View style={styles.orbWrap}>
            <Orb size={38} />
          </View>
          <Text style={styles.title}>Connect your inbox</Text>
          <Text style={styles.sub}>
            I read only what helps surface what matters. Nothing ever leaves your account.
          </Text>
          <View style={styles.opts}>
            <GhostButton label="Continue with Gmail" onPress={connect} icon={<Chip bg="#fff" fg="#EA4335" letter="G" />} />
            <GhostButton label="Continue with Outlook" onPress={connect} icon={<Chip bg="#0A66C2" fg="#fff" letter="O" />} />
          </View>
          <View style={styles.priv}>
            <Text style={styles.lock}>🔒</Text>
            <Text style={styles.privText}>
              Maximum Privacy is on by default. You can revoke access anytime in settings.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Background>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 28, paddingTop: 18 },
  orbWrap: { alignItems: 'center', marginTop: 6, marginBottom: 26 },
  title: { fontFamily: font.serif, fontSize: 25, lineHeight: 32, color: color.textBright, textAlign: 'center' },
  sub: {
    fontFamily: font.light,
    fontSize: 14,
    lineHeight: 22,
    color: color.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  opts: { gap: 12, marginTop: 34 },
  priv: { marginTop: 'auto', paddingVertical: 18, paddingBottom: 30, flexDirection: 'row', gap: 9 },
  lock: { fontSize: 12, color: color.textMuted },
  privText: { flex: 1, fontFamily: font.light, fontSize: 12, lineHeight: 18, color: '#6B7790' },
  chip: { width: 22, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: font.semibold, fontSize: 13 },
});
