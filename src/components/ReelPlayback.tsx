import React from 'react';
import { ReelVideo } from './ReelVideo';
export function ReelPlayback({uri,poster,active,preload}:{uri:string;poster?:string;active:boolean;preload?:boolean}) {
  return active ? <ReelVideo uri={uri} poster={poster}/> : null;
}
