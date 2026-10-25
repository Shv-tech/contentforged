/**
 * lib/platforms/http.ts
 *
 * One error type for every publishing platform, so routes can turn any
 * provider failure into a sentence the user can act on.
 */

export class PlatformError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** True when the stored credential no longer works and the user must reconnect. */
    public readonly reconnect = false
  ) {
    super(message);
  }
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text.slice(0, 300) };
  }
}

export function providerMessage(body: Record<string, unknown>): string {
  const error = body.error as Record<string, unknown> | string | undefined;
  if (typeof error === 'object' && error && typeof error.message === 'string') return error.message;
  if (typeof body.message === 'string') return body.message;
  if (typeof body.error_description === 'string') return body.error_description;
  if (typeof error === 'string') return error;
  return 'The platform rejected the request.';
}
