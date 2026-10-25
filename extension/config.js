/**
 * Settings shared by the popup and the service worker.
 *
 * The access token lives in chrome.storage.local: it never syncs to other
 * devices, and content scripts never see it (they ask the service worker to
 * make requests instead).
 */

export const DEFAULT_BASE_URL = 'https://forgeyourway.dev';

export async function getConfig() {
  const { baseUrl, token } = await chrome.storage.local.get(['baseUrl', 'token']);
  return { baseUrl: (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''), token: token || '' };
}

export async function setConfig(next) {
  await chrome.storage.local.set(next);
}

export class ForgeError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Calls the Forge API with the stored token. */
export async function forgeRequest(path, { method = 'GET', body } = {}) {
  const { baseUrl, token } = await getConfig();
  if (!token) throw new ForgeError('Add your Forge access token in the extension first.', 401);

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ForgeError('Could not reach Forge. Check your connection.', 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback =
      response.status === 401 ? 'This access token is not valid. Create a new one in Forge, Brand, Settings.' : `Forge returned an error (${response.status}).`;
    throw new ForgeError(typeof data.error === 'string' ? data.error : fallback, response.status);
  }
  return data;
}
