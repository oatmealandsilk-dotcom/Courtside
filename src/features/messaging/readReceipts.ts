import type { Conversation, Message } from '@/data/types';

export function markMessagesOpened(messages: Message[], conversation: Conversation, readerId: string, shareReceipt: boolean, now: string) {
  if (!conversation.participantIds.includes(readerId)) return messages;
  let changed = false;
  const updated = messages.map(message => {
    if (message.conversationId !== conversation.id || message.senderId === readerId || message.openedAtBy?.[readerId]) return message;
    changed = true;
    return {
      ...message,
      openedAtBy: { ...message.openedAtBy, [readerId]: now },
      readAtBy: shareReceipt ? { ...message.readAtBy, [readerId]: now } : message.readAtBy,
    };
  });
  return changed ? updated : messages;
}
