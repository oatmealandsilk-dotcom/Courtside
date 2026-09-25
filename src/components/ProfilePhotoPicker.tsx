import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from './ui';
import { CircleCrop } from './CircleCrop';
import { colors, font } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
export function ProfilePhotoPicker({ value, name, onChange }: { value?: string; name: string; onChange: (uri: string) => void }) {
  useTheme();
  const [error,setError] = useState('');
  const [cropping, setCropping] = useState<string | null>(null);
  return <View style={{alignItems:'center',gap:12,paddingVertical:16}}>
    {cropping ? <CircleCrop uri={cropping} onDone={(uri) => { setCropping(null); onChange(uri); }} onCancel={() => setCropping(null)} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" style={{alignItems:'center',gap:12}} onPress={async () => {
      try { const result = await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.9});
        // The phone's own cropper is a square; ours is the circle the picture is shown in.
        if (!result.canceled) setCropping(result.assets[0].uri);
      } catch { setError('Unable to open your photos.'); }
    }}><Avatar name={name} seed="profile-photo-preview" uri={value} size={88}/><Text style={{color:colors.brand,...font('600')}}>Change profile photo</Text></Pressable>
    {!!error && <Text style={{color:colors.danger}}>{error}</Text>}
  </View>;
}
