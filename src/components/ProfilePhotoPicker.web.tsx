import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar } from './ui';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';
/**
 * A round photo with a link under it that opens the computer's files. Your
 * profile uses it as it is; a group chat passes its own picture (`preview`)
 * and words (`label`), so the same picker serves both.
 */
export function ProfilePhotoPicker({ value, name, onChange, label = 'Change profile photo', preview }: {
  value?: string; name: string; onChange: (uri: string) => void;
  /** The link's words under the picture. */
  label?: string;
  /** Drawn in place of the default 88px avatar. */
  preview?: React.ReactNode;
}) {
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
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => input.current?.click()} style={{alignItems:'center',gap:12}}>
      {preview ?? <Avatar name={name} seed="profile-photo-preview" uri={value} size={88}/>}
      <Text style={{color:colors.brand,...font('600')}}>{label}</Text>
    </Pressable>
    {!!error && <Text style={{color:colors.danger}}>{error}</Text>}
  </View>;
}
