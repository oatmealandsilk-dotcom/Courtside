import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { DragSheet } from '@/components/DragSheet';
import { Fine, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import type { HealthShareKey } from '@/data/types';
import { sourceLabel, statsSourceOf } from '@/features/activity/format';
import { HEALTH_LABEL, healthValue } from '@/features/activity/healthShare';
import { clearHealthShare, peekHealthShare } from '@/features/activity/healthSharePicker';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

/**
 * "Choose", beside "Share health data" in the composer: a tick for each
 * number this session's tracker has. Each tick goes straight back to the
 * post being written (its preview changes behind the sheet); unticking the
 * last one switches sharing off. The same sheet for every age. Opened with
 * nothing waiting for it (a reload), it just closes.
 */
export default function HealthShareSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const [request] = useState(() => peekHealthShare());
  const [ticked, setTicked] = useState<HealthShareKey[]>(request?.ticked ?? []);
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  useEffect(() => () => { if (request) clearHealthShare(request); }, [request]);
  const flip = (k: HealthShareKey) => {
    if (!request) return;
    const next = request.available.filter((x) => (x === k ? !ticked.includes(k) : ticked.includes(x)));
    setTicked(next);
    request.onChange(next);
  };
  // A tracker's numbers say whose they are ("Data by WHOOP"); ones you typed in have no one to name.
  const source = request?.activity.source ? sourceLabel(statsSourceOf({ source: request.activity.source, device: request.activity.device })) : '';
  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.5} header={<SheetTitle title="Share health data" line="Ticked numbers show on your post" onClose={close} />}>
      <ScrollView contentContainerStyle={formBody}>
        {request ? (
          <>
            <View style={styles.list}>
              {request.available.map((k, i) => {
                const on = ticked.includes(k);
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    accessibilityLabel={`${HEALTH_LABEL[k]}, ${healthValue(request.activity, k)}`}
                    onPress={() => flip(k)}
                    style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && styles.pressed]}
                  >
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.brand : colors.textFaint} />
                    <Text style={styles.label} numberOfLines={1}>{HEALTH_LABEL[k]}</Text>
                    <Text style={styles.value} numberOfLines={1}>{healthValue(request.activity, k)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Fine>{`Anyone who can see your post sees the ticked numbers. The rest stay private to you.${source ? ` ${source}.` : ''}`}</Fine>
            <Submit label="Done" onPress={close} />
          </>
        ) : (
          <Submit label="Close" onPress={close} />
        )}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  list: { marginTop: -spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  label: { ...typography.body, color: colors.text, flex: 1 },
  value: { ...font('500'), fontSize: 14, color: colors.textMuted, fontVariant: ['tabular-nums'], flexShrink: 0 },
});
