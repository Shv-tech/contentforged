/**
 * lib/forge/data/rules.ts
 *
 * Writing rules: accepted edit-learning suggestions, preferences stated in
 * chat, and rules added by hand. Accepted rules are injected into every
 * generation and banned phrases feed the slop filter.
 *
 * WHERE A RULE LIVES
 *
 * In a client workspace every rule belongs to the client. In a company
 * workspace there are two layers: brand guardrails, added by hand and shared
 * by everyone, and each member's personal habits, learned from their own
 * edits and chat. Generation applies both.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { bannedPhraseFromRule, extractSignals, suggestRules, type EditSignals, type RuleSuggestion } from '../learning';
import type { LearnedRule, LearnedRuleKind } from '../types';
import { scopeRows, workspaceKind } from './workspace';

const RULE_COLUMNS = 'id, user_id, workspace_id, rule, kind, signal_key, evidence_count, status, source, created_at';

/** Where rules learned from one person's habits are kept for this brand. */
async function personalScopeId(db: SupabaseClient, workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  return (await workspaceKind(db, workspaceId)) === 'company' ? null : workspaceId;
}

async function rulesIn(db: SupabaseClient, userId: string, scopeId: string | null): Promise<LearnedRule[]> {
  const query = db.from('learned_rules').select(RULE_COLUMNS);
  const { data, error } = await scopeRows(query, userId, scopeId).order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load writing rules: ${error.message}`);
  return (data ?? []) as LearnedRule[];
}

/** The rules shown in Brand, Rules for this brand. */
export async function listRules(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<LearnedRule[]> {
  return rulesIn(db, userId, workspaceId);
}

/** Every accepted rule that applies when writing for this brand. */
export async function acceptedRules(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<LearnedRule[]> {
  const brand = await rulesIn(db, userId, workspaceId);
  const personalId = await personalScopeId(db, workspaceId);
  const personal = workspaceId && personalId === null ? await rulesIn(db, userId, null) : [];

  const seen = new Set<string>();
  return [...brand, ...personal].filter((rule) => {
    if (rule.status !== 'accepted') return false;
    const key = rule.rule.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function bannedPhrasesFrom(rules: LearnedRule[]): string[] {
  return rules
    .filter((rule) => rule.status === 'accepted' && rule.kind === 'banned_phrase')
    .map((rule) => bannedPhraseFromRule(rule.rule))
    .filter((phrase): phrase is string => phrase !== null);
}

export async function addRule(
  db: SupabaseClient,
  userId: string,
  workspaceId: string | null,
  input: { rule: string; kind: LearnedRuleKind; source: LearnedRule['source']; signalKey?: string | null; status?: LearnedRule['status']; evidence?: number }
): Promise<LearnedRule> {
  // Hand-written rules are brand guardrails; learned ones are personal habits.
  const scopeId = input.source === 'manual' ? workspaceId : await personalScopeId(db, workspaceId);

  const row = {
    user_id: userId,
    workspace_id: scopeId,
    rule: input.rule.trim().slice(0, 280),
    kind: input.kind,
    source: input.source,
    signal_key: input.signalKey ?? null,
    status: input.status ?? 'accepted',
    evidence_count: input.evidence ?? 0,
  };

  // Accepting a suggestion that already exists for this brand (for example
  // as 'suggested') updates it rather than adding a duplicate.
  if (input.signalKey) {
    const existingQuery = db.from('learned_rules').select('id').eq('signal_key', input.signalKey);
    const { data: existing } = await scopeRows(existingQuery, userId, scopeId).maybeSingle();
    if (existing) {
      const { data, error } = await db.from('learned_rules').update(row).eq('id', existing.id).select(RULE_COLUMNS).single();
      if (error || !data) throw new Error(`Could not save the rule: ${error?.message ?? 'unknown error'}`);
      return data as LearnedRule;
    }
  }

  const { data, error } = await db.from('learned_rules').insert(row).select(RULE_COLUMNS).single();
  if (error || !data) throw new Error(`Could not save the rule: ${error?.message ?? 'unknown error'}`);
  return data as LearnedRule;
}

/**
 * Records one user edit and returns any new suggestions it unlocked.
 * Suggestions are computed from the last twelve user edits, never from
 * edits Forge itself made (origin 'assist'), so a rewrite chip cannot teach
 * the model its own habits.
 */
export async function recordEdit(
  db: SupabaseClient,
  userId: string,
  workspaceId: string | null,
  draftId: string,
  before: string,
  after: string,
  origin: 'user' | 'assist'
): Promise<RuleSuggestion[]> {
  if (before.trim() === after.trim()) return [];

  const signals = extractSignals(before, after);
  await db.from('draft_edits').insert({
    user_id: userId,
    draft_id: draftId,
    before_text: before.slice(0, 20_000),
    after_text: after.slice(0, 20_000),
    signals,
    origin,
  });

  if (origin !== 'user') return [];
  return pendingSuggestions(db, userId, workspaceId);
}

export async function pendingSuggestions(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<RuleSuggestion[]> {
  const [{ data: edits }, rules] = await Promise.all([
    db.from('draft_edits').select('signals').eq('user_id', userId).eq('origin', 'user').order('created_at', { ascending: false }).limit(12),
    personalScopeId(db, workspaceId).then((scopeId) => rulesIn(db, userId, scopeId)),
  ]);

  const known = new Set(rules.map((rule) => rule.signal_key).filter((key): key is string => Boolean(key)));
  const recent = (edits ?? []).map((row: { signals: EditSignals }) => row.signals).filter(Boolean);
  return suggestRules(recent, known);
}
