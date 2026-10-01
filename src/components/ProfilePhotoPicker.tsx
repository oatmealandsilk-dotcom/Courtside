import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from './ui';
import { CircleCrop } from './CircleCrop';
import { colors, font } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
/**
 * A round photo with a link under it that opens your photos. Your profile
 * uses it as it is; a group chat passes its own picture (`preview`) and
 * words (`label`), so the same picker serves both.
 */
export function ProfilePhotoPicker({ value, name, onChange, label = 'Change profile photo', preview }: {
  value?: string; name: string; onChange: (uri: string) => void;
  /** The link's words under the picture. */
  label?: string;
  /** Drawn in place of the default 88px avatar. */
  preview?: React.ReactNode;
}) {
  useTheme();
  const [error,setError] = useState('');
  const [cropping, setCropping] = useState<string | null>(null);
  const choose = async () => {
    try { const result = await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.9});
      // The phone's own cropper is a square; ours is the circle the picture is shown in.
      if (!result.canceled) setCropping(result.assets[0].uri);
    } catch { setError('Unable to open your photos.'); }
  };
  return <View style={{alignItems:'center',gap:12,paddingVertical:16}}>
    {/* Back from the crop means the wrong photo: straight back into your photos to pick again. */}
    {cropping ? <CircleCrop uri={cropping} onDone={(uri) => { setCropping(null); onChange(uri); }} onCancel={() => { setCropping(null); void choose(); }} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={{alignItems:'center',gap:12}} onPress={() => { void choose(); }}>{preview ?? <Avatar name={name} seed="profile-photo-preview" uri={value} size={88}/>}<Text style={{color:colors.brand,...font('600')}}>{label}</Text></Pressable>
    {!!error && <Text style={{color:colors.danger}}>{error}</Text>}
  </View>;
}
