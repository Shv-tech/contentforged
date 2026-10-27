/**
 * lib/forge/language.ts
 *
 * Writing language, measured rather than assumed.
 *
 * Many creators do not write textbook English. They write Hinglish,
 * Tenglish or Taglish, mixing two languages inside one sentence with both in
 * Latin script, or they write in their own language and script. A voice tool
 * that only understands English "corrects" all of that and loses the person.
 * This module measures which language and script someone writes in and how
 * much they switch, then turns that into instructions the writer model
 * follows and a check the voice score applies.
 *
 * Three signals, cheapest first:
 * - Script: letters are counted by Unicode script, so Telugu, Arabic or
 *   Japanese text is recognised from its characters alone.
 * - Romanised words: for each mix, common words of the other language that
 *   are not also English words. Ambiguous forms are left out on purpose: a
 *   false signal in an English post is worse than a missed one.
 * - Function words: for Latin-script languages, the small words every
 *   sentence uses ("que", "und", "het"), compared against English's.
 *
 * Deterministic and dependency-free, like the rest of the fingerprint: the
 * same text always measures the same, on the server and in the browser.
 */

import { LANGUAGES, SCRIPT_NAMES, languageSpec, type Script, type WritingLanguage } from './languages';

export interface LanguageProfile {
  primary: WritingLanguage;
  /** Share of letters written in a script other than Latin. */
  nativeScriptShare?: number;
  /** For a mix: share of Latin-script words that come from the other language. */
  mixShare?: number;
  /** For a mix: share of sentences that use both languages. */
  switchRate: number;
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

const SCRIPT_PATTERNS: ReadonlyArray<readonly [Script, RegExp]> = [
  ['latin', /\p{Script=Latin}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['bengali', /\p{Script=Bengali}/u],
  ['gurmukhi', /\p{Script=Gurmukhi}/u],
  ['gujarati', /\p{Script=Gujarati}/u],
  ['tamil', /\p{Script=Tamil}/u],
  ['telugu', /\p{Script=Telugu}/u],
  ['kannada', /\p{Script=Kannada}/u],
  ['malayalam', /\p{Script=Malayalam}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['greek', /\p{Script=Greek}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['thai', /\p{Script=Thai}/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['han', /\p{Script=Han}/u],
];

const LETTER = /\p{L}/u;
/** Letters Urdu uses and Arabic does not. */
const URDU_LETTERS = /[ٹڈڑںےۓھ]/u;
/** Letters Ukrainian uses and Russian does not. */
const UKRAINIAN_LETTERS = /[іїєґІЇЄҐ]/u;

function scriptOf(char: string): Script | null {
  if (!LETTER.test(char)) return null;
  for (const [script, pattern] of SCRIPT_PATTERNS) if (pattern.test(char)) return script;
  return null;
}

// ---------------------------------------------------------------------------
// Romanised words, one list per mix
// ---------------------------------------------------------------------------

function wordSet(words: string): ReadonlySet<string> {
  return new Set(words.split(/\s+/).filter(Boolean));
}

const MIX_MARKERS: Partial<Record<WritingLanguage, ReadonlySet<string>>> = {
  hinglish: wordSet(
    'hai hain nahi nahin nhi kya kyu kyun kyunki toh bhi aur yaar yar kar karo karna karne karte karta karti kiya kiye ho hoga hogi honge raha rahi rahe tha thi mein mai mujhe humko hum tum aap apna apni apne yeh ye woh wo sab kuch kuchh bahut bohot bahot accha acha achha abhi phir fir lekin magar bas matlab chal chalo dekho dekh samajh samjho samjha baat baatein din saal paisa paise kaam log logon wala wali wale jab tab agar kaise kitna kitne kitni sirf zyada jyada thoda thodi sach sahi galat pehle baad hamesha kabhi koi kisi ji haan mat chahiye sakta sakti sakte gaya gayi gaye diya liya mila mili jaana aana dena lena banana bana bani unka uska iska unki uski iski hamara hamari tumhara inko unko isko usko kaafi kafi bilkul shayad zaroor jaroor bhai dost ghar duniya waqt samay pyaar dil mann socho socha sochte bolo bola bolte suno suna sunte batao bataya chahta chahti chahte lagta lagti lagte milta milti milte hota hoti hote jaata jaati jaate aata aati aate karke hoke'
  ),
  'te-en': wordSet(
    'nenu nuvvu meeru memu manam vadu aame idi adi enti emiti enduku ela ekkada eppudu chala baga bagundi ledu kaadu kadu avunu undi unnadi unnanu unnav cheppu cheppandi chesanu chesam chesaru cheyali chestunna chestunnanu vellanu vellali vachanu vacharu raavali kani kooda kuda inka ippudu appudu tarvata mundu antha anni okka oka rendu manchi pani dabbulu roju samvatsaram nijanga asalu endukante kabatti lekapothe aithe ante kavali telusu teliyadu artham anukunna anukuntunna chusanu chudandi chudu matladu matladandi ayyaka ayindi avtundi untundi vastundi'
  ),
  'ta-en': wordSet(
    'naan neenga naanga namma enna enga eppo eppadi yenna romba konjam illa illai irukku iruku irukken iruken panren pannunga pannen panna pannu sollu sollunga sonnen sonnanga vandhen vanthen vaanga ponga poren varen paaru paarunga theriyum theriyadhu teriyum puriyudhu purinjudhu aana aanaa appo ippo innum nalla nallaa semma machan machi thambi kaasu velai naal varusham seri irundhuchu vandhaanga pannalam aagum aachu'
  ),
  'bn-en': wordSet(
    'ami tumi apni amra tomra ora keno kemon kothay kokhon kintu ebong kore korchi korbo korlam korechi hobe hoyeche hocche chilo achhe nei bhalo bhalobasha onek ekta ekti kichu shob kaj taka bochor bujhte bujhi bolchi bolun dekho dekhi jabo jacchi ashbo eshechi tahole karon jodi tobe ekhon tokhon abar legeche khub'
  ),
  'mr-en': wordSet(
    'aahe ahe aahet ahet navhta kasa kashi kase kuthe kadhi mhanun aani khup jara mala tula tyala tila amhala divas varsha bagh bagha sang sanga karto karte kela keli kele zala zali zale jhala yeto yete gelo geli barobar mhanje ata atta aamhi amhi tumhi aapan nantar vatla aale'
  ),
  'kn-en': wordSet(
    'naanu neenu neevu naavu avanu avalu idu adu enu yenu yaake hege elli yaavaga thumba tumba swalpa ide ive irutte madtini maadtini maadi maadu helu heli helthini banni hogi hogona gottu gottilla aadre aadare matte mattu innu eega aaga chennagi chennagide sakkath kelsa duddu haudu bandru aaytu'
  ),
  'ml-en': wordSet(
    'njan ningal njangal nammal athu ithu entha enthu enthina enthanu evide engane alle aano aanu undu undo illallo cheyyam cheythu cheyyunnu parayam paranju vannu varam poyi pokam ariyam ariyilla manassilayi kidilam adipoli pinne appol kurachu orupaadu valare panam divasam chetta chechi mone kazhinju santhosham'
  ),
  'gu-en': wordSet(
    'tame ame apne aapne chhe nathi hatu hati hata shu shun kem kevi kevu kyare ane bahu saru saras thodu karu karvu karyu karyo karvanu kahu kahyu gayo aavyo aavi joie joiye majama kharu khabar pachhi aavya'
  ),
  'pa-en': wordSet(
    'tusi tussi asi assi kida kiddan kithe kado hega haiga sigi kardi karda karde hoya hoyi changa changi sohna sohni mainu tainu sanu tuhanu ohnu ehnu veere veer paji paaji kudi munda gallan pind kamm vich vadiya laggeya reha'
  ),
  'tl-en': wordSet(
    'ako ikaw siya kami tayo kayo sila mga opo hindi wala meron mayroon ano bakit paano saan kailan sino talaga naman kasi pero tapos sobrang ganun ganyan diba yung nung kung gusto ayaw alam sige salamat kain trabaho pera araw taon ngayon bukas kahapon sinasabi agad saya'
  ),
};

// ---------------------------------------------------------------------------
// Function words for Latin-script languages
// ---------------------------------------------------------------------------

const FUNCTION_WORDS: Partial<Record<WritingLanguage, ReadonlySet<string>>> = {
  en: wordSet(
    'the and of to in is that it for you with on was are this be have but not at from they we his her by or an will my all would there their what so up out if about who get which go when make can like time just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us'
  ),
  es: wordSet('el los las que en una por con para es se lo como más pero sus ya este sí porque esta entre cuando muy sin sobre también hasta hay donde desde todo nos todos les ni otros eso ellos esto antes algunos qué unos yo otro otra él tanto esa estos mucho nada muchos poco ella estar algo nosotros mis tú tus ellas pues bueno gracias hoy año'),
  pt: wordSet('não que com uma para os por mais como mas foi ao ele das tem à seu sua ser quando muito há nos já está eu também só pelo pela até isso ela entre era depois sem mesmo aos ter seus quem nas esse eles estão você tinha foram essa num nem suas meu às minha têm numa pelos elas havia seja qual será nós tenho lhe deles essas esses pelas este fosse dele vocês obrigado hoje ano'),
  fr: wordSet('le les des est et une du que qui dans pour pas sur au avec ce il sont se ne plus par je elle nous vous ils mais ou comme tout leur bien sans peut été être aussi fait cette ces sa ses mon mes ton ta tes très avoir faire même merci où ça'),
  de: wordSet('der das und ist nicht ich sie es ein eine zu den mit sich des auf für im dem von wir auch noch wie aber nach bei aus wenn nur oder zum sind wird kann durch vom schon sehr mehr jetzt immer doch dann mal gibt einen einem einer wieder heute danke'),
  it: wordSet('il di che non è per una sono con si ma ho gli anche più se questo lo nel alla io cosa sei molto tutto ci dei delle questa quello essere fare grazie oggi anno perché della del'),
  nl: wordSet('het een en van ik dat niet je zijn met voor maar ook aan bij nog wel naar dan uit kan zo dit wat moet mijn hebben wordt worden heeft geen ze nu omdat hoe veel jij jullie bedankt vandaag'),
  sv: wordSet('och att det som en på är av för med till den har inte ett han var jag sig från vi så kan hon när efter upp eller vad alla skulle hade där då mycket också bara tack idag'),
  pl: wordSet('nie się jest że jak ale tak już czy mnie dla tylko jego jej był być może są ten tym bardzo przez które który która gdy też jeszcze ich było dziękuję dzisiaj'),
  tr: wordSet('ve bir bu için ile çok daha gibi ama var olan ben sen biz siz onlar değil mı mu mü şey kadar sonra önce her yani diye bana beni sana artık şimdi teşekkürler bugün'),
  id: wordSet('dan yang ini itu dengan untuk tidak ada dari saya kita kami akan juga bisa sudah pada atau karena jadi kalau tapi lebih banyak sangat apa mereka dia aku kamu harus baru masih belum terima kasih hari tahun'),
  vi: wordSet('và của là không có những được cho một người này trong với các đã để khi thì như rất cũng nhưng tôi bạn chúng mình đó vì sẽ làm cảm ơn hôm nay năm'),
};

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

export interface LanguageMeasure {
  /** Letters by script. CJK and Thai do not separate words with spaces, so letters, not words, decide script. */
  letters: number;
  scripts: Partial<Record<Script, number>>;
  urduLetters: number;
  ukrainianLetters: number;
  /** Latin-script words. */
  latin: number;
  sentences: number;
  /** Romanised words per mix. */
  markers: Partial<Record<WritingLanguage, number>>;
  /** Sentences using both a mix's words and English words. */
  mixedSentences: Partial<Record<WritingLanguage, number>>;
  /** Function words per Latin-script language, English included. */
  functionWords: Partial<Record<WritingLanguage, number>>;
}

const SENTENCE_BREAK = /(?<=[.!?।॥؟])\s+|(?<=[。！？])|\n+/u;
const LATIN_WORD = /^\p{Script=Latin}[\p{Script=Latin}\p{M}']*$/u;
const MIX_CODES = Object.keys(MIX_MARKERS) as WritingLanguage[];
const FUNCTION_CODES = Object.keys(FUNCTION_WORDS) as WritingLanguage[];

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{M}']+/u)
    .filter(Boolean);
}

function bump<K extends string>(record: Partial<Record<K, number>>, key: K, by = 1): void {
  record[key] = (record[key] ?? 0) + by;
}

export function measureLanguage(text: string): LanguageMeasure {
  const measure: LanguageMeasure = { letters: 0, scripts: {}, urduLetters: 0, ukrainianLetters: 0, latin: 0, sentences: 0, markers: {}, mixedSentences: {}, functionWords: {} };

  for (const char of text) {
    const script = scriptOf(char);
    if (!script) continue;
    measure.letters += 1;
    bump(measure.scripts, script);
    if (script === 'arabic' && URDU_LETTERS.test(char)) measure.urduLetters += 1;
    if (script === 'cyrillic' && UKRAINIAN_LETTERS.test(char)) measure.ukrainianLetters += 1;
  }

  for (const sentence of text.split(SENTENCE_BREAK)) {
    const words = tokens(sentence);
    if (words.length === 0) continue;
    measure.sentences += 1;

    const mixHits = new Set<WritingLanguage>();
    let english = 0;
    for (const word of words) {
      if (!LATIN_WORD.test(word)) continue;
      measure.latin += 1;
      let marked = false;
      for (const code of MIX_CODES) {
        if (MIX_MARKERS[code]?.has(word)) {
          bump(measure.markers, code);
          mixHits.add(code);
          marked = true;
        }
      }
      for (const code of FUNCTION_CODES) {
        if (FUNCTION_WORDS[code]?.has(word)) bump(measure.functionWords, code);
      }
      if (!marked && word.length > 2) english += 1;
    }
    if (english > 0) for (const code of mixHits) bump(measure.mixedSentences, code);
  }

  return measure;
}

/** A mix needs at least this share of Latin words from the other language. */
const MIX_THRESHOLD = 0.12;
/** A Latin-script language needs this share of its function words, and more than English's. */
const FUNCTION_THRESHOLD = 0.15;

function nativeLanguage(script: Script, measure: LanguageMeasure, hint: WritingLanguage | undefined): WritingLanguage {
  switch (script) {
    case 'devanagari':
      return hint === 'mr' || hint === 'mr-en' ? 'mr' : 'hi';
    case 'arabic':
      return hint === 'ur' || measure.urduLetters > 0 ? 'ur' : 'ar';
    case 'cyrillic':
      return measure.ukrainianLetters > 0 || hint === 'uk' ? 'uk' : 'ru';
    case 'han':
      return (measure.scripts.kana ?? 0) > 0 ? 'ja' : 'zh';
    default: {
      const match = LANGUAGES.find((language) => language.script === script && language.group !== 'mix');
      return match ? match.code : 'en';
    }
  }
}

/**
 * The language a text is in. `hint`, the language the person chose, settles
 * the cases the text alone cannot: Devanagari is Hindi or Marathi, and two
 * mixes can share a word.
 */
export function classifyLanguage(measure: LanguageMeasure, hint?: WritingLanguage): WritingLanguage {
  if (measure.letters === 0) return 'en';

  let topScript: Script | null = null;
  let topCount = 0;
  for (const [script, count] of Object.entries(measure.scripts) as Array<[Script, number]>) {
    if (script !== 'latin' && count > topCount) {
      topScript = script;
      topCount = count;
    }
  }
  if (topScript && topCount / measure.letters >= 0.5) return nativeLanguage(topScript, measure, hint);

  if (measure.latin === 0) return 'en';

  const share = (count: number | undefined) => (count ?? 0) / measure.latin;
  if (hint && languageSpec(hint).group === 'mix' && share(measure.markers[hint]) >= MIX_THRESHOLD * 0.75) return hint;

  let bestMix: WritingLanguage | null = null;
  let bestMixShare = 0;
  for (const code of MIX_CODES) {
    const value = share(measure.markers[code]);
    if (value > bestMixShare) {
      bestMix = code;
      bestMixShare = value;
    }
  }
  if (bestMix && bestMixShare >= MIX_THRESHOLD) return bestMix;

  const englishShare = share(measure.functionWords.en);
  let bestLatin: WritingLanguage | null = null;
  let bestLatinShare = 0;
  for (const code of FUNCTION_CODES) {
    if (code === 'en') continue;
    const value = share(measure.functionWords[code]);
    if (value > bestLatinShare) {
      bestLatin = code;
      bestLatinShare = value;
    }
  }
  if (bestLatin && bestLatinShare >= FUNCTION_THRESHOLD && bestLatinShare > englishShare) return bestLatin;

  return 'en';
}

export function detectLanguage(text: string, hint?: WritingLanguage): WritingLanguage {
  return classifyLanguage(measureLanguage(text), hint);
}

export function buildLanguageProfile(samples: string[], hint?: WritingLanguage): LanguageProfile {
  const total = measureLanguage(samples.join('\n\n'));
  const primary = classifyLanguage(total, hint);
  const nonLatin = total.letters - (total.scripts.latin ?? 0);
  const isMix = languageSpec(primary).group === 'mix';
  return {
    primary,
    nativeScriptShare: round(total.letters ? nonLatin / total.letters : 0),
    mixShare: isMix ? round(total.latin ? (total.markers[primary] ?? 0) / total.latin : 0) : 0,
    switchRate: isMix ? round(total.sentences ? (total.mixedSentences[primary] ?? 0) / total.sentences : 0) : 0,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

/**
 * The language to write in: what the person's posts show, unless that only
 * disagrees with their choice in a way measurement cannot settle. Text
 * cannot tell Hindi from Marathi in Devanagari, and two mixes share words,
 * so within the same script or between two mixes the choice wins.
 */
export function effectiveLanguage(stated: WritingLanguage, profile?: LanguageProfile | null): WritingLanguage {
  if (!profile || profile.primary === 'en' || profile.primary === stated) return stated;
  if (stated !== 'en') {
    const chosen = languageSpec(stated);
    const measured = languageSpec(profile.primary);
    if (chosen.group === 'mix' && measured.group === 'mix') return stated;
    if (chosen.group !== 'mix' && measured.group !== 'mix' && chosen.script === measured.script) return stated;
  }
  return profile.primary;
}

/**
 * Instructions for the writer model. A measured profile, when there is one,
 * makes them specific to how this person writes; otherwise the stated
 * language sets a sensible default.
 */
export function languageInstructions(stated: WritingLanguage, profile?: LanguageProfile | null): string {
  const code = effectiveLanguage(stated, profile);
  const spec = languageSpec(code);

  if (spec.group === 'mix') {
    const base = languageSpec((spec.base ?? 'en') as WritingLanguage);
    const baseScript = SCRIPT_NAMES[base.script];
    const mix = profile && profile.primary === code && profile.switchRate > 0 ? ` In their own posts about ${Math.round(profile.switchRate * 100)}% of sentences mix the two.` : '';
    return [
      `LANGUAGE: Write in ${spec.name}, the way this person does: ${base.name} and English mixed naturally inside sentences, ${base.name} words in Latin script (for example "${(spec.examples ?? '').split(', ').join('", "')}"), never ${baseScript} script.`,
      `Keep technical and business terms in English. Do not translate their ${base.name} into English or their English into ${base.name}.${mix}`,
    ].join(' ');
  }

  if (spec.group === 'english') return 'LANGUAGE: Write in English.';

  const script = spec.script === 'latin' ? '' : ` in ${SCRIPT_NAMES[spec.script]} script`;
  return `LANGUAGE: Write in ${spec.name}${script}, as a native speaker writes on social media, not as a translation. Keep product names, numbers and technical terms as the person writes them, usually in English.`;
}

/** Short label for the brief and the voice panel. Null for English, which needs no label. */
export function describeLanguage(profile: LanguageProfile): string | null {
  if (profile.primary === 'en') return null;
  return `Writes in ${languageSpec(profile.primary).name}`;
}

/** One line for the voice block the writer model reads, or null for English. */
export function languageTraitLine(profile: LanguageProfile | undefined): string | null {
  if (!profile || profile.primary === 'en') return null;
  const spec = languageSpec(profile.primary);
  if (spec.group === 'mix') {
    const base = languageSpec((spec.base ?? 'en') as WritingLanguage);
    return `- Mixes ${base.name} and English (${base.name} words in Latin script) in about ${Math.round(profile.switchRate * 100)}% of sentences. Keep that mix.`;
  }
  return spec.script === 'latin' ? `- Writes in ${spec.name}.` : `- Writes in ${spec.name}, in ${SCRIPT_NAMES[spec.script]} script.`;
}

/**
 * How far a draft's language is from the person's. Returns a penalty for the
 * voice score and a reason, or null when it matches.
 */
export function languageMismatch(draft: string, profile: LanguageProfile | undefined): { penalty: number; expected: WritingLanguage; found: WritingLanguage } | null {
  if (!profile || profile.primary === 'en') return null;
  const found = detectLanguage(draft, profile.primary);
  if (found === profile.primary) return null;
  return { penalty: 14, expected: profile.primary, found };
}

/**
 * Whether text renders correctly on a slide. Slides are drawn with the
 * brand kit's bundled Latin typefaces and no complex-script shaping, so any
 * letter outside Latin script would draw as an empty box.
 */
export function renderableOnSlides(text: string): boolean {
  for (const char of text) {
    const script = scriptOf(char);
    if (script && script !== 'latin') return false;
  }
  return true;
}

/** Whether a language is written right to left. */
export function isRightToLeft(code: WritingLanguage): boolean {
  return Boolean(languageSpec(code).rtl);
}
