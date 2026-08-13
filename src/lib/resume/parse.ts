import Anthropic from "@anthropic-ai/sdk";

import {
  EMPTY_PARSED_RESUME,
  parsedResumeSchema,
  type ParsedResume,
  type UploadKind,
} from "./types";

/**
 * Turns an uploaded resume into structured data.
 *
 * PDFs go to the model as a document block rather than through a text
 * extractor: resumes are two-column layouts full of tables, and naive
 * extraction interleaves the columns into nonsense that then gets parsed as
 * fact. Plain text is passed straight through.
 *
 * The extraction is deliberately dumb. It transcribes; it does not interpret.
 * Everything it produces is a fact this app may later assert on the user's
 * behalf in an email to a stranger, so an invented detail here does real
 * damage to a real person's reputation. Absent means null, always.
 */

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You extract structured data from resumes. You are a transcriber, not an assistant.

Rules, in order of importance:

1. Copy values verbatim from the document. Do not rewrite, summarise, expand abbreviations, correct spelling, or reformat.
2. If the document does not state something, return null for that field (or an empty array for a list). Absent is a valid, expected answer.
3. Never infer. Do not guess a graduation year from a course load, a GPA from honours text, a major from a job title, or a school from an email domain. Only record what is written.
4. Return the bullets under each role exactly as written, one string per bullet.
5. If a value is ambiguous, prefer null over a guess.

Downstream, this data is the only thing an email generator is allowed to claim about this person. A value you invent becomes a false statement sent to a recruiter under their name.`;

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "record_resume",
  description: "Record the contents of the resume exactly as written.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: ["string", "null"], description: "Full name as printed, or null." },
      email: { type: ["string", "null"], description: "Email address as printed, or null." },
      phone: { type: ["string", "null"], description: "Phone number as printed, or null." },
      school: {
        type: ["string", "null"],
        description: "Most recent school or university named, or null.",
      },
      major: {
        type: ["string", "null"],
        description: "Field of study as printed (e.g. 'Computer Science'), or null.",
      },
      gradYear: {
        type: ["integer", "null"],
        description:
          "Four-digit graduation year, ONLY if a graduation or expected-graduation date is stated. Otherwise null.",
      },
      gpa: {
        type: ["number", "null"],
        description: "GPA only if printed as a number. Never estimate one. Otherwise null.",
      },
      skills: {
        type: "array",
        items: { type: "string" },
        description: "Skills/technologies as listed. Empty array if there is no skills section.",
      },
      experiences: {
        type: "array",
        description: "Jobs, internships and research positions, most recent first.",
        items: {
          type: "object",
          properties: {
            organization: { type: ["string", "null"] },
            role: { type: ["string", "null"] },
            dates: {
              type: ["string", "null"],
              description: "Date range exactly as printed, e.g. 'Jun 2025 - Aug 2025'.",
            },
            location: { type: ["string", "null"] },
            bullets: {
              type: "array",
              items: { type: "string" },
              description: "Each bullet verbatim.",
            },
          },
          required: ["organization", "role", "dates", "location", "bullets"],
        },
      },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            link: { type: ["string", "null"] },
          },
          required: ["name", "description", "link"],
        },
      },
      links: {
        type: "array",
        items: { type: "string" },
        description: "Any URLs printed on the resume (portfolio, GitHub, LinkedIn).",
      },
    },
    required: [
      "name",
      "email",
      "phone",
      "school",
      "major",
      "gradYear",
      "gpa",
      "skills",
      "experiences",
      "projects",
      "links",
    ],
  },
};

export class ResumeParseError extends Error {}

export interface ParseResumeInput {
  bytes: Uint8Array;
  kind: UploadKind;
  fileName: string;
}

export interface ParseResumeResult {
  parsed: ParsedResume;
  /**
   * The document's text, when we already had it.
   *
   * Null for PDFs: we send the file to the model rather than extracting text
   * ourselves, so we never hold a transcript we can honestly call the source.
   * Storing a model-generated "transcript" as if it were the document would
   * quietly turn a paraphrase into evidence.
   */
  rawText: string | null;
}

export async function parseResume({
  bytes,
  kind,
  fileName,
}: ParseResumeInput): Promise<ParseResumeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ResumeParseError("ANTHROPIC_API_KEY is not set — see .env");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });

  const rawText = kind === "text" ? new TextDecoder().decode(bytes) : null;

  if (kind === "text" && rawText!.trim().length === 0) {
    throw new ResumeParseError("that file has no text in it");
  }

  const document: Anthropic.DocumentBlockParam =
    kind === "pdf"
      ? {
          type: "document",
          title: fileName,
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: Buffer.from(bytes).toString("base64"),
          },
        }
      : {
          type: "document",
          title: fileName,
          source: { type: "text", media_type: "text/plain", data: rawText! },
        };

  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        // Forced: we want the structured record, not a chat reply about it.
        tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
        messages: [
          {
            role: "user",
            content: [
              document,
              {
                type: "text",
                text: "Record this resume with the record_resume tool. Anything the document does not state must be null.",
              },
            ],
          },
        ],
      },
      { timeout: 120_000 },
    );
  } catch (err) {
    throw new ResumeParseError(
      err instanceof Error ? `could not read that resume: ${err.message}` : "could not read that resume",
    );
  }

  const block = message.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new ResumeParseError("could not read that resume — the parser returned nothing usable");
  }

  // `.catch()` on the field schemas coerces individually malformed values to
  // their empty form rather than discarding the whole resume, so one odd date
  // does not cost the user their upload.
  const result = parsedResumeSchema.safeParse(block.input);
  if (!result.success) {
    throw new ResumeParseError("could not read that resume — unexpected structure");
  }

  return { parsed: result.data, rawText };
}

/** True when a parse produced nothing worth storing. */
export function isEmptyParse(parsed: ParsedResume): boolean {
  return (
    JSON.stringify({ ...parsed, links: [] }) ===
    JSON.stringify({ ...EMPTY_PARSED_RESUME, links: [] })
  );
}
