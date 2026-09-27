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

  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);

  const start = async (): Promise<'ok' | 'denied' | 'failed'> => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return 'denied';
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      live.current = true;
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
      tick.current = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
      return 'ok';
    } catch {
      return 'failed';
    }
  };

  const finish = async (): Promise<{ uri: string; ms: number } | null> => {
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
