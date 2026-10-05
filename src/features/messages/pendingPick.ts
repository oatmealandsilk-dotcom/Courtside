import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

import type { PickedPhoto } from '@/components/MediaPicker';

/*
 * Android only (Oct 5). A phone short of memory often closes CourtSide while
 * its camera or photo picker is open on top. The picker keeps what was taken
 * or chosen, but the app it would have gone back to is gone: without this,
 * the photo just taken in a chat was silently lost and the person landed back
 * on the app's first page.
 *
 * So before a chat opens the camera or the photo picker on Android, it notes
 * which chat (kept on the phone, not in memory). When the app next opens, a
 * result the picker kept is collected, the app goes back to that chat, and
 * the photos wait in its tray to be sent, as if nothing had happened. An
 * iPhone never closes the app this way, so it never needs it.
 */
const KEY = 'courtside-chat-pick';
/** A note older than this is from a pick that was abandoned, not one cut short. */
const FRESH_MS = 30 * 60 * 1000;

let recovered: { chatId: string; photos: PickedPhoto[] } | null = null;
let looked = false;

/** Before the camera or picker opens for a chat. */
export function noteChatPick(chatId: string) {
  if (Platform.OS !== 'android') return;
  void AsyncStorage.setItem(KEY, JSON.stringify({ chatId, at: Date.now() })).catch(() => undefined);
}

/** The camera or picker came back to a running app: nothing to recover. */
export function clearChatPick() {
  if (Platform.OS !== 'android') return;
  void AsyncStorage.removeItem(KEY).catch(() => undefined);
}

/**
 * Once per launch, signed in: a pick cut short by the app being closed. Gives
 * back the chat to go back to, its photos waiting for takeRecoveredPick.
 */
export async function recoverChatPick(): Promise<string | null> {
  if (Platform.OS !== 'android' || looked) return null;
  looked = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    const note = JSON.parse(raw) as { chatId?: string; at?: number };
    if (!note.chatId || !note.at || Date.now() - note.at > FRESH_MS) return null;
    const result = await ImagePicker.getPendingResultAsync();
    if (!result || !('assets' in result) || result.canceled || !result.assets?.length) return null;
    const photos = result.assets
      .filter((a) => a.type !== 'video')
      .map((a) => ({ uri: a.uri, width: a.width || 1, height: a.height || 1 }));
    if (!photos.length) return null;
    recovered = { chatId: note.chatId, photos };
    return note.chatId;
  } catch {
    return null;
  }
}

/** The chat collects its recovered photos as it opens (once). */
export function takeRecoveredPick(chatId: string): PickedPhoto[] | null {
  if (!recovered || recovered.chatId !== chatId) return null;
  const { photos } = recovered;
  recovered = null;
  return photos;
}
