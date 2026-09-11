import React, { useEffect, useRef, useState } from 'react';
export function ReelPlayback({uri,poster,active,preload=false}:{uri:string;poster?:string;active:boolean;preload?:boolean}) {
 const video=useRef<HTMLVideoElement>(null);
 const [paused,setPaused]=useState(false),[muted,setMuted]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{const el=video.current;if(!el)return;if(active&&!paused)el.play().catch(()=>setPaused(true));else el.pause();return()=>el.pause();},[active,paused]);
 useEffect(()=>{if(!active)setPaused(false);},[active]);
 return <div style={{position:'absolute',inset:0}}>
  <video ref={video} src={uri} poster={poster} loop muted={muted} playsInline preload={active||preload?'auto':'none'} onError={()=>setError(true)} style={{width:'100%',height:'100%',objectFit:'cover',pointerEvents:'none'}}/>
  <button aria-label={paused?'Play reel':'Pause reel'} onClick={()=>setPaused(v=>!v)} style={{position:'absolute',inset:0,width:'100%',background:'transparent',border:0,color:'white',fontSize:40}}>{paused?'▶':''}</button>
  <button aria-label={muted?'Unmute reel':'Mute reel'} onClick={()=>setMuted(v=>!v)} style={{position:'absolute',top:70,right:18,border:0,borderRadius:20,padding:10,background:'#0008',color:'white'}}>{muted?'Sound off':'Sound on'}</button>
  {error&&<p role="status" style={{position:'absolute',top:'40%',left:30,right:30,color:'white',textAlign:'center'}}>This video couldn’t load. Swipe up for the next item.</p>}
 </div>;
}
