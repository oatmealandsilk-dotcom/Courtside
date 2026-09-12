import React from 'react';
import { ReelVideo } from './ReelVideo';
export function ReelPlayback({uri,poster,active,preload,onDoubleTap}:{uri:string;poster?:string;active:boolean;preload?:boolean;onDoubleTap?:()=>void}) {
  return active ? <ReelVideo uri={uri} poster={poster}/> : null;
}
