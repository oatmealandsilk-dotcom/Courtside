import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import Home from '../../(tabs)/index';
import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Screen } from '@/components/ui';
import { parseCourtParams } from '@/features/places/court';
import { useCourtPosts } from '@/features/places/useCourtPosts';
import { goBack } from '@/lib/goBack';
import { useStillLoading } from '@/lib/useStillLoading';
import { useApp } from '@/store/AppContext';
import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/**
 * A court's posts as the same full-screen feed as Home, starting on the one
 * tapped: the same list as the court's grid, in the same order, so the tile
 * you tapped is the page you land on. The order is fixed when it opens, so a
 * like or a page arriving never reshuffles what you are swiping through.
 */
export default function CourtReel() {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const params = useLocalSearchParams<{ id: string; name?: string; lat?: string; lng?: string; post?: string }>();
  const { posts } = useApp();
  const parsed = parseCourtParams(params, posts);
  const place = useMemo(() => parsed, [parsed?.id, parsed?.name, parsed?.lat, parsed?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const { posts: list, status } = useCourtPosts(place);
  const loading = useStillLoading();
  const ids = useRef<string[] | null>(null);
  // Fixed once the court's first page is in (and the account behind it): opened
  // from the grid that is a frame away; a link opened cold or a reload waits for
  // it, so the reel never settles on the few posts that happened to be here.
  if (!ids.current && place && status !== 'loading') ids.current = list.map((p) => p.id);

  if (!place) {
    return (
      <Screen title="Court" compactTitle onBack={() => goBack()}>
        {loading
          ? <View style={styles.waitInline}><CourtSpinner size={28} /></View>
          : <EmptyState icon="location-outline" title="This court isn’t available" body="The link is missing where it is." />}
      </Screen>
    );
  }
  if (!ids.current) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.wait, { backgroundColor: colors.bg }]}>
        <CourtSpinner size={28} />
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <Home scope={{ ids: ids.current, start: params.post }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wait: { alignItems: 'center', justifyContent: 'center' },
  waitInline: { paddingVertical: 60, alignItems: 'center' },
});
