import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { CircleCrop } from '@/components/CircleCrop';

/*
 * "Upload a photo" for a group's face: the phone's own photos, then the
 * profile photo's Move and Scale, with a rounded-square window the shape of
 * the group's tile. The cut is a square (640 across at most), uploaded only
 * when the group is saved. The browser has its own twin (.web).
 */
export function useGroupPhotoPick(onPicked: (uri: string) => void): { open: () => void; element: React.ReactNode; error: string } {
  const [cropping, setCropping] = useState<string | null>(null);
  const [error, setError] = useState('');
  const open = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (!result.canceled) { setError(''); setCropping(result.assets[0].uri); }
    } catch {
      setError('Your photos couldn’t be opened.');
    }
  };
  const element = cropping ? (
    <CircleCrop
      uri={cropping}
      corner={0.3}
      onDone={(uri) => { setCropping(null); onPicked(uri); }}
      // Back from the crop means the wrong photo: straight back into your photos.
      onCancel={() => { setCropping(null); void open(); }}
    />
  ) : null;
  return { open: () => { void open(); }, element, error };
}
