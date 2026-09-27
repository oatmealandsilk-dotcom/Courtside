import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ProfilePhotoPicker } from '@/components/ProfilePhotoPicker';
import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, Field, Screen } from '@/components/ui';
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

  return (
    <Screen title="Edit Profile" onBack={() => router.back()}>
      {!currentUser ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View>
      ) : (
        <View style={{ gap: 20 }}>
          <ProfilePhotoPicker name={name} value={avatarUrl} onChange={setAvatarUrl} />
          <Field label="Name" value={name} onChangeText={setName} />
          {/* The handle has its own page: it has rules (once a month) and a live check. */}
          <View style={styles.wrap}>
            <Text style={styles.label}>Handle</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Handle, @${currentUser.handle}. Change it`} onPress={() => router.push('/change-handle')} style={({ pressed }) => [styles.box, pressed && { opacity: 0.7 }]}>
              <Text style={styles.value} numberOfLines={1}>@{currentUser.handle}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          </View>
          <Field label="Bio" value={bio} onChangeText={setBio} multiline />
          <LocationField value={location} onChange={setLocation} />
          <Button label="Save changes" disabled={!name.trim()} onPress={() => { actions.updateIdentity({ avatarUrl, name: name.trim(), bio: bio.trim(), location: location.trim() }); router.back(); }} />
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
});
