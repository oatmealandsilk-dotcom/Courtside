import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { show as showToast } from '@/lib/toast';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import Reanimated, { Easing, FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { MediaPicker, pickFromDevice, type PickedMedia } from '@/components/MediaPicker';
import { MediaEditor, type EditedMedia } from '@/components/MediaEditor';
import { takePendingShot } from '@/features/compose/pendingShot';
import { registerCreateClose } from '@/features/compose/createMenu';
import { SheetBackdrop } from '@/components/SheetBackdrop';
import { Button, Field, Screen, Toggle } from '@/components/ui';
import { LocationLink } from '@/components/LocationChip';
import { openPlacePicker } from '@/features/places/picker';
import { PreparingRing } from '@/components/PreparingRing';
import { TagPlayers } from '@/components/TagPlayers';
import { addToBank, getBank } from '@/features/compose/mediaBank';
import { useApp } from '@/store/AppContext';
import { fetchCourts } from '@/features/players/courts';
import { homeFor } from '@/features/players/positions';
import type { TaggedCourt } from '@/data/types';
import { colors, radius, spacing, typography, font } from '@/theme';
import { challengeFor } from '@/features/challenge/weekly';

type Mode = 'clip' | 'post' | 'story' | 'hit';

const goBackNow = () => router.back();
/**
 * Posting lands you on the feed, whichever tab the Create box was opened
 * over, the way Instagram does: what you just posted is at the very top there
 * (still uploading, counting itself up), and the feed has been taken to it.
 */
// Back to the tabs, on Home. Not '/': that address is also the splash
// screen's, which would open a second copy of the whole app on top.
const landOnFeed = () => router.dismissTo('/(tabs)');
/** Each choice in the Create box arrives a moment after the one above it. */
const arrive = (index: number) => FadeInDown.delay(90 + index * 55).duration(260).easing(Easing.out(Easing.cubic));
/** choose → library → form, with back always stepping one page left. */
type Stage = 'choose' | 'library' | 'edit' | 'form';

/**
 * Instagram-shaped composer: pick media, write a caption, post.
 * A post carries a caption and how long you were on court — nothing else.
 * Questions are asked from their own sheet (app/ask.tsx), not from here.
 */
export default function Compose() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, posts, currentUserId, currentUser, detectedCoords, lastSeen } = useApp();

  // The story rail opens this straight at the library with ?mode=story.
  const params = useLocalSearchParams<{ mode?: string; shot?: string; challenge?: string; courtId?: string; courtName?: string; lat?: string; lng?: string }>();
  // Opened from the weekly challenge: its tag starts the caption, which is what makes the clip an entry.
  const challenge = useMemo(() => challengeFor(), []);
  const entering = params.challenge === challenge.tag;
  useEffect(() => { if (params.mode === 'story') router.replace('/hit'); }, [params.mode]);
  // A hit arrives here with its photo already taken: straight to the form.
  // The camera's photo travels in memory; the address only says one is waiting.
  const shotUri = params.shot === 'pending' ? takePendingShot() : params.shot;
  const isHit = params.mode === 'hit' && !!shotUri;
  const [stage, setStage] = useState<Stage>(isHit ? 'form' : 'choose');
  // The courts around you start loading while you pick and edit, so Add
  // location opens on a full list (it asks for the same spot, from the same cache).
  useEffect(() => {
    if (!currentUser) return;
    const mine = lastSeen[currentUser.id];
    const near = homeFor(currentUser, detectedCoords ?? (mine ? { lat: mine.lat, lng: mine.lng } : null));
    if (!near) return;
    void fetchCourts(near).catch(() => undefined);
    void fetchCourts(near, 25000).catch(() => undefined);
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Create box rises and grows into place with a small spring when it
  // opens, and plays that backwards when it closes, instead of only fading.
  const pop = useSharedValue(0);
  useEffect(() => { pop.value = withSpring(1, { damping: 15, stiffness: 190, mass: 0.8 }); }, [pop]);
  // Closing is its own motion, not the opening played backwards: from the
  // first frame the box starts fading, sinks a little and shrinks slightly,
  // and the dimmed page behind it fades with it, so everything leaves as one.
  const leave = useSharedValue(0);
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.6) * (1 - leave.value),
    transform: [
      { translateY: (1 - pop.value) * 28 + leave.value * 16 },
      { scale: (0.94 + 0.06 * pop.value) * (1 - 0.05 * leave.value) },
    ],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value }));
  const navigation = useNavigation();
  const closing = useRef(false);
  const closeMenu = () => {
    if (closing.current) return;
    closing.current = true;
    // The page's own fade would run after the box has already gone, leaving
    // an invisible layer that swallows taps for a moment; it is switched off
    // now, well before the page leaves.
    navigation.setOptions({ animation: 'none' });
    leave.value = withTiming(1, { duration: 210, easing: Easing.out(Easing.cubic) }, (done) => { if (done) runOnJS(goBackNow)(); });
  };
  // While the box is up, the + in the tab bar can close it the same way.
  const closeRef = useRef(closeMenu);
  closeRef.current = closeMenu;
  useEffect(() => (stage === 'choose' ? registerCreateClose(() => closeRef.current()) : undefined), [stage]);
  const [mode, setMode] = useState<Mode>(isHit ? 'hit' : params.mode === 'story' ? 'story' : 'post');
  // A post is 4:5 upright, the way the feed shows it; a clip and a story fill a phone screen (9:16).
  const portraitRatio = mode === 'post' ? 4 / 5 : 9 / 16;
  const [media, setMedia] = useState<PickedMedia | null>(isHit ? { uri: shotUri as string, label: 'Instant', kind: 'photo', thumbnailUrl: shotUri as string, orientation: 'portrait' } : null);
  // The pick as it came off the device. The editor always opens on this, so
  // a cut photo is never cut twice and a clip's edits can be revisited.
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  // What the edit step decided: where a clip starts and stops, how fast and how loud it plays, and its crop.
  const [edit, setEdit] = useState<Pick<EditedMedia, 'trimStart' | 'trimEnd' | 'muted' | 'volume' | 'speed' | 'crop' | 'coverAt'>>({});
  const [body, setBody] = useState(entering ? `#${challenge.tag} ` : '');
  const inChallenge = mode === 'clip' && new RegExp(`#${challenge.tag}\\b`, 'i').test(body);
  const [minutes, setMinutes] = useState('');
  // People tagged in the post: chips under the caption, added from a short search.
  const [tagged, setTagged] = useState<string[]>([]);
  // Opened from a court's page ("Post from here"): that court is already the place.
  const [location, setLocation] = useState(params.courtName?.trim() ?? '');
  // The court it was played on, when the location was picked from the courts list.
  const [court, setCourt] = useState<TaggedCourt | null>(() => {
    const lat = Number(params.lat); const lng = Number(params.lng); const name = params.courtName?.trim();
    return params.courtId && name && params.lat && params.lng && Number.isFinite(lat) && Number.isFinite(lng) ? { id: params.courtId, name, lat, lng } : null;
  });
  const [featureOk, setFeatureOk] = useState(true);

  const canSubmit = !!media?.uri && (mode !== 'clip' || media.kind === 'video');

  // A quick second tap on Share would post it twice.
  const sent = useRef(false);
  const submit = () => {
    if (!canSubmit || sent.current) return;
    sent.current = true;

    if (mode === 'story' || mode === 'hit') {
      actions.addStory({
        caption: body.trim() || undefined,
        imageUrl: media?.kind === 'photo' ? media.uri : undefined,
        videoUrl: media?.kind === 'video' ? media.uri : undefined,
        mediaLabel: mode === 'hit' ? 'Instant' : media?.label,
        thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
      });
      landOnFeed();
      return;
    }

    const onCourt = Number(minutes);
    actions.addPost({
      kind: mode === 'clip' ? 'clip' : 'note',
      orientation,
      // The cover's moment is the editor's own bookmark, not part of the post.
      trimStart: edit.trimStart, trimEnd: edit.trimEnd, muted: edit.muted, volume: edit.volume, speed: edit.speed, crop: edit.crop,
      body: body.trim(),
      tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag=>tag.slice(1).toLowerCase()))),
      taggedUserIds: tagged.length ? tagged : undefined,
      location: location.trim() || undefined,
      court: location.trim() && court ? court : undefined,
      featureOk: featureOk ? undefined : false,
      imageUrl: media?.kind === 'photo' ? media.uri : undefined,
      videoUrl: media?.kind === 'video' ? media.uri : undefined,
      mediaLabel: media?.label,
      thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
      session:
        onCourt > 0
          ? { focus: 'On court', minutes: onCourt, drills: [] }
          : undefined,
    });
    // The first post is the moment to ask who they hit with, but only after
    // they have seen it go up: a light nudge on the feed, not a whole screen.
    const firstPost = !posts.some((p) => p.authorId === currentUserId);
    landOnFeed();
    if (firstPost) setTimeout(() => showToast({ title: 'Your first post is up', body: 'Tap to invite the people you hit with.', icon: 'people-outline', href: '/invite' }), 1800);
  };

  const pick = (next: PickedMedia | null) => {
    if (!next) return;
    addToBank(next);
    setPicked(next);
    setMedia(next);
    setOrientation(next.orientation ?? 'portrait');
    setEdit({});
    // A clip or photo goes through the edit step first; a hit already has its shot.
    setStage(mode === 'hit' ? 'form' : 'edit');
  };

  // Straight to the phone's library from the + menu; a cancel leaves the menu up.
  const [pickError, setPickError] = useState('');
  // While a video is being picked and converted (a few seconds on iPhone), the box says so.
  const [preparing, setPreparing] = useState<null | 'video' | 'all'>(null);
  // The ring closes fully before the note goes, so it is seen to finish.
  const [prepDone, setPrepDone] = useState(false);
  const openDevice = async (selection: 'video' | 'all') => {
    setPickError('');
    // The phone never says when the library closes and the converting starts,
    // so the note waits out the library's own slide-up rather than flashing
    // under it. A browser converts nothing, so it says nothing there.
    const hold = Platform.OS === 'web' ? null : setTimeout(() => setPreparing(selection), 600);
    try {
      const next = await pickFromDevice(selection);
      if (next) pick(next);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    } finally {
      if (hold) clearTimeout(hold);
      setPrepDone(true);
      setTimeout(() => { setPreparing(null); setPrepDone(false); }, 300);
    }
  };

  if (stage === 'choose') return <View style={styles.choiceBackdrop}>
    <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, dimStyle]}><SheetBackdrop /></Reanimated.View>
    <Pressable accessibilityRole="button" accessibilityLabel="Close create menu" onPress={closeMenu} style={StyleSheet.absoluteFill}/>
    <Reanimated.View style={[styles.choiceSheet, popStyle]}>
      <View style={styles.choiceHeader}><Text style={styles.choiceTitle}>Create</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeMenu} hitSlop={10}><Ionicons name="close" size={24} color={colors.text}/></Pressable></View>
      <Reanimated.View entering={arrive(0)}><Pressable accessibilityRole="button" accessibilityLabel={entering ? `Create a clip for the ${challenge.title} challenge` : 'Create a clip'} onPress={() => { setMode('clip'); void openDevice('video'); }} style={[styles.choiceOption, entering && styles.choiceChallenge]}>
        {preparing === 'video' ? <PreparingRing size={28} done={prepDone} /> : <Ionicons name={entering ? 'trophy-outline' : 'videocam-outline'} size={28} color={entering ? colors.brand : colors.textMuted}/>}<Text style={styles.choiceLabel}>{entering ? 'Clip for the challenge' : 'Clip'}</Text><Text style={styles.note}>{preparing === 'video' ? 'Getting your video ready — shrinking it so it posts fast.' : entering ? `${challenge.title}. #${challenge.tag} is already in the caption.` : 'Share a video from your device.'}</Text>
      </Pressable></Reanimated.View>
      <Reanimated.View entering={arrive(1)}><Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={() => { setMode('post'); void openDevice('all'); }} style={styles.choiceOption}>
        {preparing === 'all' ? <PreparingRing size={28} done={prepDone} /> : <Ionicons name="images-outline" size={28} color={colors.textMuted}/>}<Text style={styles.choiceLabel}>Post</Text><Text style={styles.note}>{preparing === 'all' ? 'Getting it ready…' : 'Choose from your photos and videos.'}</Text>
      </Pressable></Reanimated.View>
      {pickError ? <Text style={styles.pickError}>{pickError}</Text> : null}
      <Reanimated.View entering={arrive(2)}><Pressable accessibilityRole="button" accessibilityLabel="Take an instant" onPress={() => router.replace('/hit')} style={styles.choiceOption}>
        <Ionicons name="camera-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Instant</Text><Text style={styles.note}>A photo after you play. Up on the feed for a day.</Text>
      </Pressable></Reanimated.View>
      <Reanimated.View entering={arrive(3)}><Pressable accessibilityRole="button" accessibilityLabel="Create a thread or question" onPress={() => router.replace('/ask')} style={styles.choiceOption}>
        <Ionicons name="chatbubbles-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Thread or question</Text><Text style={styles.note}>Ask the community or start a conversation.</Text>
      </Pressable></Reanimated.View>
    </Reanimated.View>
  </View>;

  if (stage === 'edit' && media) {
    // Back from the caption, the editor reopens on the original pick with
    // everything it decided last time still in place. A photo's zoom, turn
    // and drag are not carried back (it reopens uncut); its frame choice is.
    const source = picked ?? media;
    const returning = media !== source;
    const initial = source.kind === 'video'
      ? { ...edit, orientation: returning ? orientation : undefined, cover: media.thumbnailUrl }
      : { orientation: returning ? orientation : undefined };
    return (
      <View style={[styles.backdrop, { backgroundColor: '#000' }]}>
        <MediaEditor
          media={source}
          portraitRatio={portraitRatio}
          initial={initial}
          // Back means "wrong one": straight back into your photos to pick again,
          // not out to the menu. Stories go back to their own library.
          onBack={() => {
            if (params.mode === 'story') { setStage('library'); return; }
            setStage('choose');
            void openDevice(mode === 'clip' ? 'video' : 'all');
          }}
          onDone={(result) => {
            setMedia(result.media);
            setOrientation(result.orientation);
            setEdit({ trimStart: result.trimStart, trimEnd: result.trimEnd, muted: result.muted, volume: result.volume, speed: result.speed, crop: result.crop, coverAt: result.coverAt });
            setStage('form');
          }}
        />
      </View>
    );
  }

  if (stage === 'library') {
    // Everything picked this session plus anything you have already posted,
    // so a clip can be reused without another trip through the file dialog.
    const posted: PickedMedia[] = posts
      .filter((p) => p.authorId === currentUserId && (p.videoUrl || p.imageUrl))
      .map((p) => ({
        uri: p.videoUrl ?? p.imageUrl,
        label: p.mediaLabel ?? (p.videoUrl ? 'Video' : 'Photo'),
        kind: p.videoUrl ? 'video' as const : 'photo' as const,
        thumbnailUrl: p.thumbnailUrl ?? p.imageUrl,
      }));
    const seen = new Set<string>();
    const bank = [...getBank(), ...posted].filter((item) => {
      if (!item.uri || seen.has(item.uri)) return false;
      if (mode === 'clip' && item.kind !== 'video') return false;
      seen.add(item.uri);
      return true;
    });

    return (
      <View style={styles.backdrop}>
        <SheetBackdrop />
        <View style={styles.sheet}>
          <Screen
            title={mode === 'clip' ? 'Your videos' : 'Your library'}
            compactTitle
            onBack={() => (params.mode === 'story' ? router.back() : setStage('choose'))}
          >
            <MediaPicker compact selection={mode === 'clip' ? 'video' : 'all'} label={mode === 'clip' ? 'New video from your device' : 'New from your device'} value={null} onChange={pick} />
            <Text style={styles.libraryTitle}>{bank.length ? 'Recent' : 'Nothing here yet'}</Text>
            {bank.length ? (
              <ScrollView contentContainerStyle={styles.grid}>
                {bank.map((item) => (
                  <Pressable
                    key={item.uri}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${item.label}`}
                    onPress={() => pick(item)}
                    style={styles.tile}
                  >
                    {item.thumbnailUrl ? (
                      <Image accessibilityIgnoresInvertColors source={{ uri: item.thumbnailUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="videocam" size={26} color={colors.textFaint} />
                      </View>
                    )}
                    {item.kind === 'video' ? <Ionicons name="play" size={16} color="white" style={styles.tileBadge} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.note}>Videos and photos you pick show up here so you can use them again.</Text>
            )}
          </Screen>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.backdrop, mode === 'hit' && { backgroundColor: colors.bg }]}>
      {mode === 'hit' ? null : <SheetBackdrop />}
      <View style={styles.sheet}>
        <Screen
          title={mode === 'clip' ? 'New clip' : mode === 'post' ? 'New post' : mode === 'story' ? 'New story' : 'New instant'}
          compactTitle
          onBack={() => (mode === 'hit' ? router.navigate('/hit') : setStage('edit'))}
          right={<Button label={mode === 'story' || mode === 'hit' ? 'Post instant' : 'Share'} variant="secondary" onPress={submit} disabled={!canSubmit} />}
        >
          <View style={styles.form}>
            <View style={styles.stage}>
              {mode === 'hit' && media?.uri ? (
                // The hit is what the camera took, full stop: shown plainly, nothing to click.
                <View style={styles.hitFrame}>
                  <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Your instant" />
                </View>
              ) : (
                <MediaPicker bare orientation={orientation} portraitRatio={portraitRatio} selection={mode === 'clip' ? 'video' : 'all'} value={media} onChange={setMedia} trim={edit} />
              )}
            </View>
            {mode === 'hit' ? (
              <View style={styles.hitMeta}>
                <View style={styles.hitPill}><Ionicons name="time-outline" size={13} color={colors.brand} /><Text style={styles.hitPillText}>24 hours</Text></View>
                <Text style={styles.hitMetaText}>On the feed for a day, then kept in your archive.</Text>
              </View>
            ) : null}
            <Field
              label={mode !== 'story' && mode !== 'hit' ? 'Caption' : undefined}
              labelRight={mode !== 'story' && mode !== 'hit' ? <LocationLink value={location} court={!!court} onPress={() => openPlacePicker((value, picked) => { setLocation(value); setCourt(picked ?? null); }, location)} onClear={() => { setLocation(''); setCourt(null); }} /> : undefined}
              value={body}
              onChangeText={setBody}
              placeholder={mode === 'story' ? 'Add a line (optional)' : mode === 'hit' ? 'How did it go? (optional)' : 'Write a caption…'}
              multiline
              minHeight={64}
              mentions
            />
            {inChallenge ? (
              <View style={styles.inlineRow}>
                <Ionicons name="trophy-outline" size={18} color={colors.brand} />
                <Text style={styles.inlineLabel}>Entering this week’s challenge: {challenge.title}</Text>
              </View>
            ) : null}
            {mode !== 'story' && mode !== 'hit' ? <TagPlayers tagged={tagged} onChange={setTagged} /> : null}
            {mode !== 'story' && mode !== 'hit' ? (
              <View style={styles.inlineRow}>
                <Ionicons name="megaphone-outline" size={18} color={colors.textMuted} />
                <Text style={styles.inlineLabel}>OK to feature on CourtSide's Instagram</Text>
                <Toggle value={featureOk} onChange={setFeatureOk} accessibilityLabel="OK for CourtSide to feature this on its own channels" />
              </View>
            ) : null}

            {mode !== 'story' && mode !== 'hit' ? (
              <View style={styles.inlineRow}>
                <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                <Text style={styles.inlineLabel}>Minutes on court</Text>
                <View style={{ width: 96 }}>
                  <Field value={minutes} onChangeText={setMinutes} placeholder="optional" accessibilityLabel="Minutes on court (optional)" keyboardType="number-pad" />
                </View>
              </View>
            ) : null}
          </View>
        </Screen>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  choiceBackdrop: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', padding: 20 },
  choiceSheet: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 20, gap: 12, backgroundColor: colors.bg },
  choiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 },
  choiceTitle: { fontSize: 22, ...font('700'), color: colors.text },
  choiceOption: { padding: 20, gap: 8, borderRadius: 18, backgroundColor: colors.surface },
  choiceChallenge: { borderWidth: 1, borderColor: colors.brand },
  choiceLabel: { fontSize: 16, ...font('600'), color: colors.text },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  sheet: {
    height: '100%',
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  form: { gap: spacing.md, paddingTop: 0 },
  // Bleed past the screen's own padding so the media runs edge to edge.
  // A little room under the header, so the preview's rounded top corners show.
  stage: { marginTop: spacing.xs },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inlineLabel: { ...typography.small, color: colors.textMuted, flex: 1 },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  pickError: { ...typography.small, color: colors.danger, lineHeight: 18 },
  hitFrame: { width: '100%', aspectRatio: 4 / 3, maxHeight: 520, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', alignSelf: 'center' },
  hitMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hitPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandDim },
  hitPillText: { color: colors.brand, fontSize: 12, ...font('600') },
  hitMetaText: { ...typography.small, color: colors.textMuted, flex: 1 },
  libraryTitle: { ...typography.smallStrong, color: colors.textMuted, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tile: { width: '32.5%', aspectRatio: 9 / 12, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tileBadge: { position: 'absolute', right: 6, bottom: 6, textShadowColor: '#0008', textShadowRadius: 3 },
});
