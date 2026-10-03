import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import type { ShareKind } from '@/data/types';
import { SharedPage } from '@/features/share/SharedPage';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

/**
 * A page that a shared link can open: signed in, the page itself; signed
 * out, its public look (SharedPage) instead of a bounce to sign-in. AppShell
 * lets these addresses through without an account (see publicPaths).
 */
export function publicRoute(kind: ShareKind, Screen: React.ComponentType): React.ComponentType {
  function PublicRoute() {
    const { currentUserId, ready, authResolved } = useApp();
    const { id } = useLocalSearchParams<{ id?: string }>();
    if (currentUserId) return <Screen />;
    if (!ready || !authResolved) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><CourtSpinner size={32} /></View>;
    return <SharedPage kind={kind} id={String(id ?? '')} />;
  }
  PublicRoute.displayName = `PublicRoute(${kind})`;
  return PublicRoute;
}
