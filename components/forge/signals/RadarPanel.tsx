'use client';

/**
 * Reply Radar: rising posts in the niche, each with three replies drafted in
 * the user's voice.
 *
 * Nothing is posted from Forge. "Reply on X" opens X's own reply box with the
 * chosen draft filled in, and the user presses Reply.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/forge/client';
import type { RadarTarget } from '@/lib/x/radar';
import { replyIntent } from '@/lib/x/intent';
import { Button, Card, EmptyState, Spinner, cn, compactNumber } from '../ui';
import { UpsellCard } from '../views/UpsellCard';

function age(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function RadarPanel() {
  const [targets, setTargets] = useState<RadarTarget[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [upsell, setUpsell] = useState(false);

  const scan = async () => {
    setBusy(true);
    try {
      const data = await api<{ targets: RadarTarget[] }>('/api/signals/radar', { method: 'POST', json: {} });
      setTargets(data.targets);
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setUpsell(true);
      else toast.error(error instanceof ApiError ? error.message : 'The scan could not run.');
    } finally {
      setBusy(false);
    }
  };

  if (upsell) {
    return (
      <UpsellCard
        feature="reply_radar"
        body="Posts in your niche that are taking off right now, from accounts bigger than yours, with replies drafted in your voice. A good reply on the right post is the fastest way to be seen."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-[520px]">
          <h3 className="text-[15px] font-semibold text-white">Find posts worth replying to</h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">
            Rising in the last few hours, not yet buried in replies. You choose a draft, edit it in X, and press Reply yourself.
          </p>
        </div>
        <Button variant="primary" size="md" loading={busy} onClick={scan}>
          {targets ? 'Scan again' : 'Scan now'}
        </Button>
      </Card>

      {busy && !targets && (
        <div className="flex items-center gap-2 py-10 text-[13.5px] text-white/45">
          <Spinner /> Finding rising posts and drafting replies
        </div>
      )}

      {targets && targets.length === 0 && (
        <EmptyState
          plate="slag"
          title="Nothing rising right now"
          body="No posts in your niche are gaining traction in the last few hours. Try again later, or broaden your niche words."
        />
      )}

      {targets?.map((target) => <RadarCard key={target.id} target={target} />)}
    </div>
  );
}

function RadarCard({ target }: { target: RadarTarget }) {
  const [chosen, setChosen] = useState(0);
  const [text, setText] = useState(target.suggestions[0] ?? '');

  const choose = (index: number) => {
    setChosen(index);
    setText(target.suggestions[index] ?? '');
  };

  return (
    <Card className="p-6">
      <a href={target.url} target="_blank" rel="noopener noreferrer" className="block">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <span className="font-semibold text-white">{target.author.name}</span>
          <span className="text-white/45">
            @{target.author.username} · {compactNumber(target.author.followers)} followers · {age(target.ageMinutes)}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-relaxed text-white/85">{target.text}</p>
        <p className="mt-2 text-[12px] text-white/40 tabular-nums">
          {compactNumber(target.likes)} likes · {compactNumber(target.replies)} replies · {compactNumber(target.reposts)} reposts
        </p>
      </a>

      {target.suggestions.length > 0 && (
        <div className="mt-5 border-t border-white/[0.06] pt-5">
          <div className="flex flex-wrap gap-2">
            {target.suggestions.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => choose(index)}
                className={cn(
                  'h-8 rounded-full border px-3 text-[12.5px] transition-colors',
                  chosen === index ? 'border-white bg-white text-black' : 'border-white/[0.12] text-white/70 hover:text-white'
                )}
              >
                {['From experience', 'Adds to it', 'A question'][index] ?? `Option ${index + 1}`}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            aria-label="Reply draft"
            className="mt-3 w-full resize-y rounded-[16px] border border-white/[0.09] bg-white/[0.03] px-4 py-3 text-[16px] text-white outline-none focus:border-white/25 md:text-[14px]"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className={cn('text-[12px] tabular-nums', text.length > 280 ? 'text-forge-bad' : 'text-white/35')}>{text.length}/280</span>
            <a
              href={replyIntent(target.id, text)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-full bg-white px-4 text-[13.5px] font-medium text-black hover:bg-white/85"
            >
              Reply on X
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}
