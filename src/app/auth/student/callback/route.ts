import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { eq, or } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { createStudentSSOClient } from "@/lib/supabase/student-sso";
import {
  studentSSOProviders,
  studentAffiliationMatches,
} from "@/lib/student-sso-config";
import { schoolEmailHash } from "@/lib/student-discount";
import { ensureProfile } from "@/lib/profile/store";
import { db } from "@/db/client";
import { studentDiscountClaims } from "@/db/schema";

export async function GET(request: NextRequest) {
  const finish = (status: string) =>
    NextResponse.redirect(
      new URL(`/onboarding?student=${status}`, request.url),
    );
  const store = await cookies();
  const flow = store.get("instela-student-sso-flow")?.value;
  store.delete("instela-student-sso-flow");
  const owner = await getSessionUser();
  const secret =
    process.env.STUDENT_SSO_STATE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const code = request.nextUrl.searchParams.get("code");
  if (!owner || !flow || !secret || !code) return finish("failed");
  const client = await createStudentSSOClient();
  try {
    const [encoded, signature] = flow.split(".");
    const expected = createHmac("sha256", secret).update(encoded).digest();
    const actual = Buffer.from(signature ?? "", "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return finish("failed");
    const state = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (
      state.owner !== owner.id ||
      !Number.isFinite(state.createdAt) ||
      Date.now() - state.createdAt > 10 * 60000 ||
      state.createdAt > Date.now()
    )
      return finish("failed");
    const provider = studentSSOProviders().find(
      (p) => p.providerId === state.providerId,
    );
    if (!provider) return finish("failed");
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return finish("failed");
    const { data } = await client.auth.getUser();
    const identity = data.user?.identities?.find(
      (i) => i.provider === `sso:${provider.providerId}`,
    );
    const claims = identity?.identity_data;
    const email =
      typeof claims?.email === "string" ? claims.email.toLowerCase() : "";
    const fresh =
      identity?.last_sign_in_at &&
      Date.now() - Date.parse(identity.last_sign_in_at) < 5 * 60000;
    if (
      !identity ||
      !fresh ||
      !provider.domains.includes(email.split("@")[1]) ||
      !studentAffiliationMatches(
        claims?.custom_claims?.[provider.affiliationClaim],
        provider.studentValue,
        provider.domains,
      )
    )
      return finish("not-current-student");
    await ensureProfile(owner.id);
    const subjectHash = createHash("sha256")
      .update(`${provider.providerId}:${identity.id}`)
      .digest("hex");
    const emailHash = schoolEmailHash(email);
    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(studentDiscountClaims)
        .where(
          or(
            eq(studentDiscountClaims.userId, owner.id),
            eq(studentDiscountClaims.schoolEmailHash, emailHash),
            eq(studentDiscountClaims.studentSubjectHash, subjectHash),
          ),
        );
      if (
        existing.some(
          (c) =>
            c.userId !== owner.id ||
            c.schoolEmailHash !== emailHash ||
            (c.studentSubjectHash && c.studentSubjectHash !== subjectHash),
        )
      )
        return false;
      const values = {
        schoolEmailHash: emailHash,
        schoolDomain: email.split("@")[1],
        studentSubjectHash: subjectHash,
        emailVerifiedAt: new Date(),
        enrollmentStatus: "verified",
        enrollmentVerifiedAt: new Date(),
        enrollmentValidUntil: new Date(Date.now() + 90 * 86400000),
      };
      if (existing.length)
        await tx
          .update(studentDiscountClaims)
          .set(values)
          .where(eq(studentDiscountClaims.userId, owner.id));
      else
        await tx
          .insert(studentDiscountClaims)
          .values({ userId: owner.id, ...values });
      return true;
    });
    if (!result) return finish("already-claimed");
    revalidatePath("/onboarding");
    revalidatePath("/pricing");
    return finish("verified");
  } catch {
    return finish("failed");
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => {});
  }
}
