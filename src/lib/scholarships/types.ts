/**
 * Shared contract for scholarship sources.
 *
 * Deliberately not `SourcePosting` from `../ingest/types` — that contract is
 * shaped around one company's ATS board (an `orgId`, an `employmentHint`,
 * ATS-specific fields). A scraped scholarship page lists many sponsors and
 * has no ATS underneath it at all, so forcing it through the same interface
 * would mean padding it with nulls that don't mean anything for this domain.
 *
 * Every field a source does not state is `null`, never a guess — same rule
 * as the job-posting side.
 */

/** Sources we scrape. Each gets its own module under this directory.
 *  `scholarshipscom` and `scholarshipportal` share one module (`parse.ts`)
 *  because both are served by the same Parse API key. */
export type ScholarshipSource =
  | "cftexas"
  | "unl"
  | "unr"
  | "scholarshipscom"
  | "scholarshipportal";

export interface ScholarshipListing {
  source: ScholarshipSource;
  /** The source's own id for this listing, used for upsert + close-on-removal. */
  sourceId: string;
  /** As authored by the source page. Never lowercased. */
  title: string;
  /** Per-scholarship detail page, not the shared application portal — the
   *  portal URL is identical across every listing on a page and would
   *  collapse every scholarship in the canonical-URL dedup sense. */
  url: string;
  /** The awarding org as named on the source page. There is no ATS-style
   *  `organizations` row to link to — see schema.ts on `postings.orgId`. */
  sponsorName: string;
  /** Whole-dollar bounds. Both null means "varies" or unparseable prose —
   *  never guessed from a range we can't confidently read. */
  amountMin: number | null;
  amountMax: number | null;
  /** The source stated a dollar figure we could not parse, as opposed to
   *  stating none at all. Both leave the bounds null; only this one is a
   *  defect worth a human look. See `parseAmount`. */
  amountNeedsReview: boolean;
  /** Raw eligibility bullets/prose as the source states them. Kept as text
   *  rather than parsed into majors/GPA/etc. fields — we have not seen
   *  enough real listings yet to know the right structured shape, and a
   *  wrong guess here is worse than an unstructured list a student can
   *  still read. */
  eligibility: string[];
  /** Employer-stated deadline. Null when the source gives no parseable date. */
  deadlineAt: Date | null;
  /** True when the source's own status field says it is currently accepting
   *  applications. This is a first-party assertion, not an inference — CFT
   *  states it directly, so there is no "disappeared from a feed" guessing
   *  the way the ATS-polled side has to do it. */
  isOpen: boolean;
}
