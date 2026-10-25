'use client';

/**
 * Clarifying questions with tappable answers, asked before Forge writes.
 *
 * Keyboard: 1 to 4 pick an option in the current question, Enter sends once
 * every question has an answer, Escape skips ("Just write it"). The keys only
 * act while focus is not in a text field, so typing a free answer is never
 * hijacked.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClarifyingQuestion } from '@/lib/forge/types';
import { Button, Kbd, cn, focusRing, inputClass } from '../ui';

export const ANSWERS_OPEN = '[ANSWERS]';
export const ANSWERS_CLOSE = '[/ANSWERS]';
export const SKIP_MESSAGE = 'Just write it. Use [brackets] for anything you do not know.';

export function formatAnswers(questions: ClarifyingQuestion[], answers: Record<string, string[]>): string {
  const lines = questions.map((q) => `${q.question} ${(answers[q.id] ?? []).join(', ') || '(no answer)'}`);
  return `${ANSWERS_OPEN}\n${lines.join('\n')}\n${ANSWERS_CLOSE}`;
}

/** Parses an answers message back into question/answer pairs for display. */
export function parseAnswers(content: string): Array<{ question: string; answer: string }> | null {
  const match = content.match(/\[ANSWERS\]\n([\s\S]*?)\n\[\/ANSWERS\]/);
  if (!match) return null;
  return match[1].split('\n').map((line) => {
    const index = line.lastIndexOf('? ');
    return index >= 0 ? { question: line.slice(0, index + 1), answer: line.slice(index + 2) } : { question: '', answer: line };
  });
}

export function QuestionsCard({
  intro,
  questions,
  answered,
  disabled,
  onSubmit,
}: {
  intro: string | null;
  questions: ClarifyingQuestion[];
  answered: boolean;
  disabled: boolean;
  onSubmit: (message: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});

  const complete = useMemo(() => questions.every((q) => (answers[q.id] ?? []).some((a) => a.trim().length > 0)), [answers, questions]);
  const activeIndex = questions.findIndex((q) => !(answers[q.id] ?? []).length);
  const locked = answered || disabled;

  const choose = useCallback((question: ClarifyingQuestion, option: string) => {
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      if (question.mode === 'multi') {
        return { ...prev, [question.id]: current.includes(option) ? current.filter((o) => o !== option) : [...current, option] };
      }
      return { ...prev, [question.id]: [option] };
    });
    setOtherOpen((prev) => ({ ...prev, [question.id]: false }));
  }, []);

  const submit = useCallback(() => {
    if (!complete || locked) return;
    onSubmit(formatAnswers(questions, answers));
  }, [complete, locked, onSubmit, questions, answers]);

  useEffect(() => {
    if (locked) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'Enter' && complete) {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key === 'Escape') {
        onSubmit(SKIP_MESSAGE);
        return;
      }
      const digit = Number(event.key);
      const question = questions[activeIndex >= 0 ? activeIndex : questions.length - 1];
      if (question && digit >= 1 && digit <= question.options.length && question.mode !== 'free') {
        event.preventDefault();
        choose(question, question.options[digit - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, complete, submit, questions, activeIndex, choose, onSubmit]);

  return (
    <div className={cn('my-5 w-full max-w-[640px] rounded-[24px] border border-white/[0.08] bg-forge-card p-5', locked && 'opacity-70')}>
      {intro && <p className="mb-4 text-[15px] text-white/85">{intro}</p>}
      <div className="flex flex-col gap-5">
        {questions.map((question, qIndex) => {
          const selected = answers[question.id] ?? [];
          return (
            <fieldset key={question.id} disabled={locked} className="min-w-0">
              <legend className="mb-2.5 text-[14px] font-medium text-white">{question.question}</legend>
              {question.mode === 'free' ? (
                <input
                  className={cn(inputClass, 'h-10 rounded-full py-0')}
                  placeholder={question.placeholder ?? 'Type your answer'}
                  value={selected[0] ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: [e.target.value] }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option, oIndex) => {
                    const isOn = selected.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={isOn}
                        onClick={() => choose(question, option)}
                        className={cn(
                          'flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] transition-colors',
                          isOn ? 'border-white bg-white text-black' : 'border-white/[0.12] text-white/80 hover:border-white/25 hover:text-white',
                          focusRing
                        )}
                      >
                        {qIndex === (activeIndex >= 0 ? activeIndex : -1) && !locked && (
                          <span className={cn('text-[11px] tabular-nums', isOn ? 'text-black/50' : 'text-white/35')}>{oIndex + 1}</span>
                        )}
                        {option}
                      </button>
                    );
                  })}
                  {otherOpen[question.id] ? (
                    <input
                      autoFocus
                      className={cn(inputClass, 'h-9 w-[220px] rounded-full py-0 text-[13.5px]')}
                      placeholder={question.placeholder ?? 'Your answer'}
                      value={otherText[question.id] ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setOtherText((prev) => ({ ...prev, [question.id]: value }));
                        setAnswers((prev) => ({ ...prev, [question.id]: value.trim() ? [value] : [] }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          submit();
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOtherOpen((prev) => ({ ...prev, [question.id]: true }))}
                      className={cn('h-9 rounded-full px-3 text-[13.5px] text-white/45 hover:text-white', focusRing)}
                    >
                      Something else
                    </button>
                  )}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      {!locked ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => onSubmit(SKIP_MESSAGE)} className="text-[13px] text-white/45 hover:text-white">
            Just write it <Kbd className="ml-1">Esc</Kbd>
          </button>
          <Button variant="primary" size="sm" disabled={!complete} onClick={submit}>
            Write it <Kbd className="ml-1 border-black/15 bg-black/5 text-black/50">Enter</Kbd>
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-[12.5px] text-white/40">Answered</p>
      )}
    </div>
  );
}
