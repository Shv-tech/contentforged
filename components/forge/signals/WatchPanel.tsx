'use client';

/**
 * Competitor watch: up to ten accounts, and what worked for them this week,
 * ranked by how far each post beat that account's own median.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/forge/client';
import type { WatchDigest, WatchedAccount } from '@/lib/forge/watch';
import { Button, Card, EmptyState, Spinner, cn, compactNumber, inputClass, relativeTime } from '../ui';
import { composeInChat } from '../views/ViewShell';
import { UpsellCard } from '../views/UpsellCard';

export function WatchPanel() {
  const [accounts, setAccounts] = useState<WatchedAccount[] | null>(null);
  const [max, setMax] = useState(10);
  const [digest, setDigest] = useState<WatchDigest | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [handle, setHandle] = useState('');
  const [adding, setAdding] = useState(false);
  const [upsell, setUpsell] = useState(false);

  const loadDigest = useCallback(async () => {
    setDigestLoading(true);
    try {
      setDigest((await api<{ digest: WatchDigest | null }>('/api/watch/digest')).digest);
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setUpsell(true);
    } finally {
      setDigestLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    const data = await api<{ accounts: WatchedAccount[]; max: number }>('/api/watch');
    setAccounts(data.accounts);
    setMax(data.max);
    return data.accounts;
  }, []);

  useEffect(() => {
    loadAccounts()
      .then((list) => {
        if (list.length > 0) void loadDigest();
      })
      .catch(() => setAccounts([]));
  }, [loadAccounts, loadDigest]);

  const add = async () => {
    if (!handle.trim()) return;
    setAdding(true);
    try {
      await api('/api/watch', { method: 'POST', json: { handle } });
      setHandle('');
      await loadAccounts();
      void loadDigest();
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setUpsell(true);
      else toast.error(error instanceof ApiError ? error.message : 'Could not add that account.');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/watch/${id}`, { method: 'DELETE' });
      const list = await loadAccounts();
      if (list.length > 0) void loadDigest();
      else setDigest(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove that account.');
    }
  };

  if (upsell) {
    return (
      <UpsellCard
        feature="competitor_watch"
        body="Follow up to ten accounts and get their best posts of the week, ranked by how far each beat that account's usual, with the openings that worked."
      />
    );
  }

  if (!accounts) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13.5px] text-white/45">
        <Spinner /> Loading
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@account to watch"
            aria-label="Account to watch"
            className={cn(inputClass, 'h-11 flex-1 rounded-full py-0')}
          />
          <Button type="submit" variant="primary" size="md" loading={adding} disabled={!handle.trim() || accounts.length >= max}>
            Watch
          </Button>
        </form>
        {accounts.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1 pl-3 pr-1 text-[13px] text-white/80"
              >
                @{account.handle}
                <button
                  type="button"
                  onClick={() => remove(account.id)}
                  aria-label={`Stop watching @${account.handle}`}
                  className="rounded-full p-1 text-white/40 hover:bg-white/[0.08] hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
            <li className="self-center text-[12px] text-white/35">
              {accounts.length} of {max}
            </li>
          </ul>
        )}
      </Card>

      {accounts.length === 0 ? (
        <EmptyState
          plate="steel"
          title="Watch the accounts you measure yourself against"
          body="Add a few people in your niche. Each week Forge shows which of their posts beat their own usual, and how those posts opened."
        />
      ) : digestLoading && !digest ? (
        <div className="flex items-center gap-2 py-10 text-[13.5px] text-white/45">
          <Spinner /> Reading their week
        </div>
      ) : digest ? (
        <>
          {digest.hooks.length > 0 && (
            <Card className="p-6">
              <h3 className="text-[15px] font-semibold text-white">Openings that worked for them this week</h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {digest.hooks.map((hook) => (
                  <li key={hook.type} className="rounded-full bg-white/[0.05] px-3 py-1.5 text-[13px] text-white/80">
                    {hook.label}{' '}
                    <span className="text-white/40">
                      {hook.medianLift}x usual, {hook.posts} posts
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div>
            <h3 className="mb-3 text-[13px] font-semibold text-white/45">Best posts this week · updated {relativeTime(digest.generatedAt)}</h3>
            {digest.top.length === 0 ? (
              <p className="text-[14px] text-white/45">None of them posted this week.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {digest.top.map((post) => (
                  <li key={post.id}>
                    <Card className="p-5">
                      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                        <span className="font-semibold text-white">@{post.handle}</span>
                        <span className="rounded-full bg-forge-ember/15 px-2 py-0.5 font-medium text-forge-gold">{post.lift}x their usual</span>
                        <span className="text-white/35">{relativeTime(post.createdAt)}</span>
                      </div>
                      <p className="mt-2.5 line-clamp-5 whitespace-pre-wrap text-[14px] leading-relaxed text-white/80">{post.text}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[12px] text-white/40 tabular-nums">
                          {compactNumber(post.likes)} likes · {compactNumber(post.replies)} replies · {compactNumber(post.reposts)} reposts
                        </span>
                        <span className="flex gap-2">
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center rounded-full border border-white/[0.12] px-3 text-[12.5px] text-white hover:bg-white/[0.06]"
                          >
                            Open
                          </a>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              composeInChat({
                                fresh: true,
                                send: true,
                                tool: null,
                                text: `This post from @${post.handle} did ${post.lift}x their usual this week:\n\n${post.text}\n\nDo not copy it. Work out why it worked, then write my own post on a related idea, in my voice, from my Story Bank.`,
                              })
                            }
                          >
                            Learn from it
                          </Button>
                        </span>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
