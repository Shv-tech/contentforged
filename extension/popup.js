/**
 * Popup: connect the extension with an access token, and grade a line
 * without leaving the current tab.
 */

import { DEFAULT_BASE_URL, forgeRequest, getConfig, setConfig } from './config.js';

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function showReady() {
  const { baseUrl } = await getConfig();
  $('setup').hidden = true;
  $('ready').hidden = false;
  $('open').href = `${baseUrl}/dashboard`;
  try {
    const me = await forgeRequest('/api/extension/me');
    $('who').textContent = me.workspace ? `${me.name} · ${me.workspace.name}` : `${me.name} · ${me.plan}`;
  } catch (error) {
    if (error.status === 401) return showSetup(error.message);
    $('who').textContent = '';
  }
}

async function showSetup(message = '') {
  const { baseUrl } = await getConfig();
  $('setup').hidden = false;
  $('ready').hidden = true;
  $('who').textContent = '';
  $('base').value = baseUrl === DEFAULT_BASE_URL ? '' : baseUrl;
  $('setup-error').textContent = message;
}

$('save').addEventListener('click', async () => {
  const token = $('token').value.trim();
  const base = $('base').value.trim().replace(/\/+$/, '');
  if (!token.startsWith('fx_')) {
    $('setup-error').textContent = 'That is not a Forge access token. It starts with fx_.';
    return;
  }
  if (base) {
    // Access to a self-hosted origin is requested only when one is entered.
    const granted = await chrome.permissions.request({ origins: [`${new URL(base).origin}/*`] });
    if (!granted) {
      $('setup-error').textContent = 'Permission to reach that address is needed.';
      return;
    }
  }
  await setConfig({ token, baseUrl: base || DEFAULT_BASE_URL });
  try {
    await forgeRequest('/api/extension/me');
    $('token').value = '';
    await showReady();
  } catch (error) {
    $('setup-error').textContent = error.message;
  }
});

$('disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token']);
  await showSetup();
});

$('grade').addEventListener('click', async () => {
  const text = $('text').value.trim();
  if (text.length < 3) return;
  const button = $('grade');
  button.disabled = true;
  button.textContent = 'Grading';
  $('result').innerHTML = '';
  try {
    const { grade, voice } = await forgeRequest('/api/extension/grade', { method: 'POST', body: { text, platform: $('platform').value } });
    const verdict = grade.verdict === 'ready' ? 'Ready to post' : grade.verdict === 'revise' ? 'Needs one fix' : 'Rethink the angle';
    $('result').innerHTML = `
      <div class="score">${grade.score}<small>/50</small></div>
      <div class="verdict">${escapeHtml(verdict)}${voice && voice.score !== null ? ` <span class="muted">· voice ${voice.score}</span>` : ''}</div>
      ${grade.weakest ? `<p class="muted">${escapeHtml(grade.weakest)}</p>` : ''}
      ${grade.rewrite ? `<div class="box">${escapeHtml(grade.rewrite)}</div>` : ''}`;
  } catch (error) {
    $('result').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Grade';
  }
});

getConfig().then(({ token }) => (token ? showReady() : showSetup()));
