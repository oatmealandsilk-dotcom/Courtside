import React, { useCallback, useEffect, useRef } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/ui';
import type { TakedownReason } from '@/data/types';
import { TAKEDOWN_REASONS, asRuleThing, reasonLabel } from '@/features/moderation/reasons';
import { goBack } from '@/lib/goBack';
import { openLegal } from '@/lib/legal';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/** When these words last changed. */
const UPDATED = 'October 5, 2026';

/**
 * One part per reason an admin can give (src/features/moderation/reasons.ts),
 * in the same order and under the same name the author's notice uses, so
 * "Removed: Spam or scams" leads straight to "Spam or scams" here.
 */
const RULES: Record<TakedownReason, { lead: string; list?: string[]; after?: string }> = {
  harassment: {
    lead: 'Treat people the way you would on court. Don’t insult, threaten, shame or gang up on anyone.',
    list: [
      'Mocking someone’s body, game, looks or where they’re from',
      'Piling on in the comments, or getting others to',
      'Messaging someone again and again after they’ve stopped answering',
      'Sharing someone’s photo or clip to make fun of them',
    ],
  },
  hate: {
    lead: 'Don’t attack anyone for who they are: their race, ethnicity, religion, gender, sexual orientation, disability or where they come from.',
    list: [
      'Slurs and hateful names',
      'Jokes, memes or symbols meant to put a group down',
      'Saying a group of people is worth less than others',
    ],
  },
  sexual: {
    lead: 'Keep CourtSide something anyone could look at. No nudity or sexual content in posts, clips, Instants, comments or messages.',
    after: 'Anything that sexualizes someone under 18 is never allowed, and we report it to the authorities.',
  },
  violence: {
    lead: 'No threats, and nothing that encourages anyone to hurt themselves or someone else.',
    list: [
      'Threatening to hurt someone, even as a joke',
      'Showing people or animals being hurt',
      'Pointing a gun or another weapon at someone',
      'Cheering on fights or self-harm',
    ],
    after: 'If you or someone you know might be in danger, call your local emergency number.',
  },
  spam: {
    lead: 'Don’t try to trick people or flood their feeds.',
    list: [
      'Ads, fake offers and chain messages',
      'Links that lead somewhere other than they say',
      'Buying or selling followers, likes or views',
      'Fake accounts',
    ],
  },
  impersonation: {
    lead: 'Be yourself. Don’t pretend to be someone else, including a real coach, player or brand, and don’t post someone else’s photos as if they were you.',
    after: 'Each account is for one person: don’t share yours or use someone else’s.',
  },
  'minor-safety': {
    lead: 'Some people on CourtSide are teenagers, and keeping them safe comes first.',
    list: [
      'Adults must not seek private contact with teens they don’t know',
      'Never ask a teen for personal information or photos',
      'Don’t try to move a chat with a teen to another app',
      'Don’t share anything that puts someone under 18 at risk',
    ],
    after: 'If you’re a teen and someone makes you uncomfortable, block them, report them, and tell an adult you trust.',
  },
  other: {
    lead: 'A few rules come up less often. When something breaks one of these, it’s marked only “Removed for breaking our rules”:',
    list: [
      'Sharing someone’s private information, like their address, phone number, school, or photos of them they didn’t agree to share',
      'Posting other people’s footage, photos or music without their OK',
      'Anything illegal or dangerous',
      'Trying to break or misuse the app, or get into other people’s accounts',
    ],
  },
};

/** What happens to something taken down, as the app and the database actually do it (migrations 23, 108, 115 and 20261006000139). */
const AFTER: { icon: keyof typeof Ionicons.glyphMap; text: string; review?: true }[] = [
  { icon: 'eye-off-outline', text: 'Only you and CourtSide’s admins can still see it. It’s gone from feeds, profiles, search and shared links for everyone else, and so are the comments under it.' },
  { icon: 'archive-outline', text: 'Nothing is deleted. It stays on your profile, marked Removed, with the reason. You can still delete or archive it, but not edit it while it’s down.' },
  { icon: 'notifications-outline', text: 'You get a notice in the app (and on your phone, if notifications are on) saying what was removed and why.' },
  { icon: 'refresh-outline', review: true, text: 'You can ask for a review, once for each removal. A person on our team looks again and lets you know. If we got it wrong, it comes back exactly as it was.' },
  { icon: 'person-remove-outline', text: 'Breaking the rules again and again, or one serious break, can get an account suspended. A suspended account can’t post, comment, like, follow or send messages, and other people can’t see it.' },
];

/** Where each kind of thing is reported from (the same places Help and the Terms name). */
const REPORT: string[] = [
  'A post, clip or Instant: tap ••• and Report',
  'A profile: open it and tap ••• at the top',
  'A thread: tap the flag at the top',
  'A comment, reply or chat message: press and hold it',
  'A question to a coach: its ••• menu',
];

/** Every part a link can open at: a reason, what happens after, and how to report. */
type Anchor = TakedownReason | 'removed' | 'report';
const ANCHORS: Anchor[] = [...TAKEDOWN_REASONS.map((r) => r.code), 'removed', 'report'];
const asAnchor = (raw: unknown): Anchor | null => (typeof raw === 'string' && (ANCHORS as string[]).includes(raw) ? (raw as Anchor) : null);

/**
 * Community Guidelines (Oct 5, owner: "why was this removed. what rules.
 * should we have smth that explain the guidelines if someones post is
 * removed"): the rules in plain words, one part per reason an admin can give,
 * then what happens when something is removed and how to report. The same
 * look as the Terms page: a green title, a date, short parts under plain
 * headings. Open to anyone, signed in or not (publicPaths).
 *
 * Address: /guidelines, or /guidelines?rule=<reason>&what=<post|clip|…> from
 * "Why? See the rules" on something removed: the page opens at that rule,
 * marked "Why your post was removed". "Something else" (rule=other, also
 * what a removal from before reasons existed shows as) opens at the top,
 * which says what a plain "Removed for breaking our rules" means.
 * In a browser each part also has its own #id (#violence, #report…).
 */
export default function Guidelines() {
  const styles = useThemedStyles(styleDefinitions);
  // Asking for a review isn't on this database yet (known once your asks were read): the page doesn't promise it.
  const { reviewsOff } = useApp();
  const params = useLocalSearchParams<{ rule?: string; what?: string }>();
  const hash = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
  const rule = asAnchor(params.rule) ?? asAnchor(hash);
  const what = asRuleThing(params.what);
  // "Why your post was removed": only when a removed thing of yours sent you here.
  const why = what ? `Why your ${what} was removed` : null;
  // Something else opens at the top; every other part is scrolled to.
  const target = rule && rule !== 'other' ? rule : null;

  const scrollRef = useRef<ScrollView | null>(null);
  const tops = useRef<Partial<Record<Anchor, number>>>({});
  // Opened at the part asked for once; after that the page is yours to scroll.
  const jumped = useRef(false);
  const jump = useCallback((to: Anchor, animated: boolean) => {
    const y = tops.current[to];
    if (y === undefined) return false;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated });
    return true;
  }, []);
  const place = (id: Anchor) => (e: LayoutChangeEvent) => {
    tops.current[id] = e.nativeEvent.layout.y;
    // The part asked for, as soon as it has a place: after a frame, once the page has its height.
    if (id === target && !jumped.current) {
      jumped.current = true;
      requestAnimationFrame(() => { jump(id, false); });
    }
  };
  // A link that changes only its #part while the page is open (a browser).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onHash = () => { const to = asAnchor(window.location.hash.replace(/^#/, '')); if (to) jump(to, true); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [jump]);

  const bullets = (items: string[]) => (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item} style={styles.item}>
          <View style={styles.bullet} />
          <Text style={[styles.body, styles.itemText]}>{item}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Screen title="" onBack={() => goBack()} scrollRef={scrollRef} memoryKey={`guidelines:${rule ?? 'top'}`}>
      <View style={styles.page}>
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">Community Guidelines</Text>
          <Text style={styles.meta}>CourtSide · Last updated {UPDATED}</Text>
        </View>

        {rule === 'other' && why ? (
          // A plain "Removed for breaking our rules" explained, first thing.
          <View style={styles.callout}>
            <View style={styles.markRow}>
              <Ionicons name="eye-off-outline" size={13} color={colors.danger} />
              <Text style={styles.markText}>{why}</Text>
            </View>
            <Text style={styles.body}>
              “Removed for breaking our rules” means it broke one of the guidelines on this page. When the notice doesn’t name one, it’s usually one of the rules under{' '}
              <Text accessibilityRole="link" onPress={() => jump('other', true)} style={styles.inlineLink}>Something else</Text>.
            </Text>
            {reviewsOff ? null : <Text style={styles.calloutFine}>Think we got it wrong? Ask for a review from the {what} itself.</Text>}
          </View>
        ) : null}

        <Text style={styles.body}>
          CourtSide is for everyone who loves tennis, including players who are still at school. These guidelines are how we keep it a good place to share a clip, ask a question or find someone to hit with.
        </Text>
        <Text style={styles.body}>
          When something breaks one of them, we take it down and tell you which one. Here’s what each one means.
        </Text>

        {/* Each rule a tap away. */}
        <View style={styles.chips} accessibilityLabel="Jump to a rule">
          {TAKEDOWN_REASONS.map((r) => (
            <Pressable key={r.code} accessibilityRole="link" onPress={() => jump(r.code, true)} style={({ pressed }) => [styles.chip, r.code === target && styles.chipOn, pressed && styles.pressed]}>
              <Text style={[styles.chipText, r.code === target && styles.chipTextOn]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        {TAKEDOWN_REASONS.map((r) => {
          const part = RULES[r.code];
          const marked = r.code === target && !!why;
          return (
            <View key={r.code} nativeID={r.code} onLayout={place(r.code)} style={[styles.section, marked && styles.marked]}>
              {marked ? (
                <View style={styles.markRow}>
                  <Ionicons name="eye-off-outline" size={13} color={colors.danger} />
                  <Text style={styles.markText}>{why}</Text>
                </View>
              ) : null}
              <Text style={styles.h2} accessibilityRole="header">{reasonLabel(r.code)}</Text>
              <Text style={styles.body}>{part.lead}</Text>
              {part.list ? bullets(part.list) : null}
              {part.after ? <Text style={styles.body}>{part.after}</Text> : null}
            </View>
          );
        })}

        <View nativeID="removed" onLayout={place('removed')} style={[styles.section, styles.sectionBreak]}>
          <Text style={styles.h2} accessibilityRole="header">What happens when something is removed</Text>
          <View style={styles.steps}>
            {AFTER.filter((step) => !(step.review && reviewsOff)).map((step) => (
              <View key={step.text} style={styles.step}>
                <View style={styles.stepIcon}><Ionicons name={step.icon} size={16} color={colors.brand} /></View>
                <Text style={[styles.body, styles.stepText]}>{step.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View nativeID="report" onLayout={place('report')} style={styles.section}>
          <Text style={styles.h2} accessibilityRole="header">How to report</Text>
          <Text style={styles.body}>See something that breaks these rules? Report it. A person reviews every report within 24 hours, and the person you report is never told who reported them.</Text>
          {bullets(REPORT)}
          <Text style={styles.body}>You can also block or mute anyone. If someone might be in danger right now, call your local emergency number first.</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.fine}>
            These are the rules from our{' '}
            <Text accessibilityRole="link" onPress={() => openLegal('terms')} style={styles.fineLink}>Terms of Use</Text>
            , in plain words. Questions?{' '}
            <Text accessibilityRole="link" onPress={() => { void Linking.openURL('mailto:support@courtsidebase.com?subject=Community%20Guidelines'); }} style={styles.fineLink}>support@courtsidebase.com</Text>
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  // The Terms page's measure: one comfortable column, however wide the screen.
  page: { gap: spacing.md, maxWidth: 680, width: '100%', alignSelf: 'center', paddingTop: spacing.xs },
  head: { gap: 4, paddingBottom: spacing.sm },
  // The Terms page's title: the brand's green, large and close-set.
  title: { ...typography.display, ...font('600'), color: colors.brand },
  meta: { ...typography.small, color: colors.textMuted },
  body: { ...typography.body, color: colors.text, lineHeight: 23 },
  h2: { ...typography.heading, fontSize: 19, color: colors.text, marginBottom: 2 },
  section: { gap: spacing.sm, paddingTop: spacing.xl },
  sectionBreak: { marginTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // The rule a removal pointed to: lifted off the page, marked with why you are here.
  marked: { marginTop: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg, marginHorizontal: -spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  markText: { ...typography.smallStrong, color: colors.danger },
  list: { gap: 6, paddingLeft: 2 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemText: { flex: 1 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textFaint, marginTop: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.text, backgroundColor: colors.text },
  chipText: { ...typography.small, ...font('500'), color: colors.text },
  chipTextOn: { color: colors.bg },
  pressed: { opacity: 0.6 },
  callout: { gap: 6, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs },
  calloutFine: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  inlineLink: { ...font('600'), color: colors.brand, textDecorationLine: 'underline' },
  steps: { gap: spacing.md, paddingTop: 2 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDim },
  stepText: { flex: 1, paddingTop: 3 },
  footer: { paddingTop: spacing.xl, marginTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  fine: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  fineLink: { ...font('600'), color: colors.text, textDecorationLine: 'underline' },
});
