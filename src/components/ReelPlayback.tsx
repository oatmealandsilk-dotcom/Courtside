import React from 'react';
import { ReelVideo } from './ReelVideo';
export function ReelPlayback({uri,active}:{uri:string;active:boolean}) { return active ? <ReelVideo uri={uri}/> : null; }
