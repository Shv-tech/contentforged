'use client';

/**
 * Story Bank: the true things Forge is allowed to write about. Stories,
 * numbers, wins, failures, beliefs, facts. Forge searches here before it
 * drafts and marks what it does not know with [brackets] instead of
 * inventing it, so this list is what makes drafts specific.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError, WORKSPACE_CHANGED_EVENT } from '@/lib/forge/client';
import { STORY_KIND_LABELS, type StoryItem, type StoryKind } from '@/lib/forge/types';
import { Button, Card, EmptyState, Field, Segmented, Spinner, Tag, cn, inputClass, relativeTime } from '../ui';
import { composeInChat } from '../views/ViewShell';

const KINDS = Object.keys(STORY_KIND_LABELS) as StoryKind[];

const KIND_HINTS: Record<StoryKind, string> = {
  story: 'Something that happened: a scene with people in it.',
  metric: 'A real number with its context: what, when, compared to what.',
  win: 'A result you are proud of and how it came about.',
  failure: 'Something that went wrong and what it taught you.',
  opinion: 'Something you believe that others in your field might not.',
  fact: 'A fact about you or your work that does not change often.',
};

export function StoryBankPanel() {
  const [stories, setStories] = useState<StoryItem[] | null>(null);
  const [kind, setKind] = useState<StoryKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ stories: StoryItem[] }>('/api/stories');
      setStories(data.stories);
    } catch (error) {
      setStories([]);
      toast.error(error instanceof ApiError ? error.message : 'Could not load your Story Bank.');
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, load);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, load);
  }, [load]);

  const visible = useMemo(() => {
    if (!stories) return [];
    const q = query.trim().toLowerCase();
    return stories.filter(
      (story) => (kind === 'all' || story.kind === kind) && (!q || `${story.title} ${story.body} ${story.tags.join(' ')}`.toLowerCase().includes(q))
    );
  }, [stories, kind, query]);

  if (!stories) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13.5px] text-white/45">
        <Spinner /> Loading your Story Bank
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {adding ? (
        <StoryEditor
          onCancel={() => setAdding(false)}
          onSaved={(story) => {
            setStories([story, ...stories]);
            setAdding(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[520px] text-[14px] leading-relaxed text-white/55">
            Forge saves stories you tell it in chat here, and searches them before every draft. Add the ones you tell most often.
          </p>
          <Button variant="primary" size="md" onClick={() => setAdding(true)}>
            Add to Story Bank
          </Button>
        </div>
      )}

      {stories.length === 0 && !adding ? (
        <EmptyState
          plate="ingot"
          title="Nothing true to work with yet"
          body="Without stories Forge writes with [brackets] where your specifics go. Add a few: the client who almost walked, the launch that flopped, the number you are proudest of."
          action={
            <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
              Add the first one
            </Button>
          }
        />
      ) : (
        stories.length > 0 && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="-mx-1 overflow-x-auto px-1">
                <Segmented
                  label="Filter by kind"
                  value={kind}
                  onChange={setKind}
                  options={[{ value: 'all', label: 'All' }, ...KINDS.map((k) => ({ value: k, label: STORY_KIND_LABELS[k] }))]}
                />
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stories"
                aria-label="Search stories"
                className="h-10 w-full rounded-full border border-white/[0.08] bg-white/[0.03] px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-white/20 sm:w-[240px] sm:text-[14px]"
              />
            </div>

            {visible.length === 0 ? (
              <p className="py-10 text-center text-[14px] text-white/45">No stories match.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {visible.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    onChanged={(next) => setStories(stories.map((s) => (s.id === next.id ? next : s)))}
                    onRemoved={() => setStories(stories.filter((s) => s.id !== story.id))}
                  />
                ))}
              </ul>
            )}
          </>
        )
      )}
    </div>
  );
}

function StoryCard({ story, onChanged, onRemoved }: { story: StoryItem; onChanged: (story: StoryItem) => void; onRemoved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <li className="md:col-span-2">
        <StoryEditor
          story={story}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            onChanged(next);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  const remove = async () => {
    try {
      await api(`/api/stories/${story.id}`, { method: 'DELETE' });
      onRemoved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete that story.');
    }
  };

  return (
    <li className="flex flex-col rounded-[20px] border border-white/[0.06] bg-forge-card p-5">
      <div className="flex items-center gap-2">
        <Tag tone="ember">{STORY_KIND_LABELS[story.kind]}</Tag>
        {story.occurred_on && (
          <span className="text-[12px] text-white/40">{new Date(story.occurred_on).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
        )}
        <span className="ml-auto text-[11.5px] text-white/35">{story.use_count > 0 ? `Used ${story.use_count}x` : 'Not used yet'}</span>
      </div>
      <h4 className="mt-3 text-[15px] font-semibold text-white">{story.title}</h4>
      <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/65">{story.body}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-4">
        <Button
          variant="secondary"
          size="xs"
          onClick={() =>
            composeInChat({
              fresh: true,
              tool: null,
              text: `Write a post from this ${STORY_KIND_LABELS[story.kind].toLowerCase()} in my Story Bank. Keep every fact as it is.\n\n[STORY: ${story.title}]\n${story.body}\n[/STORY]`,
            })
          }
        >
          Write from this
        </Button>
        <Button variant="quiet" size="xs" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {confirming ? (
          <Button variant="danger" size="xs" onClick={remove}>
            Delete for good
          </Button>
        ) : (
          <Button variant="quiet" size="xs" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
        <span className="ml-auto text-[11.5px] text-white/30">{relativeTime(story.updated_at)}</span>
      </div>
    </li>
  );
}

function StoryEditor({ story, onCancel, onSaved }: { story?: StoryItem; onCancel: () => void; onSaved: (story: StoryItem) => void }) {
  const [kind, setKind] = useState<StoryKind>(story?.kind ?? 'story');
  const [title, setTitle] = useState(story?.title ?? '');
  const [body, setBody] = useState(story?.body ?? '');
  const [occurredOn, setOccurredOn] = useState(story?.occurred_on ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { kind, title: title.trim(), body: body.trim(), occurred_on: occurredOn || null };
      const result = story
        ? await api<{ story: StoryItem }>(`/api/stories/${story.id}`, { method: 'PATCH', json: payload })
        : await api<{ story: StoryItem }>('/api/stories', { method: 'POST', json: { ...payload, tags: [] } });
      onSaved(result.story);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that story.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5">
        <div>
          <div className="-mx-1 overflow-x-auto px-1">
            <Segmented label="Kind" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: STORY_KIND_LABELS[k] }))} />
          </div>
          <p className="mt-2 text-[12.5px] text-white/45">{KIND_HINTS[kind]}</p>
        </div>
        <Field label="Title" htmlFor="story-title" hint="A few words you would recognise it by.">
          <input
            id="story-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            className={inputClass}
            placeholder="The client who almost walked"
          />
        </Field>
        <Field label="What happened" htmlFor="story-body" hint="The facts, plainly. Names, numbers and dates are what make a post believable.">
          <textarea id="story-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={4000} className={cn(inputClass, 'resize-y')} />
        </Field>
        <Field label="When (optional)" htmlFor="story-date">
          <input
            id="story-date"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className={cn(inputClass, 'w-auto [color-scheme:dark]')}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="quiet" size="md" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="md" loading={busy} onClick={save} disabled={!title.trim() || !body.trim()}>
            {story ? 'Save' : 'Add to Story Bank'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
