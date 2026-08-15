/**
 * Essay / SOP review — deterministic, no model call, no network call.
 *
 * WHY NO MODEL, WHEN AN ESSAY IS THE MOST PROSE-LIKE THING HERE. Two reasons,
 * and the first is a privacy argument rather than a quality one.
 *
 *  1. **The essay never leaves the browser.** These functions are pure, so the
 *     review runs client-side and there is no endpoint that takes an essay. A
 *     scholarship essay is frequently about the hardest thing that has happened
 *     to a student — a bereavement, an illness, an immigration story. Shipping
 *     that to an API to be graded is a thing we should have to justify, and we
 *     cannot justify it for feedback we can produce without it.
 *  2. A model asked "is this essay good" will always find something to say, and
 *     will say it with the same confidence whether or not it is true. Every
 *     finding below is a count the student can verify by looking at their own
 *     text.
 *
 * WHAT WE CAN HONESTLY CLAIM, AND THE ONE THING WE CANNOT. We can say what the
 * prompt asks about and whether those words appear anywhere in the essay; we
 * can count specifics, measure sentences, and find filler. We **cannot** tell
 * whether the essay is moving, or whether the story is the right one. The page
 * says so. What this replaces is not a reader — it is the third read-through a
 * student does not have time for.
 */

import {
  paragraphs,
  promptTerms,
  sentences,
  stemSet,
  wordCount,
  words,
  type EssayInput,
} from "./types";

export type EssaySection = "prompt" | "specificity" | "clarity" | "structure";

export type DimensionKey = "coverage" | "specificity" | "clarity" | "structure";

export interface Finding {
  section: EssaySection;
  dimension: DimensionKey;
  severity: "high" | "medium" | "low";
  title: string;
  /** Always an instruction, never a diagnosis. */
  fix: string;
  /** The student's own sentence, quoted back. */
  evidence?: string;
}

export interface ReviewDimension {
  key: DimensionKey;
  label: string;
  /** 0–100, or null when there was nothing to assess. */
  score: number | null;
  detail: string;
  weight: number;
}

export interface EssayReview {
  score: number | null;
  dimensions: ReviewDimension[];
  findings: Finding[];
  knownDimensions: number;
  totalDimensions: number;
  words: number;
  /** Terms from the prompt that appear nowhere in the essay. */
  missingTerms: string[];
}

interface Assessed {
  dimension: ReviewDimension;
  findings: Finding[];
}

function quote(s: string, max = 130): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, t.lastIndexOf(" ", max))}…`;
}

/* ------------------------------------------------------------------ *
 * Does it answer the question
 * ------------------------------------------------------------------ */

/**
 * Lexical coverage of the prompt.
 *
 * The single most common way a scholarship essay fails is not being bad — it is
 * being a good essay about something the prompt did not ask for, usually
 * because it was written for a different application and lightly edited. That
 * is invisible when you reread your own work and obvious to a reader.
 *
 * THE HONEST LIMIT, WHICH THE UI ALSO PRINTS: this matches words, not meaning.
 * An essay that addresses "leadership" entirely through the word "captain"
 * scores as a miss here. So a gap is reported as *worth checking*, never as
 * proof, and the terms are listed so the student can judge in two seconds.
 */
function assessCoverage(input: EssayInput): Assessed {
  const terms = promptTerms(input.prompt);
  if (terms.length === 0) {
    return {
      dimension: {
        key: "coverage",
        label: "answers the prompt",
        score: null,
        detail: "No prompt pasted, so there is nothing to check the essay against.",
        weight: 30,
      },
      findings: [],
    };
  }

  const inEssay = stemSet(input.essay);
  const missing = terms.filter((t) => !inEssay.has(t));
  const covered = terms.length - missing.length;

  const findings: Finding[] = [];
  if (missing.length > 0) {
    const share = missing.length / terms.length;
    findings.push({
      section: "prompt",
      dimension: "coverage",
      severity: share > 0.5 ? "high" : share > 0.25 ? "medium" : "low",
      title: `${missing.length} of ${terms.length} things the prompt names do not appear in your essay`,
      fix: "Check each one. Some will be fine — you may have covered “leadership” by describing what you did as captain, and we match words rather than meaning. The rest are the most common way a strong essay loses: it was written for a different application and answers that question instead of this one.",
      evidence: missing.join(", "),
    });
  }

  return {
    dimension: {
      key: "coverage",
      label: "answers the prompt",
      score: Math.round((covered / terms.length) * 100),
      detail: `${covered} of ${terms.length} terms from the prompt appear somewhere in the essay.`,
      weight: 30,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Specificity
 * ------------------------------------------------------------------ */

/**
 * Openings that could sit on any essay ever submitted.
 *
 * Every entry is a phrase a reader has seen several hundred times before lunch.
 * The list is kept tight for the same reason the resume critique's is: a
 * checker that flags decent writing gets ignored wholesale.
 */
const CLICHES: Array<{ re: RegExp; phrase: string }> = [
  { re: /\bever since I (?:was|can remember)\b/i, phrase: "ever since I was…" },
  { re: /\bfrom a young age\b/i, phrase: "from a young age" },
  { re: /\bas long as I can remember\b/i, phrase: "as long as I can remember" },
  { re: /\bI have always (?:been )?(?:passionate|loved|wanted|dreamed)\b/i, phrase: "I have always been passionate…" },
  { re: /\bchanged my life\b/i, phrase: "changed my life" },
  { re: /\btaught me the (?:value|importance) of\b/i, phrase: "taught me the value of" },
  { re: /\bmake a difference\b/i, phrase: "make a difference" },
  { re: /\bgive back to (?:my|the) community\b/i, phrase: "give back to my community" },
  { re: /\bout(?:side)? of my comfort zone\b/i, phrase: "outside my comfort zone" },
  { re: /\bwell[- ]rounded\b/i, phrase: "well-rounded" },
  { re: /\bhard[- ]working\b/i, phrase: "hard-working" },
  { re: /\bin today'?s (?:society|world)\b/i, phrase: "in today's society" },
  { re: /\bthe dictionary defines\b/i, phrase: "the dictionary defines…" },
  { re: /\bstrive to\b/i, phrase: "strive to" },
];

export function clichesIn(text: string): string[] {
  return CLICHES.filter((c) => c.re.test(text)).map((c) => c.phrase);
}

/**
 * Quantities written as words.
 *
 * Students write "three years" far more often than "3 years", so counting only
 * digits would report a specific essay as abstract — the one error this check
 * must not make, because it tells someone their concrete writing is vague.
 *
 * "one" is deliberately excluded: it is usually the pronoun ("one of the
 * things I learned"), and a false positive here means calling an abstract essay
 * specific, which is the failure that matters in the other direction.
 */
const NUMBER_WORD =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|twice|half)\b/i;

/** A sentence carrying something checkable: a number, a date, or a proper noun. */
export function isConcrete(sentence: string): boolean {
  if (/\d/.test(sentence) || NUMBER_WORD.test(sentence)) return true;
  // Capitalised words that are not sentence-initial and not "I".
  const tokens = sentence.trim().split(/\s+/);
  return tokens.slice(1).some((t) => /^[A-Z][a-z]{2,}/.test(t.replace(/[^A-Za-z]/g, "")));
}

/** Full credit at this share of sentences carrying something concrete. */
const CONCRETE_TARGET = 0.35;

function assessSpecificity(input: EssayInput): Assessed {
  const lines = sentences(input.essay);
  if (lines.length === 0) {
    return {
      dimension: {
        key: "specificity",
        label: "specific, not general",
        score: null,
        detail: "Nothing to assess.",
        weight: 25,
      },
      findings: [],
    };
  }

  const findings: Finding[] = [];
  const concrete = lines.filter(isConcrete);
  const share = concrete.length / lines.length;

  if (share < CONCRETE_TARGET) {
    findings.push({
      section: "specificity",
      dimension: "specificity",
      severity: share < 0.15 ? "high" : "medium",
      title: `${concrete.length} of ${lines.length} sentences contain anything checkable`,
      fix: "Names, numbers, dates, places. A reader forgets “I learned the importance of persistence” before the end of the page, and remembers “I rewrote the intake form four times before the clinic stopped losing appointments.” Both claim persistence; only one is evidence.",
      evidence: quote(lines.find((l) => !isConcrete(l)) ?? lines[0]),
    });
  }

  const cliches = clichesIn(input.essay);
  if (cliches.length > 0) {
    findings.push({
      section: "specificity",
      dimension: "specificity",
      severity: cliches.length > 2 ? "high" : "medium",
      title: `${cliches.length} phrase${cliches.length === 1 ? "" : "s"} a reader has seen hundreds of times`,
      fix: "Replace each with the specific thing underneath it. These are not bad writing exactly — they are invisible writing, and a reviewer working through two hundred essays skims straight past them.",
      evidence: cliches.join(", "),
    });
  }

  const concreteScore = Math.min(1, share / CONCRETE_TARGET);
  // Clichés cap the dimension rather than subtracting from it: an essay full of
  // them is not "slightly less specific", it is generic.
  const clichePenalty = Math.max(0, 1 - cliches.length * 0.15);

  return {
    dimension: {
      key: "specificity",
      label: "specific, not general",
      score: Math.round(concreteScore * clichePenalty * 100),
      detail: `${concrete.length} of ${lines.length} sentences name something checkable; ${cliches.length} stock phrase${cliches.length === 1 ? "" : "s"} found.`,
      weight: 25,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Clarity
 * ------------------------------------------------------------------ */

const LONG_SENTENCE_WORDS = 40;

/** Words that soften a claim until it says nothing. */
const HEDGES =
  /\b(?:very|really|quite|rather|somewhat|fairly|actually|basically|essentially|literally|truly|definitely|certainly|arguably|perhaps|maybe|sort of|kind of|a lot of|in order to|due to the fact that|the fact that)\b/gi;

function assessClarity(input: EssayInput): Assessed {
  const lines = sentences(input.essay);
  if (lines.length < 2) {
    return {
      dimension: {
        key: "clarity",
        label: "clarity",
        score: null,
        detail: "Too short to assess sentence rhythm.",
        weight: 25,
      },
      findings: [],
    };
  }

  const findings: Finding[] = [];
  const lengths = lines.map((l) => wordCount(l));

  const long = lines.filter((_, i) => lengths[i] > LONG_SENTENCE_WORDS);
  if (long.length > 0) {
    findings.push({
      section: "clarity",
      dimension: "clarity",
      severity: long.length > lines.length / 5 ? "medium" : "low",
      title: `${long.length} sentence${long.length === 1 ? " runs" : "s run"} past ${LONG_SENTENCE_WORDS} words`,
      fix: "Split them. A long sentence is where a reader loses the thread, and in an essay being skimmed under time pressure they do not go back to find it.",
      evidence: quote(long[0]),
    });
  }

  const hedgeMatches = input.essay.match(HEDGES) ?? [];
  if (hedgeMatches.length > 3) {
    const unique = [...new Set(hedgeMatches.map((h) => h.toLowerCase()))];
    findings.push({
      section: "clarity",
      dimension: "clarity",
      severity: hedgeMatches.length > 10 ? "medium" : "low",
      title: `${hedgeMatches.length} filler words weakening your sentences`,
      fix: "Delete them and read it again — almost every one can go without changing the meaning. “In order to” is “to”. “Very important” is “important”, or it is something more precise you have not said yet.",
      evidence: unique.slice(0, 8).join(", "),
    });
  }

  /*
   * Sentence-length variance.
   *
   * Uniform sentence length is what makes competent prose dull to read, and it
   * is invisible to its author. Reported as a range rather than a statistic,
   * because "your standard deviation is 4.2" is not an instruction.
   */
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const spread = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
  const monotone = spread < 5 && lines.length >= 6;
  if (monotone) {
    findings.push({
      section: "clarity",
      dimension: "clarity",
      severity: "low",
      title: `Your sentences are all about the same length (${Math.round(mean)} words)`,
      fix: "Vary them. A short sentence after two long ones is the cheapest emphasis in writing, and an essay of uniform sentences reads as flat however good the content is.",
    });
  }

  const clean = lines.length - long.length;
  const hedgeRate = Math.min(1, hedgeMatches.length / Math.max(10, lines.length));
  const score = Math.round(
    ((clean / lines.length) * 0.6 + (1 - hedgeRate) * 0.3 + (monotone ? 0 : 0.1)) * 100,
  );

  return {
    dimension: {
      key: "clarity",
      label: "clarity",
      score: Math.max(0, Math.min(100, score)),
      detail: `${lines.length} sentences, ${Math.round(mean)} words on average, ${hedgeMatches.length} filler words.`,
      weight: 25,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Structure and limits
 * ------------------------------------------------------------------ */

function assessStructure(input: EssayInput): Assessed {
  const total = wordCount(input.essay);
  if (total === 0) {
    return {
      dimension: {
        key: "structure",
        label: "structure and length",
        score: null,
        detail: "Nothing pasted.",
        weight: 20,
      },
      findings: [],
    };
  }

  const findings: Finding[] = [];
  const checks: boolean[] = [];

  if (input.wordLimit) {
    const over = total > input.wordLimit;
    const wellUnder = total < input.wordLimit * 0.7;
    checks.push(!over && !wellUnder);

    if (over) {
      findings.push({
        section: "structure",
        dimension: "structure",
        severity: "high",
        title: `You are ${total - input.wordLimit} words over the ${input.wordLimit}-word limit`,
        fix: "Cut before you submit. Plenty of application forms simply truncate at the limit, which means the reader gets your essay with the ending removed and no indication that anything is missing.",
      });
    } else if (wellUnder) {
      findings.push({
        section: "structure",
        dimension: "structure",
        severity: "medium",
        title: `You have used ${total} of ${input.wordLimit} words`,
        fix: "The limit is a signal about how much they expect. Well under it reads as having less to say — usually there is one more specific example that would fit.",
      });
    }
  }

  const paras = paragraphs(input.essay);
  const oneBlock = paras.length === 1 && total > 150;
  checks.push(!oneBlock);
  if (oneBlock) {
    findings.push({
      section: "structure",
      dimension: "structure",
      severity: "medium",
      title: "The whole essay is one paragraph",
      fix: "Break it up. A wall of text is the first thing a reader sees and the fastest way to lose their attention before a word has been read.",
    });
  }

  /*
   * The opening sentence.
   *
   * It is the only sentence guaranteed to be read, and the most common opening
   * in student essays says nothing at all — a definition, or a windup toward
   * the actual first sentence two lines down.
   */
  const first = sentences(input.essay)[0] ?? "";
  const weakOpening =
    clichesIn(first).length > 0 || (!isConcrete(first) && wordCount(first) < 8);
  checks.push(!weakOpening);
  if (weakOpening && first) {
    findings.push({
      section: "structure",
      dimension: "structure",
      severity: "medium",
      title: "Your first sentence does not do much",
      fix: "It is the one sentence guaranteed to be read. Start inside the story — a moment, a place, a number — rather than winding up to it. Very often the real first sentence is already there, two or three lines down.",
      evidence: quote(first),
    });
  }

  const passed = checks.filter(Boolean).length;
  const limitNote = input.wordLimit ? ` against a ${input.wordLimit}-word limit` : "";

  return {
    dimension: {
      key: "structure",
      label: "structure and length",
      score: Math.round((passed / checks.length) * 100),
      detail: `${total} words in ${paras.length} paragraph${paras.length === 1 ? "" : "s"}${limitNote}.`,
      weight: 20,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

const SEVERITY_RANK: Record<Finding["severity"], number> = { high: 0, medium: 1, low: 2 };

export function reviewEssay(input: EssayInput): EssayReview {
  const assessed = [
    assessCoverage(input),
    assessSpecificity(input),
    assessClarity(input),
    assessStructure(input),
  ];

  const dimensions = assessed.map((a) => a.dimension);
  const scored = dimensions.filter((d) => d.score !== null);
  const totalWeight = scored.reduce((s, d) => s + d.weight, 0);
  const score =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((s, d) => s + d.weight * (d.score as number), 0) / totalWeight);

  // Ordered by how much fixing each moves the number, exactly as the resume
  // critique and the GitHub audit order theirs.
  const headroom = new Map<DimensionKey, number>(
    dimensions.map((d) => [d.key, d.score === null ? 0 : ((100 - d.score) / 100) * d.weight]),
  );

  const findings = assessed
    .flatMap((a) => a.findings)
    .sort(
      (a, b) =>
        (headroom.get(b.dimension) ?? 0) - (headroom.get(a.dimension) ?? 0) ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );

  const terms = promptTerms(input.prompt);
  const inEssay = stemSet(input.essay);

  return {
    score,
    dimensions,
    findings,
    knownDimensions: scored.length,
    totalDimensions: dimensions.length,
    words: words(input.essay).length,
    missingTerms: terms.filter((t) => !inEssay.has(t)),
  };
}
