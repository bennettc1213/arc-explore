"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { PREVIEW_AREAS, type PreviewLane } from "@/lib/landing-preview";
import { feedHref } from "@/lib/routes";

export function MatchPreview({ lanes }: { lanes: PreviewLane[] }) {
  const [kind, setKind] = useState("internship");
  const [area, setArea] = useState<string>(PREVIEW_AREAS[0].key);
  const key = kind === "scholarship" ? kind : area;
  const lane = lanes.find(item => item.key === key);
  const areaLabel = PREVIEW_AREAS.find(item => item.key === area)!.label;
  const href = feedHref(new URLSearchParams({ kind, ...(kind === "internship" ? { category: area } : {}), excludeMarketing: "1" }).toString());

  return (
    <section className="landing-match landing-block" id="try-it" aria-labelledby="match-title">
      <div className="landing-section-heading">
        <div><div className="eyebrow">A little direction starts here</div><h2 id="match-title">Your next move.<br /><span className="landing-accent">Let’s narrow it down.</span></h2></div>
        <p>Pick a direction. Get a feel for the opportunities waiting for you, before you make an account.</p>
      </div>
      <div className="match-workbench">
        <div className="match-controls">
          <span className="landing-small-label">01 / Choose your direction</span>
          <fieldset className="match-kind"><legend>I’m looking for</legend>
            {[{ key: "internship", label: "Internships", icon: "explore" as const }, { key: "scholarship", label: "Scholarships", icon: "award" as const }].map(option => (
              <label key={option.key} className={kind === option.key ? "is-selected" : ""}>
                <input type="radio" name="preview-kind" value={option.key} checked={kind === option.key} onChange={() => setKind(option.key)} />
                <Icon name={option.icon} size={19} /><span>{option.label}</span><Icon name="check" size={15} />
              </label>
            ))}
          </fieldset>
          {kind === "internship" ? <div className="match-area"><label htmlFor="preview-area">In a field I care about</label><select id="preview-area" value={area} onChange={event => setArea(event.target.value)}>{PREVIEW_AREAS.map(option => <option value={option.key} key={option.key}>{option.label}</option>)}</select></div> : <div className="match-scholarship-note"><Icon name="graduation" size={23} /><p>Help fund what comes next.</p><span>Explore judged awards, then check each sponsor’s eligibility requirements.</span></div>}
          <div className="match-context"><Icon name="info" size={17} /><p>This is a browse preview. Add your background in Explore to check eligibility and build your personal matches.</p></div>
        </div>
        <div className="match-results" aria-label="Opportunity preview results" aria-live="polite" aria-atomic="true">
          <div className="match-results-heading"><div><span className="landing-small-label">02 / See what’s out there</span><h3>{kind === "scholarship" ? "Funding for your next chapter" : areaLabel}</h3></div><span className="match-snapshot"><span />Source-linked listings</span></div>
          <div className="match-list" key={key}>
            {lane?.items.length ? lane.items.map(item => <article className="match-listing" key={item.id}>
              <div className="match-listing-top"><span className="match-org-mark" aria-hidden="true">{item.company.slice(0, 1).toUpperCase()}</span><div><p>{item.company}</p><h4><Link href={`/listing/${item.id}`} prefetch={false}>{item.title}<Icon name="arrow" size={17} /></Link></h4></div></div>
              <div className="match-listing-meta"><span><Icon name={kind === "scholarship" ? "award" : "pin"} size={13} />{item.detail}</span>{item.deadline && <span><Icon name="calendar" size={13} />{item.deadline}</span>}</div>
              <div className="match-listing-proof"><Icon name={item.caution ? "info" : "shield"} size={13} /><span>{item.caution ? "Application link needs a recheck. Review the original source." : item.verified}</span></div>
            </article>) : <div className="match-no-results"><Icon name="search" size={26} /><h4>No preview listings in this direction yet.</h4><p>Try another field, or explore all opportunities. Coverage changes as sources are checked.</p></div>}
          </div>
          <div className="match-results-footer"><span>{kind === "internship" && lane ? `${lane.total.toLocaleString("en-US")} listings in this field` : "Judged awards · no lottery-style previews"}</span><Link href={href} className="landing-text-link">{kind === "scholarship" ? "Explore scholarships" : "Keep exploring"}<Icon name="arrow" size={16} /></Link></div>
        </div>
      </div>
      <p className="landing-section-note"><Icon name="check" size={14} />Real listings from the feed. Open any opportunity to check the full details before applying.</p>
    </section>
  );
}
