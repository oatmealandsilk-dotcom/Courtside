import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CoachSpecialty, ID } from '@/data/types';

/**
 * A question to the coaches that didn't post (no connection, say), kept on
 * this phone so Ask a coach opens with it already typed instead of empty.
 * One at a time, and only until Ask a coach has opened with it. A clip isn't
 * kept: it is picked again.
 */
export interface UnsentCoachQuestion { title: string; body: string; specialty: CoachSpecialty }

let unsent: (UnsentCoachQuestion & { who?: ID }) | null = null;

export function keepUnsentCoachQuestion(question: UnsentCoachQuestion, who?: ID) { unsent = { ...question, who }; }
/** The kept question, for this account only (another account signed in on the phone never sees it). */
export function peekUnsentCoachQuestion(me?: ID | null): UnsentCoachQuestion | null {
  if (!unsent || (unsent.who && me && unsent.who !== me)) return null;
  return { title: unsent.title, body: unsent.body, specialty: unsent.specialty };
}
/** Ask a coach has opened with the kept question: it goes. Only this account's (the one peek showed): another
 * account opening Ask a coach on the same phone leaves it for its writer. */
export function clearUnsentCoachQuestion(me?: ID | null) { if (peekUnsentCoachQuestion(me)) unsent = null; }

/*
 * A question with a clip is saved only once the clip has uploaded (Nov 3). Its
 * words are written on the phone while the clip goes up, so an app closed in
 * that time doesn't lose them: the next time the app opens they are the kept
 * question above, and Ask a coach opens with them typed.
 */
const KEY = 'courtside-coach-question-uploading';
// This run of the app: a note left by a run before it is one whose upload never finished.
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
interface Uploading extends UnsentCoachQuestion { id: ID; who: ID; run: string }

/** Notes the words of a question whose clip is uploading. */
export function holdCoachQuestionWhileUploading(id: ID, who: ID, question: UnsentCoachQuestion) {
  const note: Uploading = { id, who, run: RUN, title: question.title, body: question.body, specialty: question.specialty };
  void AsyncStorage.setItem(KEY, JSON.stringify(note)).catch(() => undefined);
}

/** The question's upload is over (saved, refused, deleted or kept in memory): its note goes. */
export function releaseCoachQuestion(id: ID) {
  void AsyncStorage.getItem(KEY)
    .then((raw) => {
      const note = raw ? (JSON.parse(raw) as Partial<Uploading>) : null;
      if (note?.id === id) return AsyncStorage.removeItem(KEY);
      return undefined;
    })
    .catch(() => undefined);
}

// At open: a note from a run that closed mid-upload becomes the kept question.
try {
  void AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      const note = JSON.parse(raw) as Partial<Uploading>;
      if (note.run === RUN) return; // this run's own upload, still going
      void AsyncStorage.removeItem(KEY).catch(() => undefined);
      if (typeof note.title !== 'string' || typeof note.body !== 'string' || !note.specialty) return;
      if (!unsent) unsent = { title: note.title, body: note.body, specialty: note.specialty, who: note.who };
    })
    .catch(() => undefined);
} catch {
  // No storage here (the web build being drawn ahead of time): nothing to bring back.
}
