import { ScoutWorkspace } from "@/components/scout/ScoutWorkspace";
import { getSessionUser } from "@/lib/auth";
import { scoutFocusFrom } from "@/lib/scout/focus";
import { listRecentScouts } from "@/lib/scout/history-store";

export const metadata = { title: "Your Scout | Instela" };

export default async function ScoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const recentScouts = user ? await listRecentScouts(user.id).catch(() => []) : [];
  // `?for=` says which tool the student came from. Parsed in a tested module,
  // never in the page, and anything unrecognised is a plain Scout.
  return <ScoutWorkspace key={`${user?.id ?? "guest"}:${scoutFocusFrom(sp.for) ?? "all"}`} memoryOwner={user?.id ?? "guest"} focus={scoutFocusFrom(sp.for)} recentScouts={recentScouts} />;
}
