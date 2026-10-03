import React, { useRef, useState } from 'react';

/*
 * The browser's "Upload a photo" for a group's face: the computer's (or
 * phone browser's) file picker, then the middle square of the picture, 640
 * across at most, the way the profile photo is cut on the web. Uploaded only
 * when the group is saved.
 */
export function useGroupPhotoPick(onPicked: (uri: string) => void): { open: () => void; element: React.ReactNode; error: string } {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const element = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      style={{ display: 'none' }}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { setError('Choose a photo.'); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const img = new window.Image();
          img.onload = () => {
            const side = Math.min(img.width, img.height);
            const out = Math.min(640, side);
            const canvas = document.createElement('canvas');
            canvas.width = out; canvas.height = out;
            const ctx = canvas.getContext('2d');
            if (!ctx) { onPicked(String(reader.result)); return; }
            ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
            setError('');
            onPicked(canvas.toDataURL('image/jpeg', 0.88));
          };
          img.onerror = () => setError('This photo couldn’t be opened.');
          img.src = String(reader.result);
        };
        reader.onerror = () => setError('This photo couldn’t be opened.');
        reader.readAsDataURL(file);
      }}
    />
  );
  return { open: () => input.current?.click(), element, error };
}
