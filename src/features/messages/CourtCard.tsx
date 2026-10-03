import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtMapThumb } from '@/components/map/CourtMapThumb';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Tappable } from '@/components/Tappable';
import { nearestPlace } from '@/data/locations';
import type { Message } from '@/data/types';
import { formatMiles, milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import { colors, font, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/**
 * The card's width, and its map's height: a slim strip of map, so a court
 * reads as one line of the conversation rather than a page of its own.
 */
export const COURT_CARD_W = 248;
const MAP_H = 84;
/** A court further than this from the nearest city we know is not named after it. */
const CITY_MILES = 35;

/**
 * "Los Angeles · 6 courts · 1.2 mi": where the court is (the nearest city
 * the app knows, when it is close enough to say so), how many courts stand
 * there when the sender's list knew it, and how far it is from you when the
 * app knows where you are. Any part it cannot say is left out.
 */
export function courtLine(place: NonNullable<Message['place']>, from?: LatLng | null): string {
  const city = nearestPlace(place.lat, place.lng);
  const parts = [
    milesBetween(city, place) <= CITY_MILES ? city.name.split(',')[0] : null,
    place.count && place.count > 1 ? `${place.count} courts` : place.count === 1 ? '1 court' : null,
    from ? formatMiles(milesBetween(from, place)) : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * A court sent in a chat: a slim still map of the spot with the court's
 * badge on it, then the court's name and a quiet line under it beside a
 * chevron. The whole card opens the court's page. Sent and received look the same; the
 * row puts yours on the right. Its corners match the chat's bubbles: small
 * on the sender's side where it joins the message above or below in a run.
 */
export function CourtCard({ place, width = COURT_CARD_W, mine, tail, joinTop = false, from, sentAt, onPress, onLongPress }: {
  place: NonNullable<Message['place']>;
  /** Narrower on a small phone; the map is drawn at this width. */
  width?: number;
  mine: boolean;
  /** Joined to the next message, the same person's moments later: the corner below on the sender's side is small, like a bubble's. */
  tail: boolean;
  /** Joined to the message above it in a run: the corner on the sender's side is small there too. */
  joinTop?: boolean;
  /** Where you are, when the app knows (for the distance). */
  from?: LatLng | null;
  /** When it was sent ("9:41 AM"), for a screen reader. */
  sentAt?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const line = courtLine(place, from);
  return (
    <Tappable
      accessibilityRole="link"
      accessibilityLabel={`Court: ${place.name}${line ? `, ${line}` : ''}${sentAt ? `, sent ${sentAt}` : ''}. See the court`}
      scaleTo={0.98}
      hoverTo={1.01}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      style={[styles.card, { width }, tail && (mine ? styles.tailMine : styles.tailTheirs), joinTop && (mine ? styles.joinMine : styles.joinTheirs)]}
    >
      <View style={styles.map}>
        <CourtMapThumb lat={place.lat} lng={place.lng} width={width - 2} height={MAP_H} />
        {/* The court's own badge, on its spot, as the big map marks a court. */}
        <View pointerEvents="none" style={styles.pinWrap}>
          <View style={styles.halo} />
          <View style={styles.pin}><CourtGlyph size={12} color={colors.brandInk} /></View>
        </View>
        <Text pointerEvents="none" style={styles.credit}>© OpenStreetMap</Text>
      </View>
      <View style={styles.foot}>
        <View style={styles.words}>
          <Text style={styles.name} numberOfLines={1}>{place.name}</Text>
          {line ? <Text style={styles.line} numberOfLines={1}>{line}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </View>
    </Tappable>
  );
}

const styleDefinitions = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  tailMine: { borderBottomRightRadius: 5 },
  tailTheirs: { borderBottomLeftRadius: 5 },
  joinMine: { borderTopRightRadius: 5 },
  joinTheirs: { borderTopLeftRadius: 5 },
  map: { height: MAP_H, backgroundColor: colors.bgElevated, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 46, height: 46, borderRadius: 23, backgroundColor: `${colors.court}33` },
  pin: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.court, borderWidth: 2.5, borderColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  credit: { position: 'absolute', right: 6, bottom: 4, fontSize: 8, lineHeight: 10, color: colors.textFaint, opacity: 0.85 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, paddingRight: 10, paddingVertical: 9 },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.bodyStrong, ...font('600'), fontSize: 15, color: colors.text, lineHeight: 19 },
  line: { ...typography.small, fontSize: 12.5, lineHeight: 16, color: colors.textMuted },
});
