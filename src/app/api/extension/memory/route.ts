import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { allowedOrigins, corsHeaders, preflight } from "@/lib/apply/cors";
import { findPostingById, findPostingByUrl } from "@/lib/apply/extension";
import { applicationPageUrl } from "@/lib/apply/extension-config";
import { getUserTier } from "@/lib/pricing/entitlements";
import { autofillFeature, evaluateFeature } from "@/lib/pricing/tiers";
import { memoryFactSchema } from "@/lib/profile/memory";
import { saveMemoryFact } from "@/lib/profile/memory-store";

export async function OPTIONS(req: Request) { return preflight(req.headers.get("origin")); }
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...corsHeaders(origin), "Cache-Control": "private, no-store" };
  const reply = (body: object, status: number) => NextResponse.json(body, { status, headers });
  // Unlike a read, this mutates account memory: reject unconfigured origins,
  // not merely their CORS reads. No arbitrary website may post with a cookie.
  if (!origin || !allowedOrigins().includes(origin)) return reply({ error: "Origin not allowed." }, 403);
  const user = await getSessionUser();
  if (!user) return reply({ error: "Sign in to Instela to save this answer." }, 401);
  if (Number(req.headers.get("content-length") ?? 0) > 8192) return reply({ error: "Answer too large." }, 413);
  let body: unknown;
  try { body = await req.json(); } catch { return reply({ error: "Invalid answer." }, 400); }
  if (!body || typeof body !== "object") return reply({ error: "Invalid answer." }, 400);
  const parsed = memoryFactSchema.safeParse(body);
  if (!parsed.success || !parsed.data.value) return reply({ error: parsed.success ? "Enter an answer." : parsed.error.issues[0]?.message }, 400);
  const pageUrl = "pageUrl" in body && typeof body.pageUrl === "string" ? body.pageUrl : "";
  if (!applicationPageUrl(pageUrl)) return reply({ error: "Invalid application URL." }, 400);
  const postingId = "postingId" in body && typeof body.postingId === "string" ? body.postingId : null;
  const posting = postingId ? await findPostingById(postingId) : await findPostingByUrl(pageUrl);
  if (!posting) return reply({ error: "This application could not be matched to Instela." }, 404);
  const tier = await getUserTier(user.id);
  if (!evaluateFeature(tier, autofillFeature(posting.kind)).usable) return reply({ error: "upgrade_required" }, 403);
  try { await saveMemoryFact(user.id, parsed.data.key, parsed.data.value, "application"); }
  catch { return reply({ error: "Could not save your answer. Please try again." }, 500); }
  return reply({ ok: true }, 200);
}
