import { Platform } from 'react-native';

/**
 * A web-only preview switch for the Send-to redesign (Oct 22, owner: "This
 * screen looks too ai"). `?ss=a` is the Instagram share layout, `?ss=b` the
 * calm CourtSide one; anything else (and every phone) is the app exactly as
 * it is. Read once, when the app loads.
 */
export type SendToLook = 'now' | 'a' | 'b';

function read(): SendToLook {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'now';
  try {
    const v = new URLSearchParams(window.location.search).get('ss');
    return v === 'a' || v === 'b' ? v : 'now';
  } catch {
    return 'now';
  }
}

export const SEND_TO_LOOK: SendToLook = read();
/** The calmer pieces A and B share: no glow behind sheets, flat buttons, quiet faces. */
export const CALM = SEND_TO_LOOK !== 'now';
/** B's sheet-wide pieces: flat wells for chips, tiles and soft fields, and a native-size sheet header. */
export const CALM_SHEETS = SEND_TO_LOOK === 'b';
