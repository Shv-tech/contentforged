/**
 * lib/forge/languages.ts
 *
 * Every language Forge writes in, in one place: what it is called, which
 * script it uses, how speech in it is transcribed, and what to tell the
 * writer model. Pure data, safe to import on the server and in the browser.
 *
 * Three kinds:
 * - native: the language in its own script (Telugu in Telugu script).
 * - mix: the language mixed with English inside sentences, the other
 *   language's words written in Latin script (Tenglish, Tanglish). This is
 *   how a large share of creators in India and the Philippines actually
 *   write, and a tool that "corrects" it into textbook English loses them.
 * - English.
 *
 * Every transcription code is one Whisper supports. A language Whisper does
 * not transcribe is not listed, so nothing here promises what Forge cannot do.
 */

export type Script =
  | 'latin'
  | 'devanagari'
  | 'bengali'
  | 'gurmukhi'
  | 'gujarati'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'malayalam'
  | 'arabic'
  | 'hebrew'
  | 'greek'
  | 'cyrillic'
  | 'thai'
  | 'hangul'
  | 'kana'
  | 'han';

export type LanguageGroup = 'english' | 'mix' | 'indian' | 'world';

export interface LanguageSpec {
  code: string;
  /** English name, used in settings and instructions. */
  name: string;
  /** The name as speakers write it, shown beside the English name. */
  native: string;
  group: LanguageGroup;
  script: Script;
  /** Written right to left. */
  rtl?: boolean;
  /** ISO 639-1 code passed to Whisper. Absent for mixes, which Whisper hears best when left to detect. */
  whisper?: string;
  /** For a mix: the code of the language mixed with English. */
  base?: string;
  /** For a mix: a few common words, shown to the writer as the spelling to follow. */
  examples?: string;
  /** For a mix: a sentence in the mix that steers Whisper to Latin-script spelling. */
  transcriptPrompt?: string;
}

export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', group: 'english', script: 'latin', whisper: 'en' },

  {
    code: 'hinglish',
    name: 'Hinglish',
    native: 'Hindi + English',
    group: 'mix',
    script: 'latin',
    base: 'hi',
    examples: 'yeh, kaafi, matlab',
    transcriptPrompt: 'Haan, toh main yeh keh raha tha ki launch ke baad pehle hafte mein 40 customers aaye. Bahut accha laga.',
  },
  {
    code: 'te-en',
    name: 'Tenglish',
    native: 'Telugu + English',
    group: 'mix',
    script: 'latin',
    base: 'te',
    examples: 'chala, ante, cheppu',
    transcriptPrompt: 'Haa, nenu cheppedi enti ante, launch ayyaka first week lo 40 customers vacharu. Chala happy ga undi.',
  },
  {
    code: 'ta-en',
    name: 'Tanglish',
    native: 'Tamil + English',
    group: 'mix',
    script: 'latin',
    base: 'ta',
    examples: 'romba, enna, illa',
    transcriptPrompt: 'Seri, naan solla vandhadhu enna na, launch aana first week la 40 customers vandhaanga. Romba happy ah irundhuchu.',
  },
  {
    code: 'bn-en',
    name: 'Banglish',
    native: 'Bengali + English',
    group: 'mix',
    script: 'latin',
    base: 'bn',
    examples: 'ami, kintu, bhalo',
    transcriptPrompt: 'Haan, ami bolchilam je launch er por first week e 40 jon customer eshechilo. Khub bhalo legeche.',
  },
  {
    code: 'mr-en',
    name: 'Marathi-English',
    native: 'Marathi + English',
    group: 'mix',
    script: 'latin',
    base: 'mr',
    examples: 'aahe, khup, mhanje',
    transcriptPrompt: 'Ho, mi he sangat hoto ki launch nantar pahilya athavdyat 40 customers aale. Khup chan vatla.',
  },
  {
    code: 'kn-en',
    name: 'Kanglish',
    native: 'Kannada + English',
    group: 'mix',
    script: 'latin',
    base: 'kn',
    examples: 'thumba, yaake, gottilla',
    transcriptPrompt: 'Haudu, naanu heltiddu enu andre launch aada mele first week alli 40 customers bandru. Thumba khushi aaytu.',
  },
  {
    code: 'ml-en',
    name: 'Manglish',
    native: 'Malayalam + English',
    group: 'mix',
    script: 'latin',
    base: 'ml',
    examples: 'njan, adipoli, valare',
    transcriptPrompt: 'Athe, njan paranjathu enthanu vechal launch kazhinju first week il 40 customers vannu. Valare santhosham aayi.',
  },
  {
    code: 'gu-en',
    name: 'Gujarati-English',
    native: 'Gujarati + English',
    group: 'mix',
    script: 'latin',
    base: 'gu',
    examples: 'chhe, saru, kem',
    transcriptPrompt: 'Haa, hu e kaheto hato ke launch pachhi pehla week ma 40 customers aavya. Bahu maja aavi.',
  },
  {
    code: 'pa-en',
    name: 'Punjabi-English',
    native: 'Punjabi + English',
    group: 'mix',
    script: 'latin',
    base: 'pa',
    examples: 'tusi, changa, kiddan',
    transcriptPrompt: 'Haan, main eh keh reha si ki launch to baad pehle hafte vich 40 customers aaye. Bahut vadiya laggeya.',
  },
  {
    code: 'tl-en',
    name: 'Taglish',
    native: 'Tagalog + English',
    group: 'mix',
    script: 'latin',
    base: 'tl',
    examples: 'talaga, kasi, naman',
    transcriptPrompt: 'Oo, ang sinasabi ko lang, after ng launch, 40 customers agad sa first week. Sobrang saya talaga.',
  },

  { code: 'hi', name: 'Hindi', native: 'हिन्दी', group: 'indian', script: 'devanagari', whisper: 'hi' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', group: 'indian', script: 'bengali', whisper: 'bn' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', group: 'indian', script: 'telugu', whisper: 'te' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', group: 'indian', script: 'tamil', whisper: 'ta' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', group: 'indian', script: 'devanagari', whisper: 'mr' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', group: 'indian', script: 'gujarati', whisper: 'gu' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', group: 'indian', script: 'kannada', whisper: 'kn' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', group: 'indian', script: 'malayalam', whisper: 'ml' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', group: 'indian', script: 'gurmukhi', whisper: 'pa' },
  { code: 'ur', name: 'Urdu', native: 'اردو', group: 'indian', script: 'arabic', rtl: true, whisper: 'ur' },

  { code: 'es', name: 'Spanish', native: 'Español', group: 'world', script: 'latin', whisper: 'es' },
  { code: 'pt', name: 'Portuguese', native: 'Português', group: 'world', script: 'latin', whisper: 'pt' },
  { code: 'fr', name: 'French', native: 'Français', group: 'world', script: 'latin', whisper: 'fr' },
  { code: 'de', name: 'German', native: 'Deutsch', group: 'world', script: 'latin', whisper: 'de' },
  { code: 'it', name: 'Italian', native: 'Italiano', group: 'world', script: 'latin', whisper: 'it' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', group: 'world', script: 'latin', whisper: 'nl' },
  { code: 'sv', name: 'Swedish', native: 'Svenska', group: 'world', script: 'latin', whisper: 'sv' },
  { code: 'pl', name: 'Polish', native: 'Polski', group: 'world', script: 'latin', whisper: 'pl' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', group: 'world', script: 'latin', whisper: 'tr' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', group: 'world', script: 'latin', whisper: 'id' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', group: 'world', script: 'latin', whisper: 'vi' },
  { code: 'ru', name: 'Russian', native: 'Русский', group: 'world', script: 'cyrillic', whisper: 'ru' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', group: 'world', script: 'cyrillic', whisper: 'uk' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά', group: 'world', script: 'greek', whisper: 'el' },
  { code: 'ar', name: 'Arabic', native: 'العربية', group: 'world', script: 'arabic', rtl: true, whisper: 'ar' },
  { code: 'he', name: 'Hebrew', native: 'עברית', group: 'world', script: 'hebrew', rtl: true, whisper: 'he' },
  { code: 'th', name: 'Thai', native: 'ไทย', group: 'world', script: 'thai', whisper: 'th' },
  { code: 'ja', name: 'Japanese', native: '日本語', group: 'world', script: 'kana', whisper: 'ja' },
  { code: 'ko', name: 'Korean', native: '한국어', group: 'world', script: 'hangul', whisper: 'ko' },
  { code: 'zh', name: 'Chinese', native: '中文', group: 'world', script: 'han', whisper: 'zh' },
] as const satisfies readonly LanguageSpec[];

export type WritingLanguage = (typeof LANGUAGES)[number]['code'];

/** Every code, in the shape zod's enum takes. */
export const LANGUAGE_CODES = LANGUAGES.map((language) => language.code) as unknown as readonly [WritingLanguage, ...WritingLanguage[]];

const BY_CODE: ReadonlyMap<string, LanguageSpec> = new Map(LANGUAGES.map((language) => [language.code, language as LanguageSpec]));

export function isWritingLanguage(value: unknown): value is WritingLanguage {
  return typeof value === 'string' && BY_CODE.has(value);
}

export function languageSpec(code: WritingLanguage): LanguageSpec {
  return BY_CODE.get(code) ?? (LANGUAGES[0] as LanguageSpec);
}

export const LANGUAGE_NAMES = Object.fromEntries(LANGUAGES.map((language) => [language.code, language.name])) as Record<WritingLanguage, string>;

export const LANGUAGE_GROUPS: ReadonlyArray<{ group: LanguageGroup; label: string }> = [
  { group: 'english', label: 'English' },
  { group: 'mix', label: 'Mixed with English, in Roman script' },
  { group: 'indian', label: 'Indian languages, in their own script' },
  { group: 'world', label: 'Other languages' },
];

export const SCRIPT_NAMES: Record<Script, string> = {
  latin: 'Latin',
  devanagari: 'Devanagari',
  bengali: 'Bengali',
  gurmukhi: 'Gurmukhi',
  gujarati: 'Gujarati',
  tamil: 'Tamil',
  telugu: 'Telugu',
  kannada: 'Kannada',
  malayalam: 'Malayalam',
  arabic: 'Arabic',
  hebrew: 'Hebrew',
  greek: 'Greek',
  cyrillic: 'Cyrillic',
  thai: 'Thai',
  hangul: 'Hangul',
  kana: 'Japanese',
  han: 'Chinese',
};

/** One line for the settings card: what choosing this language does. */
export function languageHint(code: WritingLanguage): string {
  const spec = languageSpec(code);
  if (spec.group === 'english') return 'Drafts in English.';
  if (spec.group === 'mix') {
    const base = spec.base ? languageSpec(spec.base as WritingLanguage) : null;
    return `Drafts in ${spec.name}: ${base?.name ?? 'your language'} and English mixed the way you speak, in Roman script. Forge matches how much you switch.`;
  }
  const script = spec.script === 'latin' ? '' : `, in ${SCRIPT_NAMES[spec.script]} script`;
  return `Drafts in ${spec.name}${script}. Product names and technical terms stay as people write them.`;
}
