import Link from "next/link";
import { getFeed } from "@/lib/feed";
import { toScoreProfile } from "@/lib/profile/types";
import { formatAward } from "@/lib/scholarships/display";
import { Icon } from "./ui/Icon";
import { Mascot } from "./chrome/Mascot";

/** Real public listings, without fabricated profile scores or application activity. */
export async function OpportunityPreview({ openNow }: { openNow: number }) {
  const { items } = await getFeed(toScoreProfile(null, []), { limit: 3, reservePerKind: 1 });
  return <div className="product-preview landing-rise" style={{ animationDelay: "240ms" }}>
    <div className="preview-window-bar"><div className="preview-window-dots"><i /><i /><i /></div><span>YOUR NEXT CHAPTER</span><Icon name="shield" size={14} /></div>
    <div className="preview-app"><div className="preview-rail" aria-hidden="true"><Mascot size={22} /><span className="is-active"><Icon name="explore" size={17} /></span><Icon name="tracker" size={17} /><Icon name="resume" size={17} /><Icon name="tools" size={17} /></div><div className="preview-body">
      <div className="preview-heading"><div><span className="preview-overline">A little direction. A lot of possibility.</span><h2>Find your next move<span>.</span></h2></div><span className="preview-live"><i />Live listings</span></div>
      <div className="preview-search"><Icon name="search" size={16} /><span>Internships, scholarships, possibilities</span><Icon name="filter" size={15} /></div>
      <div className="preview-tabs"><span className="is-active">All opportunities</span><span>Internships</span><span>Scholarships</span></div>
      <div className="preview-list">{items.map(item => <Link key={item.id} href={`/listing/${item.id}`} className="preview-listing"><span className="preview-company-mark">{item.company.slice(0, 1).toUpperCase()}</span><div><span className="preview-listing-kind">{item.kind === "scholarship" ? "Scholarship" : "Internship"}</span><h3>{item.title}</h3><p>{item.company}{item.kind === "scholarship" ? ` · ${formatAward(item) ?? "Amount not stated"}` : item.locations.length ? ` · ${item.locations[0]}` : ""}</p><span className="preview-verified">{item.dates.verified}</span></div><Icon name="chevron" size={16} /></Link>)}{items.length === 0 && <div className="preview-empty">Explore the feed to see current opportunities.</div>}</div>
      <Link className="preview-bottom" href="/explore"><span><strong>{openNow.toLocaleString("en-US")}</strong> opportunities open right now</span><Icon name="arrow" size={17} /></Link>
    </div></div>
    <div className="preview-caption"><Icon name="check" size={14} />Real listings from the live feed. No sample data.</div>
  </div>;
}
