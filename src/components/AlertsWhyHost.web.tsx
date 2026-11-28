import React, { useRef } from 'react';
import { Modal, type Text } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { AlertsWhyCard } from '@/components/AlertsWhyCard';
import { alertsWhyWords } from '@/features/push/alertsWhyWords';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * "Why turn on alerts" in a browser: never drawn. The website has no alerts
 * (push.web.ts), so there is nothing to ask for. See AlertsWhyHost.tsx.
 *
 * The one exception is a picture: the demo website (no Supabase) draws the
 * iPhone's card with ?alertswhy=1 in its address, as an iPhone would show it
 * right after Up to hit (Continue, the one way on). It does nothing when tapped.
 */
export function AlertsWhyHost() {
  return PREVIEW ? <Preview /> : null;
}

const PREVIEW = !isSupabaseConfigured && typeof window !== 'undefined' && /[?&]alertswhy=1\b/.test(window.location.search);

function Preview() {
  const shown = useSharedValue(1);
  const titleRef = useRef<Text>(null);
  return (
    <Modal visible transparent animationType="none">
    <AlertsWhyCard
      words={alertsWhyWords('up-to-hit')}
      settings={false}
      onlyOn
      dimStyle={{ opacity: 1 }}
      cardStyle={{ opacity: 1 }}
      reduce
      shown={shown}
      titleRef={titleRef}
      onTurnOn={() => undefined}
      onNotNow={() => undefined}
      onTouch={() => undefined}
    />
    </Modal>
  );
}
