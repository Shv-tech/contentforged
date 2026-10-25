'use client';

/**
 * Rules: the standing instructions Forge follows for this brand.
 *
 * Three sources: said in chat ("never use the word synergy"), learned from
 * how the user edits drafts (offered as a suggestion and only applied once
 * accepted), and added here by hand. Every rule is visible and removable;
 * nothing Forge learns about a writer is hidden from them.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError, useVoiceStore, WORKSPACE_CHANGED_EVENT } from '@/lib/forge/client';
import type { RuleSuggestion } from '@/lib/forge/learning';
import type { LearnedRule, LearnedRuleKind } from '@/lib/forge/types';
import { Button, Card, Segmented, Spinner, Tag, cn, inputClass } from '../ui';

const KIND_LABELS: Record<LearnedRuleKind, string> = {
  preference: 'Preference',
  banned_phrase: 'Never write',
  structure: 'Structure',
  format: 'Format',
};

const SOURCE_LABELS: Record<LearnedRule['source'], string> = {
  chat: 'From chat',
  edits: 'From your edits',
  manual: 'Added here',
};

export function RulesPanel() {
  const [rules, setRules] = useState<LearnedRule[] | null>(null);
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api<{ rules: LearnedRule[]; suggestions: RuleSuggestion[] }>('/api/rules');
      setRules(data.rules.filter((rule) => rule.status === 'accepted'));
      setSuggestions(data.suggestions);
    } catch (error) {
      setRules([]);
      toast.error(error instanceof ApiError ? error.message : 'Could not load your rules.');
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, load);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, load);
  }, [load]);

  // Banned phrases feed the live voice meter, so it reloads with the rules.
  const changed = () => {
    void load();
    void useVoiceStore.getState().load(true);
  };

  if (!rules) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13.5px] text-white/45">
        <Spinner /> Loading your rules
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {suggestions.length > 0 && (
        <Card className="border-forge-ember/25 p-6">
          <h3 className="text-[15px] font-semibold text-white">Learned from your edits</h3>
          <p className="mt-1 text-[13.5px] text-white/55">Patterns in how you change Forge&apos;s drafts. Nothing applies until you say yes.</p>
          <ul className="mt-4 flex flex-col gap-3">
            {suggestions.map((suggestion) => (
              <SuggestionRow key={suggestion.signalKey} suggestion={suggestion} onAnswered={changed} />
            ))}
          </ul>
        </Card>
      )}

      <AddRule onAdded={changed} />

      {rules.length === 0 ? (
        <p className="rounded-[20px] border border-dashed border-white/[0.1] px-6 py-10 text-center text-[14px] leading-relaxed text-white/45">
          No rules yet. Tell Forge in chat (&ldquo;stop opening with questions&rdquo;) or add one above, and it applies to every draft from then on.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/[0.05] rounded-[22px] border border-white/[0.07] bg-forge-card">
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} onChanged={changed} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionRow({ suggestion, onAnswered }: { suggestion: RuleSuggestion; onAnswered: () => void }) {
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const answer = async (action: 'accept' | 'reject') => {
    setBusy(action);
    try {
      await api('/api/rules', {
        method: 'POST',
        json: { action, signalKey: suggestion.signalKey, rule: suggestion.rule, kind: suggestion.kind, evidence: suggestion.evidence },
      });
      if (action === 'accept') toast.success('Rule saved. It applies from the next draft.');
      onAnswered();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that.');
      setBusy(null);
    }
  };
  return (
    <li className="flex flex-col gap-3 rounded-[16px] bg-white/[0.03] p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-white">{suggestion.prompt}</p>
        <p className="mt-1 text-[12px] text-white/40">
          Seen in {suggestion.evidence} of your last {suggestion.outOf} edits
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="quiet" size="sm" loading={busy === 'reject'} disabled={busy !== null} onClick={() => answer('reject')}>
          No
        </Button>
        <Button variant="primary" size="sm" loading={busy === 'accept'} disabled={busy !== null} onClick={() => answer('accept')}>
          Yes, always
        </Button>
      </div>
    </li>
  );
}

function AddRule({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<LearnedRuleKind>('preference');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const rule = text.trim();
    if (rule.length < 3) return;
    setBusy(true);
    try {
      await api('/api/rules', { method: 'POST', json: { action: 'add', rule, kind } });
      setText('');
      onAdded();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not add that rule.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3">
        <Segmented
          label="Rule type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'preference', label: 'Preference' },
            { value: 'banned_phrase', label: 'Never write' },
            { value: 'structure', label: 'Structure' },
          ]}
        />
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && add()}
            maxLength={280}
            placeholder={
              kind === 'banned_phrase' ? 'A word or phrase, for example: game-changer' : 'For example: end with a question only when it is a real one'
            }
            aria-label="New rule"
            className={cn(inputClass, 'h-11 flex-1 rounded-full py-0')}
          />
          <Button variant="primary" size="md" loading={busy} onClick={add} disabled={text.trim().length < 3}>
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RuleRow({ rule, onChanged }: { rule: LearnedRule; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(rule.rule);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const next = text.trim();
    if (next === rule.rule || next.length < 3) {
      setEditing(false);
      setText(rule.rule);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/rules/${rule.id}`, { method: 'PATCH', json: { rule: next } });
      setEditing(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that rule.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/rules/${rule.id}`, { method: 'DELETE' });
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove that rule.');
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') {
                setText(rule.rule);
                setEditing(false);
              }
            }}
            maxLength={280}
            aria-label="Rule"
            className={cn(inputClass, 'h-10 py-0')}
          />
        ) : (
          <p className="text-[14.5px] text-white/90">{rule.rule}</p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Tag tone={rule.kind === 'banned_phrase' ? 'bad' : 'neutral'}>{KIND_LABELS[rule.kind]}</Tag>
          <span className="self-center text-[11.5px] text-white/35">{SOURCE_LABELS[rule.source]}</span>
        </div>
      </div>
      {!editing && (
        <div className="flex shrink-0 gap-1">
          <Button variant="quiet" size="xs" onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </Button>
          <Button variant="quiet" size="xs" onClick={remove} disabled={busy}>
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}
