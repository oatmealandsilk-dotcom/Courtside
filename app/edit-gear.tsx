import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/** Your gear bag, part of your Tennis profile: whatever you fill in shows there; leave the rest blank. */
export default function EditGear() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const gear = currentUser?.profile.gear;
  const [racket, setRacket] = useState(gear?.racket ?? '');
  const [strings, setStrings] = useState(gear?.strings ?? '');
  const [tension, setTension] = useState(gear?.tension ?? '');
  const [shoes, setShoes] = useState(gear?.shoes ?? '');
  // Opened before the account has arrived, it fills in once it does — once, so typing is never overwritten.
  const filled = useRef(!!currentUser);
  useEffect(() => {
    if (filled.current || !currentUser) return;
    filled.current = true;
    const g = currentUser.profile.gear;
    setRacket(g?.racket ?? ''); setStrings(g?.strings ?? ''); setTension(g?.tension ?? ''); setShoes(g?.shoes ?? '');
  }, [currentUser]);
  const save = () => {
    const tidy = (v: string) => v.trim().slice(0, 80) || undefined;
    actions.updateProfile({ gear: { racket: tidy(racket), strings: tidy(strings), tension: tidy(tension), shoes: tidy(shoes) } });
    goBack('/profile-details');
  };
  return (
    <Screen title="Gear bag" onBack={() => goBack('/profile-details')}>
      <View style={styles.body}>
        <Text style={styles.lead}>Shows on your Tennis profile. Fill in what you like; blanks stay hidden.</Text>
        <Field label="Racket" value={racket} onChangeText={setRacket} autoCapitalize="words" />
        <View style={styles.pair}>
          <View style={{ flex: 1 }}><Field label="Strings" value={strings} onChangeText={setStrings} autoCapitalize="words" /></View>
          <View style={{ width: 110 }}><Field label="Tension" value={tension} onChangeText={setTension} placeholder="lbs" /></View>
        </View>
        <Field label="Shoes" value={shoes} onChangeText={setShoes} autoCapitalize="words" />
        <Button label="Save" onPress={save} full />
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.xxl },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  pair: { flexDirection: 'row', gap: spacing.md },
});
