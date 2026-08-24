"use client";

import { signOut } from "@/app/auth/actions";
import { PendingButton } from "@/components/PendingButton";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <PendingButton type="submit" pendingLabel="signing out…" className="btn press">
        sign out
      </PendingButton>
    </form>
  );
}
