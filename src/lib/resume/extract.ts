import { parseOffice } from "officeparser";
import { tmpdir } from "node:os";
import WordExtractor from "word-extractor";
import {
  EMPTY_PARSED_RESUME,
  type ParsedResume,
  type UploadKind,
} from "./types";

export async function extractResumeText(
  bytes: Uint8Array,
  kind: UploadKind,
): Promise<string> {
  const buffer = Buffer.from(bytes);
  let text: string;
  if (kind === "text") {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (text.includes("\0"))
      throw new Error("This file does not contain readable text.");
  } else if (kind === "doc") {
    // Word sometimes saves HTML/RTF with a .doc extension.
    const start = buffer.subarray(0, 200).toString().trimStart();
    if (/^\{\\rtf/i.test(start)) return extractResumeText(bytes, "rtf");
    if (/^<(?:!doctype|html|head|body)/i.test(start))
      return extractResumeText(bytes, "html");
    const doc = await new WordExtractor().extract(buffer);
    text = [doc.getHeaders(), doc.getBody(), doc.getFooters()]
      .filter(Boolean)
      .join("\n");
  } else if (kind === "image") {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, { cachePath: tmpdir() });
    try {
      text = (await worker.recognize(buffer)).data.text;
    } finally {
      await worker.terminate();
    }
  } else {
    const limits = {
      maxUncompressedBytes: 25 * 1024 * 1024,
      maxXmlElements: 100000,
      maxRawContentLength: 200000,
    };
    const ast = await parseOffice(buffer, {
      fileType: kind,
      ocr: false,
      ignoreNotes: true,
      decompressionLimits: limits,
      abortSignal: AbortSignal.timeout(60000),
    });
    text = (await ast.to("text", { includeImages: false })).value;
    if (!text.trim() && kind === "pdf") {
      const scanned = await parseOffice(buffer, {
        fileType: "pdf",
        ocr: true,
        extractAttachments: true,
        ignoreNotes: true,
        decompressionLimits: limits,
        abortSignal: AbortSignal.timeout(60000),
        ocrConfig: {
          cacheMethod: "none",
          timeout: {
            workerLoad: 30000,
            recognition: 15000,
            autoTerminate: 1000,
          },
        },
      });
      text = (await scanned.to("text", { includeImages: "ocr-text-only" }))
        .value;
    }
  }
  if (!text.trim())
    throw new Error(
      "No readable text found. Try a clearer scan or a text-based document.",
    );
  if (text.length > 200_000)
    throw new Error(
      "That document is too long for a resume. Please upload just your resume pages.",
    );
  return text.replace(/\r\n?/g, "\n");
}

/** Conservative transcription fallback. Only explicit labels/sections become facts. */
export function resumeFromText(text: string): ParsedResume {
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const labeled = (label: string) =>
    text
      .match(new RegExp(`^\\s*(?:${label})\\s*:\\s*(.+)$`, "im"))?.[1]
      ?.trim() ?? null;
  const first = lines[0]?.replace(/^#+\s*/, "") ?? "";
  const explicitName = labeled("full name|name");
  const name =
    explicitName ??
    (/^[\p{L}][\p{L} .’'-]+$/u.test(first) &&
    first.split(/\s+/).length >= 2 &&
    first.split(/\s+/).length <= 5 &&
    !/resume|curriculum|university|college|engineer|education|experience|profile|summary/i.test(
      first,
    )
      ? first
      : null);
  const section = (heading: string) => {
    const index = lines.findIndex((s) =>
      new RegExp(`^(?:#+\\s*)?(?:${heading})\\s*:?$`, "i").test(s),
    );
    if (index < 0) return [];
    const end = lines.findIndex(
      (s, i) =>
        i > index &&
        /^(?:#+\s*)?(?:education|experience|work experience|professional experience|skills|technical skills|projects|certifications|awards|references|summary|publications)\s*:?$/i.test(
          s,
        ),
    );
    return lines.slice(index + 1, end < 0 ? undefined : end);
  };
  const education = section("education|academic background");
  const school =
    labeled("school|university|college|institution") ??
    education.find((s) =>
      /\b(university|college|institute|high school)\b/i.test(s),
    ) ??
    null;
  const major =
    labeled("major|field of study") ??
    education
      .join("\n")
      .match(
        /(?:Bachelor(?:[’']s)?|Master(?:[’']s)?|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?)(?:\s+of\s+(?:Science|Arts))?\s+(?:in\s+)([^\n|,;]+)/i,
      )?.[1]
      ?.trim() ??
    null;
  const year = text.match(
    /(?:expected(?:\s+graduation)?|graduat(?:ion|ing)(?:\s+date)?)\s*:?[^\n\d]{0,25}((?:19|20)\d{2})/i,
  )?.[1];
  const gpaText = text.match(
    /\b(?:cumulative\s+)?GPA\s*:?\s*(\d(?:\.\d+)?)/i,
  )?.[1];
  const gpa = gpaText ? Number(gpaText) : null;
  const skills = [
    ...section("skills|technical skills|core skills"),
    labeled("skills|technical skills") ?? "",
  ]
    .flatMap((s) => s.replace(/^[•*\-]\s*/, "").split(/[,;|]/))
    .map((s) => s.trim())
    .filter(Boolean);
  const experience = section(
    "experience|work experience|professional experience",
  );
  const bullets = experience
    .filter((s) => /^[•*\-]/.test(s))
    .map((s) => s.replace(/^[•*\-]\s*/, ""));
  return {
    ...EMPTY_PARSED_RESUME,
    name,
    school,
    major,
    gradYear: year ? Number(year) : null,
    gpa: gpa !== null && gpa <= 5 ? gpa : null,
    email: text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? null,
    phone:
      labeled("phone|telephone|mobile") ??
      text.match(/(?:\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/)?.[0] ??
      null,
    links: [...new Set(text.match(/https?:\/\/[^\s<>"\])]+/g) ?? [])],
    skills: [...new Set(skills)],
    experiences: bullets.length
      ? [
          {
            organization: null,
            role: null,
            dates: null,
            location: null,
            bullets,
          },
        ]
      : [],
  };
}
