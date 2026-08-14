/**
 * Cover letter generation — the one place a model is consulted.
 *
 * The model is a *writer*, given a fixed set of facts to work from. It never
 * supplies facts. The context handed in is the only ground truth it may assert
 * (see `context.ts`), the system prompt repeats the rule in the strongest
 * terms this codebase uses, and — because prompt adherence is not guaranteed —
 * the output is validated and any missing specific becomes a literal
 * `[YOUR SPECIFIC DETAIL: …]` placeholder that `slotsFromText` turns into an
 * honest gap the student sees before they send the letter.
 *
 * Same model and call shape as `lib/resume/parse.ts`, for the same reason:
 * the output goes to a stranger under the student's name, so fabrication here
 * is the worst failure this product can have.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { CoverLetterContext } from "./context";
import {
  LETTER_ROLES,
  MIN_PARAGRAPHS,
  MAX_PARAGRAPHS,
  normalizeDraft,
  slotMarker,
  slotsFromText,
  type CoverLetterDraft,
  type LetterParagraph,
  type LetterRole,
} from "./types";

const MODEL = "claude-sonnet-5";

export class CoverLetterGenerateError extends Error {}

/* ------------------------------------------------------------------ *
 * Pure: prompt building + result validation (unit-testable)
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You write cover letters for a student applying to the exact role described in the context. You are a professional writer, not an assistant.

GROUNDING RULES — the most important rules in this prompt:

1. Every claim about the candidate must come from the candidate facts or the evidence entries below. Where you quote their resume, quote the bullets verbatim. Never invent, embellish, upgrade, or infer a metric, grade, project, organisation, title, or result. If the resume does not say the candidate "led" something, they did not lead it.
2. Every claim about the role or the organisation must come from the posting facts below. You know nothing else about this organisation — not its size, age, products, awards, location, or reputation — and you must never assert any of that. Do not flatter, do not speculate, do not fill in.
3. When the letter needs a specific detail you do not have — a portfolio link, a particular project name, a number, a location, the reader's name — write the literal placeholder ${'"[YOUR SPECIFIC DETAIL: what is needed]"'} at that spot and leave it. A placeholder is honest. A guess becomes a false statement sent to a real recruiter, which is the single worst failure of this product.
4. The letter is first-person, in the student's voice, direct and specific. No clichés ("passionate about", "I am writing to express"), no hedging, no invented enthusiasm about a company you have never seen.
5. ${MIN_PARAGRAPHS} to ${MAX_PARAGRAPHS} paragraphs, 3-5 sentences each. You must include exactly one "opening" and exactly one "closing". "why" explains interest grounded only in posting facts. "evidence" uses the evidence entries.
6. Never mention the candidate's email, phone, or name in the body — the signature block is rendered separately.`;

/** Every gap becomes an explicit instruction to write a placeholder. */
function gapInstructions(gaps: string[]): string {
  if (gaps.length === 0) {
    return "No gaps: the candidate facts below cover what this letter needs.";
  }
  const list = gaps.map((g) => `  - ${g}`).join("\n");
  return `The letter is missing these specifics. Wherever one is needed, write ${JSON.stringify(
    slotMarker("what is needed"),
  )} with the specific named — never guess:\n${list}`;
}

function formatEvidence(evidence: CoverLetterContext["evidence"]): string {
  if (evidence.length === 0) {
    return "No resume entry names this role's skills. Do not pretend otherwise. In the evidence paragraph, either state honestly what the candidate does have (school, major, listed skills) or write a placeholder asking for a specific detail.";
  }
  return evidence
    .map((e, i) => {
      const bullets = e.bullets.map((b) => `      - ${b}`).join("\n");
      const dates = e.dates ? ` (${e.dates})` : "";
      return (
        `  ${i + 1}. ${e.kind === "experience" ? "experience" : "project"}: ${e.title}${dates}\n` +
        `     demonstrates posting skills: ${e.matchedSkills.join(", ") || "none"}\n` +
        `     as written on the resume:\n${bullets}`
      );
    })
    .join("\n");
}

/** The model-facing context, assembled only from facts we actually hold. */
export function buildUserMessage(ctx: CoverLetterContext): string {
  const candidate = ctx.candidate;
  const factLines: string[] = [];
  if (candidate.name) factLines.push(`- name: ${candidate.name}`);
  if (candidate.school) factLines.push(`- school: ${candidate.school}`);
  if (candidate.major) factLines.push(`- major: ${candidate.major}`);
  if (candidate.gradYear) factLines.push(`- expected graduation year: ${candidate.gradYear}`);
  if (candidate.gpa != null) factLines.push(`- GPA as stated on resume: ${candidate.gpa}`);
  if (candidate.skills.length > 0) factLines.push(`- skills on resume: ${candidate.skills.join(", ")}`);
  if (candidate.targetVerticals.length > 0) {
    factLines.push(`- areas of interest (direction only, not a claim): ${candidate.targetVerticals.join(", ")}`);
  }
  if (factLines.length === 0) factLines.push("- (no profile or resume facts supplied)");

  const posting = ctx.posting;
  const postingLines: string[] = [
    `- kind: ${posting.kind}`,
    `- title: ${posting.title}`,
    `- organisation: ${posting.company}`,
  ];
  if (posting.term) postingLines.push(`- term: ${posting.term}`);
  if (posting.locations.length > 0) postingLines.push(`- locations: ${posting.locations.join(", ")}`);
  if (posting.isRemote) postingLines.push(`- remote: yes`);
  if (posting.skills.length > 0) postingLines.push(`- skills the role names: ${posting.skills.join(", ")}`);
  if (posting.amountMin != null || posting.amountMax != null) {
    const lo = posting.amountMin ?? posting.amountMax;
    const hi = posting.amountMax ?? posting.amountMin;
    postingLines.push(`- award/amount: $${lo?.toLocaleString("en-US")}${hi !== lo ? `–$${hi?.toLocaleString("en-US")}` : ""}`);
  }
  if (posting.eligibility.length > 0) postingLines.push(`- eligibility criteria: ${posting.eligibility.join("; ")}`);
  if (posting.deadlineAt) {
    postingLines.push(`- deadline: ${posting.deadlineAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`);
  }
  if (posting.isContentMarketing) {
    postingLines.push(
      "- note: this scholarship is sponsored content (the sponsor markets themselves). Write a modest letter about the stated criteria, not an effusive one.",
    );
  }

  return [
    "## Candidate facts (the ONLY facts you may assert about the candidate)",
    factLines.join("\n"),
    "",
    "## Posting facts (the ONLY facts you may assert about the role/organisation)",
    postingLines.join("\n"),
    "",
    "## Evidence entries (verbatim from the resume)",
    formatEvidence(ctx.evidence),
    "",
    "## Gaps",
    gapInstructions(ctx.gaps),
  ].join("\n");
}

export interface WriteCoverLetterInput {
  paragraphs: Array<{ role: LetterRole; text: string }>;
}

export function normalizeGenerated(raw: unknown): CoverLetterDraft {
  if (!raw || typeof raw !== "object") {
    throw new CoverLetterGenerateError("the model returned nothing usable");
  }
  const paragraphs = (raw as WriteCoverLetterInput).paragraphs;
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    throw new CoverLetterGenerateError("the model returned no paragraphs");
  }

  try {
    return normalizeDraft({
      // New ids on every generation; the editor owns them after that.
      paragraphs: paragraphs.map((p) => ({
        id: "",
        role: p.role,
        text: p.text,
      })),
    });
  } catch (err) {
    if (err instanceof Error) {
      throw new CoverLetterGenerateError(`the generated letter was invalid: ${err.message}`);
    }
    throw new CoverLetterGenerateError("the generated letter was invalid");
  }
}

/* ------------------------------------------------------------------ *
 * Network: full draft + single-paragraph rewrite
 * ------------------------------------------------------------------ */

function createClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new CoverLetterGenerateError("ANTHROPIC_API_KEY is not set — see .env");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
}

const WRITE_TOOL: Anthropic.Tool = {
  name: "write_cover_letter",
  description: "Write the cover letter as a list of body paragraphs.",
  input_schema: {
    type: "object",
    properties: {
      paragraphs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: {
              type: "string",
              enum: [...LETTER_ROLES],
              description:
                'exactly one "opening" and exactly one "closing"; "why" and "evidence" as needed',
            },
            text: {
              type: "string",
              description: "The paragraph. 3-5 sentences. Use [YOUR SPECIFIC DETAIL: ...] where a fact is missing.",
            },
          },
          required: ["role", "text"],
        },
      },
    },
    required: ["paragraphs"],
  },
};

async function completeWith(client: Anthropic, userMessage: string): Promise<unknown> {
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [WRITE_TOOL],
        // Forced: we want the structured letter, not a chat reply about it.
        tool_choice: { type: "tool", name: WRITE_TOOL.name },
        messages: [{ role: "user", content: userMessage }],
      },
      { timeout: 120_000 },
    );
  } catch (err) {
    throw new CoverLetterGenerateError(
      err instanceof Error ? `could not write the letter: ${err.message}` : "could not write the letter",
    );
  }

  const block = message.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new CoverLetterGenerateError("the model returned nothing usable");
  }
  return block.input;
}

export async function generateDraft(ctx: CoverLetterContext): Promise<CoverLetterDraft> {
  const client = createClient();
  const input = await completeWith(client, buildUserMessage(ctx));
  return normalizeGenerated(input);
}

export async function regenerateParagraph(
  ctx: CoverLetterContext,
  target: { role: LetterRole; text: string },
): Promise<LetterParagraph> {
  const client = createClient();
  const prompt = [
    buildUserMessage(ctx),
    "",
    `## Task`,
    `Rewrite ONLY the "${target.role}" paragraph. The current paragraph is:`,
    ``,
    `"""${target.text}"""`,
    "",
    `Keep the same role and point, but write it better. Respect the grounding rules exactly — no new facts.`,
  ].join("\n");

  const input = await completeWith(client, prompt);
  if (!input || typeof input !== "object") {
    throw new CoverLetterGenerateError("the model returned nothing usable");
  }
  const paragraphs = (input as { paragraphs?: unknown[] }).paragraphs;
  const first = Array.isArray(paragraphs) ? paragraphs[0] : null;
  if (!first || typeof first !== "object") {
    throw new CoverLetterGenerateError("the model returned no rewritten paragraph");
  }
  const text = typeof (first as { text?: unknown }).text === "string" ? (first as { text: string }).text.trim() : "";
  if (!text) throw new CoverLetterGenerateError("the rewritten paragraph was empty");

  return { id: "", role: target.role, text };
}

/** Slots across an entire draft, for surfacing before save. */
export function draftSlots(draft: CoverLetterDraft): string[] {
  return [...new Set(draft.paragraphs.flatMap((p) => slotsFromText(p.text)))];
}
