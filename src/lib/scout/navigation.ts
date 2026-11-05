/** Only Scout destinations may be carried through an opportunity URL. */
export function scoutReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/scout") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "https://instela.org");
    return url.origin === "https://instela.org" && url.pathname === "/scout" ? url.pathname + url.search : null;
  } catch { return null; }
}
