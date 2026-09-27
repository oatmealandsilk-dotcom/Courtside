import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { HitCard } from '@/components/HitCard';
import { EmptyState, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';

/** One hit on its own page, for a notification ("Mira is in for your hit") to land on. */
export default function HitRequestPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { hitRequests } = useApp();
  const hit = hitRequests.find((h) => h.id === id);
  return (
    <Screen title="Hit" compactTitle onBack={() => goBack('/discuss')}>
      {hit ? <View style={{ paddingTop: 4 }}><HitCard hit={hit} /></View> : <EmptyState icon="tennisball-outline" title="This hit is over" body="It has been played, or called off." />}
    </Screen>
  );
}
