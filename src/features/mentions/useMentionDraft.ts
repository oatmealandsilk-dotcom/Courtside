import { useState, type RefObject } from 'react';
import type { NativeSyntheticEvent, TextInput, TextInputSelectionChangeEventData } from 'react-native';

import { useMentionCandidates } from '@/features/mentions/useMentionCandidates';
import { activeMention, applyMention } from '@/lib/mentions';

/**
 * @-tagging for a plain reply box: while an @handle is being typed at the
 * caret, `rows` are the people to offer (the same order chat uses), and
 * `pick` puts the chosen handle in. The box passes `onSelectionChange` so
 * the caret is known.
 */
export function useMentionDraft(draft: string, setDraft: (text: string) => void, input: RefObject<TextInput | null>) {
  const [caret, setCaret] = useState(0);
  const candidatesFor = useMentionCandidates();
  const mention = activeMention(draft, caret);
  const rows = mention ? candidatesFor(mention.query, 4) : [];
  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => setCaret(e.nativeEvent.selection.end);
  const pick = (handle: string) => {
    if (!mention) return;
    const next = applyMention(draft, mention.start, caret, handle);
    setDraft(next.text);
    setCaret(next.caret);
    setTimeout(() => input.current?.setNativeProps?.({ selection: { start: next.caret, end: next.caret } }), 0);
  };
  return { rows, pick, onSelectionChange };
}
