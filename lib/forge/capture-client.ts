'use client';

/**
 * lib/forge/capture-client.ts
 *
 * The browser side of capture: upload a recording straight to private
 * storage with a signed URL, then ask the server to transcribe and read it.
 * Shared by the dashboard inbox and the installable /capture screen.
 */

import { createClient } from '@/lib/supabase-browser';
import { api, ApiError } from './client';
import type { CaptureRecord, ProposalRecord } from './capture/ingest';

export type { CaptureRecord, ProposalRecord };

export interface CaptureSummary extends Omit<CaptureRecord, 'raw_text' | 'segments'> {
  raw_text?: string;
}

export interface CaptureDetail {
  capture: CaptureRecord;
  proposals: ProposalRecord[];
  audioUrl: string | null;
}

const MAX_UPLOAD = 25 * 1024 * 1024;

/** Upload a recording or audio file, then transcribe and read it. Returns the processed capture. */
export async function submitAudio(input: {
  blob: Blob;
  contentType: string;
  purpose: 'voice' | 'interview';
  title?: string;
  subject?: string;
  onStage?: (stage: 'uploading' | 'transcribing') => void;
}): Promise<CaptureRecord> {
  if (input.blob.size > MAX_UPLOAD) throw new ApiError('Recordings can be up to 25 MB. Export a compressed copy (M4A or MP3) and try again.', 413);

  input.onStage?.('uploading');
  const upload = await api<{ path: string; token: string }>('/api/capture/upload', {
    method: 'POST',
    json: { contentType: input.contentType, size: input.blob.size, purpose: input.purpose },
  });
  const { error } = await createClient().storage.from('captures').uploadToSignedUrl(upload.path, upload.token, input.blob, { contentType: input.contentType });
  if (error) throw new ApiError(`The upload did not finish: ${error.message}`, 502);

  input.onStage?.('transcribing');
  const { capture } = await api<{ capture: CaptureRecord }>('/api/capture/audio', {
    method: 'POST',
    json: { path: upload.path, source: input.purpose, title: input.title || undefined, subject: input.subject || undefined },
  });
  return capture;
}

export async function submitNote(text: string, title?: string): Promise<CaptureRecord> {
  const { capture } = await api<{ capture: CaptureRecord }>('/api/capture', { method: 'POST', json: { text, title: title || undefined } });
  return capture;
}

export async function decideProposal(id: string, action: 'keep' | 'discard', edits?: { title?: string; body?: string; kind?: ProposalRecord['kind'] }) {
  return api<{ proposal: ProposalRecord }>(`/api/capture/proposals/${id}`, { method: 'POST', json: { action, edits } });
}
