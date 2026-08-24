/**
 * Deciding which form field on an employer's page holds which fact of ours.
 *
 * This is the brain of the browser extension, kept here rather than in the
 * extension bundle for one reason: it is the part that can do real harm, and
 * everything in this repo that can do harm is unit-tested. The extension is a
 * thin shell that walks the DOM and calls `matchFieldKey` on what it finds.
 *
 * WHAT THIS DOES. Greenhouse, Lever, Ashby, SmartRecruiters and Workday all
 * render ordinary HTML inputs with wildly inconsistent names — `first_name`,
 * `firstname`, `candidate[first]`, `input-1`. Rather than maintain five
 * brittle per-ATS selector tables that break whenever one of them ships a
 * redesign, this reads the *signature* of a field (its name, id, label,
 * placeholder and autocomplete attribute) and decides what it is asking for.
 * A per-ATS table would be five things to keep correct; a signature reader is
 * one, and it degrades to "leave it alone" instead of to "fill it wrong".
 *
 * ── THE RULE THAT MATTERS MOST ──────────────────────────────────────────────
 *
 * NEVER FILL AN ATTESTATION. `packet.ts` already separates ordinary facts from
 * legal declarations — work authorization, sponsorship, veteran and disability
 * status, race and gender — on the grounds that getting one wrong is not a typo
 * but a false statement on a form the student signs. That separation is worth
 * nothing if the autofiller quietly reaches around it, so the blocklist below
 * is checked FIRST and wins over every other rule, including an explicit
 * `autocomplete` attribute.
 *
 * This is deliberately belt-and-braces. The API that feeds the extension does
 * not send attestation values at all, so there is nothing to put in these
 * fields even if a rule matched. The blocklist exists so that a future change
 * to that API cannot silently turn autofill loose on a legal declaration —
 * two independent things would have to go wrong rather than one.
 *
 * It also never fills, and cannot fill:
 *   · file inputs — we do not store the student's original resume file, only
 *     the parsed structure (see `/privacy`, which says exactly this)
 *   · anything the student has already typed into — a value we did not put
 *     there is a value they chose, and overwriting it is data loss
 *   · a submit button. The extension has no code path that clicks one.
 */

/* ------------------------------------------------------------------ *
 * The values we are able to offer
 * ------------------------------------------------------------------ */

/**
 * Every fact the extension may put into a form.
 *
 * Note what is absent: work authorization, sponsorship, and every demographic
 * question. They are attestations, and they are not autofillable data.
 */
export const AUTOFILL_KEYS = [
  "fullName",
  "firstName",
  "lastName",
  "email",
  "phone",
  "school",
  "major",
  "degree",
  "gradYear",
  "gpa",
  "linkedinUrl",
  "githubUrl",
  "portfolioUrl",
  "location",
  "coverLetter",
] as const;

export type AutofillKey = (typeof AUTOFILL_KEYS)[number];

export type AutofillValues = Partial<Record<AutofillKey, string>>;

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

/**
 * Flatten a field's attributes into one lowercase string of words.
 *
 * `candidate[first_name]`, `firstName` and `First Name *` all reduce to
 * "candidate first name", "first name" and "first name" — so one set of word
 * patterns covers every naming convention the five ATS platforms use between
 * them, instead of one table each.
 */
export function normalizeSignature(text: string): string {
  return text
    // camelCase → two words, so `firstName` does not read as one token
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface FieldSignature {
  name?: string | null;
  id?: string | null;
  label?: string | null;
  placeholder?: string | null;
  autocomplete?: string | null;
  /** The input's `type` attribute, or "textarea" / "select". */
  type?: string | null;
}

/** Everything we know about a field, as one searchable string. */
function signatureText(sig: FieldSignature): string {
  return normalizeSignature(
    [sig.label, sig.name, sig.id, sig.placeholder].filter(Boolean).join(" "),
  );
}

/** Whole-word test — stops `gpa` matching `gpay` and `law` matching `flawless`,
 *  the exact bug class already fixed once in the field taxonomy. */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`(^| )${word}( |$)`).test(haystack);
}

/**
 * Whole-word test that also accepts the plural.
 *
 * Used ONLY by the blocklist, and the asymmetry is deliberate. Over-matching
 * when deciding what to *refuse* costs a student one field they fill by hand;
 * over-matching when deciding what to *fill* puts a wrong answer on a form
 * under their name. So blocking is allowed to be loose and matching is not —
 * "What are your pronouns?" must block on `pronoun`, while `major` must never
 * start matching `majors` into somewhere it does not belong.
 */
function hasWordOrPlural(haystack: string, word: string): boolean {
  return new RegExp(`(^| )${word}s?( |$)`).test(haystack);
}

/**
 * The signature with word gaps removed — `linkedinprofile`.
 *
 * Needed because the camelCase splitter that correctly turns `firstName` into
 * "first name" also turns `LinkedIn` into "linked in" and `GitHub` into "git
 * hub". Used only for the two platform names, which are distinctive enough
 * that a substring test carries none of the risk it would elsewhere.
 */
function compact(haystack: string): string {
  return haystack.replace(/ /g, "");
}

function hasAny(haystack: string, words: string[]): boolean {
  return words.some((w) => hasWord(haystack, w));
}

/** Substring test, for multi-word phrases where word order is fixed. */
function hasPhrase(haystack: string, phrase: string): boolean {
  return haystack.includes(phrase);
}

/* ------------------------------------------------------------------ *
 * The blocklist — checked before anything else
 * ------------------------------------------------------------------ */

/**
 * Fields the autofiller must never touch, whatever else matches.
 *
 * Three groups, each for its own reason:
 *
 *   1. LEGAL ATTESTATIONS. Work authorization, sponsorship, citizenship,
 *      security clearance, and the voluntary EEO block (race, ethnicity,
 *      gender, veteran status, disability). The student answers these or
 *      nobody does. `packet.ts` states the reasoning at length.
 *   2. THINGS WE DO NOT HOLD AND WOULD BE GUESSING AT. Salary expectations,
 *      notice periods, references, start dates. A guess here is not illegal,
 *      just wrong, and a wrong answer the student did not notice is worse
 *      than an empty box they will.
 *   3. CREDENTIALS. Password and SSN fields, which appear on account-creation
 *      steps some ATS wrap around their forms. Nothing we hold belongs here.
 */
const BLOCKED_PATTERNS: string[] = [
  // 1 — legal attestations
  "work authorization",
  "authorized to work",
  "legally authorized",
  "right to work",
  "require sponsorship",
  "need sponsorship",
  "sponsorship",
  "visa",
  "citizenship",
  "citizen",
  "security clearance",
  "clearance",
  "veteran",
  "protected veteran",
  "disability",
  "disabled",
  "race",
  "ethnicity",
  "ethnic",
  "gender",
  "sex",
  "pronoun",
  "hispanic",
  "latino",
  "sexual orientation",
  "transgender",
  "eeo",
  "equal employment",
  "affirmative action",
  // 2 — facts we do not hold
  "salary",
  "compensation",
  "desired pay",
  "expected pay",
  "hourly rate",
  "notice period",
  "start date",
  "available to start",
  "availability",
  "reference",
  "referred by",
  "how did you hear",
  // 3 — credentials
  "password",
  "social security",
  "ssn",
  // 4 — consent and agreement. Found on a live Greenhouse form: "By clicking
  // 'Yes' below, you agree to the following Application Consent". Agreeing to
  // something on a student's behalf is the same category of act as answering a
  // work-authorization question for them, and it is one they must read.
  "consent",
  "agree",
  "acknowledge",
  "certify",
  "terms and conditions",
  "privacy policy",
];

/**
 * Infrastructure fields that are not questions at all.
 *
 * reCAPTCHA's response textarea is the one that matters, and it was found the
 * only way this could have been found — by running the matcher over a real
 * Greenhouse form. It carries no label of its own, so the label search walked
 * up the DOM and returned an unrelated "First Name*" from elsewhere on the
 * page, and the matcher duly offered to type the student's first name into the
 * field that carries the captcha token. Writing there does not merely waste a
 * value; it corrupts the token the form submits.
 *
 * Matched on `name`/`id` rather than on the label, precisely because the label
 * is the thing that cannot be trusted for these.
 */
const INFRASTRUCTURE_PATTERNS = [
  "recaptcha",
  "captcha",
  "csrf",
  "authenticity",
  "honeypot",
  "utm ",
  "referrer",
];

/**
 * Is this field one the autofiller must leave strictly alone?
 *
 * Exported because the extension surfaces these to the student rather than
 * silently skipping them: "3 questions only you can answer" beside a
 * highlighted field is the difference between a tool that helped and a tool
 * that half-filled a form and left them to spot the holes.
 */
export function isBlockedField(sig: FieldSignature): boolean {
  const text = signatureText(sig);
  if (!text) return false;
  return BLOCKED_PATTERNS.some((p) =>
    // Multi-word patterns are phrases; single words must match whole, but may
    // be plural — see `hasWordOrPlural` for why blocking is allowed to be
    // looser than matching.
    p.includes(" ") ? hasPhrase(text, p) : hasWordOrPlural(text, p),
  );
}

/**
 * A field that is plumbing rather than a question.
 *
 * Read from `name`/`id` only — the label is exactly what is untrustworthy here.
 * Not surfaced to the student as "yours to answer", because it is nobody's to
 * answer; it is simply skipped.
 */
export function isInfrastructureField(sig: FieldSignature): boolean {
  const text = normalizeSignature([sig.name, sig.id].filter(Boolean).join(" "));
  if (!text) return false;
  return INFRASTRUCTURE_PATTERNS.some((p) => text.includes(p.trim()));
}

/**
 * Is this label a yes/no question rather than the name of a field?
 *
 * The distinction that keeps the matcher honest, and another one only a live
 * form produced: "Is your university able to provide an internship agreement?"
 * contains the word "university", so the education rule offered to type the
 * student's school into what is actually a yes/no box.
 *
 * A label opening with an auxiliary verb — is / are / do / have / will / can —
 * is asking for a judgement, and a judgement is never a fact we hold. A
 * wh-question is different and deliberately still matches: "What is your email
 * address?" is a genuine request for a fact, and plenty of forms phrase their
 * fields that way, so blanket-declining every question mark would cost real
 * fills for nothing.
 */
const YES_NO_OPENERS = [
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "must",
  "if",
  "by",
];

export function isYesNoQuestion(sig: FieldSignature): boolean {
  const label = normalizeSignature(sig.label ?? "");
  if (!label) return false;
  const first = label.split(" ")[0];
  return YES_NO_OPENERS.includes(first);
}

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

/**
 * `autocomplete` is a standard the browser already understands, so where a
 * form bothers to set it, it is the most reliable signal available — better
 * than any guess from a name attribute. Checked after the blocklist and
 * before the heuristics.
 */
const AUTOCOMPLETE_MAP: Record<string, AutofillKey> = {
  name: "fullName",
  "given-name": "firstName",
  "family-name": "lastName",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  organization: "school",
  url: "portfolioUrl",
};

/**
 * Decide what one form field is asking for.
 *
 * Returns null for "no idea" — which is the correct and common answer, and
 * the reason this is safe. A field we cannot identify is a field we leave for
 * the student, and the extension reports how many it left.
 *
 * Order is load-bearing throughout. Specific patterns are tested before
 * general ones, because "school name" and "first name" both contain "name",
 * and a general `name` rule evaluated first would swallow both.
 */
export function matchFieldKey(sig: FieldSignature): AutofillKey | null {
  // 0. The blocklist wins over everything, including autocomplete.
  if (isBlockedField(sig)) return null;
  // Plumbing, and yes/no questions, are declined for the reasons on each
  // predicate. Both were found by running this over a real Greenhouse form.
  if (isInfrastructureField(sig)) return null;
  if (isYesNoQuestion(sig)) return null;

  const type = (sig.type ?? "").toLowerCase();
  // File inputs are unfillable: we hold no original document. Checkboxes and
  // radios are choices, not facts, and are frequently attestations wearing a
  // label the blocklist did not anticipate — so they are declined wholesale.
  if (["file", "checkbox", "radio", "password", "submit", "button", "hidden"].includes(type)) {
    return null;
  }

  // 1. An explicit autocomplete attribute, where the form provides one.
  const ac = (sig.autocomplete ?? "").toLowerCase().trim();
  if (ac && AUTOCOMPLETE_MAP[ac]) return AUTOCOMPLETE_MAP[ac];

  const t = signatureText(sig);
  if (!t) return null;

  // 2. Cover letter — checked early because it is the only textarea we fill
  // and its label is unambiguous.
  if (hasPhrase(t, "cover letter") || hasWord(t, "coverletter")) return "coverLetter";

  // 3. Links. Before the generic url/website rule, and before name rules —
  // "linkedin profile" contains neither but "portfolio url" would otherwise
  // be caught by a bare `url` test in the wrong order.
  const c = compact(t);
  if (hasWord(t, "linkedin") || c.includes("linkedin")) return "linkedinUrl";
  if (hasWord(t, "git") || c.includes("github")) return "githubUrl";
  // Deliberately NOT a bare `url`. Lever renders one link box per purpose —
  // "Transcripts (if applying for Co-op/Internship) URL", "Other URL" — and a
  // bare `url` rule claimed all of them for the portfolio, quietly putting a
  // personal site where a transcript belongs. A link field has to say what
  // kind of link it wants before we will answer it.
  if (hasAny(t, ["portfolio", "website", "homepage"]) || hasPhrase(t, "personal site")) {
    return "portfolioUrl";
  }

  // 4. Education. `school` before any name rule, since "school name" is a
  // school and not a name.
  if (hasAny(t, ["school", "university", "college", "institution", "alma mater"])) {
    return "school";
  }
  if (hasAny(t, ["major", "discipline", "field of study", "course of study", "concentration"])) {
    return "major";
  }
  if (hasPhrase(t, "field of study") || hasPhrase(t, "area of study")) return "major";
  if (hasAny(t, ["degree", "qualification"])) return "degree";
  if (hasWord(t, "gpa") || hasPhrase(t, "grade point")) return "gpa";
  if (
    hasPhrase(t, "graduation") ||
    hasPhrase(t, "grad year") ||
    hasPhrase(t, "expected graduation") ||
    (hasWord(t, "year") && hasAny(t, ["graduate", "graduating", "completion"]))
  ) {
    return "gradYear";
  }

  // 5. Contact.
  if (hasWord(t, "email") || hasPhrase(t, "e mail")) return "email";
  if (hasAny(t, ["phone", "mobile", "telephone", "cell"])) return "phone";

  // 6. Names. Most specific first; the bare `name` fallback is last of the
  // three and still requires that nothing above claimed the field.
  if (hasAny(t, ["firstname", "forename", "given"]) || hasPhrase(t, "first name")) {
    return "firstName";
  }
  if (
    hasAny(t, ["lastname", "surname", "family"]) ||
    hasPhrase(t, "last name")
  ) {
    return "lastName";
  }
  if (hasPhrase(t, "full name") || hasPhrase(t, "your name") || hasWord(t, "name")) {
    return "fullName";
  }

  // 7. Location. Last, because "location" appears inside plenty of
  // question text that is not asking where the student lives.
  if (hasAny(t, ["location", "city", "address", "where are you based"])) return "location";

  return null;
}

/* ------------------------------------------------------------------ *
 * Turning the packet into fillable values
 * ------------------------------------------------------------------ */

/**
 * Split a full name into the two boxes most forms actually render.
 *
 * First token is the given name, everything after it is the family name —
 * which is wrong for some naming conventions, and deliberately not guessed at
 * any harder than that. The student sees every value before it goes in and can
 * correct it in the form; inventing a cleverer rule would produce confident
 * errors instead of obvious ones.
 */
export function splitName(full: string): { firstName: string | null; lastName: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** One link out of a mixed list, by host. */
function linkFor(links: string[], host: RegExp): string | undefined {
  return links.find((l) => host.test(l));
}

export interface AutofillSourceData {
  /** Ordinary packet fields, already excluding attestations. */
  fields: Array<{ key: string; value: string | null }>;
  /** Links parsed off the resume and profile, any hosts. */
  links: string[];
  /** The saved cover letter for this posting, as plain paragraphs. */
  coverLetter?: string | null;
}

/**
 * Build the value map the extension fills from.
 *
 * Only non-null values are included, so "we hold nothing for this" and "we
 * hold an empty string" cannot be confused — the same rule the resume editor
 * follows when it stores null rather than "".
 */
export function buildAutofillValues(input: AutofillSourceData): AutofillValues {
  const byKey = new Map(input.fields.map((f) => [f.key, f.value]));
  const out: AutofillValues = {};

  const set = (key: AutofillKey, value: string | null | undefined) => {
    const v = value?.trim();
    if (v) out[key] = v;
  };

  const fullName = byKey.get("name") ?? null;
  set("fullName", fullName);
  if (fullName) {
    const { firstName, lastName } = splitName(fullName);
    set("firstName", firstName);
    set("lastName", lastName);
  }

  set("email", byKey.get("email") ?? null);
  set("phone", byKey.get("phone") ?? null);
  set("school", byKey.get("school") ?? null);
  set("major", byKey.get("major") ?? null);
  set("gradYear", byKey.get("gradYear") ?? null);
  set("gpa", byKey.get("gpa") ?? null);

  // `locations` is a preference list; a form asking for one location gets the
  // first, which is the one the student ranked highest by typing it first.
  const locations = byKey.get("locations");
  set("location", locations ? locations.split(",")[0] : null);

  set("linkedinUrl", linkFor(input.links, /linkedin\.com/i));
  set("githubUrl", linkFor(input.links, /github\.com/i));
  // The portfolio is whatever link is left over — the resume parser already
  // deliberately picks a non-platform link for that field.
  set(
    "portfolioUrl",
    input.links.find((l) => !/linkedin\.com|github\.com/i.test(l)),
  );

  set("coverLetter", input.coverLetter ?? null);

  return out;
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

export interface FillReport {
  /** Fields we put a value into. */
  filled: number;
  /** Fields we identified but hold no value for. */
  known: number;
  /** Fields we deliberately refused — attestations and the rest of the blocklist. */
  blocked: number;
  /** Fields we could not identify at all. */
  unknown: number;
  /** Fields the student had already typed into, left untouched. */
  skippedNonEmpty: number;
}

/**
 * The sentence under the button.
 *
 * Names what actually happened to every field on the page, in the project's
 * established voice: what we counted, not what we hope. A student who is told
 * "filled 9" and finds 14 boxes has been given a number that costs them trust
 * in the whole tool — so every category is reported, and the blocked ones are
 * reported as *deliberate* rather than as failures.
 */
export function describeFill(r: FillReport): string {
  const parts = [`filled ${r.filled} field${r.filled === 1 ? "" : "s"}`];
  if (r.known > 0) parts.push(`${r.known} we hold nothing for`);
  if (r.skippedNonEmpty > 0) parts.push(`${r.skippedNonEmpty} you had already answered`);
  if (r.blocked > 0) parts.push(`${r.blocked} only you can answer`);
  if (r.unknown > 0) parts.push(`${r.unknown} we did not recognise`);
  return parts.join(" · ");
}
