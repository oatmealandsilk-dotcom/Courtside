import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { PersonWord } from '@/features/activity/sessionTags';
import { peopleText } from '@/features/activity/sessionTags';
import { colors } from '@/theme';

/** Who you played, as `peopleWords` gives it (or built from a tag, for your copy of someone's session). */
export type PeopleLine = { vs: PersonWord[]; with: PersonWord[]; allWaiting: boolean };

/**
 * A session's title in your private log: what it was, then who you played,
 * by first name ("Match · Won vs Mira and June · with Dev"). Each tagged
 * person says where their tag stands: a small tick once they accepted,
 * "(waiting)" while they have not; when everyone is still to answer, the
 * line ends " · Waiting" once instead. A no, or a name you typed, is just
 * the name.
 */
export function LoggedTitle({ label, people, style, faint, numberOfLines }: {
  label: string;
  people: PeopleLine | null;
  style: StyleProp<TextStyle>;
  /** The quieter words: "(waiting)", " · Waiting". */
  faint: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const names = (list: PersonWord[]) => list.map((w, i) => (
    <React.Fragment key={`${w.name}-${i}`}>
      {i === 0 ? '' : i === list.length - 1 ? ' and ' : ', '}
      {w.name}
      {w.state === 'accepted' ? <Text accessibilityLabel=" (accepted)"> <Ionicons name="checkmark-circle" size={13} color={colors.brand} /></Text> : null}
      {w.state === 'pending' && !people?.allWaiting ? <Text style={faint}> (waiting)</Text> : null}
    </React.Fragment>
  ));
  return (
    <Text style={style} numberOfLines={numberOfLines} accessibilityLabel={people ? `${label} ${peopleText(people)}` : label}>
      {label}
      {people?.vs.length ? <>{' vs '}{names(people.vs)}</> : null}
      {people?.with.length ? <>{people.vs.length ? ' · with ' : ' with '}{names(people.with)}</> : null}
      {people?.allWaiting ? <Text style={faint}> · Waiting</Text> : null}
    </Text>
  );
}
