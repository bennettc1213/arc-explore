"use client";

import { useState } from "react";

export function BillingButton({ portal = false }: { portal?: boolean }) {
  const [loading, setLoading] = useState(false);
  async function openBilling() {
    setLoading(true);
    try {
      const response = await fetch(`/api/stripe/${portal ? "portal" : "checkout"}`, { method: "POST" });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? "Unable to open Stripe.");
      window.location.assign(body.url);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to open Stripe.");
      setLoading(false);
    }
  }
  return <button type="button" className="btn" style={{ marginTop: "auto", textAlign: "center" }} onClick={openBilling} disabled={loading}>{loading ? "opening secure checkout…" : portal ? "manage subscription" : "upgrade to Apply"}</button>;
}
