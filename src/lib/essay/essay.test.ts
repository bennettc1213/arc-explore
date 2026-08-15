import assert from "node:assert/strict";
import { test } from "node:test";

import { clichesIn, isConcrete, reviewEssay } from "./review";
import {
  EMPTY_ESSAY_INPUT,
  promptTerms,
  sentences,
  stem,
  wordCount,
  type EssayInput,
} from "./types";

function input(over: Partial<EssayInput> = {}): EssayInput {
  return { ...EMPTY_ESSAY_INPUT, ...over };
}

/* ------------------------------------------------------------------ *
 * Tokenizing
 * ------------------------------------------------------------------ */

test("sentences split on real boundaries, not on every period", () => {
  const s = sentences("I worked at Acme Inc. in 2025. It went well! Did it? Yes.");
  assert.equal(s.length, 4);
  assert.equal(s[0], "I worked at Acme Inc. in 2025.");
});

test("inflections of the same word collapse to one stem", () => {
  /*
   * The property that matters, asserted as a property rather than as exact
   * output. A prompt asking about "challenges" must match an essay that says
   * "challenge" — reporting a gap the student does not have is the one error
   * this check cannot afford, because it sends them rewriting a section that
   * was already fine.
   */
  const same = (a: string, b: string) =>
    assert.equal(stem(a), stem(b), `${a} and ${b} should share a stem`);

  same("challenge", "challenges");
  same("experience", "experiences");
  same("time", "times");
  same("overcoming", "overcome");
  same("leader", "leaders");

  // Genuinely different words stay apart.
  assert.notEqual(stem("leadership"), stem("leader"));
  // Short words are never stemmed — "ties" must not become "t".
  assert.equal(stem("ties"), "ties");
});

test("prompt terms keep the subject and drop the scaffolding", () => {
  /*
   * "Describe" and "time" tell the student what to do; they are not things the
   * essay must mention. Flagging their absence would put an obviously silly
   * finding at the top of the list, and a student who sees one stops trusting
   * the rest. Asserted through the same stemmer the matcher uses, so this does
   * not encode the stemmer's exact output as the contract.
   */
  const terms = promptTerms("Describe a time when you overcame a significant challenge.");
  for (const kept of ["overcame", "significant", "challenge"]) {
    assert.ok(terms.includes(stem(kept)), `${kept} missing from ${terms.join(",")}`);
  }
  for (const dropped of ["a", "you", "when", "time", "describe"]) {
    assert.equal(terms.includes(stem(dropped)), false, `${dropped} should not be a term`);
  }
});

/* ------------------------------------------------------------------ *
 * Coverage
 * ------------------------------------------------------------------ */

test("an essay answering a different question is caught", () => {
  /*
   * The most common way a scholarship essay fails: it is a good essay, written
   * for another application, about something this prompt did not ask for. It is
   * invisible when you reread your own work.
   */
  const review = reviewEssay(
    input({
      prompt: "Describe your leadership experience in a community organization.",
      essay:
        "I have spent three years studying organic chemistry at Rutgers. My research " +
        "focused on catalysis. I published one paper in 2025 with Professor Alvarez. " +
        "I intend to pursue a doctorate in synthetic methods.",
    }),
  );
  const f = review.findings.find((x) => /do not appear in your essay/.test(x.title));
  assert.ok(f, "expected a coverage finding");
  assert.equal(f.severity, "high");
  assert.ok(review.missingTerms.includes("leadership"), review.missingTerms.join(","));
});

test("an essay that does answer the prompt scores well on coverage", () => {
  const review = reviewEssay(
    input({
      prompt: "Describe your leadership experience in a community organization.",
      essay:
        "My leadership experience began at the Trenton Community Kitchen in 2024. " +
        "I organized 14 volunteers across three shifts. The organization had lost " +
        "half its Saturday coverage, and I rebuilt the roster over six weeks.",
    }),
  );
  const d = review.dimensions.find((x) => x.key === "coverage");
  assert.ok(d && d.score !== null && d.score >= 70, `got ${d?.score}`);
});

test("no prompt means the coverage dimension is dropped, not scored as zero", () => {
  // Same contract as every other scorer here: a check we could not run is not a
  // failure. A student who only pasted their essay has not told us it is off-topic.
  const review = reviewEssay(input({ essay: "I did a thing in 2025 at Acme." }));
  assert.equal(review.dimensions.find((d) => d.key === "coverage")?.score, null);
  assert.ok(review.knownDimensions < review.totalDimensions);
});

/* ------------------------------------------------------------------ *
 * Specificity
 * ------------------------------------------------------------------ */

test("a sentence is concrete when it names something checkable", () => {
  assert.equal(isConcrete("I rewrote the form four times."), true);
  assert.equal(isConcrete("I worked at the Trenton Community Kitchen."), true);
  assert.equal(isConcrete("I learned the importance of persistence."), false);
  // A leading capital is the start of a sentence, not a proper noun.
  assert.equal(isConcrete("Persistence matters more than talent."), false);
});

test("stock phrases are counted, and good writing is not flagged", () => {
  assert.deepEqual(clichesIn("Ever since I was a child I wanted to make a difference."), [
    "ever since I was…",
    "make a difference",
  ]);
  assert.deepEqual(clichesIn("I rebuilt the roster over six weeks and Saturday coverage held."), []);
});

test("a wholly abstract essay is flagged as unspecific", () => {
  const review = reviewEssay(
    input({
      essay:
        "I have always been passionate about helping others. From a young age I knew " +
        "I wanted to make a difference. My experiences have taught me the value of " +
        "hard work. I am a well-rounded person who strives to give back to my community.",
    }),
  );
  const f = review.findings.find((x) => /contain anything checkable/.test(x.title));
  assert.ok(f);
  assert.equal(f.severity, "high");
  const d = review.dimensions.find((x) => x.key === "specificity");
  assert.ok(d && d.score !== null && d.score < 30, `got ${d?.score}`);
});

/* ------------------------------------------------------------------ *
 * Clarity and structure
 * ------------------------------------------------------------------ */

test("going over a stated word limit is a high-severity finding with the real number", () => {
  const essay = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ") + ".";
  const review = reviewEssay(input({ essay, wordLimit: 50 }));
  const f = review.findings.find((x) => /over the 50-word limit/.test(x.title));
  assert.ok(f);
  assert.equal(f.severity, "high");
  assert.match(f.title, /10 words over/);
});

test("coming in well under the limit is worth saying, gently", () => {
  const essay = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ") + ".";
  const review = reviewEssay(input({ essay, wordLimit: 500 }));
  assert.ok(review.findings.some((f) => /used 20 of 500 words/.test(f.title)));
});

test("no stated limit means no length finding either way", () => {
  const essay = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ") + ".";
  const review = reviewEssay(input({ essay, wordLimit: null }));
  assert.equal(review.findings.some((f) => /word limit|of 500 words/.test(f.title)), false);
});

test("filler words are counted only once they are a habit", () => {
  const few = reviewEssay(input({ essay: "This was very good. I went home. It ended." }));
  assert.equal(few.findings.some((f) => /filler words/.test(f.title)), false);

  const many = reviewEssay(
    input({
      essay:
        "This was very really quite good. I basically actually went home in order to rest. " +
        "It was literally very important. I definitely certainly agree.",
    }),
  );
  assert.ok(many.findings.some((f) => /filler words/.test(f.title)));
});

test("a single wall of text is flagged", () => {
  const essay = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ") + ".";
  const review = reviewEssay(input({ essay }));
  assert.ok(review.findings.some((f) => /one paragraph/.test(f.title)));
});

test("an empty essay returns a review rather than throwing", () => {
  const review = reviewEssay(EMPTY_ESSAY_INPUT);
  assert.equal(review.words, 0);
  assert.deepEqual(review.missingTerms, []);
  assert.equal(review.knownDimensions, 0);
  assert.equal(review.score, null);
});

test("a strong essay scores well across the board", () => {
  const review = reviewEssay(
    input({
      prompt: "Describe a challenge you overcame and what you learned.",
      wordLimit: 250,
      essay: [
        "The Trenton Community Kitchen lost half its Saturday volunteers in March 2025.",
        "I had been washing dishes there for a year. Nobody asked me to fix the roster, so I did.",
        "",
        "I called 31 lapsed volunteers over three weeks. Nine came back. The pattern I found was that most had stopped because the 6am start clashed with a bus that no longer ran that early.",
        "We moved the shift to 8am. Saturday coverage went from four people to twelve, and it held through the summer.",
        "",
        "What I learned was narrower than I expected. The challenge was not persuading anyone to care. It was that nobody had asked them why they left.",
      ].join("\n"),
    }),
  );
  assert.ok(review.score !== null && review.score >= 65, `got ${review.score}`);
  assert.equal(review.findings.filter((f) => f.severity === "high").length, 0);
});

test("word counting ignores punctuation", () => {
  assert.equal(wordCount("Hello, world — this is four."), 5);
});
