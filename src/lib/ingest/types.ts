/** Shared contract every ingestion adapter produces. */

/** Feeds we pull from. `simplify` is discovery-only — see sources/simplify.ts.
 *  `usajobs` is a whole-government search rather than one employer's board, so
 *  it has no `BoardAdapter` — see sources/usajobs.ts. */
export type SourceName =
  | "greenhouse"
  | "ashby"
  | "lever"
  | "smartrecruiters"
  | "simplify"
  | "usajobs";

/**
 * One posting as reported by a source, before normalization/dedup.
 *
 * Every field that a source does not provide is `null` rather than a guess.
 * Downstream renders a dashed honest-slot for nulls instead of inventing a
 * value — that rule is the whole point of the product.
 */
export interface SourcePosting {
  source: SourceName;
  /** The source's own stable id, used for incremental reconcile. */
  sourceId: string;
  /** Employer-authored. Rendered as-is; never lowercased. */
  companyName: string;
  title: string;
  /** Public apply/view URL for a human. */
  url: string;
  locations: string[];
  isRemote: boolean;
  /** True posting date when the feed exposes one, else null. */
  postedAt: Date | null;
  /** Employer-stated deadline. Almost always null; never fabricated. */
  deadlineAt: Date | null;
  /**
   * Plain-text JD when the feed includes it. Used for work-auth and term
   * detection ONLY — never for classification, because JD boilerplate mentions
   * internships constantly. See classifyOpportunity.
   */
  descriptionText: string | null;
  /**
   * Short structured employment field (Ashby `employmentType`,
   * SmartRecruiters `experienceLevel`, Lever `commitment`). Safe to classify
   * on, unlike prose.
   */
  employmentHint: string | null;
  /** Original payload, retained for debugging parser drift. */
  raw: unknown;
}

export interface FetchBoardResult {
  postings: SourcePosting[];
  /** ETag to send next poll, when the source supports conditional requests. */
  etag: string | null;
  /** True when the server answered 304 and `postings` is therefore empty. */
  notModified: boolean;
}

export interface BoardAdapter {
  name: SourceName;
  /** Fetch every posting on one company's board. */
  fetchBoard(slug: string, opts?: { etag?: string | null }): Promise<FetchBoardResult>;
}
