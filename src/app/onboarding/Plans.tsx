import { allowanceWords } from "@/lib/pricing/describe";
import { TIER_LABELS, TIER_PRICE_USD } from "@/lib/pricing/tiers";

/**
 * The two plans as onboarding shows them. Every limit comes from the
 * entitlement table through `allowanceWords`; the student price is described
 * as possible, never as applied — this screen cannot know whether checkout is
 * configured for it (the pricing page checks, and shows the exact amount).
 */
export function OnboardingPlans() {
  return (
    <div className="ob-plans" aria-label="Compare the Free and Pro plans">
      <section className="ob-plan">
        <span className="ob-plan-label">{TIER_LABELS.free}</span>
        <p className="ob-plan-price">
          $0<span>/ month</span>
        </p>
        <p>A complete search, and a first draft of everything.</p>
        <ul>
          <li>Every listing, warning and source fact</li>
          <li>Your {allowanceWords("feed_full_depth", "free")}</li>
          <li>Tracker: {allowanceWords("tracker", "free")}</li>
          <li>Weekly digest and deadline reminders</li>
          <li>Each preparation tool: {allowanceWords("cover_letter", "free")}</li>
        </ul>
        <span className="ob-plan-foot">Always free</span>
      </section>
      <section className="ob-plan ob-plan-pro">
        <span className="ob-plan-label">{TIER_LABELS.apply}</span>
        <p className="ob-plan-price">
          ${TIER_PRICE_USD.apply.toFixed(2)}
          <span>/ month</span>
        </p>
        <p>For preparing several applications at once.</p>
        <ul>
          <li>Full ranked results and detailed fit guidance</li>
          <li>Unlimited tracking and preparation tools</li>
          <li>Several saved searches, daily alerts</li>
        </ul>
        <span className="ob-plan-foot">
          Verified students may be eligible for 50% off; the pricing page shows whether it applies
        </span>
      </section>
    </div>
  );
}
