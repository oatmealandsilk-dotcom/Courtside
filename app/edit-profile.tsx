import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { ProfilePhotoPicker } from '@/components/ProfilePhotoPicker';
import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, Field, Screen, SegmentedControl } from '@/components/ui';
import { SCALES, ratingBand, roundRating } from '@/features/players/ratingScales';
import { BLOCKED_WORDS_NOTE } from '@/features/hiddenWords/hiddenWords';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { LocationField } from '@/components/LocationField';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { buttonShape, colors, font, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { CapsLabel, setupLook } from '@/components/setup/SetupBits';
import { EDIT_PROFILE_V2 } from '@/features/profile/editProfileV2';
import { isOfficial } from '@/features/players/official';

/** Your picture, name, bio and city. Opened before the app has your account, it waits and then fills in. */
export default function EditProfile() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl);
  const [name, setName] = useState(currentUser?.name ?? '');
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [location, setLocation] = useState(currentUser?.location ?? '');
  const [cityAt, setCityAt] = useState(currentUser?.cityAt ?? null);
  // Words CourtSide refuses (migration 117) are said before leaving, and what you wrote stays to change.
  const [checking, setChecking] = useState(false);
  // The first time your account is here, its details fill the fields — once, so typing is never overwritten.
  const filled = useRef(!!currentUser);
  useEffect(() => {
    if (filled.current || !currentUser) return;
    filled.current = true;
    setAvatarUrl(currentUser.avatarUrl);
    setName(currentUser.name);
    setBio(currentUser.bio);
    setLocation(currentUser.location);
    // The rating too: its boxes were set up before the account was here, empty.
    const p = currentUser.profile;
    if (p) {
      setSystem(p.skillSystem === 'UTR' ? 'UTR' : 'NTRP');
      setRatingText(p.rating && p.skillSystem !== 'ITF' ? p.rating.toFixed(1) : '');
    }
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
  // Game details (EDIT_PROFILE_V2's row) changes the rating too: back here, the box shows the new one, so Save never
  // puts the old one back. A number you had typed here yourself stays.
  const shownFor = (p?: typeof prof) => ({ text: p?.rating && p.skillSystem !== 'ITF' ? p.rating.toFixed(1) : '', system: p?.skillSystem === 'UTR' ? 'UTR' as const : 'NTRP' as const });
  const seenRating = useRef(shownFor(prof));
  useEffect(() => {
    if (!prof) return;
    const was = seenRating.current;
    const now = shownFor(prof);
    seenRating.current = now;
    if ((now.text !== was.text || now.system !== was.system) && ratingText === was.text && system === was.system) {
      setSystem(now.system);
      setRatingText(now.text);
    }
  }, [prof?.rating, prof?.skillSystem]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeSystem = (next: 'NTRP' | 'UTR') => {
    if (next === system) return;
    haptics.tap();
    setSystem(next);
    // A number on one scale means nothing on the other: start from the middle of the new one.
    setRatingText((next === 'UTR' ? 6 : 3.5).toFixed(1));
  };
  const saveAll = () => {
    if (checking) return;
    setChecking(true);
    void actions.wordsRefused([name, bio, location]).then((refused) => {
      setChecking(false);
      if (refused) {
        haptics.reject();
        showToast({ title: BLOCKED_WORDS_NOTE, body: 'Change them and save again.', icon: 'alert-circle-outline', long: true });
        return;
      }
      actions.updateIdentity({ name: name.trim(), bio: bio.trim(), location: location.trim(), cityAt: location.trim() ? cityAt : null });
      if (!(EDIT_PROFILE_V2 && official)) saveRating();
      // Opened from a link or after a reload there is no page behind it: the profile, then.
      goBack('/profile');
    });
  };
  const saveRating = () => {
    if (!prof || !ratingOk) return;
    const next = roundRating(typed, scale.decimals);
    if (next !== prof.rating || system !== prof.skillSystem) actions.completeOnboarding({ ...prof, skillSystem: system, rating: next });
  };

  // The redraw (EDIT_PROFILE_V2). CourtSide's own account shows no rating anywhere, so it has no Tennis list here.
  const official = isOfficial(currentUser?.id);
  const showRating = !!prof && !official;
  const sameAt = (a?: { lat: number; lng: number } | null, b?: { lat: number; lng: number } | null) => (a?.lat ?? null) === (b?.lat ?? null) && (a?.lng ?? null) === (b?.lng ?? null);
  const ratingChanged = showRating && ratingOk && (roundRating(typed, scale.decimals) !== prof!.rating || system !== prof!.skillSystem);
  // Save waits until something is different from what is saved (the photo saves on its own).
  const changed = !!currentUser && (
    name.trim() !== currentUser.name.trim()
    || bio.trim() !== (currentUser.bio ?? '').trim()
    || location.trim() !== (currentUser.location ?? '').trim()
    || (!!location.trim() && !sameAt(cityAt, currentUser.cityAt))
    || ratingChanged
  );
  const saveOff = !name.trim() || (showRating && !ratingEmpty && !ratingOk) || !changed;

  if (EDIT_PROFILE_V2) {
    return (
      <Screen
        title="Edit profile"
        compactTitle
        onBack={() => goBack('/profile')}
        // Save in the header, as an iPhone's own edit pages have it: never under the floating tab bar or the keyboard.
        right={currentUser ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            accessibilityState={{ disabled: saveOff, busy: checking }}
            disabled={saveOff || checking}
            hitSlop={8}
            onPress={saveAll}
            style={({ pressed }) => [styles.save, saveOff && styles.saveOff, pressed && { opacity: PRESS_DIM }]}
          >
            {checking ? <CourtSpinner size={14} ink={colors.brandInk} /> : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.saveText}>Save</Text>}
          </Pressable>
        ) : undefined}
      >
        {!currentUser ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View>
        ) : (
          <View style={styles.page}>
            {/* A chosen photo saves at once (Instagram's way, Oct 4); everything below waits for Save. */}
            <ProfilePhotoPicker name={name} value={avatarUrl} label="Edit picture" accessibilityLabel="Change profile photo" onChange={(uri) => {
              setAvatarUrl(uri);
              actions.updateIdentity({ avatarUrl: uri });
            }} />
            <View style={styles.inset}>
              <View style={styles.row}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowLabel}>Name</Text>
                <View style={styles.rowBox}>
                  <Field row accessibilityLabel="Name" placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" />
                </View>
              </View>
              <View style={styles.hairline} />
              {/* The handle has its own page: it has rules (once a month) and a live check. */}
              <Pressable accessibilityRole="button" accessibilityLabel={`Handle, @${currentUser.handle}. Change it`} onPress={() => router.push('/change-handle')} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowLabel}>Handle</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowValue} numberOfLines={1}>@{currentUser.handle}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.chevron} />
              </Pressable>
              <View style={styles.hairline} />
              <View style={[styles.row, styles.bioRow]}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.rowLabel, styles.bioLabel]}>Bio</Text>
                <View style={styles.rowBox}>
                  <Field bare multiline minHeight={92} accessibilityLabel="Bio" placeholder="A line about your tennis" value={bio} onChangeText={setBio} />
                </View>
              </View>
              <View style={styles.hairline} />
              <LocationField row value={location} onChange={(next, at) => { setLocation(next); setCityAt(at); }} />
            </View>
            {showRating ? (
              <View style={styles.group}>
                <View style={styles.caps}><CapsLabel>Tennis</CapsLabel></View>
                <View style={styles.inset}>
                  {/* Your UTR or NTRP, right here: the number, the scale, and what it means. */}
                  <View style={styles.ratingBlock}>
                    <View style={styles.row}>
                      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowLabel}>Rating</Text>
                      <View style={styles.rowBox}>
                        <Field row accessibilityLabel={`${system} rating`} value={ratingText} onChangeText={setRatingText} placeholder={system === 'UTR' ? '6.0' : '3.5'} keyboardType="decimal-pad" selectTextOnFocus />
                      </View>
                      <View style={styles.system}>
                        <SegmentedControl<'NTRP' | 'UTR'> accessibilityLabel="Rating system" value={system} onChange={changeSystem} segments={[{ value: 'NTRP', label: 'NTRP' }, { value: 'UTR', label: 'UTR' }]} />
                      </View>
                    </View>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.level, !ratingEmpty && !ratingOk && styles.ratingBad]}>
                      {ratingOk ? ratingBand(system, roundRating(typed, scale.decimals)) : ratingEmpty ? 'Add yours: it shows on your profile.' : `Enter ${scale.min.toFixed(1)}–${scale.max.toFixed(1)}`}
                    </Text>
                  </View>
                  <View style={styles.hairline} />
                  {/* Plays, hand, backhand, surface: the Tennis profile's own edit pages. */}
                  <Pressable accessibilityRole="button" accessibilityLabel="Game details" onPress={() => router.push({ pathname: '/onboarding', params: { from: 'edit', step: '0' } })} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkText}>Game details</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.chevron} />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </Screen>
    );
  }

  return (
    <Screen title="Edit profile" onBack={() => goBack('/profile')}>
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
            <Pressable accessibilityRole="button" accessibilityLabel={`Handle, @${currentUser.handle}. Change it`} onPress={() => router.push('/change-handle')} style={({ pressed }) => [styles.box, pressed && { opacity: PRESS_DIM }]}>
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
          <Button label="Save changes" disabled={!name.trim() || (!ratingEmpty && !ratingOk)} loading={checking} onPress={saveAll} />
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
  // The redraw (EDIT_PROFILE_V2): the sign-up redraw's inset lists, label-left rows on hairlines.
  page: { gap: setupLook.sectionGap, paddingBottom: spacing.lg },
  group: { gap: spacing.sm },
  caps: { paddingHorizontal: spacing.lg },
  inset: { ...setupLook.inset },
  // Labels 88 wide with no gap, as LocationField's own row draws Town, so every value starts on one line.
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: spacing.lg },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowLabel: { ...typography.body, color: colors.textMuted, width: 88 },
  rowBox: { flex: 1, minWidth: 0 },
  rowValue: { flex: 1, ...typography.body, fontSize: 15, ...font('500'), color: colors.text },
  chevron: { marginLeft: spacing.sm },
  bioRow: { alignItems: 'flex-start', paddingVertical: 6 },
  bioLabel: { paddingTop: 7 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  ratingBlock: { paddingBottom: spacing.md },
  system: { width: 132, marginLeft: spacing.sm },
  level: { ...typography.small, color: colors.textMuted, paddingLeft: spacing.lg + 88, paddingRight: spacing.lg, marginTop: -4 },
  linkText: { flex: 1, ...typography.body, color: colors.text },
  save: { minWidth: 64, paddingHorizontal: 14, minHeight: 32, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  saveOff: { opacity: 0.4 },
  saveText: { ...typography.smallStrong, color: colors.brandInk },
});
