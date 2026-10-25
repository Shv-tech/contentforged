'use client';

/**
 * Browser extension access. A token is shown exactly once, at creation, to
 * paste into the extension; afterwards only its label and last use are
 * visible, and it can be revoked at any time.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/forge/client';
import { Button, Card, relativeTime } from '../ui';

interface TokenRecord {
  id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

export function ExtensionCard() {
  const [tokens, setTokens] = useState<TokenRecord[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [upsell, setUpsell] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTokens((await api<{ tokens: TokenRecord[] }>('/api/extension/tokens')).tokens);
    } catch {
      setTokens([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const result = await api<{ token: string }>('/api/extension/tokens', { method: 'POST', json: { label: 'Chrome extension' } });
      setFresh(result.token);
      void load();
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setUpsell(error.message);
      else toast.error(error instanceof ApiError ? error.message : 'Could not create a token.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api(`/api/extension/tokens/${id}`, { method: 'DELETE' });
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not revoke the token.');
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[520px]">
          <h3 className="text-[15px] font-semibold text-white">Browser extension</h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">
            Grade what you are writing inside X and LinkedIn, check it against your voice, and save posts and stories to Forge from any page.
          </p>
        </div>
        <Button variant="secondary" size="sm" loading={busy} onClick={create}>
          Create access token
        </Button>
      </div>

      {upsell && <p className="mt-4 text-[13px] text-white/60">{upsell}</p>}

      {fresh && (
        <div className="mt-5 rounded-[16px] border border-forge-ember/30 bg-forge-ember/[0.06] p-4">
          <p className="text-[13px] text-white/80">Paste this into the extension. It will not be shown again.</p>
          <div className="mt-3 flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-black/50 px-3 py-2 font-mono text-[12.5px] text-white">{fresh}</code>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(fresh);
                toast.success('Copied.');
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="mt-5 flex flex-col divide-y divide-white/[0.05]">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block text-[13.5px] text-white">{token.label}</span>
                <span className="block text-[12px] text-white/40">
                  Created {relativeTime(token.created_at)} · {token.last_used_at ? `last used ${relativeTime(token.last_used_at)}` : 'never used'}
                </span>
              </span>
              <Button variant="quiet" size="xs" onClick={() => revoke(token.id)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
