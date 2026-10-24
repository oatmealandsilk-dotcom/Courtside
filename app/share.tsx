import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { TextBox } from '@/components/ui/TextBox';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { DragSheet } from '@/components/DragSheet';
import { HitGlyph } from '@/components/HitGlyph';
import { copyLink, shareOutside, shareToWhatsApp } from '@/lib/shareOutside';
import { Avatar, Button, quietTintFor } from '@/components/ui';
import { initials } from '@/lib/format';
import type { ShareItem, User } from '@/data/types';
import { isLocalMedia } from '@/data/remote';
import { GroupAvatar, groupName, isDirectChat, isGroupChat, othersIn } from '@/features/messages/groups';
import { hitWhen } from '@/features/hits/format';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, font, radius, spacing, typography } from '@/theme';
import { TextScale, oneLine } from '@/theme/textScale';
import { courtLink, shareLink } from '@/lib/shareLink';
import { courtShareText, hitShareText, postShareText, profileShareText, questionShareText } from '@/features/share/shareText';
import { isMapCourtId } from '@/features/places/courtName';
import { corner } from '@/theme/look';

/**
 * Instagram's Send sheet, CourtSide's way (Oct 22, owner picked B): a
 * "Send to" title with a round close, one quiet line saying what is being
 * sent, a search, and one grid of faces three across (your recent chats
 * first, groups and hit chats included, then people) with a tick on each
 * pick. Search finds people by name or @handle and groups by their name or
 * anyone in them. Nobody picked: a row of round ways out of the app (Copy
 * link, WhatsApp, More = the phone's own share sheet). Someone picked: a
 * message box and Send, which puts the item in every chat picked: each group
 * gets it in the group, each person in your one-to-one chat with them.
 *
 * It sends a post, a thread, a profile, a "Looking for a hit", a court
 * (`?kind=court&name=&lat=&lng=`) or, from a held message, the message itself
 * (`?kind=message&id=`, which reads "Forward to", with no ways out: a
 * message is private).
 */

/**
 * The most chats one Send goes to. Each chat gets the item and maybe a note,
 * and the server takes 30 messages a minute from one person (migration 36),
 * so 15 always goes through in one go.
 */
const MAX_PICKS = 15;
/** How many of each list show before you search. */
const RECENT_SHOWN = 16;
const PEOPLE_SHOWN = 40;
/** Faces this big, always three across. */
const FACE = 64;
/** The message box: one line (40 high) growing to four as you type. */
const NOTE_MIN = 40;
const NOTE_MAX = 104;

type Kind = 'post' | 'question' | 'profile' | 'hit-request' | 'court' | 'message';
const KINDS: Kind[] = ['post', 'question', 'profile', 'hit-request', 'court', 'message'];

/**
 * Somewhere to send it. `c:<id>` is a group, by its chat; `u:<id>` is a
 * person, whose one-to-one chat it lands in (made if there is none yet), so
 * someone you already talk to is never listed twice.
 */
interface Target {
  key: string;
  name: string;
  /** Everything a search may match, in lower case. */
  words: string;
  /** A person: their face. */
  user?: User;
  /** A group: who else is in it, and its photo. */
  people?: User[];
  photoUrl?: string;
  /** Someone who only gets messages from people they follow, and doesn't follow you. */
  locked?: boolean;
}

export default function ShareSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ kind?: string; id?: string; name?: string; lat?: string; lng?: string }>();
  // Anything unknown is read as a post, the way every older link to this sheet meant it.
  const kind: Kind = KINDS.includes(params.kind as Kind) ? (params.kind as Kind) : 'post';
  const id = params.id ?? '';

  const { users, posts, questions, hitRequests, messages, conversations, currentUserId, blockedIds, followingIds, feedGroups, actions } = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [sent, setSent] = useState(false);
  // The note is checked for refused words before anything goes (a quick second tap would ask twice).
  const [checking, setChecking] = useState(false);
  const [fallbackNote, setFallbackNote] = useState('');
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const [noteHeight, setNoteHeight] = useState(0);

  // The card itself (rise, dim, drag handle) is DragSheet's; this only asks it to close.
  const [closeSignal, setCloseSignal] = useState(0);
  const dismiss = () => setCloseSignal((n) => n + 1);

  /**
   * What is being sent: the item the store sends, a line saying what it is
   * (shown at the top so you know), its icon, and its link for sharing
   * outside the app (a forwarded message is private, so it has none).
   */
  const sending = useMemo((): { item: ShareItem; label: string; icon: React.ReactNode; outside?: { title: string; url: string } } | null => {
    const glyph = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={20} color={colors.brand} />;
    // Your handle rides on every link you share, so whoever joins through it is counted as yours.
    const me = users.find((u) => u.id === currentUserId);
    if (kind === 'post') {
      const post = posts.find((p) => p.id === id);
      if (!post) return null;
      const label = post.body.trim() || (post.kind === 'clip' ? 'A clip' : 'A post');
      // Shared to a group only: it never leaves the group, so there is no link to share outside (the server locks it too, migration 68).
      const outside = post.groupId ? undefined : { title: postShareText(post, users.find((u) => u.id === post.authorId), currentUserId), url: shareLink('post', id, me?.handle) };
      return { item: { kind: 'post', id }, label, icon: glyph(post.kind === 'clip' ? 'play-circle-outline' : 'image-outline'), outside };
    }
    if (kind === 'question') {
      const question = questions.find((q) => q.id === id);
      if (!question) return null;
      return { item: { kind: 'question', id }, label: question.title, icon: glyph('chatbubbles-outline'), outside: { title: questionShareText(question), url: shareLink('question', id, me?.handle) } };
    }
    if (kind === 'profile') {
      const user = users.find((u) => u.id === id);
      if (!user) return null;
      return { item: { kind: 'profile', id }, label: `${user.name} · @${user.handle}`, icon: glyph('person-outline'), outside: { title: profileShareText(user, currentUserId), url: shareLink('profile', id, me?.handle) } };
    }
    if (kind === 'hit-request') {
      // A hit that was called off can't be sent on.
      const hit = hitRequests.find((h) => h.id === id && !h.cancelled);
      if (!hit) return null;
      const label = `Looking for a hit · ${hitWhen(hit.startsAt)} · ${hit.place.name}`;
      return { item: { kind: 'hit-request', id }, label, icon: <HitGlyph size={20} color={colors.brand} />, outside: { title: hitShareText(hit, users.find((u) => u.id === hit.authorId), currentUserId), url: shareLink('hit-request', id, me?.handle) } };
    }
    if (kind === 'court') {
      const name = params.name?.trim();
      const lat = Number(params.lat);
      const lng = Number(params.lng);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      // The court's map id travels with it when it has one, so the chat's card opens that court's page.
      // Outside the app, a court the map knows is its own page (anyone can open it, signed in or not); any other spot is a maps link.
      const place = { id: isMapCourtId(id) ? id : undefined, name, lat, lng };
      return { item: { kind: 'court', place }, label: name, icon: glyph('location-outline'), outside: { title: courtShareText(name), url: courtLink(place, me?.handle) } };
    }
    // A message, forwarded as it is. An event line ("Mira added Dev") is not one anyone sent,
    // and a voice note still only on this phone (its upload failed) can't be heard anywhere else.
    // Photos too: they sit on their own chat's private shelf, so they can't be passed on (yet).
    const message = messages.find((m) => m.id === id);
    if (!message || message.kind === 'system' || message.kind === 'photo' || isLocalMedia(message.audio?.url)) return null;
    const shared = message.sharedId;
    const label = message.kind === 'voice' ? 'Voice message'
      : message.kind === 'court' ? `Court · ${message.place?.name ?? message.body}`
      : message.kind === 'post' ? (posts.find((p) => p.id === shared)?.body.trim() || 'A clip')
      : message.kind === 'question' ? (questions.find((q) => q.id === shared)?.title ?? 'A thread')
      : message.kind === 'profile' ? (users.find((u) => u.id === shared)?.name ?? 'A profile')
      : message.kind === 'hit-request' ? 'Looking for a hit'
      : message.body;
    return { item: { kind: 'message', id }, label, icon: glyph('arrow-redo-outline') };
  }, [kind, id, params.name, params.lat, params.lng, posts, questions, users, hitRequests, messages, currentUserId]);

  const term = search.trim().replace(/^@/, '').toLowerCase();

  // A post shared to a group only goes only to people in that group: a chat
  // with anyone else is not offered (they could not open it anyway).
  const groupOnly = kind === 'post' ? posts.find((p) => p.id === id)?.groupId : undefined;
  const members = useMemo(() => (groupOnly ? new Set((feedGroups.find((g) => g.id === groupOnly)?.members ?? []).map((m) => m.id)) : null), [groupOnly, feedGroups]);
  // Opened before your groups were read (a notification, a link): read them, so its members are listed.
  useEffect(() => { if (groupOnly && currentUserId && !feedGroups.some((g) => g.id === groupOnly)) void actions.loadFeedGroups().catch(() => undefined); }, [groupOnly, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Your chats, newest first: every group you are in, and the people you
   * have actually talked to. Someone you blocked is left out (a group they
   * are in stays: both of you can still write there).
   */
  const recent = useMemo((): Target[] => {
    if (!currentUserId) return [];
    const list: Target[] = [];
    const seen = new Set<string>();
    for (const c of [...conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
      if (!c.participantIds.includes(currentUserId)) continue;
      if (members && !c.participantIds.every((p) => p === currentUserId || members.has(p))) continue;
      if (isGroupChat(c)) {
        const people = othersIn(c, users, currentUserId);
        const name = groupName(c, users, currentUserId);
        list.push({ key: `c:${c.id}`, name, people, photoUrl: c.photoUrl, words: `${name} ${people.map((p) => `${p.name} ${p.handle}`).join(' ')}`.toLowerCase() });
        continue;
      }
      if (!isDirectChat(c) || !c.messageIds.length) continue;
      const other = users.find((u) => u.id !== currentUserId && c.participantIds.includes(u.id));
      if (!other || blockedIds.includes(other.id) || seen.has(other.id)) continue;
      seen.add(other.id);
      list.push({ key: `u:${other.id}`, name: other.name, user: other, words: `${other.name} ${other.handle}`.toLowerCase() });
    }
    return list;
  }, [conversations, users, currentUserId, blockedIds, members]);

  /**
   * Everyone else: people you follow first, then the rest by name. Someone
   * who only gets messages from people they follow (a teen account), and
   * doesn't follow you, shows but can't be picked.
   */
  const people = useMemo((): Target[] => {
    const inRecent = new Set(recent.map((t) => t.key));
    return users
      .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id) && !inRecent.has(`u:${u.id}`) && (!members || members.has(u.id)))
      .sort((a, b) => Number(followingIds.includes(b.id)) - Number(followingIds.includes(a.id)) || a.name.localeCompare(b.name))
      .map((u) => ({ key: `u:${u.id}`, name: u.name, user: u, words: `${u.name} ${u.handle}`.toLowerCase() }));
  }, [users, currentUserId, blockedIds, followingIds, recent, members]);

  /**
   * What shows: what matches the search, or the top of each list. A chat
   * picked from a search stays in view at the front of its list after the
   * search clears, so every tick can be seen and taken off again.
   */
  const shown = (list: Target[], max: number) => {
    if (term) return list.filter((t) => t.words.includes(term)).slice(0, 60);
    const top = list.slice(0, max);
    const pickedElsewhere = list.slice(max).filter((t) => selected.includes(t.key));
    return [...pickedElsewhere, ...top];
  };
  const recentShown = shown(recent, RECENT_SHOWN);
  // Locks only for the people on screen: whether someone can be messaged is
  // asked of the server person by person (migration 64), never for everyone.
  const peopleShown = shown(people, PEOPLE_SHOWN).map((t) => ({ ...t, locked: !!t.user && !actions.canMessage(t.user.id) }));

  const toggle = (target: Target) => {
    if (selected.includes(target.key)) { setSelected((prev) => prev.filter((x) => x !== target.key)); return; }
    if (target.locked) {
      showToast({ title: `Only people ${target.name.split(' ')[0]} follows can message them`, icon: 'lock-closed-outline' });
      return;
    }
    if (selected.length >= MAX_PICKS) {
      showToast({ title: `You can send to up to ${MAX_PICKS} chats at once`, icon: 'paper-plane-outline' });
      return;
    }
    haptics.tap();
    setSelected((prev) => [...prev, target.key]);
    // Picked from a search: back to the full list, with the pick at its front.
    if (term) setSearch('');
  };

  const send = async () => {
    if (!selected.length || !sending || sent || checking) return;
    // A note with words CourtSide refuses (migration 117) is said here, before
    // anything goes: the sheet stays open with the note, to change and send.
    if (note.trim()) {
      setChecking(true);
      const refused = await actions.wordsRefused([note]);
      setChecking(false);
      if (refused) {
        haptics.reject();
        showToast({ title: 'Not sent', body: 'Your message has words that break CourtSide’s rules. Change them and send again.', icon: 'alert-circle-outline', long: true });
        return;
      }
    }
    actions.shareToChats(
      {
        conversationIds: selected.filter((k) => k.startsWith('c:')).map((k) => k.slice(2)),
        userIds: selected.filter((k) => k.startsWith('u:')).map((k) => k.slice(2)),
      },
      sending.item,
      note,
    );
    haptics.reward();
    setSent(true);
    // The way Instagram does it: the button says Sent, the sheet goes, and a
    // small note names who got it. (A big tick used to spring up over the
    // middle of the sheet, landing on top of the faces and their names.)
    // A person by first name; a group by its whole name ("Saturday hitters", not "Saturday").
    const names = selected.map((k) => { const name = [...recent, ...people].find((t) => t.key === k)?.name; return k.startsWith('u:') ? name?.split(' ')[0] : name; }).filter(Boolean);
    const to = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} chats`;
    setTimeout(() => {
      dismiss();
      showToast({ title: to ? `Sent to ${to}` : 'Sent', icon: 'paper-plane-outline' });
    }, 350);
  };


  const outside = sending?.outside;
  const shareOut = async () => {
    if (!outside) return;
    try { setFallbackNote((await shareOutside(outside.title, outside.url)) ?? ''); }
    catch { setFallbackNote(`Share this link: ${outside.url}`); }
  };
  const copy = async () => {
    if (!outside) return;
    if (await copyLink(outside.url)) { haptics.tap(); showToast({ title: 'Link copied', icon: 'link-outline' }); }
    else setFallbackNote(`Share this link: ${outside.url}`);
  };
  const whatsApp = () => {
    if (!outside) return;
    shareToWhatsApp(`${outside.title} ${outside.url}`).catch(() => setFallbackNote(`Share this link: ${outside.url}`));
  };
  const outsideActions: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; run: () => void }[] = outside ? [
    { key: 'copy', label: 'Copy link', icon: 'link-outline', run: () => { void copy(); } },
    { key: 'wa', label: 'WhatsApp', icon: 'logo-whatsapp', run: whatsApp },
    { key: 'more', label: 'More', icon: 'ellipsis-horizontal', run: () => { void shareOut(); } },
  ] : [];

  // Three across, whatever the width (a phone, or a computer's box).
  const width = gridWidth || Math.min(windowWidth, 520) - spacing.lg * 2;
  const tileWidth = Math.floor(width / 3);

  /** What is being sent, as a small rounded picture: the post's own, the person's face, or an icon in a grey well. */
  const thumb = (): React.ReactNode => {
    const glyph = (icon: React.ReactNode) => <View style={styles.thumb}>{icon}</View>;
    const icon = (name: keyof typeof Ionicons.glyphMap) => glyph(<Ionicons name={name} size={20} color={colors.textMuted} />);
    if (!sending) return icon('alert-circle-outline');
    if (kind === 'profile') {
      const u = users.find((x) => x.id === id);
      if (!u) return icon('person-outline');
      return u.avatarUrl
        ? <Image source={{ uri: u.avatarUrl }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: quietTintFor(u.avatarSeed) }]}><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.thumbInk}>{initials(u.name)}</Text></View>;
    }
    if (kind === 'post') {
      const post = posts.find((x) => x.id === id);
      const pic = post?.thumbnailUrl ?? post?.imageUrl;
      return pic ? <Image source={{ uri: pic }} style={styles.thumb} /> : icon(post?.kind === 'clip' ? 'play-circle-outline' : 'image-outline');
    }
    if (kind === 'question') return icon('chatbubbles-outline');
    if (kind === 'court') return icon('location-outline');
    if (kind === 'hit-request') return glyph(<HitGlyph size={20} color={colors.textMuted} />);
    return icon('arrow-redo-outline');
  };
  /** The one plain line beside it: "Mira's clip", "Sam Lee's profile", "A hit at Albert Park, Sat 9am". */
  const itemLine = (): string => {
    if (!sending) return kind === 'message' ? 'That message can’t be forwarded' : 'This item is no longer available';
    const whose = (name?: string) => (name ? `${name}’s` : 'A');
    if (kind === 'profile') return id === currentUserId ? 'Your profile' : `${whose(users.find((x) => x.id === id)?.name)} profile`;
    if (kind === 'post') {
      const post = posts.find((x) => x.id === id);
      const by = post?.authorId === currentUserId ? 'Your' : whose(users.find((u) => u.id === post?.authorId)?.name.split(' ')[0]);
      return `${by} ${post?.kind === 'clip' ? 'clip' : 'post'}`;
    }
    if (kind === 'hit-request') { const h = hitRequests.find((x) => x.id === id); return h ? `A hit at ${h.place.name}, ${hitWhen(h.startsAt)}` : 'A hit'; }
    return sending.label;
  };

  const tile = (target: Target) => {
    const on = selected.includes(target.key);
    const group = !!target.people;
    // A hit's chat is named "Hit · <court>": the tile says just the court, and a small hit mark sits where the tick goes.
    const hitAt = group ? /^Hit · (.+)$/.exec(target.name)?.[1] : undefined;
    return (
      <Pressable
        key={target.key}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={target.locked ? `${target.name}. Only people they follow can message them` : group ? `${target.name}, group` : target.name}
        onPress={() => toggle(target)}
        style={[styles.tile, { width: tileWidth }, target.locked && styles.tileLocked]}
      >
        {({ pressed }) => (
          <>
            <View style={pressed ? styles.pressed : null}>
              {group
                ? <GroupAvatar people={target.people ?? []} size={FACE} photoUrl={target.photoUrl} name={target.name} quiet />
                : <Avatar name={target.name} seed={target.user?.avatarSeed ?? target.key} uri={target.user?.avatarUrl} size={FACE} quiet />}
              {on ? (
                <View style={styles.tick}><Ionicons name="checkmark" size={13} color={colors.brandInk} /></View>
              ) : target.locked ? (
                <View style={[styles.tick, styles.tickQuiet]}><Ionicons name="lock-closed" size={10} color={colors.textMuted} /></View>
              ) : hitAt ? (
                <View style={[styles.tick, styles.tickQuiet]}><HitGlyph size={12} color={colors.text} /></View>
              ) : null}
            </View>
            <Text numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={TextScale.TITLE} style={[styles.name, on && styles.nameOn]}>{hitAt ?? target.name}</Text>
          </>
        )}
      </Pressable>
    );
  };

  const nothingFound = !!term && !recentShown.length && !peopleShown.length;
  // Nobody to send to at all (a new account, or a group-only post in a group of one).
  const nobody = !term && !recentShown.length && !peopleShown.length;
  const many = selected.length > 1;
  const noteMax = NOTE_MAX * Math.min(fontScale || 1, TextScale.TITLE);

  // Nothing picked: ways out of the app. Someone picked: a message and Send (Instagram never shows a dead Send).
  const bottom = selected.length ? (
    <View style={styles.bar}>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Write a message…"
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.brand}
        multiline
        maxFontSizeMultiplier={TextScale.TITLE}
        accessibilityLabel="Message"
        onContentSizeChange={(e) => setNoteHeight(e.nativeEvent.contentSize.height)}
        style={[styles.note, { height: Math.min(noteMax, Math.max(NOTE_MIN, Math.ceil(noteHeight))) }]}
      />
      {/* Several picked: each gets its own copy in its own chat; nobody is put in a group together.
          Once sent it stays lit, not greyed like a button that can't be pressed; send() ignores a second tap. */}
      <Button
        label={sent ? 'Sent' : many ? `Send separately · ${selected.length}` : 'Send'}
        onPress={() => { void send(); }}
        loading={checking}
        disabled={!sending}
        full
      />
    </View>
  ) : outsideActions.length ? (
    <View style={styles.bar}>
      <View style={styles.actions}>
        {outsideActions.map((a) => (
          <Pressable key={a.key} onPress={a.run} accessibilityRole="button" accessibilityLabel={a.label} style={styles.action}>
            {({ pressed }) => (
              <>
                <View style={[styles.actionDisc, pressed && styles.pressed]}>
                  <Ionicons name={a.icon} size={24} color={colors.text} />
                </View>
                <Text {...oneLine(TextScale.TITLE, 0.8)} style={styles.actionLabel}>{a.label}</Text>
              </>
            )}
          </Pressable>
        ))}
      </View>
      {fallbackNote ? <Text selectable style={styles.fallback}>{fallbackNote}</Text> : null}
    </View>
  ) : null;

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={() => router.back()}
      peekFraction={0.72}
      plain
      header={
        <View style={styles.headerRow}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} accessibilityRole="header" style={styles.heading}>{kind === 'message' ? 'Forward to' : 'Send to'}</Text>
          <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <View style={styles.sheet}>
        <View style={styles.itemRow} accessible accessibilityLabel={`Sending: ${itemLine()}`}>
          {thumb()}
          <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.itemLine}>{itemLine()}</Text>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextBox
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.brand}
            autoCapitalize="none"
            autoCorrect={false}
            maxFontSizeMultiplier={TextScale.TITLE}
            accessibilityLabel="Search"
            style={styles.searchInput}
          />
        </View>

        {/* One list, recent chats first and then people. The last row melts into the page under a
            short fade (a gradient drawn over the list, nothing faded on a parent), never sliced. */}
        <View style={styles.list}>
          <ScrollView style={styles.fill} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listBody}>
            <View onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridWidth) setGridWidth(w); }}>
              <View style={styles.grid}>{[...recentShown, ...peopleShown].map(tile)}</View>
              {nothingFound ? <Text style={styles.empty}>No one matches “{search.trim()}”</Text> : null}
              {nobody ? <Text style={styles.empty}>{members ? 'No one else is in this group yet' : 'No one to send to yet'}</Text> : null}
            </View>
          </ScrollView>
          <LinearGradient pointerEvents="none" colors={[`${colors.bg}00`, colors.bg]} style={styles.fade} />
        </View>

        {bottom}
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  sheet: { flex: 1, paddingBottom: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  heading: { ...typography.heading, letterSpacing: -0.2, color: colors.text, flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  itemLine: { ...typography.body, color: colors.textMuted, flex: 1 },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbInk: { ...font('500'), fontSize: 14, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 10, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, marginTop: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.xs },
  searchInput: { flex: 1, minHeight: 36, color: colors.text, ...typography.body, paddingVertical: 0, paddingHorizontal: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  // Fills whatever the sheet has between the search and the bottom row.
  list: { flex: 1, minHeight: 120 },
  fill: { flex: 1 },
  listBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Face 64, 6 below it, a one-line name: rows about 94 apart, as Instagram's are.
  tile: { alignItems: 'center', gap: 6, paddingVertical: spacing.xs, paddingHorizontal: 4 },
  tileLocked: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.96 }] },
  // The tick sits on the face's lower right, ringed in the page colour so it reads on a photo too.
  tick: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  tickQuiet: { backgroundColor: colors.surfaceAlt },
  name: { ...typography.small, lineHeight: 16, color: colors.text, textAlign: 'center', alignSelf: 'stretch' },
  nameOn: { ...font('600') },
  empty: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingTop: spacing.xl },
  fallback: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  bar: { paddingTop: spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.md },
  note: {
    ...typography.body, color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: corner(20),
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'center',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'none' } as object) : {}),
  },
  // Each way out takes an equal share of the row, so the three fill it edge to edge.
  actions: { flexDirection: 'row' },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionDisc: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { ...typography.small, fontSize: 12, color: colors.textMuted },
});
