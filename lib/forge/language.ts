/**
 * lib/forge/language.ts
 *
 * Writing language, measured rather than assumed.
 *
 * A large share of creators in India write in Hinglish: Hindi and English
 * in one sentence, Hindi words in Latin script. A voice tool that only
 * understands English "corrects" that into textbook English and loses the
 * person. This module measures how much someone switches, in which script,
 * and turns that into instructions the writer model follows and a check the
 * voice score applies.
 *
 * Deterministic and dependency-free, like the rest of the fingerprint: the
 * same text always measures the same, on the server and in the browser.
 */

import type { WritingLanguage } from './types';

export interface LanguageProfile {
  /** Share of words in Devanagari script. */
  devanagariShare: number;
  /** Share of Latin-script words that are romanised Hindi. */
  romanHindiShare: number;
  /** Share of sentences that mix Hindi and English words. */
  switchRate: number;
  primary: WritingLanguage;
}

/**
 * Common romanised Hindi words that are not also English words. Ambiguous
 * forms ("to", "me", "the", "par") are left out on purpose: a false Hindi
 * signal in an English post would be worse than a missed one.
 */
const ROMAN_HINDI = new Set(
  (
    'hai hain nahi nahin nhi kya kyu kyun kyunki toh bhi aur yaar yar kar karo karna karne karte karta karti kiya kiye ho hoga hogi honge raha rahi rahe tha thi mein mai mujhe humko hum tum aap apna apni apne yeh ye woh wo sab kuch kuchh bahut bohot bahot accha acha achha abhi phir fir lekin magar bas matlab chal chalo dekho dekh samajh samjho samjha baat baatein din saal paisa paise kaam log logon wala wali wale jab tab agar kaise kitna kitne kitni sirf zyada jyada thoda thodi sach sahi galat pehle baad hamesha kabhi koi kisi ji haan mat chahiye sakta sakti sakte gaya gayi gaye diya liya mila mili jaana aana dena lena banana bana bani unka uska iska unki uski iski hamara hamari tumhara inko unko isko usko kaafi kafi bilkul shayad zaroor jaroor bhai dost ghar duniya waqt samay pyaar dil mann socho socha sochte bolo bola bolte suno suna sunte batao bataya chahta chahti chahte lagta lagti lagte milta milti milte hota hoti hote jaata jaati jaate aata aati aate karke hoke'
  ).split(/\s+/)
);

const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN_WORD = /^[a-z][a-z']*$/;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{M}']+/u)
    .filter(Boolean);
}

export interface LanguageMeasure {
  words: number;
  devanagari: number;
  latin: number;
  romanHindi: number;
  sentences: number;
  mixedSentences: number;
}

export function measureLanguage(text: string): LanguageMeasure {
  const measure: LanguageMeasure = { words: 0, devanagari: 0, latin: 0, romanHindi: 0, sentences: 0, mixedSentences: 0 };

  for (const sentence of text.split(/(?<=[.!?।])\s+|\n+/)) {
    const words = tokens(sentence);
    if (words.length === 0) continue;
    measure.sentences += 1;

    let hindi = 0;
    let english = 0;
    for (const word of words) {
      measure.words += 1;
      if (DEVANAGARI.test(word)) {
        measure.devanagari += 1;
        hindi += 1;
      } else if (LATIN_WORD.test(word)) {
        measure.latin += 1;
        if (ROMAN_HINDI.has(word)) {
          measure.romanHindi += 1;
          hindi += 1;
        } else if (word.length > 2) {
          english += 1;
        }
      }
    }
    if (hindi > 0 && english > 0) measure.mixedSentences += 1;
  }

  return measure;
}

export function classifyLanguage(measure: LanguageMeasure): WritingLanguage {
  if (measure.words === 0) return 'en';
  if (measure.devanagari / measure.words >= 0.5) return 'hi';
  if (measure.latin > 0 && measure.romanHindi / measure.latin >= 0.12) return 'hinglish';
  return 'en';
}

export function detectLanguage(text: string): WritingLanguage {
  return classifyLanguage(measureLanguage(text));
}

export function buildLanguageProfile(samples: string[]): LanguageProfile {
  const total = measureLanguage(samples.join('\n\n'));
  return {
    devanagariShare: round(total.words ? total.devanagari / total.words : 0),
    romanHindiShare: round(total.latin ? total.romanHindi / total.latin : 0),
    switchRate: round(total.sentences ? total.mixedSentences / total.sentences : 0),
    primary: classifyLanguage(total),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Instructions for the writer model. A measured profile, when there is one,
 * makes them specific to how this person mixes; otherwise the stated
 * language sets a sensible default.
 */
export function languageInstructions(stated: WritingLanguage, profile?: LanguageProfile | null): string {
  const language = profile && profile.primary !== 'en' ? profile.primary : stated;

  if (language === 'hinglish') {
    const mix = profile && profile.switchRate > 0 ? ` In their own posts about ${Math.round(profile.switchRate * 100)}% of sentences mix the two.` : '';
    return [
      'LANGUAGE: Write in Hinglish, the way this person does: Hindi and English mixed naturally inside sentences, Hindi words in Latin script (for example "yeh", "kaafi", "matlab"), never Devanagari.',
      `Keep technical and business terms in English. Do not translate their Hindi into English or their English into Hindi.${mix}`,
    ].join(' ');
  }
  if (language === 'hi') {
    return 'LANGUAGE: Write in Hindi in Devanagari script. Keep product names, numbers and technical terms as the person writes them, usually in English.';
  }
  return 'LANGUAGE: Write in English.';
}

/** Short label for the brief and the voice panel. */
export function describeLanguage(profile: LanguageProfile): string | null {
  if (profile.primary === 'hinglish') return 'Writes in Hinglish';
  if (profile.primary === 'hi') return 'Writes in Hindi';
  return null;
}

/**
 * How far a draft's language is from the person's. Returns a penalty for the
 * voice score and a reason, or null when it matches.
 */
export function languageMismatch(draft: string, profile: LanguageProfile | undefined): { penalty: number; expected: WritingLanguage; found: WritingLanguage } | null {
  if (!profile || profile.primary === 'en') return null;
  const found = detectLanguage(draft);
  if (found === profile.primary) return null;
  return { penalty: 14, expected: profile.primary, found };
}
