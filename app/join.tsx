import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { rememberReferrer } from '@/features/invite/referral';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

/**
 * Where an invite link lands. The handle on it is remembered, then the
 * person is sent to make an account (or, already signed in, straight home —
 * the store claims the invite the moment there is an account to claim it).
 */
export default function Join() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const { currentUserId, actions } = useApp();
  useEffect(() => {
    let live = true;
    (async () => {
      if (ref) await rememberReferrer(String(ref));
      if (!live) return;
      if (currentUserId) { await actions.claimPendingReferral(); router.replace('/'); }
      else router.replace({ pathname: '/sign-in', params: { mode: 'create' } });
    })();
    return () => { live = false; };
  }, [ref, currentUserId, actions]);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><CourtSpinner size={32} /></View>;
}
