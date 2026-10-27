import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Onboarding } from "./Onboarding";
import { getStudentClaim } from "@/lib/student-discount";
import "./onboarding.css";

export const metadata: Metadata = {
  title: "Your next chapter starts here | Instela",
};
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const messages: Record<string, string> = {
    verified: "Your university confirmed your student status.",
    failed: "University verification didn’t complete. Please try again.",
    "not-current-student":
      "Your university didn’t confirm current student status.",
    "already-claimed": "This student identity already has a discount claim.",
  };
  const user = await getSessionUser();
  const profile = user ? await getProfile(user.id) : null;
  const claim = user ? await getStudentClaim(user.id).catch(() => null) : null;
  const supabase = await createSupabaseServerClient();
  const { data } = user
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  return (
    <Onboarding
      email={user?.email ?? null}
      profile={profile}
      preferences={data.user?.user_metadata?.instelaOnboarding ?? null}
      studentClaimStatus={
        claim?.enrollmentStatus === "verified" && !claim.current
          ? "expired"
          : (claim?.enrollmentStatus ?? null)
      }
      verificationMessage={
        typeof params.student === "string"
          ? (messages[params.student] ?? "")
          : ""
      }
    />
  );
}
