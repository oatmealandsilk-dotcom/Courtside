import { barCompact, glideBar } from '@/features/navigation/barShrink';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { pagerStep } from '@/lib/pagerGesture';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { PullDisc, usePullDisc } from '@/components/PullDisc';
import * as haptics from '@/lib/haptics';
import { PULL_DISARM, PULL_DISC, PULL_GAP, PULL_MIN_SPIN, PULL_RETURN, WEB_HOME_PULL_LINE, fingerFor, pullFetch, pullRowLift, pullRowOpacity, rubberBand } from '@/lib/pullRefresh';
import { colors } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

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
  /** Feed item to open on, so returning from a thread keeps your place. */
  initialIndex?: number;
  /** Pulling down past the first page fetches what is new. */
  onRefresh?: () => Promise<void>;
  /** Shown in the gap the pull opens, beside the disc. */
  pullHeader?: React.ReactNode;
  pullTop?: number;
  pullAlign?: 'center' | 'left';
}>(function VerticalPager({ children, onIndex, onSettled, initialIndex = 0, onRefresh, pullHeader, pullTop = 0, pullAlign = 'center' }, ref) {
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
  const pager = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Position as a fraction of a page: the bar ducking changes this box's
  // height, which shifts the pixel position by itself; fractions stay put,
  // so that shift never reads as a swipe (which would lift the bar again).
  const lastFrac = useRef(-1);
  // Which way the bar was last sent (1 tucked, -1 up, 0 not yet); cleared once a page lands.
  const barDir = useRef(0);
  const lastHeight = useRef(0);
  useImperativeHandle(ref, () => ({ scrollToTop: () => { if (pager.current) settle(pager.current, 0); } }), []);
  const drag = useRef<{y:number;x:number;top:number;active:boolean;target:HTMLElement;scroll?:HTMLElement;scrollTop?:number;lastY:number;lastTime:number;velocity:number} | null>(null);
  const suppressClick = useRef(false);
  const animation = useRef(0);
  const stop = () => {
    cancelAnimationFrame(animation.current);
  };
  const settle = (el: HTMLDivElement, target = Math.round(el.scrollTop / el.clientHeight) * el.clientHeight) => {
    stop();
    const from = el.scrollTop;
    const to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.scrollTop = to; el.style.scrollSnapType = 'y mandatory'; return; }
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
      if (t < 1) animation.current = requestAnimationFrame(frame);
      else el.style.scrollSnapType = 'y mandatory';
    };
    animation.current = requestAnimationFrame(frame);
  };
  useEffect(() => () => stop(), []);

  // Restore the caller's position once the children have laid out. Runs on
  // mount only: later index changes are the user scrolling, not a restore.
  const restored = useRef(false);
  // Scroll fires continuously; without this every frame of a swipe would set
  // state upstream and rebuild the feed mid-gesture.
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
      // Let the browser own trackpad movement, momentum and snap selection.
      // No preventDefault, finger-up timer, or synthetic scroll increments.
      el.style.scrollSnapType = 'y mandatory';
    };
    el.addEventListener('wheel', wheel, { passive: true });
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
    return () => { stop(); if (idle) clearTimeout(idle); el.removeEventListener('wheel', wheel); el.removeEventListener('wheel', pullWheel); el.removeEventListener('touchstart', touchS); el.removeEventListener('touchmove', touchM); el.removeEventListener('touchend', touchE); el.removeEventListener('touchcancel', touchE); };
  }, [children.length]);

  return <div style={{ position: 'relative', height: '100%', width: '100%' }}>
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
      drag.current={x:event.clientX,y:event.clientY,top:event.currentTarget.scrollTop,active:false,target:event.target as HTMLElement,lastY:event.clientY,lastTime:performance.now(),velocity:0};
    }}
    onPointerMove={event=>{
      const point=drag.current;
      if(!point)return;
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
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.style.scrollSnapType='none';
      }
      event.preventDefault();
      const now=performance.now();
      point.velocity=(point.lastY-event.clientY)/Math.max(1,now-point.lastTime);
      point.lastY=event.clientY;point.lastTime=now;
      if(point.scroll)point.scroll.scrollTop=(point.scrollTop ?? 0)-dy;
      else event.currentTarget.scrollTop=point.top-Math.max(-event.currentTarget.clientHeight,Math.min(event.currentTarget.clientHeight,dy));
    }}
    onPointerUp={event=>{
      const point=drag.current;drag.current=null;
      if(!point?.active)return;
      suppressClick.current=true;
      if(point.scroll)return;
      const el=event.currentTarget;
      const distance = point.y - event.clientY;
      const speed = performance.now()-point.lastTime < 100 ? point.velocity : 0;
      const step = pagerStep(distance, speed, el.clientHeight);
      settle(el, (Math.round(point.top / el.clientHeight) + step) * el.clientHeight);
    }}
    onPointerCancel={event=>{
      const point=drag.current;drag.current=null;
      if(point?.active && !point.scroll)settle(event.currentTarget,point.top);
    }}
    onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}
    onScroll={e => {
      const el = e.currentTarget;
      if (!el.clientHeight) return;
      const index = Math.round(el.scrollTop / el.clientHeight);
      // The bar follows the scroll: down tucks it, up lifts it — as on the other tabs.
      const frac = el.scrollTop / el.clientHeight;
      const resized = lastHeight.current !== 0 && lastHeight.current !== el.clientHeight;
      lastHeight.current = el.clientHeight;
      if (lastFrac.current >= 0 && !resized) {
        const dy = (frac - lastFrac.current) * el.clientHeight;
        // One glide per swipe and direction, as on the phone (see glideBar).
        const dir = Math.abs(dy) > 0.3 ? (dy > 0 ? 1 : -1) : 0;
        if (dir !== 0 && dir !== barDir.current) { barDir.current = dir; glideBar(dir > 0); }
      }
      lastFrac.current = frac;
      // Quiet for a beat after the last movement means the page has landed.
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => { settleTimer.current = null; barDir.current = 0; onSettled?.(Math.round(el.scrollTop / Math.max(1, el.clientHeight))); }, 160);
      if (index === reported.current) return;
      reported.current = index;
      onIndex(index);
    }}
    style={{ height: '100%', width: '100%', overflowY: 'auto', scrollSnapType: 'y mandatory', touchAction:'none', userSelect:'none',
      overscrollBehaviorY: 'contain', scrollbarWidth: 'thin', scrollbarColor: `${colors.borderStrong} ${colors.bgElevated}` }}>
    {/* Under each page's own key, not its place: a page a refresh moves keeps its buffered video. */}
    {children.map((child, index) => <div key={pageKey(child, index)} style={{ display: 'flex', flexDirection: 'column',
      height: '100%', width: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always',
      position: 'relative', overflow: 'hidden' }}>{child}</div>)}
  </div>
  </Animated.View>
  </div>;
});
