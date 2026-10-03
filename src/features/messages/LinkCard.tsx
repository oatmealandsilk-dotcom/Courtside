import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { Easing, FadeIn } from 'react-native-reanimated';

import { Tappable, useDoubleTap } from '@/components/Tappable';
import { domainOf, openLink } from '@/lib/links';
import { colors, font, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { DemoPhoto } from './DemoPhoto';
import { kindOf, refreshLinkPreview, useLinkPreview, type LinkKind } from './linkPreview';

/** How wide a link's card sits in a chat (narrower on a small phone). */
export const LINK_CARD_W = 252;
/** A tall (portrait) video's card is a little narrower, so it never fills the chat. */
const PORTRAIT_W = 220;

/** Round corners like a bubble's; where it joins the message above or below, the corner on its sender's side is small. */
const ROUND = 18;
const JOINED = 6;

/** Each kind of page's picture, at the shape its pictures usually have. */
const ASPECT: Record<LinkKind, number> = { tiktok: 4 / 5, instagram: 4 / 5, youtube: 16 / 9, image: 4 / 3, link: 1.91 };
/** A picture is never taller than this, nor a third of the screen: a card is a glance, not the whole chat. */
const MEDIA_MAX_H = 260;

const GLYPH: Record<LinkKind, React.ComponentProps<typeof Ionicons>['name']> = {
  tiktok: 'logo-tiktok', youtube: 'logo-youtube', instagram: 'logo-instagram', image: 'image-outline', link: 'link-outline',
};

/** The site's usual name: "TikTok" for tiktok.com. Only these sites' own names are shown; any other page is named by its address. */
const SITE: Partial<Record<LinkKind, string>> = { tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram' };

/** The kinds whose card will have a picture, so its room is kept while the preview is on its way (the card never jumps). */
const PICTURED: Partial<Record<LinkKind, true>> = { tiktok: true, youtube: true };

/** Whether an address's card will be a big one (a picture, or a title), as far as is known before it arrives: a bubble with a link only shows a card under it then. */
export function linkCardShows(url: string, preview: ReturnType<typeof useLinkPreview>): boolean {
  if (preview) return !!(preview.image || preview.title);
  return preview === undefined && !!PICTURED[kindOf(url)];
}

/**
 * A link sent in a chat, as a card (iMessage's preview): the page's
 * picture, its title, and the site it is on; a tap opens it in the in-app
 * browser, a double tap leaves your reaction, a hold opens the message's
 * menu. The site line always shows the link's own address (a page cannot
 * name itself as another site). A video's card keeps its picture's room
 * while the preview is on its way, so nothing jumps when it lands; any other
 * link without a preview is a small card with the site and where on it.
 */
export function LinkCard({ url, mine, width = LINK_CARD_W, joinTop = false, joinBottom = false, sentAt, onLongPress, onReact, still = false }: {
  url: string;
  mine: boolean;
  width?: number;
  /** Joined to the bubble above it (the words it came with, or the message before in a run). */
  joinTop?: boolean;
  /** Joined to the next message in a run. */
  joinBottom?: boolean;
  /** When it was sent ("9:41 AM"), for a screen reader. */
  sentAt?: string;
  onLongPress?: () => void;
  /** A double tap: your reaction, as on any message. A single tap then waits out the double tap's moment before opening. */
  onReact?: () => void;
  /** The copy a held message's menu lifts: it takes no taps. */
  still?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { height: screenH } = useWindowDimensions();
  const preview = useLinkPreview(url);
  // Already known when the card was first drawn (opening a chat again): no fade, it is simply there.
  const instant = useRef(preview !== undefined).current;
  const [broken, setBroken] = useState(false);
  const own = kindOf(url);
  const kind = own === 'link' && preview?.kind === 'image' ? 'image' : own;
  const domain = domainOf(url);
  const image = preview?.image && !broken ? preview.image : undefined;
  const title = preview?.title;
  // TikTok, YouTube and Instagram are known by the address itself, so their own name and author may show; any other page is shown by its address only.
  const site = SITE[kind] ? (preview?.site ?? SITE[kind]!) : domain;
  const waiting = preview === undefined && !!PICTURED[kind];
  const portrait = ASPECT[kind] < 1;
  const w = portrait ? Math.min(width, PORTRAIT_W) : width;
  const mediaH = Math.round(Math.min(w / ASPECT[kind], MEDIA_MAX_H, screenH * 0.34));
  const corners = mine
    ? { borderTopRightRadius: joinTop ? JOINED : ROUND, borderBottomRightRadius: joinBottom ? JOINED : ROUND }
    : { borderTopLeftRadius: joinTop ? JOINED : ROUND, borderBottomLeftRadius: joinBottom ? JOINED : ROUND };
  const rich = !!(image || title) || waiting;
  // The small card's second line: where on the site the link goes ("/tennis"), when it says more than the site.
  const where = (() => {
    try {
      const u = new URL(url);
      const path = `${u.pathname === '/' ? '' : u.pathname}${u.search}`;
      return path.length > 1 ? decodeURI(path) : null;
    } catch {
      return null;
    }
  })();
  const video = kind === 'tiktok' || kind === 'youtube';
  const tap = useDoubleTap(() => onReact?.(), () => openLink(url));

  const body = rich ? (
    <>
      {image || waiting ? (
        <View style={[styles.media, { height: mediaH }]}>
          {waiting ? (
            // Its room, kept quietly while the picture is on its way.
            <View style={styles.mediaWait}><Ionicons name={GLYPH[kind]} size={26} color={colors.textFaint} /></View>
          ) : (
            <Reanimated.View entering={still || instant ? undefined : FadeIn.duration(240).easing(Easing.out(Easing.cubic))} style={StyleSheet.absoluteFill}>
              {image!.startsWith('demo:')
                ? <DemoPhoto path={image!} />
                : <ExpoImage accessibilityIgnoresInvertColors source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={instant ? 0 : 200} onError={() => { setBroken(true); refreshLinkPreview(url); }} />}
              {video ? (
                <View pointerEvents="none" style={styles.play}>
                  <Ionicons name="play" size={20} color={colors.onMedia} style={styles.playIcon} />
                </View>
              ) : null}
            </Reanimated.View>
          )}
        </View>
      ) : null}
      <View style={styles.words}>
        {title ? <Text style={styles.title} numberOfLines={image ? 2 : 3}>{title}</Text> : waiting ? <View style={styles.titleWait} /> : null}
        <View style={styles.siteRow}>
          <Ionicons name={GLYPH[kind]} size={12} color={colors.textMuted} />
          <Text style={styles.site} numberOfLines={1}>{site}</Text>
        </View>
      </View>
    </>
  ) : (
    // No preview: the site, and where on it the link goes.
    <View style={styles.compact}>
      <View style={styles.tile}>
        <Ionicons name={GLYPH[kind]} size={18} color={colors.textMuted} />
      </View>
      <View style={styles.compactWords}>
        <Text style={styles.title} numberOfLines={1}>{SITE[kind] ?? domain}</Text>
        {where ? <Text style={styles.site} numberOfLines={1}>{SITE[kind] ? domain + where : where}</Text> : null}
      </View>
    </View>
  );

  const label = `Link${title ? `: ${title}` : ''}, ${site}${sentAt ? `, sent ${sentAt}` : ''}`;
  const frame = [styles.card, !mine && styles.cardTheirs, corners, { width: w }];
  if (still) return <View style={frame}>{body}</View>;
  return (
    <Tappable
      accessibilityRole="link"
      accessibilityLabel={label}
      scaleTo={0.98}
      hoverTo={1.01}
      onPress={onReact ? tap : () => openLink(url)}
      onLongPress={onLongPress}
      delayLongPress={320}
      style={frame}
    >
      {body}
    </Tappable>
  );
}

const styleDefinitions = StyleSheet.create({
  card: {
    borderRadius: ROUND,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  // Theirs on their bubbles' own colour, with no outline, so a run of their messages reads as one piece.
  cardTheirs: { backgroundColor: colors.bubble, borderColor: colors.bubble },
  media: { width: '100%', backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  mediaWait: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // A play mark over a video's picture: a soft dark disc, so it reads on any picture.
  play: {
    position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, marginLeft: -22, marginTop: -22,
    borderRadius: 22, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { marginLeft: 3 },
  words: { paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 11, gap: 4 },
  title: { ...typography.smallStrong, fontSize: 14, lineHeight: 19, letterSpacing: -0.1, color: colors.text },
  // The title's place while it is on its way: a soft bar where the words will be.
  titleWait: { height: 12, width: '70%', marginVertical: 3.5, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  site: { ...font('400'), fontSize: 12, lineHeight: 16, color: colors.textMuted, flexShrink: 1 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 9, paddingRight: spacing.md, paddingVertical: 9 },
  tile: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  compactWords: { flex: 1, minWidth: 0, gap: 1 },
});
