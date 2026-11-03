import type { FeedItem } from "@/lib/feed";
import { confirmedAmount } from "@/lib/scholarships/plan";

export function selectScoutSections(items: FeedItem[], now = new Date()) {
  const open = items.filter(item => !item.closedAt && !item.isLottery && !item.fit.blocked && (item.deadlineAt === null || item.deadlineAt.getTime() >= now.getTime()));
  const used = new Set<string>();
  const definitions = [
    { id: "new", title: "Just found", description: "New to Instela in the last 24 hours", select: (i: FeedItem) => now.getTime() - i.firstSeenAt.getTime() >= 0 && now.getTime() - i.firstSeenAt.getTime() <= 86_400_000 },
    { id: "closing", title: "Closing soon", description: "Stated deadlines within the next two weeks", select: (i: FeedItem) => i.deadlineAt !== null && i.deadlineAt.getTime() - now.getTime() <= 14 * 86_400_000 },
    { id: "value", title: "Larger scholarship awards", description: "Confirmed per-recipient awards of $5,000 or more", select: (i: FeedItem) => i.kind === "scholarship" && (confirmedAmount(i) ?? 0) >= 5000 },
    { id: "awards", title: "Scholarships for your search", description: "Scholarship listings matching your search filters", select: (i: FeedItem) => i.kind === "scholarship" },
    { id: "internships", title: "Internship openings", description: "Open roles matching your search filters", select: (i: FeedItem) => i.kind === "internship" },
    { id: "other", title: "More to explore", description: "More opportunities from your Scout", select: () => true },
  ];
  return definitions.flatMap(def => {
    const selected = open.filter(i => !used.has(i.id) && def.select(i));
    selected.forEach(i => used.add(i.id));
    return selected.length ? [{ id: def.id, title: def.title, description: def.description, items: selected.map(item => ({ item, confirmedAward: confirmedAmount(item) })) }] : [];
  });
}
