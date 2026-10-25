/**
 * Service worker: the only part of the extension that talks to Forge.
 *
 * Content scripts send it messages ({ type: 'grade' | 'save' | 'me' | 'queue' |
 * 'filled' }) and get
 * the response back, so the access token is never exposed to the pages the
 * user is browsing.
 */

import { forgeRequest } from './config.js';

const MENU = {
  draft: 'forge-save-draft',
  story: 'forge-save-story',
  voice: 'forge-save-voice',
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.draft, title: 'Save to Forge as a draft', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.story, title: 'Save to Forge Story Bank', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.voice, title: 'Add to my Forge voice (I wrote this)', contexts: ['selection'] });
  });
});

function platformFromUrl(url) {
  if (!url) return 'linkedin';
  if (/^https:\/\/(x|twitter)\.com\//.test(url)) return 'x';
  if (/^https:\/\/www\.threads\.com\//.test(url)) return 'threads';
  if (/^https:\/\/bsky\.app\//.test(url)) return 'bluesky';
  return 'linkedin';
}

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-128.png', title, message });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = (info.selectionText || '').trim();
  if (!text) return;
  const platform = platformFromUrl(tab && tab.url);
  try {
    if (info.menuItemId === MENU.draft) {
      await forgeRequest('/api/extension/save', { method: 'POST', body: { kind: 'draft', text, platform } });
      notify('Saved to Forge', 'Added to your drafts.');
    } else if (info.menuItemId === MENU.story) {
      await forgeRequest('/api/extension/save', { method: 'POST', body: { kind: 'story', text } });
      notify('Saved to Forge', 'Added to your Story Bank.');
    } else if (info.menuItemId === MENU.voice) {
      const result = await forgeRequest('/api/extension/save', {
        method: 'POST',
        body: { kind: 'voice', text, platform: platform === 'linkedin' ? 'linkedin' : platform },
      });
      notify('Added to your voice', `Forge now measures your voice from ${result.samples} posts.`);
    }
  } catch (error) {
    notify('Forge could not save that', error.message);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    if (message.type === 'grade') {
      return forgeRequest('/api/extension/grade', { method: 'POST', body: { text: message.text, platform: message.platform } });
    }
    if (message.type === 'save') {
      return forgeRequest('/api/extension/save', { method: 'POST', body: message.payload });
    }
    if (message.type === 'me') {
      return forgeRequest('/api/extension/me');
    }
    if (message.type === 'queue') {
      return forgeRequest(`/api/extension/queue?platform=${encodeURIComponent(message.platform)}`);
    }
    if (message.type === 'filled') {
      return forgeRequest('/api/extension/queue', { method: 'POST', body: { draftId: message.draftId } });
    }
    throw new Error('Unknown request.');
  };
  run()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message, status: error.status }));
  // Keeps the channel open for the async response.
  return true;
});
