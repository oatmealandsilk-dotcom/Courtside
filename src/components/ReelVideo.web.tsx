import React from 'react';

export function ReelVideo({ uri }: { uri: string }) {
  return <video src={uri} controls playsInline preload="metadata" style={{ width: '100%', aspectRatio: '9 / 16', maxHeight: 650, background: '#202923', borderRadius: 12, objectFit: 'contain' }} />;
}
