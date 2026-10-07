import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { CardWash, cardLook, type CardLook } from '@/components/session/SessionCard';
import { CountUp } from '@/components/session/CountUp';
import { Avatar } from '@/components/ui';
import type { AffiliateStats, Invitee } from '@/data/types';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { REWARDS, dollars, nextReward, notCountedReason, stepFill, wontCount } from './affiliate';

const shortDate = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** The earnings count up once per person per time the app is open, never on every visit. */
const played = new Set<string>();

/**
 * The Invites page for an affiliate (Oct 6, owner: "for affiliates their
 * screen looks kind ass to see their referrals"). Everyone else keeps the
 * plain Invite friends page; this is the same route, for the people on the
 * server's affiliates list (migration 147). Top to bottom:
 *
 * 1. What they have earned, big, in the session box's own colours (the same
 *    look and fade as the Tennis profile card on every court), with what has
 *    been paid and what is owed under it. The numbers are the ones Admin →
 *    Invites shows for them.
 * 2. The rewards ladder: three steps (the tee at 20, the performance tee at
 *    40, the hoodie and badge at 75), "N more to your CourtSide tee", and
 *    the rewards on rows, the ones reached ticked.
 * 3. Their link and code, with Share and Copy (the page's own actions).
 * 4. Their players: counted first, newest first, each with "Counted" or
 *    "Not counted yet" and, when it is theirs to know, the one plain reason.
 *
 * The page's ScrollView, the sheet and the actions belong to the page
 * (app/invite.tsx); this draws what is inside.
 */
export function AffiliateDashboard({ stats, people, peopleAsked, userId, handle, link, friendsOnly, copied, copiedCode, onShare, onCopy, onCopyCode, onOpen, tools }: {
  stats: AffiliateStats;
  /** Counted first, newest first; null while unknown. */
  people: Invitee[] | null;
  /** The list has been asked for and answered (or failed): null after this means it could not be fetched. */
  peopleAsked: boolean;
  userId: string;
  handle: string;
  link: string;
  /** A teen, or anyone not known to be an adult: told to send it to their friends, as the plain page says (no poster either; the page leaves it out of `tools`). */
  friendsOnly: boolean;
  copied: boolean;
  copiedCode: boolean;
  onShare: () => void;
  onCopy: () => void;
  onCopyCode: () => void;
  onOpen: (id: string) => void;
  /** Find friends from contacts, the club poster: the page's own rows. */
  tools?: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const counted = stats.qualified;
  return (
    <View style={styles.wrap}>
      <Earnings stats={stats} userId={userId} />
      <Rewards counted={counted} />

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Your link</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Copy your code, ${handle}`} hitSlop={6} onPress={onCopyCode} style={({ pressed }) => [styles.code, pressed && { opacity: 0.7 }]}>
            <Text style={styles.codeText} numberOfLines={1}>{copiedCode ? 'Copied' : `code: ${handle}`}</Text>
          </Pressable>
        </View>
        <Text style={styles.cardLead}>
          {friendsOnly ? 'Send it to your friends' : 'Share it anywhere'}, or they type <Text style={styles.strong}>{handle}</Text> at “Invited by?” when they sign up.
        </Text>
        <View style={styles.linkBox}>
          <Ionicons name="link-outline" size={16} color={colors.textMuted} />
          <Text style={styles.link} numberOfLines={1}>{link.replace('https://', '')}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Share your invite link" onPress={onShare} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
            <Ionicons name="paper-plane-outline" size={16} color={colors.brandInk} />
            <Text style={styles.primaryText}>Share link</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy your invite link" onPress={onCopy} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}>
            <Text style={styles.secondaryText}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        </View>
        {tools ? <View style={styles.tools}>{tools}</View> : null}
      </View>

      <People people={people} asked={peopleAsked} invited={stats.invited} counted={people ? people.filter((p) => p.countedAt).length : counted} onOpen={onOpen} />

      <View style={styles.foot}>
        <Text style={styles.footTitle}>What counts</Text>
        <Text style={styles.footText}>
          Someone counts when they join with your link or type {handle} at “Invited by?”, then come back another day to actually use the app. Fake or duplicate accounts never count.
        </Text>
      </View>
    </View>
  );
}

/** What they have made: the session box's look, the dollars big, paid and owed under them. */
function Earnings({ stats, userId }: { stats: AffiliateStats; userId: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  const look = cardLook(theme);
  const reduced = useReducedMotion();
  const key = `earned:${userId}`;
  // Decided once, on the first draw: a later redraw never starts it over.
  const [play] = useState(() => !reduced && !played.has(key));
  useEffect(() => { played.add(key); }, [key]);
  const whole = stats.earnedCents % 100 === 0;
  const lastPaid = stats.lastPaidAt ? shortDate(stats.lastPaidAt) : '';
  const spoken = `${dollars(stats.earnedCents)} earned from ${stats.qualified} counted ${stats.qualified === 1 ? 'player' : 'players'}. ${dollars(stats.paidCents)} paid, ${dollars(stats.owedCents)} owed. Paid every week${lastPaid ? `, last paid ${lastPaid}` : ''}.`;
  const cells: { key: string; figure: string; label: string }[] = [
    { key: 'paid', figure: dollars(stats.paidCents), label: 'Paid' },
    { key: 'owed', figure: dollars(stats.owedCents), label: 'Owed' },
    { key: 'counted', figure: String(stats.qualified), label: stats.qualified === 1 ? 'Player counted' : 'Players counted' },
  ];
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={spoken} style={[styles.hero, { backgroundColor: look.fill, borderColor: look.border }, look.dark && styles.bordered]}>
      <CardWash look={look} radius={20} />
      <View style={styles.heroHead}>
        <Text style={[styles.heroTitle, { color: look.ink }]}>Your earnings</Text>
        <BrandMark size={22} color={look.figure} />
      </View>
      <View style={styles.earnedRow}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.dollar, { color: look.figure }]}>$</Text>
        {whole ? (
          <CountUp value={stats.earnedCents / 100} play={play} duration={800} maxFontSizeMultiplier={1.3} style={[styles.figure, { color: look.figure }]} />
        ) : (
          <Text maxFontSizeMultiplier={1.3} style={[styles.figure, styles.tabular, { color: look.figure }]}>{(stats.earnedCents / 100).toFixed(2)}</Text>
        )}
        <Text maxFontSizeMultiplier={1.3} style={[styles.earnedWord, { color: look.ink }]}>earned</Text>
      </View>
      <Text style={[styles.heroLine, { color: look.muted }]}>
        {`$${stats.rateCents % 100 ? (stats.rateCents / 100).toFixed(2) : stats.rateCents / 100} for every real player · paid every week`}
      </Text>
      <Strip cells={cells} look={look} />
      {lastPaid ? <Text style={[styles.heroNote, { color: look.muted }]}>{`Last paid ${lastPaid}`}</Text> : null}
    </View>
  );
}

/** The box's numbers on hairlines, as the Tennis profile card sets its own. */
function Strip({ cells, look }: { cells: { key: string; figure: string; label: string }[]; look: CardLook }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.strip, { borderTopColor: look.lines }]}>
      {cells.map((c, i) => (
        <View key={c.key} style={[styles.cell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: look.lines, paddingLeft: 12 }]}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={[styles.cellFigure, styles.tabular, { color: look.figure }]}>{c.figure}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.cellLabel, { color: look.muted }]}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** The ladder to the next reward, and the rewards themselves. */
function Rewards({ counted }: { counted: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const next = nextReward(counted);
  const toGo = next ? next.at - counted : 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Rewards</Text>
        <Text style={styles.cardCount}>{next ? `${counted} of ${next.at}` : `${counted} players`}</Text>
      </View>
      <Text style={styles.nextLine}>{next ? `${toGo} more to your ${next.next}` : 'Every reward unlocked'}</Text>
      <View
        style={styles.ladder}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={next ? `${counted} counted. ${toGo} more to your ${next.next}.` : `${counted} counted. Every reward unlocked.`}
        accessibilityValue={{ now: Math.min(counted, REWARDS[REWARDS.length - 1].at), min: 0, max: REWARDS[REWARDS.length - 1].at }}
      >
        {REWARDS.map((r, i) => (
          <View key={r.at} style={styles.step}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(stepFill(counted, i) * 100)}%` }]} />
            </View>
            <Text style={[styles.stepAt, counted >= r.at && styles.stepAtOn]}>{r.at}</Text>
          </View>
        ))}
      </View>
      <View style={styles.rewardList}>
        {REWARDS.map((r, i) => {
          const got = counted >= r.at;
          const isNext = next?.at === r.at;
          return (
            <View key={r.at} style={[styles.reward, i > 0 && styles.rowLine]} accessible accessibilityLabel={`${r.name}, at ${r.at} players. ${got ? 'Unlocked' : isNext ? `${toGo} to go` : 'Not yet'}.`}>
              <View style={[styles.rewardIcon, got ? styles.rewardIconOn : isNext ? styles.rewardIconNext : null]}>
                <Ionicons name={r.icon} size={17} color={got ? colors.brandInk : isNext ? colors.brand : colors.textMuted} />
              </View>
              <View style={styles.rewardWords}>
                <Text style={styles.rewardName} numberOfLines={1}>{r.name}</Text>
                <Text style={styles.rewardAt}>{`${r.at} players`}</Text>
              </View>
              {got ? (
                <View style={styles.unlocked}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                  <Text style={styles.unlockedText}>Unlocked</Text>
                </View>
              ) : isNext ? (
                <Text style={styles.toGo}>{`${toGo} to go`}</Text>
              ) : null}
            </View>
          );
        })}
        <View style={[styles.reward, styles.rowLine]} accessible accessibilityLabel="A shoutout on @courtsidebase for the month's number one.">
          <View style={styles.rewardIcon}>
            <Ionicons name="megaphone-outline" size={17} color={colors.textMuted} />
          </View>
          <View style={styles.rewardWords}>
            <Text style={styles.rewardName} numberOfLines={1}>Shoutout on @courtsidebase</Text>
            <Text style={styles.rewardAt}>#1 of the month</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Their players, counted first: a row each, the status at the end of the name's line. */
function People({ people, asked, invited, counted, onOpen }: { people: Invitee[] | null; asked: boolean; invited: number; counted: number; onOpen: (id: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const list = people ?? [];
  // Still on its way (the earnings can come first): no "No one yet" for a moment before the list.
  // Could not be fetched: how many joined, from the earnings' own count, never "No one yet".
  const unknown = people === null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.cardTitle}>Your players</Text>
        {list.length ? <Text style={styles.cardCount}>{`${counted} of ${list.length} counted`}</Text> : null}
      </View>
      {unknown ? (
        asked && invited > 0 ? (
          <Text style={styles.unknown}>{`${invited} ${invited === 1 ? 'player has' : 'players have'} joined through you.`}</Text>
        ) : asked ? null : <View style={styles.waiting} />
      ) : list.length ? (
        <View style={styles.list}>
          {list.map((p, i) => {
            const name = p.name || `@${p.handle}`;
            const reason = notCountedReason(p);
            const status = p.countedAt ? 'Counted' : wontCount(p) ? 'Not counted' : 'Not counted yet';
            return (
              <Pressable
                key={p.id}
                accessibilityRole="link"
                accessibilityLabel={`${name}, ${status.toLowerCase()}${reason ? `. ${reason}` : ''}. Open profile`}
                onPress={() => onOpen(p.id)}
                style={({ pressed }) => [styles.person, pressed && styles.personPressed]}
              >
                <Avatar name={p.name || p.handle} seed={p.id} uri={p.avatarUrl} size={40} style={styles.personAvatar} />
                <View style={[styles.personBody, i > 0 && styles.rowLine]}>
                  <View style={styles.personTop}>
                    <Text style={styles.personName} numberOfLines={1}>{name}</Text>
                    {p.countedAt ? (
                      <View style={[styles.pill, styles.pillOn]}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
                        <Text style={styles.pillOnText}>Counted</Text>
                      </View>
                    ) : (
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{status}</Text>
                      </View>
                    )}
                  </View>
                  {/* The date first: on a small phone a long handle gives way, never the date. */}
                  <Text style={styles.personNote} numberOfLines={1}>{`Joined ${shortDate(p.joinedAt)}`}{p.name ? ` · @${p.handle}` : ''}</Text>
                  {reason ? (
                    <View style={styles.reasonRow}>
                      <Ionicons name={wontCount(p) ? 'close-circle-outline' : 'time-outline'} size={13} color={colors.textMuted} />
                      <Text style={styles.reason} numberOfLines={2}>{reason}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={[styles.card, styles.empty]}>
          <View style={styles.emptyIcon}><Ionicons name="people-outline" size={22} color={colors.brand} /></View>
          <Text style={styles.emptyTitle}>No one yet</Text>
          <Text style={styles.emptyText}>When someone joins with your link or code, they show up here.</Text>
        </View>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.lg },
  tabular: { fontVariant: ['tabular-nums'] },

  // The earnings box: the session box's shape (20 corners, its fade laid first).
  hero: { borderRadius: 20, padding: 20, overflow: 'hidden' },
  bordered: { borderWidth: 1 },
  heroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTitle: { ...font('600'), fontSize: 17, letterSpacing: -0.3 },
  // "$12 earned" as one lockup: the dollar sign small with its top on the figure's, the word on its baseline.
  earnedRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 18 },
  dollar: { ...font('600'), fontSize: 30, lineHeight: 34, letterSpacing: -0.8, alignSelf: 'flex-start', marginTop: 2, marginRight: 2 },
  figure: { ...font('600'), fontSize: 64, lineHeight: 64, letterSpacing: -3.4, marginVertical: -5, minWidth: 36 },
  earnedWord: { ...font('500'), fontSize: 19, lineHeight: 24, letterSpacing: -0.4, marginLeft: 8, marginBottom: 2 },
  heroLine: { ...font('400'), fontSize: 13, lineHeight: 19, marginTop: 10 },
  heroNote: { ...font('400'), fontSize: 12, lineHeight: 16, marginTop: 10 },
  strip: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  cell: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 2 },
  cellFigure: { ...font('600'), fontSize: 22, lineHeight: 26, letterSpacing: -1 },
  cellLabel: { ...font('400'), fontSize: 12, lineHeight: 16 },

  // A card on the sheet: the grouped list's (Archive, Change handle).
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, padding: spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cardTitle: { ...typography.heading, color: colors.text },
  cardCount: { ...typography.smallStrong, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  cardLead: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginTop: spacing.xs },
  strong: { ...font('600'), color: colors.text },

  nextLine: { ...typography.title, color: colors.text, marginTop: spacing.sm },
  ladder: { flexDirection: 'row', gap: 4, marginTop: spacing.md },
  step: { flex: 1, gap: 6 },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.brand },
  stepAt: { ...typography.small, color: colors.textMuted, textAlign: 'right', fontVariant: ['tabular-nums'] },
  stepAtOn: { ...font('600'), color: colors.text },
  rewardList: { marginTop: spacing.sm },
  reward: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rewardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  rewardIconNext: { backgroundColor: colors.brandDim },
  rewardIconOn: { backgroundColor: colors.brand },
  rewardWords: { flex: 1, minWidth: 0 },
  rewardName: { ...typography.bodyStrong, color: colors.text },
  rewardAt: { ...typography.small, color: colors.textMuted },
  unlocked: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unlockedText: { ...typography.smallStrong, color: colors.text },
  toGo: { ...typography.smallStrong, color: colors.textMuted, fontVariant: ['tabular-nums'] },

  linkBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginTop: spacing.md },
  link: { ...typography.small, color: colors.text, flex: 1 },
  code: { height: 30, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', maxWidth: '55%' },
  codeText: { ...typography.smallStrong, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  primary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: radius.pill, backgroundColor: colors.brand },
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
  secondary: { height: 46, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodyStrong, color: colors.text },
  tools: { marginTop: spacing.sm },

  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xs },
  list: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingLeft: spacing.lg },
  personPressed: { backgroundColor: colors.bgElevated },
  // Level with the name's line (the words carry the row's padding, so their hairline runs from the name).
  personAvatar: { marginTop: 12 },
  // The words own the hairline, so it runs from the name's left edge, not the picture's.
  personBody: { flex: 1, minWidth: 0, paddingVertical: 12, paddingRight: spacing.lg, gap: 1 },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  personName: { ...typography.bodyStrong, color: colors.text, flex: 1, minWidth: 0 },
  personNote: { ...typography.small, color: colors.textMuted },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  reason: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  // Not counted: an outline only, so on every court (Night's included) it never reads like the tinted "Counted".
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  pillText: { ...typography.smallStrong, color: colors.textMuted },
  // The check in the court's colour, the word in the text colour (Melbourne's blue falls short for small words).
  pillOn: { backgroundColor: colors.brandDim, borderColor: colors.brandDim, paddingLeft: 7 },
  pillOnText: { ...typography.smallStrong, color: colors.text },

  // The list's place while it is on its way: about one row, so the page does not jump far when it lands.
  waiting: { height: 64 },
  unknown: { ...typography.small, color: colors.textMuted, lineHeight: 19, paddingHorizontal: spacing.xs },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  emptyIcon: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  emptyTitle: { ...typography.heading, color: colors.text },
  emptyText: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },

  foot: { gap: spacing.xs, paddingHorizontal: spacing.xs },
  footTitle: { ...typography.smallStrong, color: colors.text },
  footText: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
});
