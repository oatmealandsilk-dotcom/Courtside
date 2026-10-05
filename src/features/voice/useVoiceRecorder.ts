import { useEffect, useRef, useState } from 'react';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';

/** Longest voice note: two minutes, then it stops by itself. */
export const VOICE_LIMIT_MS = 120_000;

/**
 * Recording a voice note, on the phone or in a browser. The microphone is
 * asked for the first time, not before. `finish` hands back the recording
 * (anything under half a second counts as a slip and is dropped).
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const live = useRef(false);
  // Counts every start and finish, so a start still getting ready (the
  // microphone question up, the phone slow to set up) knows it was let go
  // of or thrown away meanwhile, and records nothing.
  const gen = useRef(0);
  const lastStart = useRef(0);

  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);

  const start = async (): Promise<'ok' | 'denied' | 'failed' | 'cancelled'> => {
    const mine = ++gen.current;
    lastStart.current = mine;
    const stale = () => gen.current !== mine;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return 'denied';
      if (stale()) return 'cancelled';
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!stale()) await recorder.prepareToRecordAsync();
      if (stale()) {
        // Back to playing through the speaker, unless a newer start has the microphone now.
        if (lastStart.current === mine) await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
        return 'cancelled';
      }
      recorder.record();
      live.current = true;
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
      tick.current = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
      return 'ok';
    } catch {
      return stale() ? 'cancelled' : 'failed';
    }
  };

  const finish = async (): Promise<{ uri: string; ms: number } | null> => {
    // Also calls off a start still getting ready.
    gen.current += 1;
    if (!live.current) return null;
    live.current = false;
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    const ms = Math.min(VOICE_LIMIT_MS, Date.now() - startedAt.current);
    try { await recorder.stop(); } catch { /* already stopped */ }
    setRecording(false);
    setElapsed(0);
    // Back to playing through the speaker, not the earpiece.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    const uri = recorder.uri;
    return uri && ms >= 500 ? { uri, ms } : null;
  };

  return { start, finish, recording, elapsed };
}

export const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
