import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';

import { DragSheet } from '@/components/DragSheet';
import { SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { WhoYouPlayed } from '@/components/WhoYouPlayed';
import type { SessionPlayer } from '@/data/types';
import { clearWhoPlayed, peekWhoPlayed } from '@/features/activity/whoPlayedPicker';
import { KeyboardScrollContext, useKeyboardReveal } from '@/lib/keyboardScroll';
import { useApp } from '@/store/AppContext';

/**
 * "Who was there", over the composer of a session's post: the same people
 * search as the log sheet, the post's one list of people (owner, Oct 3: on a
 * session, a tag works like a group). Done hands the players back to the
 * post being written (see whoPlayedPicker); nobody is asked anything until
 * the post is shared (or the session logged). Opened with nothing waiting
 * for it (a reload), it just closes.
 */
export default function WhoPlayedSheet() {
  const { sessionTagsReady } = useApp();
  const [request] = useState(() => peekWhoPlayed());
  const [players, setPlayers] = useState<SessionPlayer[]>(request?.players ?? []);
  const [text, setText] = useState(request?.text ?? '');
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  const { scroller, onScroll, reveal } = useKeyboardReveal();
  useEffect(() => () => { if (request) clearWhoPlayed(request); }, [request]);
  const done = () => { request?.onDone(players, text); close(); };
  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.62} header={<SheetTitle title="Who was there" onClose={close} />}>
      <KeyboardScrollContext.Provider value={reveal}>
        <ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
          {request ? (
            <>
              <WhoYouPlayed kind={request.kind} players={players} onPlayers={setPlayers} text={text} onText={setText} search={sessionTagsReady} suggested={request.suggested} status={request.status} declined={request.declined} closed={request.closed} />
              <Submit label="Done" onPress={done} />
            </>
          ) : (
            <Submit label="Close" onPress={close} />
          )}
        </ScrollView>
      </KeyboardScrollContext.Provider>
    </DragSheet>
  );
}
