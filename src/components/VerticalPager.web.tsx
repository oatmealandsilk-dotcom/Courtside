import React, { useEffect, useRef } from 'react';
import { pagerStep } from '@/lib/pagerGesture';
import { isDesktopBrowser } from '@/lib/browserDevice';

export function VerticalPager({ children, onIndex, initialIndex = 0 }: {
  children: React.ReactNode[];
  onIndex: (index: number) => void;
  /** Feed item to open on, so returning from a thread keeps your place. */
  initialIndex?: number;
}) {
  const pager = useRef<HTMLDivElement>(null);
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
    return () => { stop(); el.removeEventListener('wheel', wheel); };
  }, [children.length]);

  return <div ref={pager} tabIndex={0} role="region" aria-label="Clips feed"
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
      if (index === reported.current) return;
      reported.current = index;
      onIndex(index);
    }}
    style={{ height: '100%', width: '100%', overflowY: 'auto', scrollSnapType: 'y mandatory', touchAction:'none', userSelect:'none',
      overscrollBehaviorY: 'contain', scrollbarWidth: 'thin', scrollbarColor: '#8B8373 #F1EFE6' }}>
    {children.map((child, index) => <div key={index} style={{ display: 'flex', flexDirection: 'column',
      height: '100%', width: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always',
      position: 'relative', overflow: 'hidden' }}>{child}</div>)}
  </div>;
}
