"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { setFundingGoalAction, type GoalActionState } from "@/app/explore/actions";
import type { FundingTotals, PlanPayload, PlanSlot } from "@/lib/scholarships/plan";

import { useEmailModal } from "./EmailModal";
import { LockedCard, ScholarshipCard } from "./ScholarshipCard";
import { track } from "./track";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

function Slot({ slot, signedIn, origin }: { slot: PlanSlot; signedIn: boolean; origin: string }) {
  return slot.locked ? <LockedCard /> : <ScholarshipCard card={slot.card} signedIn={signedIn} origin={origin} />;
}

// ── Funding goal ─────────────────────────────────────────────────────────────

export interface FundingState {
  signedIn: boolean;
  /** False until migration 0027 is applied — the goal prompt is then hidden. */
  goalAvailable: boolean;
  goal: number | null;
  totals: FundingTotals | null;
}

const GOAL_INITIAL: GoalActionState = { status: "idle" };

function GoalForm({ onDone }: { onDone?: () => void }) {
  const [state, action, pending] = useActionState(setFundingGoalAction, GOAL_INITIAL);
  useEffect(() => {
    if (state.status === "saved") onDone?.();
  }, [state.status, onDone]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" style={{ marginTop: 12 }}>
      <label className="field-row" style={{ minWidth: 220 }}>
        <span className="mono chrome">how much do you need to cover?</span>
        <input className="field" name="goal" inputMode="numeric" placeholder="$12,000" required />
      </label>
      <button type="submit" className="btn btn-primary press" disabled={pending}>
        {pending ? "saving…" : "set goal"}
      </button>
      {state.status === "error" && (
        <span className="mono" role="alert" style={{ color: "var(--system-danger)" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}

function FundingGoalMeter({ funding }: { funding: FundingState }) {
  const openModal = useEmailModal();
  const [editing, setEditing] = useState(false);

  if (!funding.signedIn) {
    return (
      <section className="card" aria-label="funding goal">
        <div className="mono chrome">funding goal</div>
        <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6 }}>
          Say how much you need to cover and track what you have applied for against it.
        </p>
        <button type="button" className="btn press" style={{ marginTop: 12 }} onClick={() => openModal("E3")}>
          set your goal
        </button>
      </section>
    );
  }

  const totals = funding.totals ?? { submitted: 0, saved: 0, unconfirmed: 0 };
  const goal = funding.goal;
  const scale = Math.max(goal ?? 0, totals.submitted + totals.saved, 1);
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;

  return (
    <section className="card" aria-label="funding goal">
      <div className="mono" style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        <span className="mono-strong" style={{ color: "var(--text)" }}>
          {goal !== null ? `${usd(goal)} goal` : "no goal set"}
        </span>
        <span>{usd(totals.submitted)} submitted</span>
        <span>{usd(totals.saved)} saved</span>
      </div>
      <div
        className="goal-bar"
        role="img"
        aria-label={`${usd(totals.submitted)} submitted and ${usd(totals.saved)} saved${goal !== null ? ` toward a ${usd(goal)} goal` : ""}`}
      >
        <span className="goal-bar-submitted" style={{ width: pct(totals.submitted) }} />
        <span className="goal-bar-saved" style={{ width: pct(totals.saved) }} />
      </div>
      {totals.unconfirmed > 0 && (
        <p className="mono" style={{ marginTop: 8, color: "var(--faint-readable)" }}>
          {totals.unconfirmed} tracked scholarship{totals.unconfirmed === 1 ? " has" : "s have"} no confirmed
          amount and {totals.unconfirmed === 1 ? "is" : "are"} not counted
        </p>
      )}
      {funding.goalAvailable &&
        (goal === null || editing ? (
          <GoalForm onDone={() => setEditing(false)} />
        ) : (
          <button
            type="button"
            className="mono press"
            style={{ marginTop: 8, color: "var(--accent)", background: "none", border: 0, padding: 0 }}
            onClick={() => setEditing(true)}
          >
            change goal
          </button>
        ))}
    </section>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function PlanRow({
  id,
  title,
  slots,
  signedIn,
}: {
  id: string;
  title: string;
  slots: PlanSlot[];
  signedIn: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  // Recorded once per row per page view, when it actually scrolls into sight.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track("explore_row_viewed", { row: id });
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id]);

  return (
    <section ref={ref} aria-labelledby={`row-${id}`} style={{ marginTop: 36 }}>
      <h2 id={`row-${id}`} className="eyebrow chrome" style={{ marginBottom: 12 }}>
        {title.toLowerCase()}
      </h2>
      <div className="plan-row" role="list">
        {slots.map((slot) => (
          <div role="listitem" key={slot.locked ? slot.key : slot.card.id}>
            <Slot slot={slot} signedIn={signedIn} origin={id} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── The view ─────────────────────────────────────────────────────────────────

export function PlanView({
  plan,
  funding,
  signedIn,
  listHref,
}: {
  plan: PlanPayload;
  funding: FundingState;
  signedIn: boolean;
  listHref: string;
}) {
  const { counts } = plan;

  return (
    <div>
      <FundingGoalMeter funding={funding} />

      <section aria-labelledby="next-moves" style={{ marginTop: 32 }}>
        <h2 id="next-moves" className="eyebrow chrome" style={{ marginBottom: 12 }}>
          your next {plan.nextMoves.length > 0 ? plan.nextMoves.length : 3} moves
        </h2>
        {plan.nextMoves.length > 0 ? (
          <div className="plan-grid">
            {plan.nextMoves.map((slot) => (
              <Slot key={slot.locked ? slot.key : slot.card.id} slot={slot} signedIn={signedIn} origin="next-moves" />
            ))}
          </div>
        ) : (
          <div className="slot" style={{ padding: "14px 16px", display: "block" }}>
            {/* Says exactly which fact is missing, with the count, rather than
                quietly showing nothing. */}
            {counts.effortKnown === 0
              ? `none yet — next moves rank by dollars per hour of effort, and none of these ${counts.listings.toLocaleString("en-US")} listings states how many essays or letters it needs, so we cannot estimate effort for any of them.`
              : "none qualify — a move needs a confirmed amount, a known effort, a deadline at least 3 days out, and must not be a marketing contest."}{" "}
            {counts.amountKnown.toLocaleString("en-US")} of {counts.listings.toLocaleString("en-US")} have a confirmed
            amount.{" "}
            <Link href={listHref} style={{ color: "var(--accent)" }}>
              see them all as a list
            </Link>
          </div>
        )}
      </section>

      {plan.rows.map((row) => (
        <PlanRow key={row.id} id={row.id} title={row.title} slots={row.slots} signedIn={signedIn} />
      ))}

      {plan.lockedCount > 0 && (
        <p className="mono" style={{ marginTop: 24, color: "var(--faint-readable)" }}>
          signed out, the plan shows {plan.cap} scholarships — sign in for the rest.
        </p>
      )}

      {plan.hiddenRows.length > 0 && (
        <details className="disclosure" style={{ marginTop: 32 }}>
          <summary>{plan.hiddenRows.length} rows not shown</summary>
          <ul className="disclosure-body mono" style={{ display: "grid", gap: 6 }}>
            {plan.hiddenRows.map((h) => (
              <li key={h.id}>
                {h.title.toLowerCase()} — {h.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
