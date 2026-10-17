import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { CourtSpinner } from '@/components/CourtSpinner';
import { HitGlyph } from '@/components/HitGlyph';
import { Button } from '@/components/ui';
import { fetchPeekHits } from '@/data/api';
import type { PeekHit } from '@/data/types';
import { FORMAT_LABEL, hitShort, levelText } from '@/features/hits/format';
import { forgetShareTarget, rememberReferrer, rememberShareTarget } from '@/features/invite/referral';
import { formatSpotMiles } from '@/features/players/geo';
import { getPosition } from '@/lib/geo';
import { useGateSpace } from '@/lib/useGateSpace';
import { useApp } from '@/store/AppContext';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** Further than this, a hit is "further away", not "near you". */
const NEAR_KM = 40;

/** "today at 6pm", "tomorrow at 9am", "on Sat at 9am": for one sentence. */
function whenInWords(startsAt: string): string {
  const parts = hitShort(startsAt).split(' ');
  const time = parts.pop() ?? '';
  const day = parts.join(' ');
  return `${day === 'Today' ? 'today' : day === 'Tomorrow' ? 'tomorrow' : `on ${day}`} at ${time}`;
}

const spotsText = (n: number) => (n === 1 ? '1 spot left' : `${n} spots left`);

/**
 * The peek (owner, Oct 17: "for the Web version if people are gonna click
 * the link will they be able to find a hit immediately? ... would it be
 * better to have them be able to see all the hits available before they have
 * to make an account", then "Build the peek"): open hits coming up, for
 * someone with no account, straight from the website's "See open hits near
 * you". Soonest first; nearest first once they tap "Use my location" (asked
 * only then, never on arrival, and the spot is kept on this page only).
 *
 * Only what a stranger may see (peek_hits, migration 163): hits by public
 * adults, open to everyone, nobody but adults in them. Each card says when,
 * where, the level, the spots left and the host's first name, nothing more.
 * "I'm in" asks for a free account ("Make a free account to join Sam's hit
 * at 6pm"), and the app opens on that hit and joins it once they are in
 * (useShareLanding), or says honestly why it can't.
 */
export default function Peek() {
  const styles = useThemedStyles(styleDefinitions);
  const space = useGateSpace();
  const insets = useSafeAreaInsets();
  const { currentUserId, authResolved } = useApp();
  const { ref } = useLocalSearchParams<{ ref?: string }>();

  // Already signed in: the app itself has the hits, and you can join from there.
  useEffect(() => { if (authResolved && currentUserId) router.replace('/'); }, [authResolved, currentUserId]);
  // A link that carried someone's handle or code (?ref=) still credits them when this visitor signs up.
  useEffect(() => { if (ref) void rememberReferrer(String(ref)); }, [ref]);

  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [hits, setHits] = useState<PeekHit[] | null | undefined>(undefined);
  const [area, setArea] = useState<string | null>(null);
  const [asking, setAsking] = useState<PeekHit | null>(null);

  const load = useCallback((point: { lat: number; lng: number } | null) => {
    let live = true;
    setHits(undefined);
    fetchPeekHits(point, 30).then((got) => { if (live) setHits(got); }).catch(() => { if (live) setHits(null); });
    return () => { live = false; };
  }, []);
  useEffect(() => load(near), [near, load]);

  const locate = async () => {
    if (locating) return;
    setLocating(true);
    setLocNote(null);
    const got = await getPosition({}).catch(() => ({ ok: false as const, reason: 'unavailable' as const }));
    setLocating(false);
    if (got.ok) { setArea(null); setNear({ lat: got.lat, lng: got.lng }); return; }
    setLocNote(got.reason === 'denied' ? 'Location is off for this site, so here are the soonest hits instead.' : 'Couldn’t find where you are. Here are the soonest hits instead.');
  };

  // Towns to pick from, built from the hits themselves (most hits first).
  const areas = useMemo(() => {
    const count = new Map<string, number>();
    (hits ?? []).forEach((h) => { if (h.court.area) count.set(h.court.area, (count.get(h.court.area) ?? 0) + 1); });
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a).slice(0, 8);
  }, [hits]);
  const shown = useMemo(() => (hits ?? []).filter((h) => !area || h.court.area === area), [hits, area]);
  const nearHits = near ? shown.filter((h) => h.km !== undefined && h.km <= NEAR_KM) : shown;
  const farHits = near ? shown.filter((h) => h.km === undefined || h.km > NEAR_KM) : [];

  const signUp = async (hit: PeekHit | null, create: boolean) => {
    if (hit) {
      await rememberShareTarget(`/hit-request/${hit.id}`, hit.id, {
        label: `Make a free account to join ${hit.hostFirst}’s hit ${whenInWords(hit.startsAt)}`,
        host: hit.hostFirst,
      });
    } else {
      // Signing up without "I'm in" joins nothing: an earlier "I'm in" they
      // walked away from is dropped here (review, Oct 17).
      await forgetShareTarget();
    }
    router.push({ pathname: '/sign-in', params: { mode: create ? 'create' : 'sign-in' } });
  };

  const loading = hits === undefined;
  const nothing = !loading && hits !== null && hits.length === 0;
  const noneNear = !loading && !!near && nearHits.length === 0 && farHits.length > 0;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: space.top - spacing.md, paddingBottom: 150 + insets.bottom }]}>
        <View style={styles.column}>
          <View style={styles.bar}>
            <View style={styles.brand}>
              <BrandMark size={26} />
              <Text style={styles.wordmark}>CourtSide</Text>
            </View>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { void signUp(null, false); }}>
              <Text style={styles.signIn}>Sign in</Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <View style={styles.eyebrowRow}>
              <HitGlyph size={15} color={colors.brand} />
              <Text style={styles.eyebrow}>Open hits · next 7 days</Text>
            </View>
            <Text style={styles.title}>Open hits near you</Text>
            <Text style={styles.lede}>Players looking for someone to hit with. See one that fits? Tap I’m in.</Text>
          </View>

          <View style={styles.tools}>
            {near ? (
              <View style={[styles.pill, styles.pillOn]}>
                <Ionicons name="navigate" size={14} color={colors.brand} />
                <Text style={[styles.pillText, styles.pillOnText]}>Nearest first</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Stop using my location" hitSlop={10} onPress={() => setNear(null)}>
                  <Ionicons name="close" size={15} color={colors.brand} />
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => { void locate(); }} disabled={locating} style={({ pressed }) => [styles.pill, styles.locate, pressed && styles.pressed]}>
                <Ionicons name="navigate-outline" size={15} color={colors.brandInk} />
                <Text style={[styles.pillText, styles.locateText]}>{locating ? 'Finding you…' : 'Use my location'}</Text>
              </Pressable>
            )}
            {!near && areas.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areas}>
                {[null, ...areas].map((a) => (
                  <Pressable key={a ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: area === a }} onPress={() => setArea(a)} style={[styles.pill, area === a && styles.pillOn]}>
                    <Text style={[styles.pillText, area === a && styles.pillOnText]}>{a ?? 'Everywhere'}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
          {locNote ? <Text style={styles.note}>{locNote}</Text> : null}

          {loading ? (
            <View style={styles.loading}><CourtSpinner size={32} /></View>
          ) : hits === null ? (
            <View style={[styles.card, styles.empty]}>
              <Ionicons name="cloud-offline-outline" size={26} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Couldn’t load the hits</Text>
              <Text style={styles.emptyBody}>Check your connection and try again.</Text>
              <Button label="Try again" variant="secondary" size="sm" onPress={() => load(near)} />
            </View>
          ) : nothing || noneNear ? (
            <Animated.View entering={FadeIn.duration(260)} style={[styles.card, styles.empty]}>
              <View style={styles.emptyIcon}><HitGlyph size={24} color={colors.brand} /></View>
              <Text style={styles.emptyTitle}>No open hits near you yet</Text>
              <Text style={styles.emptyBody}>Be the first to post one. Players near you see it straight away.</Text>
              {/* Posting needs an account: this opens sign-up (the bar below says the same in words). */}
              <Button label="Post the first hit" onPress={() => { void signUp(null, true); }} />
            </Animated.View>
          ) : null}

          {!loading && nearHits.length ? (
            <View style={styles.list}>
              {nearHits.map((h, i) => <HitCard key={h.id} hit={h} index={i} onJoin={() => setAsking(h)} />)}
            </View>
          ) : null}

          {!loading && farHits.length ? (
            <View style={styles.list}>
              <Text style={styles.section}>{noneNear ? 'Nearest open hits' : 'Further away'}</Text>
              {farHits.map((h, i) => <HitCard key={h.id} hit={h} index={i} onJoin={() => setAsking(h)} />)}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Always in reach: a free account, whatever they are looking at. */}
      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.stickyInner}>
          <Button label="Create a free account" full onPress={() => { void signUp(null, true); }} />
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { void signUp(null, false); }} style={styles.already}>
            <Text style={styles.alreadyText}>Already on CourtSide? <Text style={styles.alreadyLink}>Sign in</Text></Text>
          </Pressable>
        </View>
      </View>

      {asking ? <JoinPrompt hit={asking} onClose={() => { setAsking(null); void forgetShareTarget(); }} onGo={(create) => { void signUp(asking, create); }} /> : null}
    </View>
  );
}

function HitCard({ hit, index, onJoin }: { hit: PeekHit; index: number; onJoin: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const where = [hit.court.area, hit.km !== undefined ? formatSpotMiles(hit.km / 1.609, true) : ''].filter(Boolean).join(' · ');
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(320)} style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.when}>{hitShort(hit.startsAt)}</Text>
        <View style={styles.spots}><Text style={styles.spotsText}>{spotsText(hit.spotsLeft)}</Text></View>
      </View>
      <View style={styles.placeRow}>
        <Ionicons name="location-outline" size={16} color={colors.textMuted} />
        <Text style={styles.place} numberOfLines={2}>{hit.court.name}</Text>
      </View>
      {where ? <Text style={styles.where}>{where}</Text> : null}
      <View style={styles.chips}>
        <View style={styles.chip}><Text style={styles.chipText}>{FORMAT_LABEL[hit.format]}</Text></View>
        <View style={styles.chip}><Text style={styles.chipText}>{levelText(hit, hit.skillSystem)}</Text></View>
      </View>
      <View style={styles.divider} />
      <View style={styles.cardFoot}>
        <Text style={styles.host} numberOfLines={1}><Text style={styles.hostName}>{hit.hostFirst}</Text> is looking for a hit</Text>
        <Button label="I'm in" size="sm" onPress={onJoin} />
      </View>
    </Animated.View>
  );
}

/** "Make a free account to join Sam's hit at 6pm": the one ask, over the list. */
function JoinPrompt({ hit, onClose, onGo }: { hit: PeekHit; onClose: () => void; onGo: (create: boolean) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.dim]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(280)} style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={styles.sheetInner}>
          <View style={styles.sheetIcon}><HitGlyph size={22} color={colors.brand} /></View>
          <Text style={styles.sheetTitle}>Make a free account to join {hit.hostFirst}’s hit {whenInWords(hit.startsAt)}</Text>
          <Text style={styles.sheetBody}>{hit.court.name} · {FORMAT_LABEL[hit.format]} · {spotsText(hit.spotsLeft)}</Text>
          <Text style={styles.sheetNote}>It takes a minute. Once you’re in, the app opens on this hit and joins it for you. Add your birthday when you sign up: hits with players you don’t follow yet are for players 18 and over.</Text>
          <Button label="Create a free account" full onPress={() => onGo(true)} />
          <Button label="I already have an account" variant="secondary" full onPress={() => onGo(false)} />
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={styles.already}>
            <Text style={styles.alreadyText}>Not now</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg },
  column: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing.lg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wordmark: { fontSize: 20, ...font('700'), color: colors.brand, letterSpacing: -0.6 },
  signIn: { ...typography.bodyStrong, color: colors.brand },
  hero: { gap: spacing.sm, paddingTop: spacing.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { ...typography.caption, color: colors.brand, textTransform: 'uppercase' },
  title: { ...typography.display, fontSize: 34, letterSpacing: -1.2, color: colors.text },
  lede: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  tools: { gap: spacing.sm },
  areas: { gap: spacing.sm, paddingRight: spacing.lg },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pillText: { ...typography.smallStrong, color: colors.textMuted },
  pillOn: { backgroundColor: colors.brandDim, borderColor: colors.brandDim },
  pillOnText: { color: colors.brand },
  locate: { backgroundColor: colors.brand, borderColor: colors.brand, paddingHorizontal: 16 },
  locateText: { color: colors.brandInk },
  pressed: { opacity: 0.85 },
  note: { ...typography.small, color: colors.textMuted, marginTop: -spacing.sm },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  list: { gap: spacing.md },
  section: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...lift },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  when: { ...typography.title, color: colors.text, flexShrink: 1 },
  spots: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  spotsText: { ...typography.smallStrong, color: colors.brand },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  place: { ...typography.heading, color: colors.text, flexShrink: 1 },
  where: { ...typography.small, color: colors.textMuted, marginTop: -4, marginLeft: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipText: { ...typography.smallStrong, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 2 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  host: { ...typography.small, color: colors.textMuted, flex: 1 },
  hostName: { ...typography.smallStrong, color: colors.text },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  emptyBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 300 },
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stickyInner: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing.xs },
  already: { alignSelf: 'center', paddingVertical: spacing.xs },
  alreadyText: { ...typography.small, color: colors.textMuted },
  alreadyLink: { ...typography.smallStrong, color: colors.brand },
  dim: { backgroundColor: colors.overlay },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.xl, paddingHorizontal: spacing.lg, ...lift },
  sheetInner: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.md },
  sheetIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { ...typography.title, color: colors.text },
  sheetBody: { ...typography.bodyStrong, color: colors.text },
  sheetNote: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
});
