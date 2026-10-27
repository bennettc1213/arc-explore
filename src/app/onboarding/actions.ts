"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { createStudentSSOClient } from "@/lib/supabase/student-sso";
import { studentSSOProviders } from "@/lib/student-sso-config";
import { getSiteOrigin } from "@/lib/site-url";
import { getSessionUser } from "@/lib/auth";
import { onboardingSchema } from "@/lib/onboarding";
import { requestStudentCode, verifyStudentCode } from "@/lib/student-discount";
import { saveProfile } from "@/lib/profile/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function finishOnboarding(
  input: unknown,
): Promise<{ ok: boolean; message?: string; needsLogin?: boolean }> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Please check your answers.",
    };
  const user = await getSessionUser();
  if (!user)
    return {
      ok: false,
      needsLogin: true,
      message: "Verify your email to save these answers to your account.",
    };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        instelaOnboarding: {
          goals: parsed.data.goals,
          education: parsed.data.education,
          degree: parsed.data.degree,
          completedAt: new Date().toISOString(),
        },
      },
    });
    if (error)
      return {
        ok: false,
        message: "We couldn't save your preferences. Please try again.",
      };
    await saveProfile(user.id, parsed.data.profile);
    revalidatePath("/profile");
    revalidatePath("/explore");
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "We couldn't save your profile. Your draft is still here; please try again.",
    };
  }
}

export async function checkStudentEmail(email: string) {
  const user = await getSessionUser();
  if (!user)
    return {
      ok: false,
      message: "Sign in before verifying your school email.",
    };
  if (typeof email !== "string")
    return { ok: false, message: "Enter your school email." };
  try {
    return await requestStudentCode(user.id, email);
  } catch {
    return {
      ok: false,
      message:
        "Student verification is temporarily unavailable. You can continue free.",
    };
  }
}

export async function confirmStudentEmail(code: string) {
  const user = await getSessionUser();
  if (!user)
    return {
      ok: false,
      message: "Sign in before verifying your school email.",
    };
  if (typeof code !== "string")
    return { ok: false, message: "Enter your verification code." };
  try {
    return await verifyStudentCode(user.id, code);
  } catch {
    return {
      ok: false,
      message: "We couldn’t verify that code. Please try again.",
    };
  }
}

export async function startStudentSSO(
  rawEmail: string,
): Promise<{ ok: boolean; message?: string; url?: string }> {
  const owner = await getSessionUser();
  if (!owner)
    return { ok: false, message: "Sign in to verify your student status." };
  if (
    typeof rawEmail !== "string" ||
    rawEmail.length > 254 ||
    !/^[^@\s]+@[^@\s]+$/.test(rawEmail.trim())
  )
    return { ok: false, message: "Enter your school email." };
  const domain = rawEmail.trim().toLowerCase().split("@")[1];
  const provider = studentSSOProviders().find((p) =>
    p.domains.includes(domain),
  );
  if (!provider)
    return {
      ok: false,
      message:
        "University sign-in isn’t connected for your school yet. You can continue free.",
    };
  const secret =
    process.env.STUDENT_SSO_STATE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    return {
      ok: false,
      message: "Student sign-in is temporarily unavailable.",
    };
  try {
    const client = await createStudentSSOClient();
    const origin = await getSiteOrigin();
    const { data, error } = await client.auth.signInWithSSO({
      providerId: provider.providerId,
      options: { redirectTo: `${origin}/auth/student/callback` },
    });
    if (error || !data?.url)
      return {
        ok: false,
        message: "Couldn’t start university sign-in. Please try again later.",
      };
    const encoded = Buffer.from(
      JSON.stringify({
        owner: owner.id,
        providerId: provider.providerId,
        createdAt: Date.now(),
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", secret)
      .update(encoded)
      .digest("hex");
    (await cookies()).set(
      "instela-student-sso-flow",
      `${encoded}.${signature}`,
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/auth/student",
        maxAge: 600,
      },
    );
    return { ok: true, url: data.url };
  } catch {
    return {
      ok: false,
      message: "Student sign-in is temporarily unavailable.",
    };
  }
}
