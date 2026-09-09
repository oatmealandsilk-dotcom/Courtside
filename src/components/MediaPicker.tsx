import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Field } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

export interface PickedMedia {
  /** Playable/displayable source. Undefined for the stubbed library tiles. */
  uri?: string;
  label: string;
  kind: 'photo' | 'video';
}

export interface MediaPickerProps {
  value: PickedMedia | null;
  onChange: (next: PickedMedia | null) => void;
}

/**
 * Native fallback: a stand-in camera roll. The web build (MediaPicker.web.tsx)
 * opens the real file picker instead. Both surface the same Instagram-shaped
 * flow — pick media first, write the caption after.
 */
const LIBRARY: PickedMedia[] = [
  { label: 'Cross-court rally · 0:24', kind: 'video' },
  { label: 'Serve, side angle · 0:18', kind: 'video' },
  { label: 'Match point · 0:41', kind: 'video' },
  { label: 'Court at golden hour', kind: 'photo' },
  { label: 'New string job', kind: 'photo' },
  { label: 'Backhand slice · 0:12', kind: 'video' },
];

export function MediaPicker({ value, onChange }: MediaPickerProps) {
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState('');

  if (value) {
    return (
      <View style={styles.preview}>
        <View style={styles.previewBody}>
          <Ionicons
            name={value.kind === 'video' ? 'videocam' : 'image'}
            size={30}
            color={colors.brand}
          />
          <Text style={styles.previewLabel} numberOfLines={2}>
            {value.label}
          </Text>
        </View>
        <Pressable
          onPress={() => onChange(null)}
          accessibilityRole="button"
          accessibilityLabel="Remove media"
          style={styles.remove}
        >
          <Ionicons name="close" size={18} color={colors.text} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Recents</Text>
        <Pressable onPress={() => setLinking((v) => !v)} accessibilityRole="button">
          <Text style={styles.link}>{linking ? 'Cancel' : 'Paste a link'}</Text>
        </Pressable>
      </View>

      {linking ? (
        <View style={styles.linkBox}>
          <Field
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            placeholder="https://…/your-video.mp4"
            hint="Direct HTTPS link to an MP4. Plays inline on phone and web."
          />
          <Pressable
            accessibilityRole="button"
            disabled={!/^https:\/\/\S+$/i.test(url.trim())}
            onPress={() => {
              onChange({ uri: url.trim(), label: 'Linked video', kind: 'video' });
              setLinking(false);
              setUrl('');
            }}
            style={[styles.useLink, !/^https:\/\/\S+$/i.test(url.trim()) && { opacity: 0.4 }]}
          >
            <Text style={styles.useLinkText}>Use this video</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grid}>
          {LIBRARY.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={`Select ${item.label}`}
              onPress={() => onChange(item)}
              style={styles.tile}
            >
              <Ionicons
                name={item.kind === 'video' ? 'play-circle' : 'image-outline'}
                size={26}
                color="#D8DECD"
              />
              <Text numberOfLines={2} style={styles.tileLabel}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { ...typography.smallStrong, color: colors.textMuted },
  link: { ...typography.smallStrong, color: colors.info },
  grid: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.xs },
  tile: {
    width: 108,
    height: 108,
    borderRadius: radius.md,
    backgroundColor: '#2A4030',
    padding: spacing.sm,
    justifyContent: 'space-between',
  },
  tileLabel: { fontSize: 10, lineHeight: 14, color: '#DCE2D2' },
  linkBox: { gap: spacing.md },
  useLink: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  useLinkText: { ...typography.smallStrong, color: colors.brandInk },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  previewBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewLabel: { ...typography.body, color: colors.text, flex: 1 },
  remove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
