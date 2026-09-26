import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ProfilePhotoPicker } from '@/components/ProfilePhotoPicker';
import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, Field, Screen } from '@/components/ui';
import { LocationField } from '@/components/LocationField';
import { useApp } from '@/store/AppContext';

/** Your picture, name, bio and city. Opened before the app has your account, it waits and then fills in. */
export default function EditProfile() {
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
          <Field label="Bio" value={bio} onChangeText={setBio} multiline />
          <LocationField value={location} onChange={setLocation} />
          <Button label="Save changes" disabled={!name.trim()} onPress={() => { actions.updateIdentity({ avatarUrl, name: name.trim(), bio: bio.trim(), location: location.trim() }); router.back(); }} />
        </View>
      )}
    </Screen>
  );
}
