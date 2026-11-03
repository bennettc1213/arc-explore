import assert from "node:assert/strict";
import { test } from "node:test";

import { DISPLAYED_PRO_CENTS, reconcileQuote, type StripePriceFacts } from "./quote";

const price = (over: Partial<StripePriceFacts> = {}): StripePriceFacts => ({
  unitAmountCents: 599,
  currency: "usd",
  interval: "month",
  intervalCount: 1,
  active: true,
  ...over,
});

test("the displayed Pro price is $5.99", () => {
  assert.equal(DISPLAYED_PRO_CENTS, 599);
});

test("a configured price matching the page allows checkout", () => {
  const q = reconcileQuote(price(), null);
  assert.equal(q.ok, true);
  assert.equal(q.ok && q.studentCents, null, "no coupon, no student price");
});

test("a mismatched Stripe price refuses checkout and says why", () => {
  // The locally configured test price on 2026-11-03 was $20.00/month.
  const q = reconcileQuote(price({ unitAmountCents: 2000 }), null);
  assert.equal(q.ok, false);
  assert.match(!q.ok ? q.reason : "", /\$20\.00/);
});

test("wrong interval, currency or an archived price also refuse", () => {
  assert.equal(reconcileQuote(price({ interval: "year" }), null).ok, false);
  assert.equal(reconcileQuote(price({ currency: "eur" }), null).ok, false);
  assert.equal(reconcileQuote(price({ active: false }), null).ok, false);
  assert.equal(reconcileQuote(null, null).ok, false);
});

test("the student price is the exact amount Stripe charges, not a rounded $3.00", () => {
  const q = reconcileQuote(price(), { percentOff: 50, amountOffCents: null, currency: null, valid: true, duration: "forever" });
  // 50% of 599 is 299.5; Stripe rounds the discount to 300, charging 299.
  assert.equal(q.ok && q.studentCents, 299);
  assert.equal(q.ok && q.studentRecurring, true);
});

test("an invalid coupon offers no student price", () => {
  const q = reconcileQuote(price(), { percentOff: 50, amountOffCents: null, currency: null, valid: false, duration: "forever" });
  assert.equal(q.ok && q.studentCents, null);
});
