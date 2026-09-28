import assert from 'node:assert';
import { describe, test } from 'node:test';

import { scoreFit, type ScoreProfile } from '../score/fit';
import { scoreScholarshipFit } from '../score/scholarship-fit';
import { isContentMarketing } from '../scholarships/classify';
import { parseAmount } from '../scholarships/amount';
import { selectPostingsToClose } from '../scholarships/close';
import { assessTrust } from '../scholarships/trust';

import {
  completeProfile,
  conflictingProfile,
  corroboratedScholarshipPosting,
  credibleAssociationPosting,
  descriptionOnlyTermPosting,
  emptyProfile,
  exactAmountPosting,
  failedPollPosting,
  freshInternshipPosting,
  ineligibleConstraintsPosting,
  lotteryLanguagePosting,
  malformedAmountPosting,
  marketingAwardPosting,
  missingTermPosting,
  partialProfile,
  pastTermPosting,
  programTotalPosting,
  rangeAmountPosting,
  rehabSponsorPosting,
  removedThenReappearedPosting,
  sourcePayloadFixture,
  variesAmountPosting,
} from './fixtures';
import { marketReadyFlags } from './flags';
import {
  redactApplicationFixture,
  redactProfileFixture,
  redactSourcePayload,
  redactText,
} from './redact';

describe('market-ready fixtures', () => {
  test('cover the required term cases', () => {
    assert.equal(descriptionOnlyTermPosting().term, null);
    assert.equal(missingTermPosting().term, null);
    assert.equal(pastTermPosting().term, 'Summer 2025');
  });

  test('cover the required amount cases', () => {
    assert.equal(exactAmountPosting().amountStatus, 'exact');
    assert.equal(exactAmountPosting().amountMin, exactAmountPosting().amountMax);
    assert.equal(rangeAmountPosting().amountStatus, 'range');
    assert.notEqual(rangeAmountPosting().amountMin, rangeAmountPosting().amountMax);
    assert.equal(variesAmountPosting().amountStatus, 'varies');
    assert.equal(variesAmountPosting().amountMin, null);
    assert.equal(malformedAmountPosting().amountStatus, 'unparseable');
    assert.equal(malformedAmountPosting().amountNeedsReview, true);
    assert.equal(programTotalPosting().programTotal ?? 0, 50000);
  });

  test('cover the required trust cases', () => {
    assert.equal(marketingAwardPosting().isContentMarketing, true);
    assert.ok(marketingAwardPosting().trustScore < 50);
    assert.ok(rehabSponsorPosting().trustScore < 50);
    assert.ok(credibleAssociationPosting().trustScore > 50);
    assert.ok(corroboratedScholarshipPosting().trustScore > 50);
    assert.equal(lotteryLanguagePosting().isLottery, true);
    assert.match(lotteryLanguagePosting().title ?? '', /sweepstakes/i);
    assert.ok((ineligibleConstraintsPosting().eligibility?.criteria?.length ?? 0) > 0);

    const assessed = assessTrust({
      sponsorName: rehabSponsorPosting().sponsorName ?? '',
      title: rehabSponsorPosting().title,
      eligibility: rehabSponsorPosting().eligibility?.criteria ?? [],
      amountMin: rehabSponsorPosting().amountMin,
      amountMax: rehabSponsorPosting().amountMax,
      corroborationCount: 0,
    });
    assert.ok(assessed.reasons.some((r) => r.signal === 'unrelated_services'));
  });

  test('cover the required lifecycle cases', () => {
    assert.equal(removedThenReappearedPosting().closedAt !== null, true);
    assert.ok(failedPollPosting().missingStrikes > 0);
  });

  test('cover the required profile cases', () => {
    assert.equal(emptyProfile().major, null);
    assert.equal(partialProfile().major !== null, true);
    assert.equal(completeProfile().gradYear !== null, true);
    assert.notEqual(conflictingProfile().workAuth, completeProfile().workAuth);
  });
});

describe('market-ready redaction', () => {
  test('removes emails, phones, and tokens from source payloads', () => {
    const redacted = redactSourcePayload(sourcePayloadFixture());
    const text = JSON.stringify(redacted);
    assert.doesNotMatch(text, /anon\.student@example\.edu/);
    assert.doesNotMatch(text, /555-123-4567/);
    assert.doesNotMatch(text, /sk-anon-api03-example/);
  });

  test('redacts free-form text', () => {
    const out = redactText('Reach me at jane.doe@example.com or 555-123-4567.');
    assert.doesNotMatch(out, /jane\.doe@example\.com/);
    assert.doesNotMatch(out, /555-123-4567/);
  });

  test('redacts profile and application fixtures', () => {
    const profile = redactProfileFixture({
      id: 'x',
      displayName: 'Jane Doe',
      linkedinUrl: 'https://linkedin.com/in/janedoe',
    });
    assert.equal(profile.displayName, '[REDACTED]');
    assert.equal(profile.linkedinUrl, '[REDACTED]');

    const app = redactApplicationFixture({
      id: 'x',
      notes: 'Emailed jane.doe@example.com',
    });
    assert.equal(app.notes, '[REDACTED]');
  });
});

describe('market-ready rollout flags', () => {
  test('default to safe off when env is not set', () => {
    assert.equal(marketReadyFlags.ranker(), false);
    assert.equal(marketReadyFlags.sourceAdapter('academicworks'), false);
    assert.equal(marketReadyFlags.notifications('instant'), false);
    assert.equal(marketReadyFlags.billing(), false);
    assert.equal(marketReadyFlags.openingSoon(), false);
    assert.equal(marketReadyFlags.feature('lottery-shelf'), false);
  });
});

describe('market-ready smoke validation', () => {
  test('existing domain functions accept anonymized fixtures without throwing', () => {
    const profile: ScoreProfile = completeProfile();

    const intern = freshInternshipPosting();
    const fit = scoreFit(profile, {
      title: intern.title,
      term: intern.term,
      locations: intern.locations,
      isRemote: intern.isRemote,
      workAuth: intern.workAuth,
      skills: intern.skills,
    });
    assert.ok(typeof fit.score === 'number' || fit.score === null);

    const scholarship = marketingAwardPosting();
    const sfit = scoreScholarshipFit(profile, {
      title: scholarship.title,
      sponsorName: scholarship.sponsorName,
      amountMin: scholarship.amountMin,
      amountMax: scholarship.amountMax,
      amountStatus: scholarship.amountStatus,
      isContentMarketing: scholarship.isContentMarketing,
      eligibility: scholarship.eligibility?.criteria ?? [],
    });
    assert.ok(typeof sfit.score === 'number' || sfit.score === null);

    assert.equal(
      isContentMarketing({
        sponsorName: scholarship.sponsorName ?? '',
        amountMin: scholarship.amountMin,
        amountMax: scholarship.amountMax,
      }),
      true,
    );

    const parsed = parseAmount('Award of $1,000 to $5,000');
    assert.equal(parsed.needsReview, false);

    const closePlan = selectPostingsToClose(
      [
        {
          id: removedThenReappearedPosting().id,
          canonicalHash: removedThenReappearedPosting().id,
          closedAt: null,
          missingStrikes: 0,
          missingSince: null,
        },
      ],
      [],
    );
    assert.ok(Array.isArray(closePlan.toClose));
  });
});
