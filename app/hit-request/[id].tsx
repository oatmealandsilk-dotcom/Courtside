import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { HitCard } from '@/components/HitCard';
import { HitGlyph } from '@/components/HitGlyph';
import { EmptyState, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';
import { publicRoute } from '@/features/share/publicRoute';

/** One hit on its own page, for a notification ("Mira is in for your hit") to land on. */
function HitRequestPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { hitRequests } = useApp();
  const hit = hitRequests.find((h) => h.id === id);
  return (
    <Screen title="Hit" compactTitle onBack={() => goBack('/discuss')}>
      {hit ? <View style={{ paddingTop: 4 }}><HitCard hit={hit} /></View> : <EmptyState glyph={<HitGlyph size={28} color={colors.textFaint} />} title="This hit is over" body="It has been played, or called off." />}
    </Screen>
  );
}

// A link shared outside the app opens here for anyone; signed out, it shows the public look (see SharedPage).
export default publicRoute('hit-request', HitRequestPage);
