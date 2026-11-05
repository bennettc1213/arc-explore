"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { BROWSER_WORKFLOW_MS } from "@/lib/pricing/allowance";
import { beginUse, confirmUse } from "@/lib/pricing/grants";
import { getUserTier } from "@/lib/pricing/entitlements";

/** The browser-local tools, and the page each one lives on. */
const SESSION_TOOLS = { linkedin_tools: "/linkedin", essay_reviewer: "/essay" } as const;
type SessionTool = keyof typeof SESSION_TOOLS;

export interface SessionState {
  status: "idle" | "started" | "error";
  message?: string;
}

/**
 * Open a 72-hour session of a browser-local tool (LinkedIn, essay).
 *
 * CARRIES NO CONTENT. The only input is which tool; the essay or profile text
 * never leaves the browser, so the server cannot tell one essay from the next.
 * The workflow boundary is therefore time: a granted session stays open across
 * reloads and revisions until it expires. This is the one request these pages
 * make, and it is made by a button press, never on page load or a keystroke.
 *
 * Enforcement is server-side in one sense only: the page will not render the
 * tool without a live grant. Once rendered, the tool runs in the browser, and
 * nothing server-side can meter what happens inside it.
 */
export async function startToolSessionAction(_prev: SessionState, formData: FormData): Promise<SessionState> {
  const raw = String(formData.get("feature") ?? "");
  if (!(raw in SESSION_TOOLS)) return { status: "error", message: "unknown tool" };
  const feature = raw as SessionTool;
  const user = await requireUser(SESSION_TOOLS[feature]);
  const tier = await getUserTier(user.id);

  const begin = await beginUse({
    userId: user.id,
    tier,
    feature,
    keys: ["session"],
    expiresInMs: BROWSER_WORKFLOW_MS,
  });
  if (begin.outcome === "reserved") await confirmUse(user.id, begin.grantId);
  if (begin.outcome === "blocked") {
    return { status: "error", message: "this period's free session is used" };
  }

  revalidatePath(SESSION_TOOLS[feature]);
  return { status: "started" };
}
