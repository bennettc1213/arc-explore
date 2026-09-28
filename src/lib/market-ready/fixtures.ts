/**
 * Anonymized fixtures for the market-ready validation harness.
 *
 * These are plain objects, not database rows, so they can be used by unit tests
 * and by scripts without opening a connection. Every value is fake: no real
 * student names, emails, employers, or secrets appear here.
 */

import type { FreshnessTier, PostingKind } from '@/db/schema';

export type FixturePosting = {
  id: string;
  kind: PostingKind;
  title: string;
  sponsorName: string | null;
  term: string | null;
  descriptionText: string | null;
  amountMin: number | null;
  amountMax: number | null;
  amountNeedsReview: boolean;
  amountStatus: "exact" | "range" | "varies" | "unparseable";
  programTotal: number | null;
  awardsCount: number | null;
  amountIsEstimated: boolean;
  isContentMarketing: boolean;
  trustScore: number;
  trustReasons: Array<{ signal: string; kind: "positive" | "caution"; detail: string }>;
  isLottery: boolean;
  lotteryReasons: Array<{ signal: string; detail: string }>;
  corroborationCount: number;
  eligibility: { criteria?: string[] } | null;
  workAuth: string | null;
  skills: string[];
  locations: string[];
  isRemote: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
  missingStrikes: number;
  missingSince: Date | null;
  urlDeadStrikes: number;
  freshnessTier: FreshnessTier;
};

export type FixtureProfile = {
  id: string;
  major: string | null;
  gradYear: number | null;
  workAuth: string | null;
  targetLocations: string[];
  targetVerticals: string[];
  openToRemote: boolean;
  skills: string[];
};

const now = new Date('2026-09-23T00:00:00.000Z');
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

function amountStatusFor(
  min: number | null,
  max: number | null,
  needsReview: boolean,
): FixturePosting["amountStatus"] {
  if (needsReview) return "unparseable";
  if (min !== null && max !== null && min !== max) return "range";
  if (min !== null) return "exact";
  return "varies";
}

function posting(overrides: Partial<FixturePosting>): FixturePosting {
  const amountMin = overrides.amountMin ?? null;
  const amountMax = overrides.amountMax ?? null;
  const amountNeedsReview = overrides.amountNeedsReview ?? false;
  return {
    id: '00000000-0000-0000-0000-000000000000',
    kind: 'scholarship',
    title: 'Anonymous Award',
    sponsorName: 'Anonymous Foundation',
    term: null,
    descriptionText: null,
    amountMin,
    amountMax,
    amountNeedsReview,
    amountStatus: amountStatusFor(amountMin, amountMax, amountNeedsReview),
    programTotal: overrides.programTotal ?? null,
    awardsCount: overrides.awardsCount ?? null,
    amountIsEstimated: overrides.amountIsEstimated ?? false,
    isContentMarketing: false,
    trustScore: overrides.trustScore ?? 50,
    trustReasons: overrides.trustReasons ?? [],
    isLottery: overrides.isLottery ?? false,
    lotteryReasons: overrides.lotteryReasons ?? [],
    corroborationCount: overrides.corroborationCount ?? 0,
    eligibility: null,
    workAuth: null,
    skills: [],
    locations: [],
    isRemote: false,
    firstSeenAt: yesterday,
    lastSeenAt: yesterday,
    closedAt: null,
    missingStrikes: 0,
    missingSince: null,
    urlDeadStrikes: 0,
    freshnessTier: 'periodic_check',
    ...overrides,
  };
}

export function explicitTermPosting(): FixturePosting {
  return posting({
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Summer 2027 Engineering Scholarship',
    term: 'Summer 2027',
    sponsorName: 'State Engineering Board',
  });
}

export function descriptionOnlyTermPosting(): FixturePosting {
  return posting({
    id: '22222222-2222-2222-2222-222222222222',
    title: 'Engineering Excellence Award',
    term: null,
    descriptionText:
      'This award is open to students enrolled in a full-time program during the Fall 2027 semester.',
  });
}

export function missingTermPosting(): FixturePosting {
  return posting({
    id: '33333333-3333-3333-3333-333333333333',
    title: 'General Merit Award',
    term: null,
    descriptionText: 'Open to all undergraduate students with demonstrated merit.',
  });
}

export function pastTermPosting(): FixturePosting {
  return posting({
    id: '44444444-4444-4444-4444-444444444444',
    title: 'Summer 2025 Returning Scholar Award',
    term: 'Summer 2025',
  });
}

export function exactAmountPosting(): FixturePosting {
  return posting({
    id: '55555555-5555-5555-5555-555555555555',
    title: 'Exact Amount Scholarship',
    amountMin: 2500,
    amountMax: 2500,
  });
}

export function rangeAmountPosting(): FixturePosting {
  return posting({
    id: '66666666-6666-6666-6666-666666666666',
    title: 'Range Amount Scholarship',
    amountMin: 1000,
    amountMax: 5000,
  });
}

export function variesAmountPosting(): FixturePosting {
  return posting({
    id: '77777777-7777-7777-7777-777777777777',
    title: 'Varies Amount Scholarship',
    amountMin: null,
    amountMax: null,
  });
}

export function malformedAmountPosting(): FixturePosting {
  return posting({
    id: '88888888-8888-8888-8888-888888888888',
    title: 'Malformed Amount Scholarship',
    descriptionText: 'Award amount: $,000',
    amountNeedsReview: true,
  });
}

export function programTotalPosting(): FixturePosting {
  return posting({
    id: '99999999-9999-9999-9999-999999999999',
    title: 'Program Total Scholarship',
    descriptionText: 'Total program funding of $50,000 will be distributed among selected students.',
    amountMin: null,
    amountMax: null,
    amountStatus: "varies",
    programTotal: 50000,
  });
}

export function ineligibleConstraintsPosting(): FixturePosting {
  return posting({
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: 'Nursing Scholarship',
    sponsorName: 'City Hospital',
    eligibility: {
      criteria: [
        'Must be a U.S. citizen',
        'Minimum 3.5 GPA',
        'Enrolled in a nursing program',
      ],
    },
  });
}

export function marketingAwardPosting(): FixturePosting {
  return posting({
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    title: 'Smith Injury Law Essay Scholarship',
    sponsorName: 'Smith Injury Law, LLP',
    amountMin: 1000,
    amountMax: 1000,
    isContentMarketing: true,
    trustScore: 25,
    trustReasons: [
      {
        signal: 'content_marketing',
        kind: 'caution',
        detail: 'Sponsor name and award size match the content-marketing pattern.',
      },
    ],
  });
}

export function lotteryLanguagePosting(): FixturePosting {
  return posting({
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    title: 'Back-to-School Sweepstakes — Enter to Win',
    sponsorName: 'Red Egg Marketing',
    descriptionText: 'No essay required. Winner selected by random drawing.',
    isLottery: true,
    lotteryReasons: [
      { signal: 'no_essay_random_drawing', detail: 'No essay required and winner selected by random drawing.' },
    ],
    trustScore: 35,
    trustReasons: [
      { signal: 'lottery', kind: 'caution', detail: 'Lottery-style language detected.' },
      { signal: 'content_marketing', kind: 'caution', detail: 'Sponsor name and award size match the content-marketing pattern.' },
    ],
  });
}

export function rehabSponsorPosting(): FixturePosting {
  return posting({
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    title: 'Recovery Futures Student Award',
    sponsorName: 'New Start Rehabilitation Center',
    amountMin: 500,
    amountMax: 500,
    trustScore: 35,
    trustReasons: [
      {
        signal: 'unrelated_services',
        kind: 'caution',
        detail: 'Sponsor appears to sell unrelated services and may use the award for lead generation.',
      },
    ],
  });
}

export function credibleAssociationPosting(): FixturePosting {
  return posting({
    id: '00000000-1111-2222-3333-444444444444',
    title: 'IEEE Computer Society Scholarship',
    sponsorName: 'Institute of Electrical and Electronics Engineers',
    amountMin: 5000,
    amountMax: 5000,
    eligibility: { criteria: ['Computer science or computer engineering major', 'Minimum 3.0 GPA'] },
    trustScore: 65,
    trustReasons: [
      { signal: 'corroborated', kind: 'positive', detail: 'Listed by 3 independent source portals.' },
    ],
    corroborationCount: 3,
  });
}

export function corroboratedScholarshipPosting(): FixturePosting {
  return posting({
    id: '00000000-1111-2222-3333-555555555555',
    title: 'National STEM Scholars Grant',
    sponsorName: 'National Science Teaching Association',
    amountMin: 2500,
    amountMax: 2500,
    eligibility: { criteria: ['STEM major', 'U.S. citizen or permanent resident'] },
    trustScore: 65,
    trustReasons: [
      { signal: 'corroborated', kind: 'positive', detail: 'Listed by 2 independent source portals.' },
    ],
    corroborationCount: 2,
  });
}

export function removedThenReappearedPosting(): FixturePosting {
  return posting({
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    title: 'Reappeared Internship',
    kind: 'internship',
    sponsorName: 'Example Tech Inc',
    term: 'Summer 2027',
    closedAt: lastWeek,
    missingStrikes: 2,
    missingSince: lastWeek,
    freshnessTier: 'live_polled',
  });
}

export function failedPollPosting(): FixturePosting {
  return posting({
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    title: 'Unstable Source Internship',
    kind: 'internship',
    sponsorName: 'Volatile Startup',
    term: 'Summer 2027',
    missingStrikes: 1,
    missingSince: yesterday,
    freshnessTier: 'live_polled',
  });
}

export function freshInternshipPosting(): FixturePosting {
  return posting({
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    title: 'Software Engineering Intern',
    kind: 'internship',
    sponsorName: 'Example Tech Inc',
    term: 'Summer 2027',
    locations: ['Remote', 'Austin, TX'],
    isRemote: true,
    skills: ['typescript', 'react'],
    workAuth: 'us_citizen',
    freshnessTier: 'live_polled',
  });
}

export function emptyProfile(): FixtureProfile {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    major: null,
    gradYear: null,
    workAuth: null,
    targetLocations: [],
    targetVerticals: [],
    openToRemote: true,
    skills: [],
  };
}

export function partialProfile(): FixtureProfile {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    major: 'computer science',
    gradYear: null,
    workAuth: null,
    targetLocations: [],
    targetVerticals: [],
    openToRemote: true,
    skills: [],
  };
}

export function completeProfile(): FixtureProfile {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    major: 'computer science',
    gradYear: 2027,
    workAuth: 'us_citizen',
    targetLocations: ['California', 'Remote'],
    targetVerticals: ['software'],
    openToRemote: true,
    skills: ['typescript', 'react'],
  };
}

export function conflictingProfile(): FixtureProfile {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    major: 'biology',
    gradYear: 2027,
    workAuth: 'needs_sponsorship',
    targetLocations: ['New York'],
    targetVerticals: ['software'],
    openToRemote: false,
    skills: ['python'],
  };
}

export function sourcePayloadFixture(): Record<string, unknown> {
  return {
    sourceId: 'anon-source-123',
    title: 'Anonymous Internship',
    description: 'Contact anon.student@example.edu for questions.',
    postedBy: 'Anon Recruiter',
    raw: {
      apiKey: 'sk-anon-api03-example',
      internalNotes: 'Call 555-123-4567 before publishing.',
    },
  };
}

export function applicationFixture(): Record<string, unknown> {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    userId: '11111111-1111-1111-1111-111111111111',
    postingId: '22222222-2222-2222-2222-222222222222',
    notes: 'Reached out to jane.doe@example.com on 2026-09-01.',
    outcome: null,
  };
}

export function profileFixture(): Record<string, unknown> {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    displayName: 'Anon Student',
    school: 'Example University',
    major: 'computer science',
    githubUsername: 'anonstudent',
    linkedinUrl: 'https://linkedin.com/in/anonstudent',
    portfolioUrl: 'https://anonstudent.dev',
  };
}
