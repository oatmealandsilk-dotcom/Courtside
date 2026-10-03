import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CourtSpinner } from '@/components/CourtSpinner';
import { DragSheet } from '@/components/DragSheet';
import { SheetTitle } from '@/components/sheet/SheetForm';
import { EmptyState } from '@/components/ui';
import { labelOf, score } from '@/features/places/courtName';
import { useCourtSearch } from '@/features/places/useCourtSearch';
import { groupName, isGroupChat, othersIn } from '@/features/messages/groups';
import { courtRows, fetchCourts, type Court } from '@/features/players/courts';
import { formatMiles } from '@/features/players/geo';
import { plain } from '@/features/search/words';
import { homeFor } from '@/features/players/positions';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/**
 * Send a court in a chat: a sheet that rises over the chat (the chat stays
 * where it was underneath, so nothing in it moves), with the public courts
 * near you, nearest first (one row per park), and a search box that also
 * finds parks further away by name. Tap one and it goes into the chat as a
 * card with a little map, which opens the court's page, so everyone knows
 * where to meet; the sheet slides away as it lands.
 */
export default function PickCourt() {
  const styles = useThemedStyles(styleDefinitions);
  // `reply`: the message being answered in the chat when the court was picked; the court goes as its answer.
  const { conversation, reply } = useLocalSearchParams<{ conversation?: string; reply?: string }>();
  const { currentUser, currentUserId, conversations, users, detectedCoords, actions } = useApp();
  const home = useMemo(() => (currentUser ? homeFor(currentUser, detectedCoords) : null), [currentUser, detectedCoords]);
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [closeSignal, setCloseSignal] = useState(0);
  // (The sheet takes the keyboard down with it as it goes, so the chat it uncovers is already at rest.)
  const close = () => setCloseSignal((n) => n + 1);
  const sent = useRef(false);
  useEffect(() => {
    if (!home) return;
    let on = true;
    fetchCourts(home).then((list) => { if (on) setCourts(list); }).catch(() => { if (on) { setFailed(true); setCourts([]); } });
    return () => { on = false; };
  }, [home]);
  const term = plain(query);
  const nearby = useMemo(() => courtRows(courts ?? [], home), [courts, home]);
  // Two letters on, the courts loaded here and, a beat later, matching parks further away.
  const searched = useCourtSearch(query, home, courts ?? undefined, 40);
  const list = !term ? nearby
    : term.replace(/\s/g, '').length < 2 ? nearby.filter(({ c }) => score(labelOf(c), [term]) !== null)
      : searched;
  // Who it is going to, under the title: the group's name, or the person's first name.
  const chat = conversations.find((c) => c.id === conversation);
  const to = !chat ? undefined
    : isGroupChat(chat) ? groupName(chat, users, currentUserId)
      : othersIn(chat, users, currentUserId)[0]?.name.split(' ')[0];
  const send = (c: Court) => {
    if (!conversation || sent.current) return;
    sent.current = true;
    // The name as the map knows it, its id (so the card opens this court's
    // page) and how many courts stand there; the distance would be from
    // here, which means nothing to whoever reads it.
    actions.sendCourt(conversation, { id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng, count: c.count > 0 ? c.count : undefined }, reply || undefined);
    close();
  };
  return (
    <DragSheet
      fitContent
      closeSignal={closeSignal}
      peekFraction={0.7}
      onDismissed={() => goBack(conversation ? `/messages/${conversation}` : '/messages')}
      header={<SheetTitle title="Send a court" line={to ? `To ${to}` : 'Where to meet'} onClose={close} />}
    >
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search courts and parks"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            accessibilityLabel="Search courts"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={17} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {courts === null ? (
          <View style={styles.loading}><CourtSpinner size={28} /></View>
        ) : failed ? (
          <EmptyState icon="cloud-offline-outline" title="Couldn’t find courts" body="Check your connection and try again." />
        ) : list.length === 0 ? (
          <EmptyState icon="location-outline" title={term ? 'No courts by that name' : 'No courts found nearby'} body={term ? 'Try another word.' : 'Turn on Location in Settings for courts right where you are.'} />
        ) : (
          <>
            <Text style={styles.section}>{term ? 'Courts' : 'Nearby'}</Text>
            {list.slice(0, 40).map(({ c, miles }) => {
              const meta = [home ? formatMiles(miles) : null, c.count > 1 ? `${c.count} courts` : null, c.lit ? 'Lights' : null].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${labelOf(c)}${meta ? `, ${meta}` : ''}`}
                  onPress={() => send(c)}
                  style={(state) => [styles.row, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn]}
                >
                  <View style={styles.badge}><CourtGlyph size={13} color={colors.brandInk} /></View>
                  <View style={styles.words}>
                    <Text style={styles.name} numberOfLines={1}>{labelOf(c)}</Text>
                    {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
                  </View>
                  <View style={styles.sendPill}>
                    <Text style={styles.sendText}>Send</Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  searchRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 42, paddingHorizontal: 14,
    borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, minWidth: 0, ...typography.body, color: colors.text, outlineStyle: 'none' } as object,
  body: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xxl },
  loading: { paddingVertical: 48, alignItems: 'center' },
  section: { ...typography.caption, color: colors.textFaint, textTransform: 'uppercase', paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  // Rows like New message's list: a mark, two lines, a soft highlight under a finger or the mouse.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  rowOn: { backgroundColor: colors.surfaceAlt },
  // The court's badge, as the map marks a court.
  badge: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.court, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  words: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  sendPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  sendText: { ...typography.smallStrong, color: colors.text },
});
