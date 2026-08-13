"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign out.
 *
 * A Server Action rather than a link, so it is a POST and cannot be triggered
 * by a third-party page embedding an image at our sign-out URL.
 */
export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
