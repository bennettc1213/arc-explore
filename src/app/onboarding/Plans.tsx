import { TIER_PRICE_USD } from "@/lib/pricing/tiers";

export function OnboardingPlans() {
  return (
    <div className="ob-plans" aria-label="Compare free and student Pro plans">
      <section className="ob-plan">
        <span className="ob-plan-label">Free</span>
        <p className="ob-plan-price">
          $0<span>/ month</span>
        </p>
        <p>Start exploring at your own pace.</p>
        <ul>
          <li>Scholarships & internships</li>
          <li>Personalized matches</li>
          <li>Application tracker</li>
        </ul>
        <span className="ob-plan-foot">Always free</span>
      </section>
      <section className="ob-plan ob-plan-pro">
        <span className="ob-plan-badge">STUDENT OFFER · 50% OFF</span>
        <span className="ob-plan-label">Pro</span>
        <p className="ob-plan-price">
          <s>${TIER_PRICE_USD.apply.toFixed(2)}</s> $
          {(TIER_PRICE_USD.apply / 2).toFixed(2)}
          <span>/ month</span>
        </p>
        <p>More tools for your next opportunity.</p>
        <ul>
          <li>Full ranked opportunity feed</li>
          <li>Resume & profile tools</li>
          <li>Application preparation tools</li>
        </ul>
        <span className="ob-plan-foot">
          After student verification · billing coming soon
        </span>
      </section>
    </div>
  );
}
