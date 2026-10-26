import { barCompact, glideBar } from '@/features/navigation/barShrink';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { pagerStep } from '@/lib/pagerGesture';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { PullDisc, usePullDisc } from '@/components/PullDisc';
import * as haptics from '@/lib/haptics';
import { PULL_DISARM, PULL_DISC, PULL_GAP, PULL_MIN_SPIN, PULL_RETURN, WEB_HOME_PULL_LINE, fingerFor, pullFetch, pullRowLift, pullRowOpacity, rubberBand } from '@/lib/pullRefresh';
import { colors } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { useTopRowHint } from '@/lib/topRowHint';
import { AT_REST, NO_DRAG, dragFrom, followRow, offPage, settleRow, showRow, type RowDrag } from '@/features/feed/topRowScroll';
import { PageKeyContext, PageLeavingContext, makePageLeaving } from '@/features/feed/pageLeaving';
import { endFollow, followHeld, followPage } from '@/features/feed/swipeFollow';

export interface VerticalPagerHandle { scrollToTop: () => void }

/** A page's own key when it has one, otherwise its place. */
function pageKey(child: React.ReactNode, index: number) {
  return React.isValidElement(child) && child.key != null ? `k:${child.key}` : `i:${index}`;
}

/** The ring round the logo in the Feed's corner. */
export const CORNER_RING = 44;

export const VerticalPager = forwardRef<VerticalPagerHandle, {
  children: React.ReactNode[];
  onIndex: (index: number) => void;
  /** The page the scroll came to rest on. */
  onSettled?: (index: number) => void;
  /** A swipe (a finger, the wheel, the keys) landed on a new page; never a jump made in code (back to the top, a restored place). */
  onSwiped?: (index: number) => void;
  /** Feed item to open on, so returning from a thread keeps your place. */
  initialIndex?: number;
  /** Pulling down past the first page fetches what is new. */
  onRefresh?: () => Promise<void>;
  /** Shown in the gap the pull opens, beside the disc. */
  pullHeader?: React.ReactNode;
  pullTop?: number;
  pullAlign?: 'center' | 'left';
  /** How far the Feed's top row is away (0 shown, 1 gone): the feed's own movement drives it, a hold or the first page brings it back (features/feed/topRowScroll). Given only to the feed on show. */
  row?: SharedValue<number>;
  /** The swipe followed (features/feed/swipeFollow): each page's look (1 a picture, 0 written), and the look under a swipe is shared frame by frame with the bar and the top row. Given only to the feed on show. */
  looks?: SharedValue<number[]>;
  /** The swipe followed: the page a decided swipe heads for counts as the one on screen for its clip (pageLeaving's `heading`) from that moment. */
  startEarly?: boolean;
  /** The swipe followed: told the page a decided swipe heads for, and null once it has landed or turned back. */
  onHead?: (index: number | null) => void;
}>(function VerticalPager({ children, onIndex, onSettled, onSwiped, initialIndex = 0, onRefresh, pullHeader, pullTop = 0, pullAlign = 'center', row, looks, startEarly = false, onHead }, ref) {
  // The scrollbar is part of the design too: reading the theme here is what
  // redraws it when the palette changes.
  useTheme();
  // Pull-to-refresh, the same as on the phone (numbers in lib/pullRefresh):
  // the feed comes down with the finger against a growing give, the disc
  // draws round in step and closes at the line, letting go past it holds the
  // feed a little way down while the fetch runs, then it springs back up.
  // `gap` is how far the feed is down; everything follows it, frame by frame,
  // without re-drawing the feed.
  const refreshRef = useRef(onRefresh); refreshRef.current = onRefresh;
  const refreshingRef = useRef(false);
  const gap = useSharedValue(0);
  const disc = usePullDisc();
  const fireRefresh = async () => {
    if (refreshingRef.current) return;
    // Nothing to fetch after all: straight back up.
    if (!refreshRef.current) { gap.value = withSpring(0, PULL_RETURN, (done) => { if (done) disc.rest(); }); return; }
    refreshingRef.current = true;
    const began = Date.now();
    // A fetch that fails leaves the feed as it was; one that hangs is let go
    // of after a few seconds and finishes behind.
    await pullFetch(refreshRef.current);
    // A quick fetch still shows the disc turning for a moment.
    const left = PULL_MIN_SPIN - (Date.now() - began);
    if (left > 0) await new Promise<void>((resolve) => setTimeout(resolve, left));
    refreshingRef.current = false;
    gap.value = withSpring(0, PULL_RETURN, (done) => { if (done) disc.rest(); });
  };
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: gap.value }], borderTopLeftRadius: gap.value > 2 ? 22 : 0, borderTopRightRadius: gap.value > 2 ? 22 : 0 }));
  const rowStyle = useAnimatedStyle(() => ({ opacity: pullRowOpacity(gap.value), transform: [{ translateY: pullRowLift(gap.value) }] }));
  const cornerStyle = useAnimatedStyle(() => ({ opacity: pullRowOpacity(gap.value) }));
  // The top row, the same as on the phone: a finger held still brings it back (lib/topRowHint); the scroll below moves it.
  const pager = useRef<HTMLDivElement>(null);
  const rowRef = useRef(row); rowRef.current = row;
  // Only with the feed resting on a page: held part way through a drag, the next page's name is right under it.
  const hint = useTopRowHint(row ? () => {
    const el = pager.current;
    if (el && !gliding.current && offPage(el.scrollTop, el.clientHeight) < AT_REST) showRow(rowRef.current);
  } : undefined);
  // Where the finger's drag started (see features/feed/topRowScroll): a spring back to that page leaves the row as it was.
  const rowDrag = useRef<RowDrag>(NO_DRAG);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Position as a fraction of a page: the bar ducking changes this box's
  // height, which shifts the pixel position by itself; fractions stay put,
  // so that shift never reads as a swipe (which would lift the bar again).
  const lastFrac = useRef(-1);
  // Which way the bar was last sent (1 tucked, -1 up, 0 not yet); cleared once a page lands.
  const barDir = useRef(0);
  const lastHeight = useRef(0);
  // Someone moved the feed themselves since it last landed (a drag, the wheel, a key): where it lands is a swipe (onSwiped).
  const userMoved = useRef(false);
  // A move made in code (back to the top) is never followed (features/feed/swipeFollow), even begun while
  // someone's own swipe still glides: the bar and the top row go back to the Feed's own look as it begins.
  useImperativeHandle(ref, () => ({ scrollToTop: () => { userMoved.current = false; if (looksRef.current) endFollow(); if (pager.current) settle(pager.current, 0); } }), []);
  const drag = useRef<{y:number;x:number;top:number;active:boolean;target:HTMLElement;scroll?:HTMLElement;scrollTop?:number;lastY:number;lastTime:number;velocity:number} | null>(null);
  const suppressClick = useRef(false);
  const animation = useRef(0);
  // A landing glide is under way (settle): the page it heads for is not on yet.
  const gliding = useRef(false);
  const stop = () => {
    cancelAnimationFrame(animation.current);
    gliding.current = false;
  };
  // The page a decided swipe is leaving (features/feed/pageLeaving): its clip stops as the finger
  // lifts, not once the feed has landed (Oct 25, owner: "it waits until the screen fully lands"),
  // while the page itself stays the active one until then. Pages by their own keys.
  const [leaving] = useState(makePageLeaving);
  const keys = useRef<string[]>([]);
  keys.current = children.map((child, index) => pageKey(child, index));
  // The swipe followed (features/feed/swipeFollow): the page a decided swipe heads for, told to its
  // clip (pageLeaving's `heading`) and to the Feed's clock (onHead).
  const early = useRef({ startEarly, onHead });
  early.current = { startEarly, onHead };
  const setHeading = (key: string | null, index: number | null) => {
    if (leaving.heading() === key) return;
    leaving.setHeading(key);
    early.current.onHead?.(key === null ? null : index);
  };
  // Heading for `index`: the page it leaves is the one it was resting on, unless it is heading
  // straight back there (a spring back), which leaves nothing. Followed, the page someone's own
  // swipe heads for starts in the same moment; a move made in code (back to the top) starts its
  // last page as it lands, as before.
  const headFor = (index: number, byUser: boolean) => {
    const here = reported.current;
    leaving.set(index !== here ? keys.current[here] ?? null : null);
    if (early.current.startEarly) setHeading(byUser && index !== here ? keys.current[index] ?? null : null, index);
  };
  // Landed on another page: the page left goes on counting as left until the Feed has drawn the
  // new page as the active one (the render this landing starts), never a moment before, or its
  // clip would start again for a moment. The page headed for goes on counting as headed for until
  // then too, so its clip never stops for a moment in between.
  const letGoAfterDraw = useRef<{ left: string | null; head: string | null }>({ left: null, head: null });
  const [, drawn] = useState(0);
  useEffect(() => {
    const { left, head } = letGoAfterDraw.current;
    if (left === null && head === null) return;
    letGoAfterDraw.current = { left: null, head: null };
    if (left !== null && leaving.get() === left) leaving.set(null);
    if (head !== null && leaving.heading() === head) setHeading(null, null);
  });
  // The swipe followed: the look under the feed where it stands now, shared with the bar and the
  // top row, while someone moves it themselves (a drag, the wheel, the keys) and as that lands.
  // A move made in code (back to the top) is not followed: it changes on landing, as before.
  const looksRef = useRef(looks);
  looksRef.current = looks;
  const shareLook = (el: HTMLDivElement) => {
    const l = looksRef.current;
    if (!l || !el.clientHeight || !userMoved.current) return;
    // Moving until it lands (commit): nothing hands the look back to the Feed's own meanwhile.
    if (!followHeld.value) followHeld.value = 1;
    followPage(l.value, el.scrollTop / el.clientHeight);
  };
  // No longer the feed on show (or gone) part way through a followed swipe: the bar and the top row
  // are let go of, and take the look of whatever is on show now, as before.
  useEffect(() => (looks ? endFollow : undefined), [looks]);
  // Gone (or no longer followed) while a decided swipe still headed somewhere: nothing keeps playing for it.
  useEffect(() => (startEarly ? () => { if (leaving.heading() !== null) { leaving.setHeading(null); early.current.onHead?.(null); } } : undefined), [startEarly, leaving]);
  // The page in view becomes the active one only once the feed has landed on
  // it, the way Instagram Reels and TikTok do: while you drag, the clip you
  // are leaving keeps playing and the next one shows its first frame (owner,
  // Oct 19: "push 3 only if it's what Instagram does"). Once the finger has
  // let go towards another page, the clip being left has stopped (headFor),
  // and with the swipe followed (features/feed/swipeFollow) the clip it heads
  // for has started.
  const commit = (el: HTMLDivElement) => {
    if (!el.clientHeight) return;
    const index = Math.round(el.scrollTop / el.clientHeight);
    // Landed: the look at rest, exactly (followed).
    shareLook(el);
    if (looksRef.current) followHeld.value = 0;
    // Back on the page the swipe left (it turned round): its clip carries on at once. On to
    // another: the page left is let go of once the Feed has drawn the landing (above), and so is
    // the page headed for if this is it; landed anywhere else, that page's clip stops now.
    const leftKey = leaving.get();
    let wait = false;
    if (leftKey !== null) {
      if (leftKey === keys.current[index]) leaving.set(null);
      else { letGoAfterDraw.current.left = leftKey; wait = true; }
    }
    const headKey = leaving.heading();
    if (headKey !== null) {
      if (headKey === keys.current[index]) { letGoAfterDraw.current.head = headKey; wait = true; }
      else setHeading(null, null);
    }
    if (wait) drawn((n) => n + 1);
    const byUser = userMoved.current;
    userMoved.current = false;
    if (index === reported.current) return;
    reported.current = index;
    onIndexRef.current(index);
    if (byUser) onSwipedRef.current?.(index);
  };
  const onIndexRef = useRef(onIndex); onIndexRef.current = onIndex;
  const onSwipedRef = useRef(onSwiped); onSwipedRef.current = onSwiped;
  const settle = (el: HTMLDivElement, target = Math.round(el.scrollTop / el.clientHeight) * el.clientHeight) => {
    stop();
    const from = el.scrollTop;
    const to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target));
    // Where it will rest is decided here (a finger let go, a jump made in code): the clip being left stops now.
    if (el.clientHeight) headFor(Math.round(to / el.clientHeight), userMoved.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.scrollTop = to; el.style.scrollSnapType = 'y mandatory'; commit(el); return; }
    const started = performance.now();
    const desktop = isDesktopBrowser();
    const duration = desktop ? 350 : 290;
    const frame = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      // A short, slow glide grows into the snap, then eases into its landing.
      const eased = desktop
        ? 0.18 * t + 0.82 * (t * t * t * (10 - 15 * t + 6 * t * t))
        : 1 - Math.pow(1 - t, 2.5);
      el.scrollTop = from + (to - from) * eased;
      shareLook(el);
      if (t < 1) animation.current = requestAnimationFrame(frame);
      // Landed: now the page it came to is the active one.
      else { gliding.current = false; el.style.scrollSnapType = 'y mandatory'; commit(el); }
    };
    gliding.current = true;
    animation.current = requestAnimationFrame(frame);
  };
  useEffect(() => () => stop(), []);

  // Restore the caller's position once the children have laid out. Runs on
  // mount only: later index changes are the user scrolling, not a restore.
  const restored = useRef(false);
  // The page last reported as active (see commit).
  const reported = useRef(initialIndex);
  useEffect(() => {
    const el = pager.current;
    if (restored.current || !el || !initialIndex || !el.clientHeight) return;
    restored.current = true;
    el.scrollTop = initialIndex * el.clientHeight;
  }, [initialIndex, children.length]);

  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.5) return;
      if (drag.current?.active) return;
      drag.current = null;
      stop();
      userMoved.current = true;
      rowDrag.current = NO_DRAG;
      // Let the browser own trackpad movement, momentum and snap selection.
      // No preventDefault, finger-up timer, or synthetic scroll increments.
      el.style.scrollSnapType = 'y mandatory';
    };
    el.addEventListener('wheel', wheel, { passive: true });
    // The arrow keys, Page Down and Space move it as well (the browser scrolls the focused feed).
    const key = (event: KeyboardEvent) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(event.key)) userMoved.current = true; };
    el.addEventListener('keydown', key);
    // Pull-to-refresh on the first page, by finger or wheel. The finger's
    // travel goes through the same give the phone has, so the feed moves about
    // half as far at first and less after; the line ticks once on the way
    // past, and only letting go past it fetches.
    let finger = 0;
    let armed = false;
    let idle: ReturnType<typeof setTimeout> | null = null;
    let touchStart: number | null = null;
    const follow = (amount: number) => {
      finger = Math.max(0, amount);
      gap.value = rubberBand(finger, el.clientHeight);
      if (!armed && gap.value >= WEB_HOME_PULL_LINE) { armed = true; disc.arm(); haptics.tap(); }
      else if (armed && gap.value < WEB_HOME_PULL_LINE - PULL_DISARM) { armed = false; disc.disarm(); }
    };
    // Picks the feed up wherever it is, even part way back.
    const pickUp = () => { cancelAnimation(gap); finger = fingerFor(gap.value, el.clientHeight); if (!refreshingRef.current) disc.rest(); };
    const letGo = () => {
      if (idle) { clearTimeout(idle); idle = null; }
      if (armed) {
        armed = false;
        disc.start();
        gap.value = withSpring(PULL_GAP, PULL_RETURN);
        void fireRefresh();
      } else if (gap.value > 0) gap.value = withSpring(0, PULL_RETURN);
      finger = 0;
    };
    const pullWheel = (e: WheelEvent) => {
      if (!refreshRef.current || refreshingRef.current) return;
      if (el.scrollTop > 0 || (e.deltaY >= 0 && finger <= 0)) return;
      if (finger <= 0 && gap.value > 0) pickUp();
      follow(finger - e.deltaY);
      if (idle) clearTimeout(idle);
      idle = setTimeout(letGo, 220);
    };
    const touchS = (e: TouchEvent) => {
      touchStart = el.scrollTop <= 0 && refreshRef.current && !refreshingRef.current ? e.touches[0].clientY : null;
      if (touchStart !== null) { pickUp(); touchStart -= finger; }
    };
    const touchM = (e: TouchEvent) => { if (touchStart === null) return; follow(e.touches[0].clientY - touchStart); };
    const touchE = () => { if (touchStart === null) return; touchStart = null; letGo(); };
    el.addEventListener('wheel', pullWheel, { passive: true });
    el.addEventListener('touchstart', touchS, { passive: true });
    el.addEventListener('touchmove', touchM, { passive: true });
    el.addEventListener('touchend', touchE);
    el.addEventListener('touchcancel', touchE);
    return () => { stop(); if (idle) clearTimeout(idle); el.removeEventListener('wheel', wheel); el.removeEventListener('keydown', key); el.removeEventListener('wheel', pullWheel); el.removeEventListener('touchstart', touchS); el.removeEventListener('touchmove', touchM); el.removeEventListener('touchend', touchE); el.removeEventListener('touchcancel', touchE); };
  }, [children.length]);

  return <PageLeavingContext.Provider value={leaving}><div style={{ position: 'relative', height: '100%', width: '100%' }}>
    {/* Behind the feed, in the gap the pull opens: the greeting and the disc, riding in its middle. */}
    {onRefresh && pullAlign === 'left' ? (
      // In the Feed's corner, level with its words (Oct 4): the ring draws round the logo.
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: pullTop, left: 14, width: CORNER_RING, height: CORNER_RING, alignItems: 'center', justifyContent: 'center', zIndex: 0 }, cornerStyle]}>
        {pullHeader}
        <View style={StyleSheet.absoluteFill}><PullDisc gap={gap} disc={disc} line={WEB_HOME_PULL_LINE} size={CORNER_RING} /></View>
      </Animated.View>
    ) : onRefresh ? (
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: pullTop, left: 0, right: 0, height: PULL_DISC, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 0 }, rowStyle]}>
        {pullHeader}
        <PullDisc gap={gap} disc={disc} line={WEB_HOME_PULL_LINE} />
      </Animated.View>
    ) : null}
  <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 1 }, sheetStyle]}>
  <div ref={pager} tabIndex={0} role="region" aria-label="Clips feed"
    onPointerDown={event=>{
      if(event.button!==0 || !event.isPrimary || (event.target as HTMLElement).closest('input,textarea,select')) return;
      stop();
      suppressClick.current=false;
      hint.down(event.clientY);
      drag.current={x:event.clientX,y:event.clientY,top:event.currentTarget.scrollTop,active:false,target:event.target as HTMLElement,lastY:event.clientY,lastTime:performance.now(),velocity:0};
    }}
    onPointerMove={event=>{
      const point=drag.current;
      if(!point)return;
      hint.move(event.clientY);
      const dy=event.clientY-point.y;
      if(!point.active){
        if(Math.abs(event.clientX-point.x)>Math.abs(dy)+10){drag.current=null;return;}
        if(Math.abs(dy)<10)return;
        let target:HTMLElement|null=point.target;
        while(target && target!==event.currentTarget){
          if(['auto','scroll'].includes(getComputedStyle(target).overflowY) && target.scrollHeight>target.clientHeight+1 && (dy<0 ? target.scrollTop+target.clientHeight<target.scrollHeight-1 : target.scrollTop>1)){
            point.scroll=target;point.scrollTop=target.scrollTop;break;
          }
          target=target.parentElement;
        }
        point.active=true;
        if(!point.scroll){userMoved.current=true;if(rowRef.current&&event.currentTarget.clientHeight)rowDrag.current=dragFrom(rowRef.current,Math.round(point.top/event.currentTarget.clientHeight));}
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.style.scrollSnapType='none';
      }
      event.preventDefault();
      const now=performance.now();
      point.velocity=(point.lastY-event.clientY)/Math.max(1,now-point.lastTime);
      point.lastY=event.clientY;point.lastTime=now;
      if(point.scroll)point.scroll.scrollTop=(point.scrollTop ?? 0)-dy;
      else{event.currentTarget.scrollTop=point.top-Math.max(-event.currentTarget.clientHeight,Math.min(event.currentTarget.clientHeight,dy));shareLook(event.currentTarget);}
    }}
    onPointerUp={event=>{
      hint.up();
      const point=drag.current;drag.current=null;
      if(!point?.active)return;
      suppressClick.current=true;
      if(point.scroll)return;
      const el=event.currentTarget;
      const distance = point.y - event.clientY;
      const speed = performance.now()-point.lastTime < 100 ? point.velocity : 0;
      const step = pagerStep(distance, speed, el.clientHeight);
      if(rowDrag.current.page>=0)rowDrag.current={...rowDrag.current,net:distance,lifted:true};
      settle(el, (Math.round(point.top / el.clientHeight) + step) * el.clientHeight);
    }}
    onPointerCancel={event=>{
      hint.up();
      const point=drag.current;drag.current=null;
      if(point?.active && !point.scroll)settle(event.currentTarget,point.top);
    }}
    onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}
    onScroll={e => {
      const el = e.currentTarget;
      if (!el.clientHeight) return;
      shareLook(el);
      // The bar follows the scroll: down tucks it, up lifts it — as on the other tabs.
      const frac = el.scrollTop / el.clientHeight;
      const resized = lastHeight.current !== 0 && lastHeight.current !== el.clientHeight;
      lastHeight.current = el.clientHeight;
      if (lastFrac.current >= 0 && !resized) {
        const dy = (frac - lastFrac.current) * el.clientHeight;
        // One glide per swipe and direction, as on the phone (see glideBar).
        const dir = Math.abs(dy) > 0.3 ? (dy > 0 ? 1 : -1) : 0;
        if (dir !== 0 && dir !== barDir.current) { barDir.current = dir; glideBar(dir > 0); }
        // The Feed's top row moves with the feed: forward takes it out, back brings it in (a jump of half a page at once is code, not a finger).
        if (rowRef.current && Math.abs(dy) < el.clientHeight / 2) followRow(rowRef.current, dy, el.scrollTop, el.clientHeight, rowDrag.current);
      }
      lastFrac.current = frac;
      // Quiet for a beat after the last movement means the page has landed
      // (a wheel, a trackpad or the keys, where the browser does the snap).
      // A finger held still part way, or a glide still going, has not.
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        settleTimer.current = null;
        if (drag.current?.active || gliding.current) return;
        barDir.current = 0;
        commit(el);
        // At rest the row is all the way in or out, and always in on the first page; back on
        // the page a finger started from, it is as it was then (or in, if the finger pulled back).
        const page = Math.round(el.scrollTop / el.clientHeight);
        const back = rowDrag.current.page >= 0 && rowDrag.current.page === page ? rowDrag.current : null;
        rowDrag.current = NO_DRAG;
        settleRow(rowRef.current, page === 0, back);
        onSettled?.(Math.round(el.scrollTop / Math.max(1, el.clientHeight)));
      }, 160);
    }}
    style={{ height: '100%', width: '100%', overflowY: 'auto', scrollSnapType: 'y mandatory', touchAction:'none', userSelect:'none',
      overscrollBehaviorY: 'contain', scrollbarWidth: 'thin', scrollbarColor: `${colors.borderStrong} ${colors.bgElevated}` }}>
    {/* Under each page's own key, not its place: a page a refresh moves keeps its buffered video. */}
    {children.map((child, index) => <div key={pageKey(child, index)} style={{ display: 'flex', flexDirection: 'column',
      height: '100%', width: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always',
      position: 'relative', overflow: 'hidden' }}><PageKeyContext.Provider value={pageKey(child, index)}>{child}</PageKeyContext.Provider></div>)}
  </div>
  </Animated.View>
  </div></PageLeavingContext.Provider>;
});
