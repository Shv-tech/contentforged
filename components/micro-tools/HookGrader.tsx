'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const POWER_WORDS = ['how', 'why', 'secret', 'stop', 'never', 'always', 'proven', 'ultimate', 'truth', 'lie', 'framework', 'stealing'];

export function HookGrader({ text }: { text: string }) {
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<string[]>([]);

  useEffect(() => {
    const firstLine = text.split('\n')[0].trim();
    if (!firstLine || firstLine.length < 5) {
      setScore(0);
      setFeedback(['Type your hook in the editor to analyze it.']);
      return;
    }

    let currentScore = 100;
    const newFeedback: string[] = [];

    if (firstLine.length > 80) {
      currentScore -= 20;
      newFeedback.push('Too long. Keep it under 80 characters to beat the "see more" cutoff.');
    } else if (firstLine.length < 15) {
      currentScore -= 10;
      newFeedback.push('Too short to build curiosity.');
    } else {
      newFeedback.push('Perfect length for social feeds.');
    }

    if (!/\d/.test(firstLine)) {
      currentScore -= 15;
      newFeedback.push('Add a number or stat. Data stops the scroll.');
    } else {
      newFeedback.push('Excellent use of data/numbers.');
    }

    const hasPowerWord = POWER_WORDS.some(word => firstLine.toLowerCase().includes(word));
    if (!hasPowerWord) {
      currentScore -= 15;
      newFeedback.push('Lacks power words. Add "How", "Why", or "Secret".');
    } else {
      newFeedback.push('Strong power word detected.');
    }

    if (!firstLine.includes('?') && !firstLine.includes('!')) {
      currentScore -= 10;
      newFeedback.push('End the hook with a question or punchy punctuation.');
    }

    setScore(Math.max(0, currentScore));
    setFeedback(newFeedback);
  }, [text]);

  const scoreColor = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  const ScoreIcon = score >= 80 ? CheckCircle2 : AlertCircle;

  return (
    <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-4 animate-in fade-in">
      <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
        <span className="text-[13px] font-bold text-white flex items-center gap-1.5">
          <ScoreIcon className={`w-4 h-4 ${scoreColor}`} />
          Hook Score: <span className={scoreColor}>{score}/100</span>
        </span>
      </div>
      <ul className="space-y-1.5">
        {feedback.map((item, i) => (
          <li key={i} className={`text-[12px] flex items-start gap-1.5 ${item.includes('Perfect') || item.includes('Excellent') || item.includes('Strong') ? 'text-green-400' : 'text-white/60'}`}>
            <span className="mt-[2px]">•</span> {item}
          </li>
        ))}
      </ul>
    </div>
  );
}