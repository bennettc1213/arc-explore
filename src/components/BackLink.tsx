import Link from "next/link";

/**
 * A back arrow link, consistent across every page.
 *
 * Server component — no client JS. The arrow is a plain Unicode character,
 * matching the existing inline pattern on the listing and apply pages.
 */
export function BackLink({
  href,
  label = "back",
}: {
  href: string;
  label?: string;
}) {
  return (
    <div className="print-hide" style={{ marginBottom: 24 }}>
      <Link
        href={href}
        className="mono chrome press"
        style={{ color: "var(--accent)", textDecoration: "none" }}
      >
        ← {label}
      </Link>
    </div>
  );
}
