import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Background } from '../components/Background';
import { AccountChip, AddRow, Card, SectionLabel, StatusDot, Toggle } from '../components/settings';
import { color, font } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Connections'>;

export function ConnectionsScreen(_: Props) {
  const [maxPrivacy, setMaxPrivacy] = useState(true);
  const [pokes, setPokes] = useState(false);

  return (
    <Background>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.head}>
          <Text style={styles.title}>Connections</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <SectionLabel>Inboxes</SectionLabel>
          <Card>
            <AccountChip letter="G" />
            <View>
              <Text style={styles.acc}>hatim@gmail.com</Text>
              <Text style={styles.accSub}>Gmail</Text>
            </View>
            <StatusDot label="connected" />
          </Card>
          <AddRow label="Add another inbox" />

          <SectionLabel>Privacy</SectionLabel>
          <Card>
            <View style={styles.flex}>
              <Text style={styles.lbl}>Maximum Privacy</Text>
              <Text style={styles.lblSub}>No one but you sees your data</Text>
            </View>
            <Toggle value={maxPrivacy} onChange={setMaxPrivacy} />
          </Card>

          <SectionLabel muted>Pokes · coming in v2</SectionLabel>
          <Card dim>
            <View style={styles.flex}>
              <Text style={styles.lbl}>Proactive nudges</Text>
              <Text style={styles.lblSub}>Get pinged when it truly matters</Text>
            </View>
            <Toggle value={pokes} disabled onChange={setPokes} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Background>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  head: { paddingHorizontal: 26, paddingTop: 14, paddingBottom: 8 },
  title: { fontFamily: font.serifMed, fontSize: 24, color: color.textBright },
  body: { paddingHorizontal: 22, paddingBottom: 30, gap: 9 },
  flex: { flex: 1 },
  acc: { fontFamily: font.medium, fontSize: 14.5, color: color.textPrimary },
  accSub: { fontFamily: font.light, fontSize: 12, color: color.textSecondary, marginTop: 2 },
  lbl: { fontFamily: font.regular, fontSize: 14, color: color.textPrimary },
  lblSub: { fontFamily: font.light, fontSize: 11.5, color: color.textSecondary, marginTop: 2 },
});
