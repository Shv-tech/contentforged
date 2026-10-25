/**
 * Forge in the composer.
 *
 * When the user focuses a post composer on X, LinkedIn, Threads or Bluesky,
 * two small pills appear at its corner:
 *
 *   Grade  grades the text (opening line, five dimensions, the one fix) and
 *          checks it against the user's measured voice.
 *   Fill   lists the user's approved and scheduled Forge drafts for this
 *          platform; clicking one places its text in the composer.
 *
 * Filling happens only when the user clicks a draft, and only into the
 * composer they have open. The user reads it and presses Post themselves:
 * the extension never posts, replies, likes or follows.
 *
 * All UI lives in a closed shadow root, so the page's CSS cannot restyle it
 * and the page's scripts cannot read it.
 */

(() => {
  if (window.__forgeComposer) return;
  window.__forgeComposer = true;

  const PLATFORM = /(^|\.)x\.com$|twitter\.com$/.test(location.hostname)
    ? 'x'
    : location.hostname.endsWith('linkedin.com')
      ? 'linkedin'
      : location.hostname.endsWith('threads.com')
        ? 'threads'
        : 'bluesky';

  /** Composer elements by platform; the generic textbox rule covers redesigns. */
  const COMPOSER_SELECTORS = [
    '[data-testid^="tweetTextarea_"][contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ];

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .pills { position: fixed; pointer-events: auto; display: none; gap: 6px; }
      .pill { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px 0 10px;
        border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: #0E0E0E; color: #fff; font-size: 12.5px; font-weight: 600;
        cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
      .pill:hover { background: #1a1a1a; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: linear-gradient(180deg, #FFB067, #E0570A); }
      .panel { position: fixed; pointer-events: auto; display: none; width: 340px; max-height: 70vh; overflow: auto; padding: 16px;
        border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: #0B0B0B; color: #fff; box-shadow: 0 30px 80px rgba(0,0,0,0.55); }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .score { font-size: 34px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
      .score small { font-size: 14px; color: rgba(255,255,255,0.45); font-weight: 500; }
      .verdict { font-size: 13px; color: #FFB067; font-weight: 600; }
      .muted { color: rgba(255,255,255,0.5); font-size: 12px; line-height: 1.5; }
      .dims { margin: 12px 0; display: grid; gap: 6px; }
      .dim { display: grid; grid-template-columns: 120px 1fr 22px; align-items: center; gap: 8px; font-size: 12px; color: rgba(255,255,255,0.7); }
      .bar { height: 5px; border-radius: 5px; background: rgba(255,255,255,0.1); overflow: hidden; }
      .bar > i { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg, #E0570A, #FFB067); }
      .box { margin-top: 10px; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.05); font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.88); white-space: pre-wrap; }
      .label { margin-top: 12px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.35); }
      button.act { margin-top: 8px; height: 28px; padding: 0 12px; border-radius: 999px; border: 0; background: #fff; color: #000; font-size: 12px; font-weight: 600; cursor: pointer; }
      button.ghost { height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: transparent; color: rgba(255,255,255,0.7); font-size: 12px; cursor: pointer; }
      .error { color: #FFB4A0; font-size: 13px; line-height: 1.5; }
      .pill.fill { padding: 0 12px; }
      .draft { display: block; width: 100%; text-align: left; margin-top: 8px; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.88); font-size: 13px; line-height: 1.45; cursor: pointer; }
      .draft:hover { background: rgba(255,255,255,0.07); }
      .draft .meta { display: block; margin-top: 6px; font-size: 11px; color: rgba(255,255,255,0.4); }
      .clip { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; background: rgba(142,227,176,0.14); color: #8EE3B0; font-size: 10.5px; font-weight: 600; }
      .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); border-top-color: #FFB067; animation: s 0.8s linear infinite; }
      @keyframes s { to { transform: rotate(360deg); } }
    </style>
    <div class="pills"><button class="pill fill" type="button" aria-label="Fill from Forge drafts">Fill</button><button class="pill grade" type="button" aria-label="Grade with Forge"><span class="dot"></span>Grade</button></div>
    <div class="panel" role="dialog" aria-label="Forge grade"></div>
  `;

  const pills = root.querySelector('.pills');
  const pill = root.querySelector('.pill.grade');
  const fillPill = root.querySelector('.pill.fill');
  const panel = root.querySelector('.panel');
  let composer = null;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function textOf(element) {
    if (!element) return '';
    return (element.value !== undefined ? element.value : element.innerText || '').trim();
  }

  function findComposer(target) {
    if (!(target instanceof Element)) return null;
    for (const selector of COMPOSER_SELECTORS) {
      const match = target.closest(selector);
      if (match) return match;
    }
    return null;
  }

  function place() {
    if (!composer || !composer.isConnected) {
      pills.style.display = 'none';
      return;
    }
    const rect = composer.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 20) {
      pills.style.display = 'none';
      return;
    }
    pills.style.display = 'flex';
    pills.style.top = `${Math.max(8, rect.bottom - 38)}px`;
    pills.style.left = `${Math.min(window.innerWidth - 150, rect.right - 146)}px`;
    if (panel.style.display === 'block') {
      const top = rect.bottom + 8 + 360 > window.innerHeight ? Math.max(8, rect.top - 368) : rect.bottom + 8;
      panel.style.top = `${top}px`;
      panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 348, rect.right - 340))}px`;
    }
  }

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }

  function ask(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: 'The extension was updated. Reload this page.' });
        else resolve(response);
      });
    });
  }

  function render(result) {
    const grade = result.grade;
    const voice = result.voice;
    const dims = grade.dimensions
      .map(
        (d) =>
          `<div class="dim"><span>${escapeHtml(d.label)}</span><span class="bar"><i style="width:${d.score * 10}%"></i></span><span>${d.score}</span></div>`
      )
      .join('');
    const drift =
      voice && voice.drift && voice.drift.length
        ? `<div class="label">Drifts from your voice</div>${voice.drift.map((d) => `<div class="muted">Line ${d.line + 1}: ${escapeHtml(d.reasons.join(', '))}</div>`).join('')}`
        : '';
    const slop =
      voice && voice.slop && voice.slop.length
        ? `<div class="label">Reads as machine-written</div>${voice.slop.map((s) => `<div class="muted">"${escapeHtml(s.match)}"</div>`).join('')}`
        : '';
    panel.innerHTML = `
      <div class="row">
        <div><div class="score">${grade.score}<small>/50</small></div><div class="verdict">${escapeHtml(verdictLabel(grade.verdict))}</div></div>
        <div style="text-align:right">
          ${voice && voice.score !== null ? `<div class="score" style="font-size:22px">${voice.score}</div><div class="muted">voice match</div>` : '<div class="muted">Add posts in Forge<br>to score your voice</div>'}
        </div>
      </div>
      <div class="dims">${dims}</div>
      ${grade.weakest ? `<div class="label">The one fix</div><div class="muted" style="font-size:13px;color:rgba(255,255,255,0.8)">${escapeHtml(grade.weakest)}</div>` : ''}
      ${grade.rewrite ? `<div class="label">A stronger opening</div><div class="box">${escapeHtml(grade.rewrite)}</div><button class="act" data-copy>Copy opening</button>` : ''}
      ${drift}${slop}
      <div class="row" style="margin-top:14px"><button class="ghost" data-save>Save to Forge drafts</button><button class="ghost" data-close>Close</button></div>
    `;
    const copy = panel.querySelector('[data-copy]');
    if (copy) {
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(grade.rewrite);
        copy.textContent = 'Copied';
      });
    }
    panel.querySelector('[data-close]').addEventListener('click', closePanel);
    panel.querySelector('[data-save]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.textContent = 'Saving';
      const response = await ask({ type: 'save', payload: { kind: 'draft', text: textOf(composer), platform: PLATFORM } });
      button.textContent = response.ok ? 'Saved' : 'Could not save';
    });
  }

  function verdictLabel(verdict) {
    return verdict === 'ready' ? 'Ready to post' : verdict === 'revise' ? 'Needs one fix' : 'Rethink the angle';
  }

  async function grade() {
    const text = textOf(composer);
    panel.style.display = 'block';
    place();
    if (text.length < 3) {
      panel.innerHTML = '<div class="error">Write something first, then grade it.</div>';
      return;
    }
    panel.innerHTML = '<div class="row" style="justify-content:flex-start;gap:10px"><span class="spin"></span><span class="muted">Grading</span></div>';
    const response = await ask({ type: 'grade', text, platform: PLATFORM });
    if (!response.ok) {
      panel.innerHTML = `<div class="error">${escapeHtml(response.error)}</div><div style="margin-top:12px"><button class="ghost" data-close>Close</button></div>`;
      panel.querySelector('[data-close]').addEventListener('click', closePanel);
      return;
    }
    render(response.data);
    place();
  }

  /**
   * Places text in the open composer as if the user had pasted it, so the
   * site's own editor (Draft.js, Lexical, Quill) updates its state and the
   * Post button enables. Replaces whatever is in the composer.
   */
  function insertIntoComposer(text) {
    if (!composer || !composer.isConnected) return false;
    composer.focus();
    if (composer.value !== undefined) {
      composer.value = text;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection.removeAllRanges();
    selection.addRange(range);
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const pasted = composer.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    // Editors that handle paste cancel the event; for the rest, insert directly.
    if (pasted) document.execCommand('insertText', false, text);
    return textOf(composer).length > 0;
  }

  function whenLabel(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }

  async function openQueue() {
    panel.style.display = 'block';
    place();
    panel.innerHTML = '<div class="row" style="justify-content:flex-start;gap:10px"><span class="spin"></span><span class="muted">Loading your drafts</span></div>';
    const response = await ask({ type: 'queue', platform: PLATFORM });
    if (!response.ok) {
      panel.innerHTML = `<div class="error">${escapeHtml(response.error)}</div><div style="margin-top:12px"><button class="ghost" data-close>Close</button></div>`;
      panel.querySelector('[data-close]').addEventListener('click', closePanel);
      return;
    }
    const drafts = response.data.drafts || [];
    if (drafts.length === 0) {
      panel.innerHTML = '<div class="muted" style="font-size:13px">No drafts for this platform. Approve this week&rsquo;s plan in Forge, or schedule a draft, and it appears here.</div><div style="margin-top:12px"><button class="ghost" data-close>Close</button></div>';
      panel.querySelector('[data-close]').addEventListener('click', closePanel);
      return;
    }
    panel.innerHTML = `
      <div class="row"><strong style="font-size:14px">Fill from Forge</strong><button class="ghost" data-close>Close</button></div>
      <div class="muted" style="margin-top:4px">Pick one to place it in the composer. You read it and press Post.</div>
      ${drafts
        .map(
          (d, i) => `<button class="draft" data-index="${i}">
            <span class="clip">${escapeHtml(d.segments && d.segments.length > 1 && d.kind === 'thread' ? d.segments[0] : d.text)}</span>
            <span class="meta">${d.approved ? '<span class="tag">Approved</span> ' : ''}${escapeHtml(whenLabel(d.scheduledFor))}${d.kind === 'thread' && d.segments.length > 1 ? ` · thread of ${d.segments.length}` : ''}${d.grade !== null ? ` · ${d.grade}/50` : ''}${d.filledAt ? ' · filled before' : ''}</span>
          </button>`
        )
        .join('')}
    `;
    panel.querySelector('[data-close]').addEventListener('click', closePanel);
    panel.querySelectorAll('[data-index]').forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => fill(drafts[Number(button.getAttribute('data-index'))]));
    });
  }

  async function fill(draft) {
    const isThread = draft.kind === 'thread' && draft.segments && draft.segments.length > 1;
    const first = isThread ? draft.segments[0] : draft.text;
    if (!insertIntoComposer(first)) {
      await navigator.clipboard.writeText(first).catch(() => undefined);
      panel.innerHTML = '<div class="error">This composer did not accept the text. It is copied: paste it in.</div><div style="margin-top:12px"><button class="ghost" data-close>Close</button></div>';
      panel.querySelector('[data-close]').addEventListener('click', closePanel);
      return;
    }
    void ask({ type: 'filled', draftId: draft.id });
    if (!isThread) {
      closePanel();
      return;
    }
    // A thread: the first post is in; the rest are a click away, in order.
    panel.innerHTML = `
      <div class="row"><strong style="font-size:14px">Post 1 of ${draft.segments.length} is in</strong><button class="ghost" data-close>Done</button></div>
      <div class="muted" style="margin-top:4px">Add a post to the thread, then fill or copy the next one.</div>
      ${draft.segments
        .slice(1)
        .map((segment, i) => `<div class="box">${escapeHtml(segment)}</div><button class="act" data-next="${i + 1}">Fill post ${i + 2}</button>`)
        .join('')}
    `;
    panel.querySelector('[data-close]').addEventListener('click', closePanel);
    panel.querySelectorAll('[data-next]').forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', async () => {
        const segment = draft.segments[Number(button.getAttribute('data-next'))];
        if (insertIntoComposer(segment)) button.textContent = 'Filled';
        else {
          await navigator.clipboard.writeText(segment).catch(() => undefined);
          button.textContent = 'Copied, paste it in';
        }
      });
    });
  }

  pill.addEventListener('mousedown', (event) => event.preventDefault());
  pill.addEventListener('click', grade);
  fillPill.addEventListener('mousedown', (event) => event.preventDefault());
  fillPill.addEventListener('click', openQueue);

  document.addEventListener(
    'focusin',
    (event) => {
      const found = findComposer(event.target);
      if (found) {
        composer = found;
        place();
      }
    },
    true
  );

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.style.display === 'block') closePanel();
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'g' && composer) {
      event.preventDefault();
      void grade();
    }
  });

  window.addEventListener('scroll', place, { passive: true, capture: true });
  window.addEventListener('resize', place, { passive: true });
  // Single-page apps swap composers without a focus change.
  setInterval(place, 1000);
})();
