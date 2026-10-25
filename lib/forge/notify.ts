/**
 * lib/forge/notify.ts
 *
 * Product notifications, by email and push, each behind its own switch in
 * Account, Notifications. Every send here checks the person's preferences
 * first; defaults (no row yet) are the column defaults in the migration.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { sendDraftCommentEmail, sendResultEmail, sendWeeklyPlanEmail, type WeeklyPlanEmailDraft } from '@/lib/mail-service';
import { appUrl } from './app-url';
import { personById } from './profile';
import { sendPush } from './push';

export interface NotificationPreferences {
  plan_email: boolean;
  plan_push: boolean;
  comments_email: boolean;
  comments_push: boolean;
  reports_email: boolean;
  results_email: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  plan_email: true,
  plan_push: true,
  comments_email: true,
  comments_push: true,
  reports_email: true,
  results_email: false,
};

export const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES) as Array<keyof NotificationPreferences>;

export async function preferencesFor(userId: string): Promise<NotificationPreferences> {
  const { data } = await createServiceClient().from('notification_preferences').select(PREFERENCE_KEYS.join(', ')).eq('user_id', userId).maybeSingle();
  return { ...DEFAULT_PREFERENCES, ...((data as Partial<NotificationPreferences> | null) ?? {}) };
}

export async function savePreferences(userId: string, patch: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  const next = { ...(await preferencesFor(userId)), ...patch };
  const { error } = await createServiceClient().from('notification_preferences').upsert({ user_id: userId, ...next }, { onConflict: 'user_id' });
  if (error) throw new Error(`Could not save preferences: ${error.message}`);
  return next;
}

export async function notifyPlanReady(args: { userId: string; brandName: string | null; drafts: WeeklyPlanEmailDraft[]; note: string | null }): Promise<{ email: boolean; push: number }> {
  const [person, preferences] = await Promise.all([personById(args.userId), preferencesFor(args.userId)]);
  if (!person) return { email: false, push: 0 };

  const reviewPath = args.drafts.length > 0 ? '/review' : '/capture';
  const email = preferences.plan_email
    ? await sendWeeklyPlanEmail({ to: person.email, firstName: person.firstName, brandName: args.brandName, drafts: args.drafts, reviewUrl: `${appUrl()}${reviewPath}`, note: args.note })
    : false;
  const push = preferences.plan_push
    ? await sendPush(args.userId, {
        title: args.drafts.length > 0 ? 'Your week is ready' : 'Your weekly plan needs material',
        body:
          args.drafts.length > 0
            ? `${args.drafts.length} draft${args.drafts.length === 1 ? '' : 's'}${args.brandName ? ` for ${args.brandName}` : ''}, graded and timed. About ten minutes.`
            : 'Record a voice note and next week writes itself from it.',
        url: reviewPath,
        tag: 'weekly-plan',
      })
    : 0;
  return { email, push };
}

export async function notifyComment(args: {
  recipientIds: string[];
  authorName: string;
  workspaceName: string | null;
  draftId: string;
  excerpt: string;
  quote: string | null;
  comment: string;
}): Promise<void> {
  const url = `${appUrl()}/drafts/${args.draftId}`;
  for (const userId of Array.from(new Set(args.recipientIds))) {
    const [person, preferences] = await Promise.all([personById(userId), preferencesFor(userId)]);
    if (!person) continue;
    if (preferences.comments_email) {
      await sendDraftCommentEmail({ to: person.email, authorName: args.authorName, workspaceName: args.workspaceName, excerpt: args.excerpt, quote: args.quote, comment: args.comment, url });
    }
    if (preferences.comments_push) {
      await sendPush(userId, { title: `${args.authorName} commented`, body: args.comment.slice(0, 140), url: `/drafts/${args.draftId}`, tag: `comment-${args.draftId}` });
    }
  }
}

/** A post did far better than the author's usual. Told once per post. */
export const STANDOUT_RESULT = 2.5;

export async function notifyStandoutPost(args: { userId: string; draftId: string; relative: number; opening: string }): Promise<boolean> {
  const [person, preferences] = await Promise.all([personById(args.userId), preferencesFor(args.userId)]);
  if (!person || !preferences.results_email) return false;
  return sendResultEmail({
    to: person.email,
    firstName: person.name,
    label: 'A post that worked',
    title: `${args.relative.toFixed(1)}x your usual`,
    detail: `"${args.opening}" did ${args.relative.toFixed(1)} times better than your usual post on its platform. Worth a look at why, and worth running a version of again.`,
    url: `${appUrl()}/drafts/${args.draftId}`,
    cta: 'See what worked',
  });
}

export async function notifyExperimentResult(args: { userId: string; summary: string; armA: string; armB: string }): Promise<boolean> {
  const [person, preferences] = await Promise.all([personById(args.userId), preferencesFor(args.userId)]);
  if (!person || !preferences.results_email) return false;
  return sendResultEmail({
    to: person.email,
    firstName: person.name,
    label: 'Experiment finished',
    title: `${args.armA} or ${args.armB}: the answer`,
    detail: args.summary,
    url: `${appUrl()}/dashboard?view=playbook&tab=experiments`,
    cta: 'See the result',
  });
}

