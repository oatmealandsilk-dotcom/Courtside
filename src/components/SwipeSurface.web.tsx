import React, { useRef } from 'react';
import { horizontalSwipe } from '@/features/navigation/swipeOrder';
export function SwipeSurface({children, onSwipe}: {children: React.ReactNode; onSwipe: (direction: 1 | -1) => void}) {
 const start = useRef<{x:number;y:number;id:number}|null>(null);
 const suppressClick = useRef(false);
 return <div style={{display:'flex',flex:1,minWidth:0,minHeight:0,touchAction:'pan-y',userSelect:'none'}}
   onPointerDownCapture={e => {
     suppressClick.current = false;
     if (!e.isPrimary || e.button !== 0 || (e.target as HTMLElement).closest('input,textarea,select,video,#topic-filter-strip,[data-swipe-ignore="true"]')) return;
     start.current={x:e.clientX,y:e.clientY,id:e.pointerId};
   }}
   onPointerMoveCapture={e=>{const point=start.current;if(!point)return;const dx=e.clientX-point.x,dy=e.clientY-point.y;if(Math.abs(dx)>25&&Math.abs(dx)>Math.abs(dy)*1.6){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);}}}
   onPointerUpCapture={e => { const point=start.current; start.current=null; if (!point || point.id!==e.pointerId) return;
     const dx=e.clientX-point.x,dy=e.clientY-point.y;
     if (horizontalSwipe(dx,dy)) { suppressClick.current=true; e.preventDefault(); e.stopPropagation(); onSwipe(dx<0?1:-1); }
   }}
   onPointerCancel={()=>{start.current=null;}}
   onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}
 >{children}</div>;
}
