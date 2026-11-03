import { ScoutWorkspace } from "@/components/scout/ScoutWorkspace";
import { scoutFocusFrom } from "@/lib/scout/focus";

export const metadata = { title: "Your Scout | Instela" };

export default async function ScoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // `?for=` says which tool the student came from. Parsed in a tested module,
  // never in the page, and anything unrecognised is a plain Scout.
  return <ScoutWorkspace focus={scoutFocusFrom(sp.for)} />;
}
