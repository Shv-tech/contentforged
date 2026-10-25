'use client';

/**
 * lib/forge/use-recorder.ts
 *
 * Browser audio recording for voice notes and interviews.
 *
 * Picks the first container the browser can record (Opus in WebM on
 * Chrome, Firefox and Android; AAC in MP4 on Safari and iOS), exposes a
 * live input level for the meter, supports pause, and hands back one Blob.
 * The microphone is released the moment recording stops or the component
 * unmounts, so the browser's recording indicator never lingers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** Longest single recording. Matches the 25 MB upload limit at typical bitrates. */
export const MAX_RECORDING_SECONDS = 45 * 60;

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'denied' | 'unsupported';

export interface Recording {
  blob: Blob;
  type: string;
  seconds: number;
}

function supportedType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<{ context: AudioContext; frame: number } | null>(null);
  const clock = useRef<{ startedAt: number; elapsed: number; timer: number | null }>({ startedAt: 0, elapsed: 0, timer: null });

  const release = useCallback(() => {
    if (clock.current.timer !== null) window.clearInterval(clock.current.timer);
    clock.current.timer = null;
    if (audio.current) {
      cancelAnimationFrame(audio.current.frame);
      void audio.current.context.close().catch(() => undefined);
      audio.current = null;
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setLevel(0);
  }, []);

  useEffect(() => release, [release]);

  const elapsed = () => clock.current.elapsed + (clock.current.startedAt ? (Date.now() - clock.current.startedAt) / 1000 : 0);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  const tick = useCallback(() => {
    const now = elapsed();
    setSeconds(now);
    if (now >= MAX_RECORDING_SECONDS) stop();
  }, [stop]);

  const meter = useCallback((media: MediaStream) => {
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(media).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const sample of data) peak = Math.max(peak, Math.abs(sample - 128) / 128);
        setLevel((previous) => previous * 0.6 + peak * 0.4);
        if (audio.current) audio.current.frame = requestAnimationFrame(loop);
      };
      audio.current = { context, frame: requestAnimationFrame(loop) };
    } catch {
      // The meter is a nicety; recording works without it.
    }
  }, []);

  const start = useCallback(async () => {
    const type = supportedType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      setError('This browser cannot record audio. Upload a recording instead.');
      return;
    }
    setError(null);
    setRecording(null);
    setState('requesting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      stream.current = media;
      chunks.current = [];
      const instance = new MediaRecorder(media, type ? { mimeType: type, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 64_000 });
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      instance.onstop = () => {
        const total = elapsed();
        clock.current = { startedAt: 0, elapsed: 0, timer: null };
        const mime = (instance.mimeType || type || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks.current, { type: mime });
        release();
        if (blob.size > 0) {
          setRecording({ blob, type: mime, seconds: total });
          setState('stopped');
        } else {
          setState('idle');
          setError('Nothing was recorded. Check the microphone and try again.');
        }
      };
      recorder.current = instance;
      // Chunks every second so a long recording never sits in one buffer.
      instance.start(1000);
      clock.current = { startedAt: Date.now(), elapsed: 0, timer: window.setInterval(tick, 250) };
      meter(media);
      setSeconds(0);
      setState('recording');
    } catch (cause) {
      release();
      const denied = cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');
      setState(denied ? 'denied' : 'idle');
      setError(denied ? 'Microphone access is blocked. Allow it for this site in your browser settings.' : 'Could not start the microphone.');
    }
  }, [meter, release, tick]);

  const pause = useCallback(() => {
    if (recorder.current?.state !== 'recording') return;
    recorder.current.pause();
    clock.current.elapsed = elapsed();
    clock.current.startedAt = 0;
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    if (recorder.current?.state !== 'paused') return;
    recorder.current.resume();
    clock.current.startedAt = Date.now();
    setState('recording');
  }, []);

  const reset = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    release();
    recorder.current = null;
    chunks.current = [];
    clock.current = { startedAt: 0, elapsed: 0, timer: null };
    setRecording(null);
    setSeconds(0);
    setError(null);
    setState('idle');
  }, [release]);

  return { state, seconds, level, recording, error, start, pause, resume, stop, reset };
}
