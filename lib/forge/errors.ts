/**
 * lib/forge/errors.ts
 *
 * Maps internal and provider errors to messages a user can act on. A raw
 * provider error names the model vendor, leaks request details, and tells the
 * user nothing about what to do next.
 */

import { AnthropicError } from '@/lib/ai/anthropic';

export function friendlyProviderError(error: unknown): string {
  if (error instanceof AnthropicError) {
    if (error.status === 429 || error.status === 529) return 'Forge is busy right now. Give it a few seconds and try again.';
    if (error.status === 400 && /prompt is too long|too many tokens/i.test(error.message)) {
      return 'This conversation has grown too long for one turn. Start a new chat, or remove large attachments.';
    }
    if (error.type === 'configuration') return 'Forge is not fully configured on this server. Please contact support.';
    return 'Something went wrong while writing that. Please try again.';
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/timed out|timeout|aborted/i.test(message)) return 'That took too long and was stopped. Try a shorter request.';
  return 'Something went wrong. Please try again.';
}
