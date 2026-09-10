import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from './ui';
import { colors } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
export function ProfilePhotoPicker({ value, name, onChange }: { value?: string; name: string; onChange: (uri: string) => void }) {
  useTheme();
  const [error,setError] = useState('');
  return <View style={{alignItems:'center',gap:12,paddingVertical:16}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" style={{alignItems:'center',gap:12}} onPress={async () => {
      try { const result = await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:0.8});
        if (!result.canceled) onChange(result.assets[0].uri);
      } catch { setError('Unable to open your photos.'); }
    }}><Avatar name={name} seed="profile-photo-preview" uri={value} size={88}/><Text style={{color:colors.brand,fontWeight:'600'}}>Change profile photo</Text></Pressable>
    {!!error && <Text style={{color:colors.danger}}>{error}</Text>}
  </View>;
}
