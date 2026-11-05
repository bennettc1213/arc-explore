import { MemoryWorkspace } from "@/components/scout/MemoryWorkspace";
import Link from "next/link";
import { ApplicationMemory } from "@/components/profile/ApplicationMemory";
import { requireUser } from "@/lib/auth";
import { getMemorySnapshot } from "@/lib/profile/memory-store";
export const metadata = { title: "Application Memory | Instela" };
export const dynamic = "force-dynamic";
export default async function MemoryPage() {
  const user = await requireUser("/memory");
  const facts = await getMemorySnapshot(user.id, user.email ?? null);
  return <main className="wrap scout-page"><nav className="scout-topline"><Link href="/portal">Back to portal</Link><Link href="/profile">Your full profile</Link></nav><ApplicationMemory facts={facts} /><MemoryWorkspace /></main>;
}
