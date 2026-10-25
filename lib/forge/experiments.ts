/**
 * lib/forge/experiments.ts
 *
 * One experiment at a time, run inside the weekly plan.
 *
 * The Playbook finds patterns in what already happened, which is always
 * confounded: maybe question openings did well because they were about
 * better topics. An experiment fixes that by deciding the variable before
 * writing and alternating it across the plan, so each arm gets a fair mix
 * of topics. After enough posts in each arm it reports the difference, the
 * sample size, and whether the difference is larger than chance.
 *
 * THE TEST
 *
 * A permutation test on log relative engagement: shuffle the arm labels
 * thousands of times and count how often a difference at least this large
 * appears by chance. Exact enough for the 3 to 20 posts per arm a person
 * actually has, with no distributional assumptions. The shuffle uses a
 * seeded generator so the same data always gives the same answer.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DRAFT_COLUMNS } from './data/drafts';
import { scopeRows } from './data/workspace';
import { classifyHook } from './hooks';
import { HttpError } from './http';
import { computePlaybook, loadPostedPosts, type Playbook } from './playbook';
import { draftText } from './draft-text';
import type { DraftRecord } from './types';

export type ExperimentVariable = 'opening' | 'length' | 'ending' | 'daypart' | 'format';

export interface ExperimentArm {
  key: string;
  label: string;
  /** What the writer is told, or empty when the arm only changes timing. */
  instruction: string;
}

export interface ExperimentTemplate {
  variable: ExperimentVariable;
  title: string;
  hypothesis: string;
  a: ExperimentArm;
  b: ExperimentArm;
}

export const EXPERIMENT_TEMPLATES: readonly ExperimentTemplate[] = [
  {
    variable: 'opening',
    title: 'Question or statement openings',
    hypothesis: 'Opening with a question the reader wants answered gets more replies than opening with a statement.',
    a: { key: 'statement', label: 'Statement opening', instruction: 'Open with a flat, specific statement. Do not open with a question.' },
    b: { key: 'question', label: 'Question opening', instruction: 'Open with one specific question the reader will want answered. The rest of the post answers it.' },
  },
  {
    variable: 'length',
    title: 'Short or long posts',
    hypothesis: 'Shorter posts are read to the end more often and earn more engagement per post.',
    a: { key: 'short', label: 'Under 600 characters', instruction: 'Keep the whole post under 600 characters. One idea, no preamble.' },
    b: { key: 'long', label: '900 to 1,300 characters', instruction: 'Write 900 to 1,300 characters: the idea, the story behind it, and what to take from it.' },
  },
  {
    variable: 'ending',
    title: 'Ending on a question',
    hypothesis: 'Ending with a direct question invites more replies than ending on a statement.',
    a: { key: 'statement', label: 'Ends on a statement', instruction: 'End on a clear statement. No question at the end.' },
    b: { key: 'question', label: 'Ends on a question', instruction: 'End with one direct, specific question to the reader that is easy to answer.' },
  },
  {
    variable: 'daypart',
    title: 'Morning or evening',
    hypothesis: 'Your audience engages more with posts that go out in the morning than in the evening.',
    a: { key: 'morning', label: 'Morning', instruction: '' },
    b: { key: 'evening', label: 'Evening', instruction: '' },
  },
  {
    variable: 'format',
    title: 'Carousel or single post',
    hypothesis: 'The same ideas get more engagement as a carousel than as a single post.',
    a: { key: 'post', label: 'Single post', instruction: '' },
    b: { key: 'carousel', label: 'Carousel', instruction: '' },
  },
];

export function templateFor(variable: ExperimentVariable): ExperimentTemplate {
  const template = EXPERIMENT_TEMPLATES.find((t) => t.variable === variable);
  if (!template) throw new HttpError(400, 'Unknown experiment.');
  return template;
}

export interface ExperimentRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  variable: ExperimentVariable;
  arm_a: string;
  arm_b: string;
  hypothesis: string | null;
  target_per_arm: number;
  status: 'running' | 'complete' | 'stopped';
  result: ExperimentResult | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ExperimentResult {
  armA: { n: number; median: number };
  armB: { n: number; median: number };
  /** Median relative engagement of B divided by A. */
  lift: number | null;
  pValue: number | null;
  verdict: 'too_early' | 'a_better' | 'b_better' | 'no_difference';
  summary: string;
  evaluatedAt: string;
}

export const EXPERIMENT_COLUMNS = 'id, user_id, workspace_id, variable, arm_a, arm_b, hypothesis, target_per_arm, status, result, started_at, completed_at, created_at';

export async function runningExperiment(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<ExperimentRecord | null> {
  const query = db.from('experiments').select(EXPERIMENT_COLUMNS).eq('status', 'running');
  const { data } = await scopeRows(query, userId, workspaceId).maybeSingle();
  return (data as ExperimentRecord | null) ?? null;
}

export async function listExperiments(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<ExperimentRecord[]> {
  const query = db.from('experiments').select(EXPERIMENT_COLUMNS);
  const { data, error } = await scopeRows(query, userId, workspaceId).order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error(`Could not load experiments: ${error.message}`);
  return (data ?? []) as ExperimentRecord[];
}

export async function startExperiment(db: SupabaseClient, userId: string, workspaceId: string | null, variable: ExperimentVariable, targetPerArm = 4): Promise<ExperimentRecord> {
  if (await runningExperiment(db, userId, workspaceId)) throw new HttpError(409, 'An experiment is already running. Stop it first, or let it finish.');
  const template = templateFor(variable);
  const { data, error } = await db
    .from('experiments')
    .insert({ user_id: userId, workspace_id: workspaceId, variable, arm_a: template.a.key, arm_b: template.b.key, hypothesis: template.hypothesis, target_per_arm: targetPerArm })
    .select(EXPERIMENT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not start the experiment: ${error?.message ?? 'unknown error'}`);
  return data as ExperimentRecord;
}

export function armFor(experiment: Pick<ExperimentRecord, 'variable'>, arm: 'a' | 'b'): ExperimentArm {
  const template = templateFor(experiment.variable);
  return arm === 'a' ? template.a : template.b;
}

/** The arm with fewer drafts so far, so arms stay balanced across plans. */
export async function nextArm(db: SupabaseClient, experiment: ExperimentRecord): Promise<'a' | 'b'> {
  const { data } = await db.from('drafts').select('experiment_arm').eq('experiment_id', experiment.id).neq('status', 'archived');
  const rows = (data ?? []) as Array<{ experiment_arm: 'a' | 'b' | null }>;
  const a = rows.filter((r) => r.experiment_arm === 'a').length;
  const b = rows.filter((r) => r.experiment_arm === 'b').length;
  return a <= b ? 'a' : 'b';
}

/**
 * Suggests the experiment worth running next: the variable where the
 * author's history is most lopsided, because that is where they know least.
 */
export function suggestExperiment(playbook: Playbook): ExperimentTemplate {
  const scored = playbook.scored;
  if (scored.length === 0) return EXPERIMENT_TEMPLATES[0];

  const share = (predicate: (text: string, draft: DraftRecord) => boolean) => {
    const hits = scored.filter((p) => predicate(draftText(p.draft), p.draft)).length;
    return Math.min(hits, scored.length - hits) / scored.length;
  };

  const balance: Array<[ExperimentVariable, number]> = [
    ['opening', share((text) => classifyHook(text) === 'question')],
    ['ending', share((text) => /\?\s*$/.test(text.trim()))],
    ['length', share((text) => text.length < 600)],
    ['format', share((_, draft) => draft.kind === 'carousel')],
  ];
  balance.sort((x, y) => x[1] - y[1]);
  return templateFor(balance[0][0]);
}

// ============================================================================
// ANALYSIS
// ============================================================================

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Small deterministic generator (mulberry32), so a result never changes on reload. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two-sided permutation test on the difference of means of log values. */
export function permutationTest(a: number[], b: number[], iterations = 5000): number {
  const logs = [...a, ...b].map((v) => Math.log(Math.max(v, 0.01)));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const observed = Math.abs(mean(logs.slice(a.length)) - mean(logs.slice(0, a.length)));
  const random = seeded(a.length * 7919 + b.length * 104_729 + Math.round(observed * 1e6));

  let extreme = 0;
  const pool = [...logs];
  for (let i = 0; i < iterations; i++) {
    for (let j = pool.length - 1; j > 0; j--) {
      const k = Math.floor(random() * (j + 1));
      [pool[j], pool[k]] = [pool[k], pool[j]];
    }
    const diff = Math.abs(mean(pool.slice(a.length)) - mean(pool.slice(0, a.length)));
    if (diff >= observed - 1e-12) extreme += 1;
  }
  return (extreme + 1) / (iterations + 1);
}

export function analyse(experiment: Pick<ExperimentRecord, 'variable' | 'target_per_arm'>, armA: number[], armB: number[]): ExperimentResult {
  const template = templateFor(experiment.variable);
  const evaluatedAt = new Date().toISOString();
  const summaryOf = (arm: number[]) => ({ n: arm.length, median: arm.length ? Math.round(median(arm) * 100) / 100 : 0 });

  if (armA.length < 3 || armB.length < 3) {
    return {
      armA: summaryOf(armA),
      armB: summaryOf(armB),
      lift: null,
      pValue: null,
      verdict: 'too_early',
      summary: `Measuring. ${armA.length} of ${experiment.target_per_arm} ${template.a.label.toLowerCase()} and ${armB.length} of ${experiment.target_per_arm} ${template.b.label.toLowerCase()} posts have results.`,
      evaluatedAt,
    };
  }

  const lift = Math.round((median(armB) / Math.max(median(armA), 0.01)) * 100) / 100;
  const pValue = Math.round(permutationTest(armA, armB) * 1000) / 1000;
  const significant = pValue < 0.1;
  const verdict: ExperimentResult['verdict'] = !significant ? 'no_difference' : lift >= 1 ? 'b_better' : 'a_better';
  const shown = lift >= 1 ? lift : 1 / lift;
  const winner = lift >= 1 ? template.b.label : template.a.label;

  const summary = significant
    ? `${winner} did ${shown.toFixed(1)}x better (${armA.length} vs ${armB.length} posts; a gap this large happens by chance ${Math.round(pValue * 100)}% of the time).`
    : `No reliable difference yet: ${template.b.label.toLowerCase()} did ${lift.toFixed(1)}x ${template.a.label.toLowerCase()}, but a gap that size happens by chance ${Math.round(pValue * 100)}% of the time (${armA.length} vs ${armB.length} posts).`;

  return { armA: summaryOf(armA), armB: summaryOf(armB), lift, pValue, verdict, summary, evaluatedAt };
}

/**
 * Recomputes an experiment's result from its posted drafts, and completes it
 * once both arms have reached their target. Called whenever results arrive.
 */
export async function evaluateExperiment(db: SupabaseClient, experimentId: string, timeZone: string): Promise<ExperimentRecord | null> {
  const { data: experiment } = await db.from('experiments').select(EXPERIMENT_COLUMNS).eq('id', experimentId).maybeSingle();
  if (!experiment || experiment.status !== 'running') return (experiment as ExperimentRecord | null) ?? null;

  const posts = await loadPostedPosts(db, experiment.user_id, experiment.workspace_id, 400);
  const { scored } = computePlaybook(posts, timeZone);
  const inExperiment = scored.filter((post) => post.draft.experiment_id === experimentId);
  const armA = inExperiment.filter((p) => p.draft.experiment_arm === 'a').map((p) => p.relative);
  const armB = inExperiment.filter((p) => p.draft.experiment_arm === 'b').map((p) => p.relative);

  const result = analyse(experiment as ExperimentRecord, armA, armB);
  const done = armA.length >= experiment.target_per_arm && armB.length >= experiment.target_per_arm;

  const { data } = await db
    .from('experiments')
    .update({ result, ...(done ? { status: 'complete', completed_at: new Date().toISOString() } : {}) })
    .eq('id', experimentId)
    .select(EXPERIMENT_COLUMNS)
    .single();
  return (data as ExperimentRecord | null) ?? null;
}

/** Drafts in an experiment, for the Playbook's experiment card. */
export async function experimentDrafts(db: SupabaseClient, experimentId: string): Promise<DraftRecord[]> {
  const { data } = await db.from('drafts').select(DRAFT_COLUMNS).eq('experiment_id', experimentId).neq('status', 'archived').order('created_at');
  return (data ?? []) as DraftRecord[];
}
