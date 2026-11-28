import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * A look at the website's Community option C inside the iPhone app (Nov 27, owner, after picking C for the website:
 * "honeslty c is the best for native. and honeslty lets see what that also looks like in the app"). Pictures only:
 * nothing changes in the app until he has seen them and said yes.
 *
 * With it on, the Community tab's map card goes edge to edge with one small label on it ("Los Angeles · 3 open hits"),
 * the big city name and the weather pill go, an iPhone Settings-style row sits under the map where the location ask is
 * ("Show courts near me" / "Nobody sees where you are"; "Continue" while iOS would still ask, Apple 5.1.1(iv)), and the
 * bottom bar takes C's look: the rounded capsule with a soft highlight under the lit tab, one ink for the lit tab.
 *
 * On only in a demo build (no live backend) bundled with EXPO_PUBLIC_APP_C_PREVIEW=1, and never on the website, so a
 * store build, an over-the-air update or the website never shows it, even if this branch were merged by mistake.
 */
export const APP_C_PREVIEW = Platform.OS !== 'web' && !isSupabaseConfigured && process.env.EXPO_PUBLIC_APP_C_PREVIEW === '1';
