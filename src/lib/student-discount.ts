import { randomInt } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { studentDiscountClaims, studentEmailChallenges } from "@/db/schema";
import { ensureProfile } from "@/lib/profile/store";
import { isSchoolEmail } from "@/lib/onboarding";

export { schoolEmailHash } from "./student-identity";
import {
  schoolEmailHash,
  hashStudentCode,
  matchesStudentCode,
} from "./student-identity";

export async function getStudentClaim(userId: string) {
  const [claim] = await db
    .select()
    .from(studentDiscountClaims)
    .where(eq(studentDiscountClaims.userId, userId))
    .limit(1);
  return claim
    ? {
        ...claim,
        current:
          claim.enrollmentStatus === "verified" &&
          Boolean(
            claim.enrollmentValidUntil &&
            claim.enrollmentValidUntil.getTime() > Date.now(),
          ),
      }
    : null;
}

export async function requestStudentCode(userId: string, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (email.length > 254 || !isSchoolEmail(email))
    return {
      ok: false,
      message: "Enter a school email ending in .edu, .edu.xx, or .ac.xx.",
    };
  const sender =
    process.env.STUDENT_VERIFICATION_FROM_EMAIL ??
    process.env.REMINDER_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !sender)
    return {
      ok: false,
      message:
        "Student email verification isn’t available yet. You can continue free.",
    };
  await ensureProfile(userId);
  if (await getStudentClaim(userId))
    return {
      ok: false,
      message: "Your account already has a student discount claim.",
    };
  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const [challenge] = await db
    .insert(studentEmailChallenges)
    .values({
      userId,
      email,
      codeHash: hashStudentCode(code),
      expiresAt: new Date(now.getTime() + 10 * 60000),
    })
    .onConflictDoUpdate({
      target: studentEmailChallenges.userId,
      set: {
        email,
        codeHash: hashStudentCode(code),
        expiresAt: new Date(now.getTime() + 10 * 60000),
        attempts: 0,
        lastSentAt: now,
        windowStartedAt: sql`CASE WHEN ${studentEmailChallenges.windowStartedAt} < now() - interval '1 hour' THEN now() ELSE ${studentEmailChallenges.windowStartedAt} END`,
        sendCount: sql`CASE WHEN ${studentEmailChallenges.windowStartedAt} < now() - interval '1 hour' THEN 1 ELSE ${studentEmailChallenges.sendCount} + 1 END`,
      },
      setWhere: sql`${studentEmailChallenges.lastSentAt} < now() - interval '60 seconds' AND (${studentEmailChallenges.sendCount} < 5 OR ${studentEmailChallenges.windowStartedAt} < now() - interval '1 hour')`,
    })
    .returning({ userId: studentEmailChallenges.userId });
  if (!challenge)
    return {
      ok: false,
      message:
        "Please wait before requesting another code. You can request up to 5 per hour.",
    };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: sender,
      to: email,
      subject: "Your Instela student verification code",
      text: `Your Instela code is ${code}. It expires in 10 minutes.\n\nThis confirms access to your school inbox. Current enrollment must also be verified before a student discount is activated.\n\nIf you didn’t request this code, ignore this email.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    return {
      ok: false,
      message:
        "We couldn’t send your code. Please try again later or continue free.",
    };
  return { ok: true, message: "Code sent. Check your school inbox." };
}

export async function verifyStudentCode(userId: string, code: string) {
  if (!/^\d{6}$/.test(code))
    return {
      ok: false,
      message: "Enter the 6-digit code from your school inbox.",
    };
  const [challenge] = await db
    .update(studentEmailChallenges)
    .set({ attempts: sql`${studentEmailChallenges.attempts} + 1` })
    .where(
      and(
        eq(studentEmailChallenges.userId, userId),
        lt(studentEmailChallenges.attempts, 5),
        gt(studentEmailChallenges.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!challenge || !matchesStudentCode(code, challenge.codeHash))
    return {
      ok: false,
      message:
        "That code is incorrect or expired. Try again or request a new code.",
    };
  return db.transaction(async (tx) => {
    // Consume this exact challenge once. Concurrent verifications cannot both claim it.
    const consumed = await tx
      .delete(studentEmailChallenges)
      .where(
        and(
          eq(studentEmailChallenges.userId, userId),
          eq(studentEmailChallenges.codeHash, challenge.codeHash),
        ),
      )
      .returning();
    if (!consumed.length)
      return {
        ok: false,
        message: "That code has already been used. Request a new one.",
      };
    const [claim] = await tx
      .insert(studentDiscountClaims)
      .values({
        userId,
        schoolEmailHash: schoolEmailHash(challenge.email),
        schoolDomain: challenge.email.split("@")[1],
      })
      .onConflictDoNothing()
      .returning();
    if (!claim)
      return {
        ok: false,
        message:
          "This account or school email already has a student discount claim.",
      };
    return {
      ok: true,
      message:
        "School email verified. Your discount is reserved while current enrollment is verified.",
    };
  });
}
