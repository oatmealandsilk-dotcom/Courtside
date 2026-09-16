import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar } from './ui';
import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';
export function ProfilePhotoPicker({ value, name, onChange }: { value?: string; name: string; onChange: (uri: string) => void }) {
  useTheme();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  return <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
    <input ref={input} type="file" accept="image/*" style={{display:'none'}} onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return; }
      const reader = new FileReader();
      // Cut the middle square so the circle shows the centre of the photo, not a stretched corner.
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const canvas = document.createElement('canvas');
          const out = Math.min(640, side);
          canvas.width = out; canvas.height = out;
          const ctx = canvas.getContext('2d');
          if (!ctx) { onChange(String(reader.result)); return; }
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
          onChange(canvas.toDataURL('image/jpeg', 0.88));
          setError('');
        };
        img.onerror = () => { onChange(String(reader.result)); setError(''); };
        img.src = String(reader.result);
      };
      reader.onerror = () => setError('This photo could not be opened.');
      reader.readAsDataURL(file); event.target.value = '';
    }}/>
    <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={() => input.current?.click()} style={{alignItems:'center',gap:12}}>
      <Avatar name={name} seed="profile-photo-preview" uri={value} size={88}/>
      <Text style={{color:colors.brand,fontWeight:'600'}}>Change profile photo</Text>
    </Pressable>
    {!!error && <Text style={{color:colors.danger}}>{error}</Text>}
  </View>;
}
