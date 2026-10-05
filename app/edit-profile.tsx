import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ProfilePhotoPicker } from '@/components/ProfilePhotoPicker';
import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, Field, Screen } from '@/components/ui';
import { LocationField } from '@/components/LocationField';
import { levelBadge } from '@/lib/badges';
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
  // "UTR 8.5", "NTRP 4.0"; nothing when no rating was ever picked.
  const rating = currentUser?.profile?.rating ? levelBadge(currentUser.profile).label : null;

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
            if (currentUser) actions.updateIdentity({ avatarUrl: uri, name: currentUser.name, bio: currentUser.bio, location: currentUser.location });
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
          {/* Your UTR or NTRP, where you'd look for it (Oct 4, owner): it opens the same rating step as Your game → Edit. */}
          <View style={styles.wrap}>
            <Text style={styles.label}>Rating</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={rating ? `Rating, ${rating}. Change it` : 'Rating. Add your rating'} onPress={() => router.push({ pathname: '/onboarding', params: { from: 'edit', step: '0' } })} style={({ pressed }) => [styles.box, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.value, !rating && styles.empty]} numberOfLines={1}>{rating ?? 'Add your rating'}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          </View>
          <Field label="Bio" value={bio} onChangeText={setBio} multiline />
          <LocationField value={location} onChange={(next, at) => { setLocation(next); setCityAt(at); }} />
          <Button label="Save changes" disabled={!name.trim()} onPress={() => { actions.updateIdentity({ name: name.trim(), bio: bio.trim(), location: location.trim(), cityAt: location.trim() ? cityAt : null }); router.back(); }} />
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
});
