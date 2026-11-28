import type { AlertMoment } from './alertsWhy';

/**
 * The card's words for each moment: its question and two or three reasons,
 * each one an alert the app really sends (send_push in the newest triggers,
 * migration 191: hit-match "is also looking for a hit", hit invites, joins,
 * follows, replies and messages). Never how near anyone is (Apple 5.1.2(i)).
 */
export function alertsWhyWords(moment: AlertMoment): { title: string; reasons: { icon: string; text: string }[] } {
  switch (moment) {
    case 'up-to-hit':
      return {
        title: 'Know when someone wants to hit?',
        reasons: [
          { icon: 'tennisball-outline', text: 'Someone is also looking for a hit' },
          { icon: 'mail-outline', text: 'Someone invites you to a hit' },
          { icon: 'chatbubble-outline', text: 'Replies and messages' },
        ],
      };
    case 'hit-posted':
      return {
        title: 'Know when someone joins?',
        reasons: [
          { icon: 'person-add-outline', text: 'Someone joins your hit' },
          { icon: 'chatbubbles-outline', text: 'A message in the hit’s chat' },
          { icon: 'chatbubble-outline', text: 'Replies and messages' },
        ],
      };
    case 'hit-joined':
      return {
        title: 'Hear from your hit?',
        reasons: [
          { icon: 'chatbubbles-outline', text: 'A message in the hit’s chat' },
          { icon: 'mail-outline', text: 'Someone invites you to a hit' },
          { icon: 'chatbubble-outline', text: 'Replies and messages' },
        ],
      };
    case 'follow':
    default:
      return {
        title: 'Know when they follow back?',
        reasons: [
          { icon: 'person-add-outline', text: 'Someone follows you back' },
          { icon: 'mail-outline', text: 'Someone invites you to a hit' },
          { icon: 'chatbubble-outline', text: 'Replies and messages' },
        ],
      };
  }
}
