'use client';

/**
 * Niche pulse: what the niche is discussing on X in the last 48 hours,
 * grouped into topics, each with an angle the user could take.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, useProfileStore } from '@/lib/forge/client';
import type { NichePulse } from '@/lib/x/pulse';
import { Button, Card, EmptyState, Spinner, compactNumber, relativeTime } from '../ui';
import { composeInChat } from '../views/ViewShell';
import { UpsellCard } from '../views/UpsellCard';

export function PulsePanel() {
  const { profile, load } = useProfileStore();
  const [pulse, setPulse] = useState<NichePulse | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'upsell' | 'no_niche' | 'error'>('idle');
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    setState('loading');
    try {
      const data = await api<{ pulse: NichePulse }>('/api/signals/pulse');
      setPulse(data.pulse);
      setState('idle');
    } catch (err) {
      if (err instanceof ApiError && err.isUpsell) setState('upsell');
      else if (err instanceof ApiError && err.status === 400) setState('no_niche');
      else {
        setError(err instanceof ApiError ? err.message : 'The pulse could not load.');
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (profile?.niche) void run();
    else if (profile) setState('no_niche');
  }, [profile?.niche, profile, run]);

  if (state === 'upsell') {
    return (
      <UpsellCard
        feature="niche_pulse"
        body="What your niche is talking about on X right now, grouped into topics with an angle for each, so your next post is timely instead of generic."
      />
    );
  }
  if (state === 'no_niche') {
    return (
      <EmptyState
        plate="steel"
        title="Set your niche first"
        body="Add two or three words that describe your niche under Brand, Settings. The pulse searches X for them."
      />
    );
  }
  if (state === 'loading' && !pulse) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13.5px] text-white/45">
        <Spinner /> Reading the last 48 hours in {profile?.niche}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <Card className="p-6">
        <p className="text-[14px] text-white/70">{error}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={run}>
          Try again
        </Button>
      </Card>
    );
  }
  if (!pulse) return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-white/45">
        {pulse.sampled} posts about {pulse.niche}, last 48 hours. Updated {relativeTime(pulse.generatedAt)}.
      </p>
      {pulse.topics.length === 0 ? (
        <EmptyState
          plate="slag"
          title="Quiet right now"
          body="Not enough posts in this niche in the last two days. Broader words in your niche setting will find more."
        />
      ) : (
        pulse.topics.map((topic) => (
          <Card key={topic.title} className="p-6">
            <h3 className="text-[17px] font-semibold text-white">{topic.title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-white/60">{topic.summary}</p>
            <div className="mt-4 rounded-2xl bg-forge-ember/[0.08] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-forge-gold">Your angle</p>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-white/90">{topic.angle}</p>
            </div>
            {topic.posts.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {topic.posts.slice(0, 2).map((post) => (
                  <li key={post.id}>
                    <a href={post.url} target="_blank" rel="noopener noreferrer" className="block rounded-[16px] bg-white/[0.03] p-3.5 hover:bg-white/[0.05]">
                      <p className="line-clamp-2 text-[13.5px] leading-relaxed text-white/75">{post.text}</p>
                      <p className="mt-1.5 text-[12px] text-white/40 tabular-nums">
                        @{post.author.username} · {compactNumber(post.likes)} likes · {compactNumber(post.replies)} replies
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={() =>
                composeInChat({
                  fresh: true,
                  send: true,
                  tool: null,
                  text: `My niche is talking about this right now: ${topic.title}. ${topic.summary}\nThe angle I want to take: ${topic.angle}\n\nWrite me an X post on it, in my voice, using my Story Bank for anything personal.`,
                })
              }
            >
              Write my take
            </Button>
          </Card>
        ))
      )}
    </div>
  );
}
