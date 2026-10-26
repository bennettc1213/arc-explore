/**
 * Join class names, skipping falsy ones.
 *
 * The shadcn convention is `cn = twMerge(clsx(...))`, which is two packages.
 * This project refuses dependencies without a reason that earns them, and the
 * only thing `twMerge` adds is resolving *conflicting* Tailwind utilities
 * (`p-2 p-4` → `p-4`). Nothing here passes conflicting utilities into a
 * component, and the one place that would matter — `.eyebrow` and friends
 * out-ranking Tailwind's display utilities — is a CSS source-order problem
 * twMerge cannot see anyway (FIXES.md §2, the mobile nav entry).
 *
 * So the signature matches shadcn's, and dropped-in components keep working.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
