import assert from "node:assert/strict";
import test from "node:test";
import { parseOffice } from "officeparser";
import { extractResumeText, resumeFromText } from "./extract";
import { parseResume } from "./parse";
import { checkUpload, type UploadKind } from "./types";

const text =
  "Taylor Student\nEmail: taylor@example.com\nEducation\nExample University\nBachelor of Science in Nursing\nExpected graduation: May 2028\nGPA: 3.75\nSkills\nPatient care, First aid\nExperience\n- Assisted with patient intake.\n";

test("resume import works without an AI key and only transcribes stated details", async () => {
  const parsed = resumeFromText(text);
  assert.equal(parsed.name, "Taylor Student");
  assert.equal(parsed.school, "Example University");
  assert.equal(parsed.major, "Nursing");
  assert.equal(parsed.gradYear, 2028);
  assert.equal(parsed.gpa, 3.75);
  assert.deepEqual(parsed.skills, ["Patient care", "First aid"]);
  assert.equal(
    parsed.experiences[0].bullets[0],
    "Assisted with patient intake.",
  );
  const absent = resumeFromText("Taylor Student\nSkills\nFirst aid");
  assert.equal(absent.school, null);
  assert.equal(absent.gradYear, null);
  assert.equal(absent.gpa, null);
  const result = await parseResume({
    bytes: Buffer.from(text),
    kind: "text",
    fileName: "resume.txt",
  });
  assert.equal(result.parsed.major, "Nursing");
  assert.equal(result.rawText, text);
});

test("HTML resumes are parsed as text without executing embedded scripts", async () => {
  const extracted = await extractResumeText(
    Buffer.from(
      "<html><body><script>throw new Error('executed')</script><h1>Taylor Student</h1><p>School: Example University</p><p>Major: Nursing</p><p>GPA: 3.75</p></body></html>",
    ),
    "html",
  );
  assert.match(extracted, /Example University/);
  assert.equal(resumeFromText(extracted).major, "Nursing");
  assert.doesNotMatch(extracted, /throw new Error/);
});

test("real document bytes round-trip through PDF, Word, OpenDocument and RTF extraction", async () => {
  const source = await parseOffice(
    Buffer.from(
      `<html><body>${text
        .split("\n")
        .map((line) => `<p>${line}</p>`)
        .join("")}</body></html>`,
    ),
    { fileType: "html" },
  );
  for (const kind of ["docx", "odt", "rtf", "pdf"] as const) {
    const output = await source.to(
      kind,
      kind === "pdf" ? { pdfConfig: { engine: "native" } } : {},
    );
    const bytes =
      typeof output.value === "string"
        ? Buffer.from(output.value)
        : Buffer.from(output.value);
    const extracted = await extractResumeText(bytes, kind);
    assert.match(extracted, /Example University/, kind);
    assert.match(extracted, /3\.75/, kind);
    assert.equal(resumeFromText(extracted).gradYear, 2028, kind);
  }
});

test("legacy .doc files containing HTML are imported and unsupported/corrupt files fail safely", async () => {
  assert.match(
    await extractResumeText(
      Buffer.from(
        "<html><body><p>Taylor Student</p><p>Major: Nursing</p></body></html>",
      ),
      "doc",
    ),
    /Nursing/,
  );
  await assert.rejects(
    parseResume({
      bytes: Buffer.from("not a PDF"),
      kind: "pdf",
      fileName: "broken.pdf",
    }),
    (error: Error) => !/x-api-key|request_id|401/.test(error.message),
  );
  for (const [ext, kind] of Object.entries({
    html: "html",
    doc: "doc",
    docx: "docx",
    odt: "odt",
    rtf: "rtf",
    png: "image",
    txt: "text",
    pdf: "pdf",
  } satisfies Record<string, UploadKind>)) {
    assert.equal(
      checkUpload({
        name: `resume.${ext}`,
        type: "application/octet-stream",
        size: 100,
      }).kind,
      kind,
    );
  }
});
