import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import Home from './(tabs)/index';
import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/**
 * A clip tapped in Activities' classic look (owner, Nov 27: "you can only enter the reel style scrolling if it is a
 * video"): the same full-screen feed as For you, starting on that clip, then the feed's other clips below it in the
 * feed's order, ending when they run out. Videos only. The list is fixed when it opens, so a like or a page arriving
 * never reshuffles it; back (the chevron, a swipe back, the browser's back) lands on the feed where it was.
 * `reel`: a video posted as a post (not as a clip) plays here as a clip too, full screen and at once, never as a
 * post's page whose video waits for a second tap (Nov 28; asReelClip in the Feed).
 */
export default function ClipReel() {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const params = useLocalSearchParams<{ ids?: string; start?: string }>();
  const ids = useRef<string[] | null>(null);
  if (!ids.current) {
    const list = (params.ids ?? '').split(',').filter(Boolean);
    ids.current = list.length ? list : params.start ? [params.start] : [];
  }
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <Home scope={{ ids: ids.current, start: params.start, reel: true }} />
    </View>
  );
}
