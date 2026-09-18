import { router } from 'expo-router';
import { requestSection } from '@/features/navigation/swipeOrder';
import type { QuestionTopic } from '@/data/types';

/**
 * A thread's topic label works like a tag: it opens Community on
 * Discussions, filtered to that topic, with its chip picked.
 */
export function openTopic(topic: QuestionTopic) {
  requestSection('/discuss', 'discussions');
  requestSection('/discuss#topic', topic);
  router.navigate('/discuss');
}
