import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';

import * as haptics from '@/lib/haptics';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing } from '@/theme';

const RECENT_KEY = 'courtside-recent-emoji';
const RECENT_MAX = 16;

/** Tennis first, then the faces, hands and hearts people actually reach for in a chat. */
const SECTIONS: { title: string; emoji: string[] }[] = [
  { title: 'Tennis', emoji: ['🎾', '🏆', '🥇', '🥈', '🥉', '🎯', '💪', '⚡️', '🔥', '👟', '🧢', '⏱️', '📍', '☀️', '🌧️', '🧊', '💧', '🩹', '🏃', '🧘', '🏋️', '🤸', '🍌', '🥤'] },
  { title: 'Faces', emoji: ['😂', '🤣', '😅', '😊', '😍', '🥹', '😎', '🤩', '😮', '😳', '🤯', '😭', '😢', '😤', '😡', '🥵', '🥶', '😴', '🤔', '🙃', '😬', '😏', '🫡', '🤐'] },
  { title: 'Hands', emoji: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '👊', '✊', '✌️', '🤞', '👋', '👌', '🤙', '👀', '🫶', '🤌'] },
  { title: 'Hearts and more', emoji: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '🎉', '🎊', '✨', '⭐️', '🚀', '✅', '❌'] },
];

/**
 * The emoji keyboard of a chat, the way WhatsApp and iMessage do it: it takes
 * the keyboard's place under the typing bar, at the keyboard's height, rather
 * than sitting on top of it. Your recent ones come first; a tap puts one where
 * the cursor is, without calling the keyboard back; the round key deletes, and
 * holding it keeps deleting.
 */
export function EmojiKeyboard({ height, bottomInset, onPick, onDelete }: {
  height: number; bottomInset: number; onPick: (emoji: string) => void;
  /** Deleting back from the box; without it (picking a reaction) there is no delete key. */
  onDelete?: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    void AsyncStorage.getItem(RECENT_KEY).then((raw) => { if (raw) setRecent(JSON.parse(raw) as string[]); }).catch(() => undefined);
  }, []);
  const pick = (emoji: string) => {
    haptics.tap();
    onPick(emoji);
    setRecent((was) => {
      const next = [emoji, ...was.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
      void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  };

  // Holding delete keeps deleting, like any keyboard.
  const repeat = useRef<{ wait?: ReturnType<typeof setTimeout>; every?: ReturnType<typeof setInterval> }>({});
  const stop = () => { clearTimeout(repeat.current.wait); clearInterval(repeat.current.every); repeat.current = {}; };
  useEffect(() => stop, []);
  const startDelete = () => {
    if (!onDelete) return;
    haptics.tap();
    onDelete();
    repeat.current.wait = setTimeout(() => { repeat.current.every = setInterval(onDelete, 90); }, 420);
  };

  const section = (title: string, emoji: string[]) => (
    <View key={title} style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.grid}>
        {emoji.map((e) => (
          <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Add ${e}`} onPress={() => pick(e)} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
            <Text style={styles.glyph}>{e}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.panel, { height: height + bottomInset }]}>
      <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 64 + bottomInset }}>
        {recent.length ? section('Recent', recent) : null}
        {SECTIONS.map((s) => section(s.title, s.emoji))}
      </ScrollView>
      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete"
          onPressIn={startDelete}
          onPressOut={stop}
          hitSlop={8}
          style={({ pressed }) => [styles.delete, { bottom: bottomInset + spacing.md }, pressed && styles.deletePressed]}
        >
          <Ionicons name="backspace-outline" size={22} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  panel: { backgroundColor: colors.bgElevated, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, overflow: 'hidden' },
  section: { paddingTop: spacing.md, paddingHorizontal: spacing.sm },
  title: { fontSize: 12, ...font('600'), color: colors.textFaint, paddingHorizontal: spacing.sm, paddingBottom: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Eight to a row, each an equal share of the width.
  key: { width: '12.5%', height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  keyPressed: { backgroundColor: colors.surfaceAlt },
  glyph: { fontSize: 28, lineHeight: 34 },
  delete: { position: 'absolute', right: spacing.lg, width: 52, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 4px 14px rgba(0, 0, 0, 0.14)' },
  deletePressed: { backgroundColor: colors.surfaceAlt },
});
