import React from 'react';
import { ClipVideo } from './ClipVideo';
export function ClipPlayback({uri,poster,active,preload,onDoubleTap}:{uri:string;poster?:string;active:boolean;preload?:boolean;onDoubleTap?:()=>void}) {
  return active ? <ClipVideo uri={uri} poster={poster}/> : null;
}
