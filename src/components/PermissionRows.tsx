import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

/** Live read of the three permissions, refreshed whenever the app comes back to the front. */
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

const WORD: Record<PermissionState, string> = {
  granted: 'On',
  denied: 'Off',
  undetermined: 'Not asked yet',
  unavailable: 'Not available here',
};

/** The three rows, each with its answer and a button to change it. */
export function PermissionRows({ only }: { only?: DevicePermission[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const { states, ask } = usePermissions();
  const kinds = only ?? ALL_PERMISSIONS;
  return (
    <View style={styles.list}>
      {kinds.map((kind, i) => {
        const meta = PERMISSION_META[kind];
        const state = states?.[kind] ?? 'undetermined';
        const on = state === 'granted';
        return (
          <View key={kind} style={[styles.row, i > 0 && styles.rowBorder]}>
            <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={21} color={on ? colors.brand : colors.textMuted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.label}>{meta.label}</Text>
              <Text style={styles.why}>{on ? meta.why : `${meta.why} ${WORD[state]}.`}</Text>
            </View>
            <Toggle
              value={on}
              disabled={state === 'unavailable'}
              accessibilityLabel={`${meta.label} ${on ? 'on' : 'off'}`}
              // Switching off, or back on after a firm no, happens outside the
              // app: the phone's Settings, or the browser's site controls.
              onChange={(next) => {
                if (next && state !== 'denied') { void ask(kind); return; }
                if (Platform.OS === 'web') toast.show({ title: `${meta.label} is set by your browser`, body: OFF_HINT, icon: 'information-circle' });
                else void openPermissionSettings();
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

/**
 * A strip for the top of a posting screen when what it needs is still off.
 * Tapping asks; if the phone has said no for good, it opens Settings.
 */
export function PermissionBanner({ needs }: { needs: DevicePermission[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const { states, ask } = usePermissions();
  if (!states) return null;
  const missing = needs.filter((k) => states[k] !== 'granted');
  if (!missing.length) return null;
  const first = missing[0];
  const names = missing.map((k) => PERMISSION_META[k].label).join(' and ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Allow ${names}`} onPress={() => ask(first)} style={styles.banner}>
      <Ionicons name="alert-circle" size={18} color={colors.warning} />
      <Text style={styles.bannerText}>{names} access is off. Tap to {states[first] === 'denied' ? 'open Settings' : 'allow'}.</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  list: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 56 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { ...typography.bodyStrong, color: colors.text },
  why: { ...typography.small, color: colors.textMuted },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.warning}66`, backgroundColor: colors.bgElevated,
    marginBottom: spacing.sm,
  },
  bannerText: { ...typography.small, color: colors.text, flex: 1 },
});
