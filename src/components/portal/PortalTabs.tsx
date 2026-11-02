import Link from "next/link";

/**
 * Home and Navigate, the portal's two pages. The caller says which one it is:
 * both are server pages that already know their own route, so reading the
 * pathname on the client for this would be a second source of the same fact.
 */
export function PortalTabs({ current }: { current: "home" | "navigate" }) {
  return (
    <nav className="portal-tabs" aria-label="Portal">
      <Link href="/portal" aria-current={current === "home" ? "page" : undefined}>
        Home
      </Link>
      <Link href="/portal/navigate" aria-current={current === "navigate" ? "page" : undefined}>
        Navigate
      </Link>
    </nav>
  );
}
