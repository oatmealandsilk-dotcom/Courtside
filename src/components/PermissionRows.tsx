import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import {
  ALL_PERMISSIONS,
  OFF_HINT,
  PERMISSION_META,
  getAllPermissions,
  openPermissionSettings,
  requestPermission,
  type DevicePermission,
  type PermissionState,
} from '@/features/permissions/devicePermissions';
import { Toggle } from '@/components/ui';
import * as toast from '@/lib/toast';
import { colors, radius, spacing, typography } from '@/theme';

/** Live read of every permission, refreshed whenever the app comes back to the front. */
export function usePermissions() {
  const [states, setStates] = useState<Record<DevicePermission, PermissionState> | null>(null);
  const refresh = useCallback(() => { getAllPermissions().then(setStates); }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);
  const ask = useCallback(async (kind: DevicePermission) => {
    await requestPermission(kind);
    refresh();
  }, [refresh]);
  return { states, ask, refresh };
}

/**
 * Where each one stands, in a word. It sits on the name's line, not tacked
 * onto the end of the reason, so "why we ask" and "your answer" read as two
 * separate things instead of one long run-on sentence.
 */
const STATUS: Record<PermissionState, string> = {
  granted: 'On',
  denied: 'Off',
  undetermined: 'Not asked',
  unavailable: 'Not available',
};

/**
 * The permissions as one grouped list, the same recipe as Account and
 * Privacy: a soft box with a hairline edge, the name in regular weight with
 * its answer beside it, one short reason underneath, the switch at the right.
 * The whole row is the switch, so a tap anywhere on it does exactly what
 * flipping the switch does. `footnote` sits once under the list, so the
 * "where to change this" advice is said one time rather than in every row.
 */
export function PermissionRows({ only, footnote }: { only?: DevicePermission[]; footnote?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { states, ask } = usePermissions();
  const kinds = only ?? ALL_PERMISSIONS;
  return (
    <View>
      <View style={styles.list}>
        {kinds.map((kind, i) => {
          const meta = PERMISSION_META[kind];
          const state = states?.[kind] ?? 'undetermined';
          const on = state === 'granted';
          const unavailable = state === 'unavailable';
          // Switching off, or back on after a firm no, happens outside the
          // app: the phone's Settings, or the browser's site controls.
          const change = (next: boolean) => {
            if (next && state !== 'denied') { void ask(kind); return; }
            if (Platform.OS === 'web') toast.show({ title: `${meta.label} is set by your browser`, body: OFF_HINT, icon: 'information-circle' });
            else void openPermissionSettings();
          };
          return (
            <Pressable
              key={kind}
              accessibilityRole="switch"
              accessibilityLabel={`${meta.label}, ${STATUS[state]}`}
              accessibilityHint={meta.why}
              accessibilityState={{ checked: on, disabled: unavailable }}
              disabled={unavailable}
              onPress={() => change(!on)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              {/* Icons stay muted whatever the answer: the switch already carries the green. */}
              <View style={[styles.lead, unavailable && styles.dim]}>
                <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.textMuted} />
              </View>
              {/* The hairline belongs to the words, so it starts past the icon, as in Settings. */}
              <View style={[styles.rowBody, i > 0 && styles.rowLine]}>
                <View style={[styles.rowText, unavailable && styles.dim]}>
                  <Text style={styles.label} numberOfLines={1}>
                    {meta.label}<Text style={styles.status}> · {STATUS[state]}</Text>
                  </Text>
                  <Text style={styles.why}>{meta.why}</Text>
                </View>
                <Toggle value={on} disabled={unavailable} accessibilityLabel={`${meta.label} ${on ? 'on' : 'off'}`} onChange={change} />
              </View>
            </Pressable>
          );
        })}
      </View>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // Quiet, the way Account and Privacy read: a flat grouped list a shade off
  // the page, with a hairline edge instead of a heavy border or a shadow.
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingLeft: spacing.lg },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  lead: { width: 22, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.md, paddingRight: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 2 },
  label: { ...typography.body, color: colors.text },
  status: { ...typography.small, color: colors.textFaint },
  why: { ...typography.small, lineHeight: 19, color: colors.textFaint },
  // Something this browser or phone cannot do at all reads as set aside, not broken.
  dim: { opacity: 0.5 },
  footnote: { ...typography.small, lineHeight: 19, color: colors.textFaint, paddingTop: spacing.sm, paddingHorizontal: spacing.lg },
});
