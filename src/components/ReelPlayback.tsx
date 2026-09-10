import React from 'react';
import { ReelVideo } from './ReelVideo';
export function ReelPlayback({uri,poster,active}:{uri:string;poster?:string;active:boolean}) {
  return active ? <ReelVideo uri={uri} poster={poster}/> : null;
}
