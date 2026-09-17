import { barCompact } from '@/features/navigation/barShrink';
import { withTiming } from 'react-native-reanimated';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { pagerStep } from '@/lib/pagerGesture';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { ActivityIndicator } from 'react-native';
import { colors } from '@/theme';

export interface VerticalPagerHandle { scrollToTop: () => void }

export const VerticalPager = forwardRef<VerticalPagerHandle, {
  children: React.ReactNode[];
  onIndex: (index: number) => void;
  /** The page the scroll came to rest on. */
  onSettled?: (index: number) => void;
  /** Feed item to open on, so returning from a thread keeps your place. */
  initialIndex?: number;
  /** Pulling down past the first page fetches what is new. */
  onRefresh?: () => Promise<void>;
}>(function VerticalPager({ children, onIndex, onSettled, initialIndex = 0, onRefresh }, ref) {
  // The pull: how far (0..1 of the line), and whether the fetch is running.
  const [pullAmount, setPullAmount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(onRefresh); refreshRef.current = onRefresh;
  const refreshingRef = useRef(false);
  const fireRefresh = async () => { if (!refreshRef.current || refreshingRef.current) return; refreshingRef.current = true; setRefreshing(true); setPullAmount(1); try { await refreshRef.current(); } finally { refreshingRef.current = false; setRefreshing(false); setPullAmount(0); } };
  const pager = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Position as a fraction of a page: the bar ducking changes this box's
  // height, which shifts the pixel position by itself; fractions stay put,
  // so that shift never reads as a swipe (which would lift the bar again).
  const lastFrac = useRef(-1);
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
    // Pull-to-refresh on the first page: wheel or finger, the disc grows with the pull and the fetch goes when you let go past the line.
    const THRESHOLD = 110;
    let pulled = 0;
    let idle: ReturnType<typeof setTimeout> | null = null;
    let touchStart: number | null = null;
    const show = (amount: number) => { pulled = Math.max(0, amount); setPullAmount(Math.min(1, pulled / THRESHOLD)); };
    const letGo = () => { if (pulled >= THRESHOLD) { pulled = 0; void fireRefresh(); return; } if (pulled > 0) show(0); };
    const pullWheel = (e: WheelEvent) => {
      if (!refreshRef.current || refreshingRef.current) return;
      if (el.scrollTop > 0 || e.deltaY >= 0) { if (pulled) letGo(); return; }
      show(pulled + (pulled >= THRESHOLD ? -e.deltaY * 0.25 : -e.deltaY));
      if (idle) clearTimeout(idle);
      idle = setTimeout(letGo, 220);
    };
    const touchS = (e: TouchEvent) => { touchStart = el.scrollTop <= 0 && refreshRef.current && !refreshingRef.current ? e.touches[0].clientY : null; };
    const touchM = (e: TouchEvent) => { if (touchStart === null) return; const dy = e.touches[0].clientY - touchStart; if (dy <= 0) { show(0); return; } show(dy * 0.8); };
    const touchE = () => { touchStart = null; letGo(); };
    el.addEventListener('wheel', pullWheel, { passive: true });
    el.addEventListener('touchstart', touchS, { passive: true });
    el.addEventListener('touchmove', touchM, { passive: true });
    el.addEventListener('touchend', touchE);
    return () => { stop(); el.removeEventListener('wheel', wheel); el.removeEventListener('wheel', pullWheel); el.removeEventListener('touchstart', touchS); el.removeEventListener('touchmove', touchM); el.removeEventListener('touchend', touchE); };
  }, [children.length]);

  return <div style={{ position: 'relative', height: '100%', width: '100%' }}>
    {onRefresh && (pullAmount > 0 || refreshing) ? (
      <div style={{ position: 'absolute', top: 16 + 40 * pullAmount - 40, left: '50%', transform: `translateX(-50%) rotate(${-120 + 120 * pullAmount}deg)`, opacity: pullAmount, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, transition: 'top 120ms, opacity 120ms', pointerEvents: 'none' }}>
        {refreshing ? <ActivityIndicator size="small" color={colors.textMuted} /> : <div style={{ width: 22, height: 22, borderRadius: 11, border: `2.5px solid ${colors.textMuted}`, borderTopColor: 'transparent', opacity: 0.9 }} />}
      </div>
    ) : null}
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
        if (Math.abs(dy) >= el.clientHeight * 0.6) barCompact.value = withTiming(dy > 0 ? 1 : 0, { duration: 200 });
        else if (Math.abs(dy) > 0.3) barCompact.value = Math.max(0, Math.min(1, barCompact.value + dy / 150));
      }
      lastFrac.current = frac;
      // Quiet for a beat after the last movement means the page has landed.
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => { settleTimer.current = null; onSettled?.(Math.round(el.scrollTop / Math.max(1, el.clientHeight))); }, 160);
      if (index === reported.current) return;
      reported.current = index;
      onIndex(index);
    }}
    style={{ height: '100%', width: '100%', overflowY: 'auto', scrollSnapType: 'y mandatory', touchAction:'none', userSelect:'none',
      overscrollBehaviorY: 'contain', scrollbarWidth: 'thin', scrollbarColor: '#8B8373 #F1EFE6' }}>
    {children.map((child, index) => <div key={index} style={{ display: 'flex', flexDirection: 'column',
      height: '100%', width: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always',
      position: 'relative', overflow: 'hidden' }}>{child}</div>)}
  </div>
  </div>;
});
