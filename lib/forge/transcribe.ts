/**
 * lib/forge/transcribe.ts
 *
 * Speech to text for voice notes and interviews.
 *
 * Whisper, through Groq when GROQ_API_KEY is set (fast and inexpensive) and
 * through OpenAI otherwise. Both speak the same API. Segments come back
 * with start and end times, which is what lets an interview proposal point
 * at the exact moment a story was told.
 */

import OpenAI, { toFile } from 'openai';
import { HttpError } from './http';
import type { WritingLanguage } from './types';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  durationSeconds: number | null;
  language: string | null;
}

interface Provider {
  client: OpenAI;
  model: string;
}

function provider(): Provider {
  if (process.env.GROQ_API_KEY) {
    return { client: new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' }), model: 'whisper-large-v3-turbo' };
  }
  if (process.env.OPENAI_API_KEY) {
    return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), model: 'whisper-1' };
  }
  throw new HttpError(503, 'Transcription is not configured on this server. Set GROQ_API_KEY or OPENAI_API_KEY.');
}

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * A prompt steers Whisper's spelling. For Hinglish speakers it keeps Hindi
 * words in Latin script, which is how they write, instead of Devanagari.
 */
function stylePrompt(language: WritingLanguage): string | undefined {
  if (language === 'hinglish') return 'Haan, toh main yeh keh raha tha ki launch ke baad pehle hafte mein 40 customers aaye. Bahut accha laga.';
  if (language === 'hi') return 'नमस्ते, आज मैं बताना चाहता हूँ कि हमने क्या सीखा।';
  return undefined;
}

export async function transcribe(audio: Buffer, options: { filename: string; contentType: string; language: WritingLanguage }): Promise<Transcript> {
  const { client, model } = provider();
  const file = await toFile(audio, options.filename, { type: options.contentType });

  let response: unknown;
  try {
    response = await client.audio.transcriptions.create({
      file,
      model,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      ...(options.language === 'hi' ? { language: 'hi' } : {}),
      ...(stylePrompt(options.language) ? { prompt: stylePrompt(options.language) } : {}),
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 413) throw new HttpError(413, 'That recording is too large to transcribe. Keep it under 25 MB.');
    if (status === 400) throw new HttpError(400, 'That file could not be read as audio.');
    console.error('[forge/transcribe] provider error:', error);
    throw new HttpError(502, 'Transcription failed. Try again in a moment.');
  }

  const raw = response as { text?: string; duration?: number; language?: string; segments?: Array<{ start: number; end: number; text: string }> };
  const segments = (raw.segments ?? [])
    .map((segment) => ({ start: round(segment.start), end: round(segment.end), text: segment.text.trim() }))
    .filter((segment) => segment.text.length > 0);

  return {
    text: (raw.text ?? segments.map((s) => s.text).join(' ')).trim(),
    segments,
    durationSeconds: typeof raw.duration === 'number' ? round(raw.duration) : (segments.at(-1)?.end ?? null),
    language: raw.language ?? null,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "1:05:09" or "4:31", for quoting a moment in an interview. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** The transcript as timestamped lines, which is how the extractor reads it. */
export function timestampedText(segments: TranscriptSegment[], maxChars = 60_000): string {
  let out = '';
  for (const segment of segments) {
    const line = `[${formatTimestamp(segment.start)}] ${segment.text}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out.trim();
}
