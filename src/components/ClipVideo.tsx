import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

/**
 * A clip on a phone. Plays on its own, looped and muted, the way a feed
 * expects — `active` is the only control the page has over it.
 */
export function ClipVideo({ uri, active = true, muted = true, paused = false }: {
  uri: string; poster?: string; active?: boolean; muted?: boolean; paused?: boolean;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);
  useEffect(() => {
    if (active && !paused) player.play();
    else player.pause();
  }, [player, active, paused]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
    </View>
  );
}
