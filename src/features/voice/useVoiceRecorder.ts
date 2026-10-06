import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from 'expo-audio';

/** Longest voice note: two minutes, then it stops by itself. */
export const VOICE_LIMIT_MS = 120_000;

/*
 * What a browser records in. Left to itself it records WebM, which an iPhone
 * cannot play at all (the note sat silent there), so it is asked for MP4 with
 * AAC sound, which every phone plays: Safari makes it, and Chrome and Edge do
 * on most computers. A browser that can't (Firefox, say) offers no mic, so it
 * never sends a voice note half the chat can't hear. Phones record M4A (AAC)
 * already.
 */
const WEB_VOICE_TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4;codecs="mp4a.40.2"'];
const webVoiceType = Platform.OS === 'web' && typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
  ? WEB_VOICE_TYPES.find((type) => { try { return MediaRecorder.isTypeSupported(type); } catch { return false; } })
  : undefined;
/** Whether voice notes can be recorded here: always on a phone; in a browser, only one that records MP4 (see above). */
export const canRecordVoice = Platform.OS !== 'web' || !!webVoiceType;
const VOICE_OPTIONS: RecordingOptions = webVoiceType
  ? { ...RecordingPresets.HIGH_QUALITY, web: { ...RecordingPresets.HIGH_QUALITY.web, mimeType: webVoiceType } }
  : RecordingPresets.HIGH_QUALITY;

/**
 * Recording a voice note, on the phone or in a browser. The microphone is
 * asked for the first time, not before. `finish` hands back the recording
 * (anything under half a second counts as a slip and is dropped).
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(VOICE_OPTIONS);
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
    // A browser that can only record what an iPhone can't play records nothing (the mic isn't offered there).
    if (!canRecordVoice) return 'failed';
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
