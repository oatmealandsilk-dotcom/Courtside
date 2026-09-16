import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A chat's colour, chosen per conversation the way Instagram lets you: it
 * paints your bubbles and the send button. Remembered on this device.
 */
export interface ChatTheme { id: string; label: string; /** Your bubbles. */ mine: string; /** Words on your bubbles. */ ink: string }

export const CHAT_THEMES: ChatTheme[] = [
  { id: 'court', label: 'Court', mine: '#2F7D5B', ink: '#FFFFFF' },
  { id: 'clay', label: 'Clay', mine: '#C9643B', ink: '#FFFFFF' },
  { id: 'grass', label: 'Grass', mine: '#4C8C3F', ink: '#FFFFFF' },
  { id: 'night', label: 'Night', mine: '#1F2A44', ink: '#F2F4F8' },
  { id: 'ocean', label: 'Ocean', mine: '#2B6CB0', ink: '#FFFFFF' },
  { id: 'sunset', label: 'Sunset', mine: '#D64B6A', ink: '#FFFFFF' },
  { id: 'gold', label: 'Gold', mine: '#E0A82E', ink: '#1B1A0A' },
];

const key = (conversationId: string) => `courtside.chat-theme.${conversationId}`;

export async function loadChatTheme(conversationId: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(key(conversationId)); } catch { return null; }
}

export async function saveChatTheme(conversationId: string, themeId: string | null): Promise<void> {
  try {
    if (themeId) await AsyncStorage.setItem(key(conversationId), themeId);
    else await AsyncStorage.removeItem(key(conversationId));
  } catch { /* remembered next time */ }
}
