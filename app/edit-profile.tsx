import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ProfilePhotoPicker } from '@/components/ProfilePhotoPicker';
import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, Field, Screen, SegmentedControl } from '@/components/ui';
import { SCALES, ratingBand, roundRating } from '@/features/players/ratingScales';
import * as haptics from '@/lib/haptics';
import { LocationField } from '@/components/LocationField';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/** Your picture, name, bio and city. Opened before the app has your account, it waits and then fills in. */
export default function EditProfile() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl);
  const [name, setName] = useState(currentUser?.name ?? '');
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [location, setLocation] = useState(currentUser?.location ?? '');
  const [cityAt, setCityAt] = useState(currentUser?.cityAt ?? null);
  // The first time your account is here, its details fill the fields — once, so typing is never overwritten.
  const filled = useRef(!!currentUser);
  useEffect(() => {
    if (filled.current || !currentUser) return;
    filled.current = true;
    setAvatarUrl(currentUser.avatarUrl);
    setName(currentUser.name);
    setBio(currentUser.bio);
    setLocation(currentUser.location);
  }, [currentUser]);
  // The rating step (the Rating row below) also has your name and city. Changed
  // there, they show here on the way back, so Save changes never puts the old
  // ones back; anything you had typed here yourself stays.
  const seen = useRef({ name: currentUser?.name ?? '', location: currentUser?.location ?? '' });
  useEffect(() => {
    if (!currentUser) return;
    const was = seen.current;
    seen.current = { name: currentUser.name, location: currentUser.location };
    if (currentUser.name !== was.name && name === was.name) setName(currentUser.name);
    if (currentUser.location !== was.location && location === was.location) {
      setLocation(currentUser.location);
      setCityAt(currentUser.cityAt ?? null);
    }
  }, [currentUser?.name, currentUser?.location]); // eslint-disable-line react-hooks/exhaustive-deps
  // Your rating, edited right here (Oct 5, owner: no separate page for it). Saved with the rest by Save changes.
  const prof = currentUser?.profile;
  const hadRating = !!prof?.rating && prof.skillSystem !== 'ITF';
  const [system, setSystem] = useState<'NTRP' | 'UTR'>(prof?.skillSystem === 'UTR' ? 'UTR' : 'NTRP');
  const [ratingText, setRatingText] = useState(hadRating ? prof!.rating!.toFixed(1) : '');
  const scale = SCALES[system];
  const typed = Number(ratingText.replace(',', '.'));
  const ratingEmpty = ratingText.trim() === '';
  const ratingOk = !ratingEmpty && Number.isFinite(typed) && typed >= scale.min && typed <= scale.max;
  const changeSystem = (next: 'NTRP' | 'UTR') => {
    if (next === system) return;
    haptics.tap();
    setSystem(next);
    // A number on one scale means nothing on the other: start from the middle of the new one.
    setRatingText((next === 'UTR' ? 6 : 3.5).toFixed(1));
  };
  const saveRating = () => {
    if (!prof || !ratingOk) return;
    const next = roundRating(typed, scale.decimals);
    if (next !== prof.rating || system !== prof.skillSystem) actions.completeOnboarding({ ...prof, skillSystem: system, rating: next });
  };

  return (
    <Screen title="Edit Profile" onBack={() => router.back()}>
      {!currentUser ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View>
      ) : (
        <View style={{ gap: 20 }}>
          {/* Instagram's way (Oct 4, owner): a chosen photo saves at once, without Save changes.
              Only the photo: anything typed above still waits for Save changes. */}
          <ProfilePhotoPicker name={name} value={avatarUrl} onChange={(uri) => {
            setAvatarUrl(uri);
            if (currentUser) actions.updateIdentity({ avatarUrl: uri });
          }} />
          <Field label="Name" value={name} onChangeText={setName} />
          {/* The handle has its own page: it has rules (once a month) and a live check. */}
          <View style={styles.wrap}>
            <Text style={styles.label}>Handle</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Handle, @${currentUser.handle}. Change it`} onPress={() => router.push('/change-handle')} style={({ pressed }) => [styles.box, pressed && { opacity: 0.7 }]}>
              <Text style={styles.value} numberOfLines={1}>@{currentUser.handle}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          </View>
          {/* Your UTR or NTRP, right here: the scale, the number, and what it means. */}
          {prof ? (
            <View style={styles.wrap}>
              <Text style={styles.label}>Rating</Text>
              <View style={styles.ratingRow}>
                <View style={{ flex: 1 }}>
                  <SegmentedControl<'NTRP' | 'UTR'> value={system} onChange={changeSystem} segments={[{ value: 'NTRP', label: 'NTRP' }, { value: 'UTR', label: 'UTR' }]} />
                </View>
                <View style={styles.ratingBox}>
                  <Field label="" accessibilityLabel={`${system} rating`} value={ratingText} onChangeText={setRatingText} placeholder={system === 'UTR' ? '6.0' : '3.5'} keyboardType="decimal-pad" />
                </View>
              </View>
              <Text style={[styles.ratingNote, !ratingEmpty && !ratingOk && styles.ratingBad]}>
                {ratingOk ? ratingBand(system, roundRating(typed, scale.decimals)) : ratingEmpty ? 'Add yours: it shows on your profile.' : `Enter ${scale.min.toFixed(1)}–${scale.max.toFixed(1)}`}
              </Text>
            </View>
          ) : null}
          <Field label="Bio" value={bio} onChangeText={setBio} multiline />
          <LocationField value={location} onChange={(next, at) => { setLocation(next); setCityAt(at); }} />
          <Button label="Save changes" disabled={!name.trim() || (!ratingEmpty && !ratingOk)} onPress={() => { actions.updateIdentity({ name: name.trim(), bio: bio.trim(), location: location.trim(), cityAt: location.trim() ? cityAt : null }); saveRating(); router.back(); }} />
        </View>
      )}
    </Screen>
  );
}

// Matches the text fields above it, so the row reads as one of them.
const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted },
  box: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  value: { flex: 1, fontSize: 15, color: colors.text },
  empty: { color: colors.textMuted },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ratingBox: { width: 96 },
  ratingNote: { ...typography.small, color: colors.textMuted },
  ratingBad: { color: colors.danger },
});
