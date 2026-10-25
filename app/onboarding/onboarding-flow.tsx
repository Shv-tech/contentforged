'use client';

/**
 * Three minutes from sign-up to a first draft that sounds like the user.
 *
 *   1. Who you are: name, niche, X handle
 *   2. Your voice: import recent X posts, or paste a few
 *   3. Something true: one or two stories for the Story Bank
 *   4. Your first post, written in chat from what was just collected
 *
 * Steps 2 and 3 can be skipped. Every step writes as it goes, so leaving
 * halfway keeps what was entered.
 */

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { api, ApiError, useProfileStore } from '@/lib/forge/client';
import { STORY_KIND_LABELS, type StoryKind } from '@/lib/forge/types';
import { Button, Field, Plate, Segmented, cn, inputClass } from '@/components/forge/ui';
import { composeInChat } from '@/components/forge/views/ViewShell';

type Step = 0 | 1 | 2 | 3;

const STEP_TITLES = ['You', 'Your voice', 'Something true', 'Your first post'];

export function OnboardingFlow() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { user, setUserFullName } = useAppStore();
  const { profile, load, update } = useProfileStore();
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [handle, setHandle] = useState('');
  const [pasted, setPasted] = useState('');
  const [voiceCount, setVoiceCount] = useState(0);
  const [storyKind, setStoryKind] = useState<StoryKind>('story');
  const [storyTitle, setStoryTitle] = useState('');
  const [storyBody, setStoryBody] = useState('');
  const [stories, setStories] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<'linkedin' | 'x'>('linkedin');

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user?.fullName && !name) setName(user.fullName);
  }, [user?.fullName, name]);

  useEffect(() => {
    if (!profile) return;
    if (profile.onboarded_at) router.replace('/dashboard');
    if (profile.niche && !niche) setNiche(profile.niche);
    if (profile.x_handle && !handle) setHandle(profile.x_handle);
    // Prefill once from the stored profile; later edits are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const fail = (error: unknown, fallback: string) => toast.error(error instanceof ApiError ? error.message : fallback);

  const saveIdentity = async () => {
    setBusy(true);
    try {
      if (name.trim() && name.trim() !== user?.fullName) {
        const { error } = await createClient().auth.updateUser({ data: { full_name: name.trim() } });
        if (error) throw error;
        setUserFullName(name.trim());
      }
      await update({ niche: niche.trim() || null, x_handle: handle.trim() || null });
      setStep(1);
    } catch (error) {
      fail(error, 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const importVoice = async () => {
    setBusy(true);
    try {
      const result = await api<{ added: number; fingerprint: { sample_count: number } }>('/api/voice', {
        method: 'POST',
        json: { source: 'x_import', handle: handle.trim() || undefined },
      });
      setVoiceCount(result.fingerprint.sample_count);
      toast.success(`Read ${result.added} of your posts.`);
      setStep(2);
    } catch (error) {
      fail(error, 'Could not import from X. Paste a few posts instead.');
    } finally {
      setBusy(false);
    }
  };

  const pasteVoice = async () => {
    setBusy(true);
    try {
      const result = await api<{ added: number; fingerprint: { sample_count: number } }>('/api/voice', {
        method: 'POST',
        json: { source: 'paste', text: pasted, platform: platform === 'x' ? 'x' : 'linkedin' },
      });
      setVoiceCount(result.fingerprint.sample_count);
      setStep(2);
    } catch (error) {
      fail(error, 'Could not add those posts.');
    } finally {
      setBusy(false);
    }
  };

  const addStory = async () => {
    setBusy(true);
    try {
      await api('/api/stories', { method: 'POST', json: { kind: storyKind, title: storyTitle.trim(), body: storyBody.trim(), tags: [] } });
      setStories([...stories, storyTitle.trim()]);
      setStoryTitle('');
      setStoryBody('');
    } catch (error) {
      fail(error, 'Could not save that story.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async (withPost: boolean) => {
    setBusy(true);
    try {
      await update({ onboarded: true });
      if (withPost && topic.trim()) {
        composeInChat({
          fresh: true,
          send: true,
          tool: null,
          text: `Write my first ${platform === 'x' ? 'X' : 'LinkedIn'} post about: ${topic.trim()}${stories.length > 0 ? '\nUse my Story Bank where it fits.' : ''}`,
        });
      }
      router.replace('/dashboard');
    } catch (error) {
      fail(error, 'Could not finish setup.');
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-[100dvh] bg-black font-sans text-white lg:grid-cols-[1fr_1.1fr]">
      <section className="flex flex-col px-6 py-8 sm:px-12 lg:py-12">
        <div className="flex items-center gap-2.5">
          <Image src="/logos/forge.svg" alt="" width={26} height={26} priority />
          <span className="text-[14px] font-semibold tracking-[0.18em]">FORGE</span>
        </div>

        <ol className="mt-12 flex gap-2" aria-label="Setup progress">
          {STEP_TITLES.map((title, index) => (
            <li key={title} className="flex-1">
              <div className={cn('h-1 rounded-full transition-colors', index <= step ? 'bg-gradient-to-r from-forge-ember2 to-forge-gold' : 'bg-white/10')} />
              <span className={cn('mt-2 hidden text-[11.5px] sm:block', index === step ? 'text-white/80' : 'text-white/35')}>{title}</span>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="max-w-[520px]"
            >
              {step === 0 && (
                <>
                  <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">Let&apos;s make it sound like you.</h1>
                  <p className="mt-4 text-[16px] leading-relaxed text-white/55">
                    Three short steps. Forge uses this to write in your voice instead of everyone else&apos;s.
                  </p>
                  <div className="mt-8 flex flex-col gap-5">
                    <Field label="Your name" htmlFor="ob-name">
                      <input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} autoComplete="name" />
                    </Field>
                    <Field label="What you post about" htmlFor="ob-niche" hint="Two or three words, like B2B SaaS founders or indie game dev.">
                      <input id="ob-niche" value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={80} className={inputClass} />
                    </Field>
                    <Field
                      label="X handle (optional)"
                      htmlFor="ob-handle"
                      hint="To read your recent posts and learn your voice. Forge never posts to X for you."
                    >
                      <input
                        id="ob-handle"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        maxLength={60}
                        placeholder="@handle"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <Button variant="primary" size="lg" className="mt-8" loading={busy} disabled={!niche.trim()} onClick={saveIdentity}>
                    Continue
                  </Button>
                </>
              )}

              {step === 1 && (
                <>
                  <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">How do you write?</h1>
                  <p className="mt-4 text-[16px] leading-relaxed text-white/55">
                    Forge measures your sentence length, line breaks, punctuation and how you open, from posts you wrote yourself. Five is enough to start.
                  </p>
                  {handle.trim() && (
                    <Button variant="primary" size="lg" className="mt-8" loading={busy} onClick={importVoice}>
                      Read my last posts on X
                    </Button>
                  )}
                  <div className={cn('flex flex-col gap-3', handle.trim() ? 'mt-8 border-t border-white/[0.08] pt-8' : 'mt-8')}>
                    <Segmented
                      label="Where you post most"
                      value={platform}
                      onChange={setPlatform}
                      options={[
                        { value: 'linkedin', label: 'LinkedIn' },
                        { value: 'x', label: 'X' },
                      ]}
                    />
                    <Field
                      label={handle.trim() ? 'Or paste a few posts' : 'Paste a few of your posts'}
                      htmlFor="ob-paste"
                      hint="Separate posts with a line of three dashes (---)."
                    >
                      <textarea id="ob-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={7} className={cn(inputClass, 'resize-y')} />
                    </Field>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant={handle.trim() ? 'secondary' : 'primary'}
                        size="lg"
                        loading={busy}
                        disabled={pasted.trim().length < 40}
                        onClick={pasteVoice}
                      >
                        Use these
                      </Button>
                      <Button variant="quiet" size="lg" onClick={() => setStep(2)}>
                        Skip for now
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">Give it something true.</h1>
                  <p className="mt-4 text-[16px] leading-relaxed text-white/55">
                    Forge never invents your stories or numbers. Add one you tell often, and it can write from it. You can add more any time under Brand.
                  </p>
                  {voiceCount > 0 && <p className="mt-4 text-[13.5px] text-forge-good">Voice measured from {voiceCount} posts.</p>}
                  <div className="mt-7 flex flex-col gap-4">
                    <div className="-mx-1 overflow-x-auto px-1">
                      <Segmented
                        label="Kind"
                        value={storyKind}
                        onChange={setStoryKind}
                        options={(['story', 'win', 'failure', 'metric', 'opinion'] as StoryKind[]).map((k) => ({ value: k, label: STORY_KIND_LABELS[k] }))}
                      />
                    </div>
                    <input
                      value={storyTitle}
                      onChange={(e) => setStoryTitle(e.target.value)}
                      maxLength={140}
                      placeholder="A few words to recognise it by"
                      aria-label="Story title"
                      className={inputClass}
                    />
                    <textarea
                      value={storyBody}
                      onChange={(e) => setStoryBody(e.target.value)}
                      rows={4}
                      maxLength={4000}
                      placeholder="What happened, plainly. Names, numbers and dates make it believable."
                      aria-label="What happened"
                      className={cn(inputClass, 'resize-y')}
                    />
                    {stories.length > 0 && <p className="text-[13px] text-white/50">Saved: {stories.join(', ')}</p>}
                    <div className="flex flex-wrap gap-3">
                      <Button variant="secondary" size="lg" loading={busy} disabled={!storyTitle.trim() || !storyBody.trim()} onClick={addStory}>
                        Save story
                      </Button>
                      <Button variant="primary" size="lg" onClick={() => setStep(3)}>
                        {stories.length > 0 ? 'Continue' : 'Skip for now'}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">What should your first post be about?</h1>
                  <p className="mt-4 text-[16px] leading-relaxed text-white/55">
                    Forge will ask a question or two if it needs to, then write it, grade it and show you where it drifts from your voice.
                  </p>
                  <div className="mt-7 flex flex-col gap-4">
                    <Segmented
                      label="Platform"
                      value={platform}
                      onChange={setPlatform}
                      options={[
                        { value: 'linkedin', label: 'LinkedIn' },
                        { value: 'x', label: 'X' },
                      ]}
                    />
                    <textarea
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      rows={3}
                      placeholder="The mistake I made hiring my first engineer"
                      aria-label="Topic"
                      className={cn(inputClass, 'resize-y')}
                    />
                    <div className="flex flex-wrap gap-3">
                      <Button variant="primary" size="lg" loading={busy} disabled={!topic.trim()} onClick={() => finish(true)}>
                        Write it
                      </Button>
                      <Button variant="quiet" size="lg" disabled={busy} onClick={() => finish(false)}>
                        Go to my workspace
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {step > 0 && (
          <button type="button" onClick={() => setStep((step - 1) as Step)} className="mt-8 self-start text-[13px] text-white/40 hover:text-white">
            Back
          </button>
        )}
      </section>

      <Plate name={(['steel', 'ingot', 'sparks', 'molten'] as const)[step]} className="hidden lg:block" priority dim={0.2} />
    </main>
  );
}
