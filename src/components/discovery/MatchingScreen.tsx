import { Mascot } from "@/components/chrome/Mascot";
import { Icon } from "@/components/ui/Icon";

export function MatchingScreen({ kind = "opportunities", overlay = false }: { kind?: string; overlay?: boolean }) {
  return <div className={`matching-screen ${overlay ? "matching-overlay" : ""}`} role="status" aria-live="polite">
    <div className="matching-orbit" aria-hidden="true"><span /><span /><span /><div><Mascot size={48} /></div><i className="orbit-spark orbit-spark-one" /><i className="orbit-spark orbit-spark-two" /></div>
    <span className="matching-eyebrow">A little direction. A lot of possibility.</span>
    <h2>Finding your next <span>possibility.</span></h2>
    <p>Finding {kind} based on your filters and preferences.</p>
    <div className="matching-progress" aria-hidden="true"><span /></div>
    <div className="matching-details"><span><Icon name="filter" size={14} />Your preferences</span><i /><span><Icon name="shield" size={14} />Source-checked listings</span></div>
  </div>;
}
