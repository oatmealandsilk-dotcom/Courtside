import React from 'react';
export function VerticalPager({children,onIndex}:{children:React.ReactNode[];onIndex:(index:number)=>void}) {
 return <div onScroll={e=>{const el=e.currentTarget; if(el.clientHeight)onIndex(Math.round(el.scrollTop/el.clientHeight));}} style={{height:'100%',width:'100%',overflowY:'auto',scrollSnapType:'y mandatory',overscrollBehaviorY:'contain',scrollbarWidth:'none'}}>
   {children.map((child,index)=><div key={index} style={{display:'flex',flexDirection:'column',height:'100%',width:'100%',scrollSnapAlign:'start',scrollSnapStop:'always',position:'relative',overflow:'hidden'}}>{child}</div>)}
 </div>;
}
