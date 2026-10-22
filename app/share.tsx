import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { HitGlyph } from '@/components/HitGlyph';
import { shareOutside } from '@/lib/shareOutside';
import { Avatar, Button, Field, quietTintFor } from '@/components/ui';
import { initials } from '@/lib/format';
import { LinearGradient } from 'expo-linear-gradient';
import type { ShareItem, User } from '@/data/types';
import { isLocalMedia } from '@/data/remote';
import { GroupAvatar, groupName, isDirectChat, isGroupChat, othersIn } from '@/features/messages/groups';
import { hitWhen } from '@/features/hits/format';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, font, radius, spacing, typography } from '@/theme';
import { courtLink, shareLink } from '@/lib/shareLink';
import { courtShareText, hitShareText, postShareText, profileShareText, questionShareText } from '@/features/share/shareText';
import { isMapCourtId } from '@/features/places/courtName';
import { SheetTitle } from '@/components/sheet/SheetForm';
import { SEND_TO_LOOK } from '@/design/sendToPreview';

/**
 * Instagram's Send sheet. Your recent chats come first, groups included (two
 * faces for a group, or its photo), then people; search finds people by name
 * or @handle and groups by their name or anyone in them. Tick as many as you
 * like, add a note, and one Send puts the item in every chat picked: each
 * group gets it in the group, each person in your one-to-one chat with them.
 *
 * It sends a post, a thread, a profile, a "Looking for a hit", a court
 * (`?kind=court&name=&lat=&lng=`) or, from a held message, the message itself
 * (`?kind=message&id=`, which reads "Forward to"). "Share outside CourtSide"
 * falls back to the phone's own share sheet.
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
/** Faces this big, in tiles at least this wide: four across a phone, five in a computer's box. */
const FACE = 56;
const TILE_MIN = 84;
/** The calm preview (?ss=a|b): bigger faces, always three across. */
const FACE_A = 64;
/** Its message box: one line (40 high) growing to four as you type. */
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
  const calm = useThemedStyles(calmDefinitions);
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
  const { width: windowWidth } = useWindowDimensions();
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

  // Tiles across: as many as fit at TILE_MIN wide (four on a phone), never fewer than three or more than five.
  const width = gridWidth || Math.min(windowWidth, 520) - spacing.lg * 2;
  const columns = Math.max(3, Math.min(5, Math.floor(width / TILE_MIN)));
  const tileWidth = Math.floor(width / columns);

  const tile = (target: Target) => {
    const on = selected.includes(target.key);
    const group = !!target.people;
    return (
      <Pressable
        key={target.key}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={target.locked ? `${target.name}. Only people they follow can message them` : group ? `${target.name}, group` : target.name}
        onPress={() => toggle(target)}
        style={(state) => [styles.tile, { width: tileWidth }, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.tilePressed, target.locked && styles.tileLocked]}
      >
        <View>
          {group
            ? <GroupAvatar people={target.people ?? []} size={FACE} photoUrl={target.photoUrl} name={target.name} />
            : <Avatar name={target.name} seed={target.user?.avatarSeed ?? target.key} uri={target.user?.avatarUrl} size={FACE} />}
          {on ? (
            <View style={styles.tick}><Ionicons name="checkmark" size={13} color={colors.brandInk} /></View>
          ) : target.locked ? (
            <View style={[styles.tick, styles.tickLocked]}><Ionicons name="lock-closed" size={10} color={colors.textMuted} /></View>
          ) : null}
        </View>
        <Text numberOfLines={2} style={[styles.tileName, on && styles.tileNameOn]}>{target.name}</Text>
      </Pressable>
    );
  };

  const nothingFound = !!term && !recentShown.length && !peopleShown.length;
  const many = selected.length > 1;

  if (SEND_TO_LOOK !== 'now') {
    // ── The calm preview (?ss=a|b, web only; phones never get here) ──
    // Both looks are Instagram's share sheet: one grid of faces three across, a tick when picked, Send
    // only once someone is picked, and a row of round ways out of the app when nobody is. A has
    // Instagram's own top (search and a close); B puts a "Send to" title and what is being sent above it.
    const look = SEND_TO_LOOK;
    const tileW = Math.floor(width / 3);

    // What is being sent, in B's line under the title: a small rounded picture and one plain line.
    const thumb = (): React.ReactNode => {
      const well = (icon: React.ReactNode) => <View style={calm.thumb}>{icon}</View>;
      const glyph = (name: keyof typeof Ionicons.glyphMap) => well(<Ionicons name={name} size={20} color={colors.textMuted} />);
      if (!sending) return glyph('alert-circle-outline');
      if (kind === 'profile') {
        const u = users.find((x) => x.id === id);
        if (!u) return glyph('person-outline');
        return u.avatarUrl
          ? <Image source={{ uri: u.avatarUrl }} style={calm.thumb} />
          : <View style={[calm.thumb, { backgroundColor: quietTintFor(u.avatarSeed) }]}><Text style={calm.thumbInk}>{initials(u.name)}</Text></View>;
      }
      if (kind === 'post') {
        const post = posts.find((x) => x.id === id);
        const pic = post?.thumbnailUrl ?? post?.imageUrl;
        return pic ? <Image source={{ uri: pic }} style={calm.thumb} /> : glyph(post?.kind === 'clip' ? 'play-circle-outline' : 'image-outline');
      }
      if (kind === 'question') return glyph('chatbubbles-outline');
      if (kind === 'court') return glyph('location-outline');
      if (kind === 'hit-request') return well(<HitGlyph size={20} color={colors.textMuted} />);
      return glyph('arrow-redo-outline');
    };
    const itemLine = (): string => {
      if (!sending) return kind === 'message' ? 'That message can’t be forwarded' : 'This item is no longer available';
      const whose = (name?: string) => (name ? `${name}’s` : 'A');
      if (kind === 'profile') return `${whose(users.find((x) => x.id === id)?.name)} profile`;
      if (kind === 'post') {
        const post = posts.find((x) => x.id === id);
        const by = users.find((u) => u.id === post?.authorId)?.name.split(' ')[0];
        return `${whose(by)} ${post?.kind === 'clip' ? 'clip' : 'post'}`;
      }
      if (kind === 'hit-request') { const h = hitRequests.find((x) => x.id === id); return h ? `A hit at ${h.place.name}, ${hitWhen(h.startsAt)}` : 'A hit'; }
      return sending.label;
    };

    const copyLink = async () => {
      if (!outside) return;
      try { await Clipboard.setStringAsync(outside.url); haptics.tap(); showToast({ title: 'Link copied', icon: 'link-outline' }); }
      catch { setFallbackNote(`Share this link: ${outside.url}`); }
    };
    const text = outside ? encodeURIComponent(`${outside.title} ${outside.url}`) : '';
    const outsideActions: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; run: () => void }[] = outside ? [
      { key: 'copy', label: 'Copy link', icon: 'link-outline', run: () => { void copyLink(); } },
      // A phone's own Messages app; a browser has none to open.
      ...(Platform.OS === 'web' ? [] : [{ key: 'sms', label: 'Messages', icon: 'chatbubble-outline' as const, run: () => { void Linking.openURL(`sms:&body=${text}`).catch(() => undefined); } }]),
      // A web link, so no app scheme to declare and no new build.
      { key: 'wa', label: 'WhatsApp', icon: 'logo-whatsapp', run: () => { void Linking.openURL(`https://wa.me/?text=${text}`).catch(() => undefined); } },
      // The phone's own share sheet (a browser's, or the link copied, through shareOutside.web).
      { key: 'more', label: 'More', icon: 'ellipsis-horizontal', run: () => { void shareOut(); } },
    ] : [];

    const calmTile = (target: Target) => {
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
          style={[calm.tile, { width: tileW }, target.locked && styles.tileLocked]}
        >
          {({ pressed }) => (
            <>
              <View style={pressed ? calm.pressed : null}>
                {group
                  ? <GroupAvatar people={target.people ?? []} size={FACE_A} photoUrl={target.photoUrl} name={target.name} />
                  : <Avatar name={target.name} seed={target.user?.avatarSeed ?? target.key} uri={target.user?.avatarUrl} size={FACE_A} />}
                {on ? (
                  <View style={calm.tick}><Ionicons name="checkmark" size={13} color={colors.brandInk} /></View>
                ) : target.locked ? (
                  <View style={[calm.tick, calm.tickQuiet]}><Ionicons name="lock-closed" size={10} color={colors.textMuted} /></View>
                ) : hitAt ? (
                  <View style={[calm.tick, calm.tickQuiet]}><HitGlyph size={12} color={colors.text} /></View>
                ) : null}
              </View>
              <Text numberOfLines={1} ellipsizeMode="tail" style={calm.name}>{hitAt ?? target.name}</Text>
            </>
          )}
        </Pressable>
      );
    };

    const searchBox = (
      <View style={calm.search}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.brand}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search"
          style={calm.searchInput}
        />
      </View>
    );

    // One list, recent chats first and then people, the way Instagram's is. The last row melts into the
    // page under a short fade (a gradient drawn over the list, nothing faded on a parent), never sliced.
    const grid = (
      <View style={styles.list}>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={calm.listBody}>
          <View onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridWidth) setGridWidth(w); }}>
            <View style={styles.grid}>{[...recentShown, ...peopleShown].map(calmTile)}</View>
            {nothingFound ? <Text style={calm.empty}>No one matches “{search.trim()}”</Text> : null}
          </View>
        </ScrollView>
        <LinearGradient pointerEvents="none" colors={[`${colors.bg}00`, colors.bg]} style={calm.fade} />
      </View>
    );

    // Nothing picked: ways out of the app. Someone picked: a message and Send (Instagram never shows a dead Send).
    const bottom = selected.length ? (
      <View style={calm.bar}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Write a message…"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.brand}
          multiline
          accessibilityLabel="Message"
          onContentSizeChange={(e) => setNoteHeight(e.nativeEvent.contentSize.height)}
          style={[calm.note, { height: Math.min(NOTE_MAX, Math.max(NOTE_MIN, Math.ceil(noteHeight))) }]}
        />
        <Button
          label={sent ? 'Sent' : many ? 'Send separately' : 'Send'}
          onPress={() => { void send(); }}
          loading={checking}
          disabled={!sending}
          full
          style={calm.send}
        />
      </View>
    ) : outsideActions.length ? (
      <View style={calm.bar}>
        <View style={calm.actions}>
          {outsideActions.map((a) => (
            <Pressable key={a.key} onPress={a.run} accessibilityRole="button" accessibilityLabel={a.label} style={calm.action}>
              {({ pressed }) => (
                <>
                  <View style={[calm.actionDisc, pressed && calm.pressed]}>
                    <Ionicons name={a.icon} size={24} color={colors.text} />
                  </View>
                  <Text numberOfLines={1} style={calm.actionLabel}>{a.label}</Text>
                </>
              )}
            </Pressable>
          ))}
        </View>
        {fallbackNote ? <Text selectable style={calm.empty}>{fallbackNote}</Text> : null}
      </View>
    ) : null;

    return (
      <DragSheet
        closeSignal={closeSignal}
        onDismissed={() => router.back()}
        peekFraction={0.72}
        header={look === 'a' ? (
          <View style={calm.searchRow}>
            <View style={{ flex: 1 }}>{searchBox}</View>
            <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={calm.closeA}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : (
          <SheetTitle title={kind === 'message' ? 'Forward to' : 'Send to'} onClose={dismiss} />
        )}
      >
        <View style={calm.sheet}>
          {look === 'b' ? (
            <>
              <View style={calm.itemRow}>
                {thumb()}
                <Text numberOfLines={1} style={calm.itemLine}>{itemLine()}</Text>
              </View>
              <View style={calm.searchB}>{searchBox}</View>
            </>
          ) : null}
          {grid}
          {bottom}
        </View>
      </DragSheet>
    );
  }

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={() => router.back()}
      peekFraction={0.72}
      header={
        <View style={styles.headerRow}>
          <Text style={styles.heading}>{kind === 'message' ? 'Forward to' : 'Send to'}</Text>
          <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <View style={styles.sheet}>
        <View style={styles.itemPreview}>
          {sending ? sending.icon : <Ionicons name="alert-circle-outline" size={20} color={colors.textMuted} />}
          <Text numberOfLines={2} style={styles.itemText}>
            {sending ? sending.label : kind === 'message' ? 'That message can’t be forwarded' : 'This item is no longer available'}
          </Text>
        </View>

        <Field value={search} onChangeText={setSearch} placeholder="Search" autoCapitalize="none" autoCorrect={false} />

        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listBody}>
          <View onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridWidth) setGridWidth(w); }}>
            {recentShown.length ? (
              <>
                <Text style={styles.label}>{term ? 'Chats' : 'Recent chats'}</Text>
                <View style={styles.grid}>{recentShown.map(tile)}</View>
              </>
            ) : null}
            {peopleShown.length ? (
              <>
                <Text style={styles.label}>People</Text>
                <View style={styles.grid}>{peopleShown.map(tile)}</View>
              </>
            ) : null}
            {nothingFound ? <Text style={styles.empty}>No one matches “{search.trim()}”.</Text> : null}
          </View>
        </ScrollView>

        {selected.length ? (
          <Field value={note} onChangeText={setNote} placeholder="Write a message…" />
        ) : null}

        <View style={styles.footer}>
          {/* Several picked: each gets its own copy in its own chat; nobody is put in a group together. */}
          {/* Once sent it stays lit, not greyed like a button that can't be pressed;
              send() itself ignores a second tap. */}
          <Button
            label={sent ? 'Sent' : many ? `Send separately · ${selected.length}` : 'Send'}
            onPress={() => { void send(); }}
            loading={checking}
            disabled={!selected.length || !sending}
            full
          />
          {outside ? (
            <Pressable onPress={shareOut} accessibilityRole="button" style={styles.externalRow}>
              <Ionicons name="share-outline" size={18} color={colors.textMuted} />
              <Text style={styles.external}>Share outside CourtSide</Text>
            </Pressable>
          ) : null}
          {fallbackNote ? <Text selectable style={styles.empty}>{fallbackNote}</Text> : null}
        </View>
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  sheet: { flex: 1, padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  itemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 19 },
  // Fills whatever the sheet has between the search and the Send button.
  list: { flex: 1, minHeight: 120 },
  listBody: { paddingBottom: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { alignItems: 'center', gap: 6, paddingVertical: spacing.sm, paddingHorizontal: 4, borderRadius: radius.lg },
  tilePressed: { backgroundColor: colors.surfaceAlt },
  tileLocked: { opacity: 0.45 },
  // The tick sits on the face's lower right, ringed in the page colour so it reads on any face.
  tick: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  tickLocked: { backgroundColor: colors.surfaceAlt },
  tileName: { ...typography.small, fontSize: 12, lineHeight: 15, color: colors.text, textAlign: 'center' },
  tileNameOn: { ...font('600') },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.md },
  footer: { gap: spacing.md },
  externalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  external: { ...typography.smallStrong, color: colors.textMuted },
});

/** The calm Send-to preview's own styles (?ss=a|b, web only). */
const calmDefinitions = StyleSheet.create({
  sheet: { flex: 1, paddingBottom: spacing.xl },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingBottom: spacing.sm },
  closeA: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, borderRadius: 10, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10 },
  searchB: { marginTop: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.xs },
  searchInput: { flex: 1, height: 36, color: colors.text, ...typography.body, padding: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  itemLine: { ...typography.body, fontSize: 15, color: colors.textMuted, flex: 1 },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbInk: { ...font('500'), fontSize: 14, color: colors.text },
  listBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 16 },
  // Face 64, 6 below it, a 16-high name: rows about 94 apart, as Instagram's are.
  tile: { alignItems: 'center', gap: 6, paddingVertical: spacing.xs, paddingHorizontal: 4 },
  pressed: { transform: [{ scale: 0.96 }] },
  // The tick sits on the face's lower right, ringed in the sheet's own colour so it reads on a photo too.
  tick: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  tickQuiet: { backgroundColor: colors.surfaceAlt },
  name: { ...typography.small, fontSize: 13, lineHeight: 16, color: colors.text, textAlign: 'center', alignSelf: 'stretch' },
  empty: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingTop: spacing.xl },
  bar: { paddingTop: spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.md },
  note: {
    ...typography.body, color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: 20,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'center',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'none' } as object) : {}),
  },
  send: { borderRadius: radius.md, paddingVertical: 0, minHeight: 46, justifyContent: 'center' },
  // Each way out takes an equal share of the row, so three or four fill it edge to edge.
  actions: { flexDirection: 'row' },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionDisc: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { ...typography.small, fontSize: 12, color: colors.textMuted },
});
