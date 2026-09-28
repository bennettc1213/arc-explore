/**
 * Scholarship trust classifier — v1.
 *
 * A transparent, deterministic heuristic over signals we can actually observe
 * from the source. It does not pretend to be certain: every score carries the
 * reasons that produced it, and the weights are exported as configuration so
 * reviewers can read and audit them.
 *
 * DESIGN RULES
 * - Unknown signals are ignored, never treated as evidence.
 * - Lottery-style awards are detected separately from ordinary trust scoring;
 *   they get their own shelf so they are not mislabeled with competition levels.
 * - Corroboration across independent portals is the one positive signal we can
 *   compute from our own data.
 * - No LLM output is stored without its source excerpt, confidence, model and
 *   version metadata. The current v1 does not use an LLM; the `provenance`
 *   shape is here so an LLM enrichment later fits the same contract.
 */

import { isContentMarketing } from "./classify";

export type TrustSignalKind = "positive" | "caution";

export interface TrustReason {
  /** Machine-readable signal name. */
  signal: string;
  kind: TrustSignalKind;
  /** One-line human explanation. */
  detail: string;
}

export interface LotteryReason {
  signal: string;
  detail: string;
}

export interface TrustProvenance {
  /** The exact text the signal was read from, when available. */
  excerpt?: string;
  /** 0–1 when the signal came from a probabilistic extractor. */
  confidence?: number;
  /** Model name/version if an LLM produced the signal. */
  model?: string;
  /** Free-form note for reviewers (e.g., deterministic override reason). */
  note?: string;
}

export interface TrustAssessment {
  /** 0–100, where 50 is neutral. */
  score: number;
  reasons: TrustReason[];
  /** Separate from score; lottery awards go on their own shelf. */
  isLottery: boolean;
  lotteryReasons: LotteryReason[];
  /** Raw signals with provenance, for review/override. */
  signals: Array<{ signal: string; triggered: boolean; provenance?: TrustProvenance }>;
}

export interface TrustInput {
  sponsorName: string;
  title: string;
  eligibility: string[];
  amountMin: number | null;
  amountMax: number | null;
  /** Number of independent source portals listing this canonical award. */
  corroborationCount: number;
}

/**
 * Configurable weights and thresholds. Exported so tests, scripts and UI can
 * read the same numbers the classifier uses.
 */
export const TRUST_CONFIG = {
  /** Starting point before any signals are applied. */
  neutralScore: 50,
  /** Floor and ceiling for the final score. */
  minScore: 0,
  maxScore: 100,
  signals: {
    contentMarketing: { kind: "caution", weight: 25 },
    unrelatedServices: { kind: "caution", weight: 15 },
    thirdPartyAccount: { kind: "caution", weight: 10 },
    minimalRequirements: { kind: "caution", weight: 10 },
    lottery: { kind: "caution", weight: 15 },
    corroborated: { kind: "positive", weight: 15 },
  },
  /** How many distinct sources count as corroboration. */
  corroborationThreshold: 2,
  /** Eligibility bullets at or below this count triggers minimal-requirements. */
  minimalRequirementsMaxBullets: 2,
} as const;

const LOTTERY_RE =
  /\b(sweepstakes|lottery|random drawing|enter to win|no essay required|no purchase necessary|winner chosen)\b/i;

const ACCOUNT_RE = /\b(create an? account|register for an? account|sign up)\b/i;

const REHAB_RE = /\b(rehab|rehabilitation|detox|sober|addiction treatment)\b/i;
const SEO_RE = /\b(seo|search engine optimization|link building|digital marketing)\b/i;

function combinedText(input: TrustInput): string {
  return [input.title, input.sponsorName, ...input.eligibility].join("\n");
}

function detectLottery(input: TrustInput): { isLottery: boolean; reasons: LotteryReason[]; provenance?: TrustProvenance } {
  const reasons: LotteryReason[] = [];
  const text = combinedText(input);

  const lotteryMatch = text.match(LOTTERY_RE);
  if (lotteryMatch) {
    reasons.push({
      signal: "lottery_language",
      detail: `Found lottery language: "${lotteryMatch[0]}"`,
    });
  }

  const hasNoEssay = /\bno essay\b/i.test(text);
  const hasRandomDrawing = /\brandom drawing\b/i.test(text);
  if (hasNoEssay && hasRandomDrawing) {
    reasons.push({
      signal: "no_essay_random_drawing",
      detail: "No essay required and winner selected by random drawing.",
    });
  }

  return {
    isLottery: reasons.length > 0,
    reasons,
    provenance: reasons.length > 0 ? { excerpt: text.slice(0, 400) } : undefined,
  };
}

function detectThirdPartyAccount(input: TrustInput): { triggered: boolean; provenance?: TrustProvenance } {
  const text = combinedText(input);
  const match = text.match(ACCOUNT_RE);
  if (!match) return { triggered: false };
  return {
    triggered: true,
    provenance: { excerpt: `Found "${match[0]}"` },
  };
}

function detectMinimalRequirements(input: TrustInput): { triggered: boolean; provenance?: TrustProvenance } {
  const criteria = input.eligibility;
  if (criteria.length === 0) return { triggered: false };
  if (criteria.length > TRUST_CONFIG.minimalRequirementsMaxBullets) return { triggered: false };
  const text = criteria.join(" ");
  const essayMention = /\bessay\b/i.test(text);
  const gpaMention = /\bgpa\b/i.test(text);
  const majorMention = /\bmajor\b/i.test(text);
  if (essayMention || gpaMention || majorMention) return { triggered: false };
  return {
    triggered: true,
    provenance: { excerpt: criteria.join(" | ") },
  };
}

function detectUnrelatedServices(input: TrustInput): { triggered: boolean; provenance?: TrustProvenance } {
  const { sponsorName } = input;
  const rehabMatch = sponsorName.match(REHAB_RE);
  if (rehabMatch) {
    return {
      triggered: true,
      provenance: { excerpt: `Sponsor name contains "${rehabMatch[0]}"` },
    };
  }
  const seoMatch = sponsorName.match(SEO_RE);
  if (seoMatch) {
    return {
      triggered: true,
      provenance: { excerpt: `Sponsor name contains "${seoMatch[0]}"` },
    };
  }
  return { triggered: false };
}

function detectCorroboration(input: TrustInput): { triggered: boolean; provenance?: TrustProvenance } {
  const triggered = input.corroborationCount >= TRUST_CONFIG.corroborationThreshold;
  return {
    triggered,
    provenance: triggered
      ? { note: `Listed by ${input.corroborationCount} independent source portals.` }
      : undefined,
  };
}

/**
 * Assess the trustworthiness of a scholarship listing from observable signals.
 *
 * The score is not a probability of being a scam; it is a relative ranking aid
 * that says "this has more/ fewer caution signals than average". Lottery
 * detection is returned separately so callers can place those rows on their own
 * shelf rather than hiding them in a competition bucket.
 */
export function assessTrust(input: TrustInput): TrustAssessment {
  const reasons: TrustReason[] = [];
  const signals: TrustAssessment["signals"] = [];

  const contentMarketing = isContentMarketing({
    sponsorName: input.sponsorName,
    amountMin: input.amountMin,
    amountMax: input.amountMax,
  });
  signals.push({
    signal: "contentMarketing",
    triggered: contentMarketing,
    provenance: contentMarketing
      ? { note: "Sponsor name and amount match the content-marketing heuristic." }
      : undefined,
  });

  const unrelated = detectUnrelatedServices(input);
  signals.push({ signal: "unrelatedServices", triggered: unrelated.triggered, provenance: unrelated.provenance });

  const account = detectThirdPartyAccount(input);
  signals.push({ signal: "thirdPartyAccount", triggered: account.triggered, provenance: account.provenance });

  const minimal = detectMinimalRequirements(input);
  signals.push({ signal: "minimalRequirements", triggered: minimal.triggered, provenance: minimal.provenance });

  const corroborated = detectCorroboration(input);
  signals.push({ signal: "corroborated", triggered: corroborated.triggered, provenance: corroborated.provenance });

  const lottery = detectLottery(input);
  signals.push({
    signal: "lottery",
    triggered: lottery.isLottery,
    provenance: lottery.provenance,
  });

  let score = TRUST_CONFIG.neutralScore;

  if (contentMarketing) {
    reasons.push({
      signal: "content_marketing",
      kind: "caution",
      detail: "Sponsor name and award size match the content-marketing pattern.",
    });
    score -= TRUST_CONFIG.signals.contentMarketing.weight;
  }
  if (unrelated.triggered) {
    reasons.push({
      signal: "unrelated_services",
      kind: "caution",
      detail: "Sponsor appears to sell unrelated services and may use the award for lead generation.",
    });
    score -= TRUST_CONFIG.signals.unrelatedServices.weight;
  }
  if (account.triggered) {
    reasons.push({
      signal: "third_party_account",
      kind: "caution",
      detail: "Application requires creating an account with a third party.",
    });
    score -= TRUST_CONFIG.signals.thirdPartyAccount.weight;
  }
  if (minimal.triggered) {
    reasons.push({
      signal: "minimal_requirements",
      kind: "caution",
      detail: "Almost no requirements stated and no essay or academic criteria required.",
    });
    score -= TRUST_CONFIG.signals.minimalRequirements.weight;
  }
  if (lottery.isLottery) {
    reasons.push({
      signal: "lottery",
      kind: "caution",
      detail: "Lottery-style language detected.",
    });
    score -= TRUST_CONFIG.signals.lottery.weight;
  }
  if (corroborated.triggered) {
    reasons.push({
      signal: "corroborated",
      kind: "positive",
      detail: `Listed by ${input.corroborationCount} independent source portals.`,
    });
    score += TRUST_CONFIG.signals.corroborated.weight;
  }

  return {
    score: Math.max(TRUST_CONFIG.minScore, Math.min(TRUST_CONFIG.maxScore, score)),
    reasons,
    isLottery: lottery.isLottery,
    lotteryReasons: lottery.reasons,
    signals,
  };
}

/**
 * Serialize reasons into the flat shape the `postings` table stores.
 *
 * Keeps the database JSON small and regular — no arbitrary object nesting.
 */
export function trustReasonsForStorage(reasons: TrustReason[]): Array<{
  signal: string;
  kind: TrustSignalKind;
  detail: string;
}> {
  return reasons.map((r) => ({ signal: r.signal, kind: r.kind, detail: r.detail }));
}

export function lotteryReasonsForStorage(reasons: LotteryReason[]): Array<{ signal: string; detail: string }> {
  return reasons.map((r) => ({ signal: r.signal, detail: r.detail }));
}
