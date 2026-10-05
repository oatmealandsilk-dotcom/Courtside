import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { HitCard } from '@/components/HitCard';
import { HitGlyph } from '@/components/HitGlyph';
import { EmptyState, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { useStillLoading } from '@/lib/useStillLoading';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';
import { publicRoute } from '@/features/share/publicRoute';

/**
 * One hit on its own page, for a notification ("Mira is in for your hit") to
 * land on. Opened cold (a push for a hit this phone hasn't loaded yet), it
 * waits for the account's data before saying the hit is over.
 */
function HitRequestPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { hitRequests } = useApp();
  const loading = useStillLoading();
  const hit = hitRequests.find((h) => h.id === id);
  return (
    <Screen title="Hit" compactTitle onBack={() => goBack('/discuss')}>
      {hit ? <View style={{ paddingTop: 4 }}><HitCard hit={hit} linked={false} /></View> : loading ? <View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View> : <EmptyState glyph={<HitGlyph size={28} color={colors.textFaint} />} title="This hit is over" body="It has been played, or called off." />}
    </Screen>
  );
}

// A link shared outside the app opens here for anyone; signed out, it shows the public look (see SharedPage).
export default publicRoute('hit-request', HitRequestPage);
