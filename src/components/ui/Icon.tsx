import type { CSSProperties, ReactNode } from "react";

export type IconName = "explore" | "tracker" | "resume" | "tools" | "profile" | "arrow" | "check" | "search" | "filter" | "shield" | "github" | "linkedin" | "essay" | "extension" | "home" | "close" | "menu" | "chevron" | "bookmark" | "award" | "people" | "calendar" | "pin" | "external" | "flip" | "info" | "graduation";
const paths: Record<IconName, ReactNode> = {
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
  award: <><circle cx="12" cy="8" r="5" /><path d="m8 12-2 9 6-3 6 3-2-9M10 8h4" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-3-5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 17h2" /></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  external: <><path d="M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7" /></>,
  flip: <><path d="M4 9a8 8 0 0 1 15-2M4 4v5h5M20 15a8 8 0 0 1-15 2M20 20v-5h-5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  graduation: <><path d="m2 8 10-5 10 5-10 5ZM6 10v6c3 3 9 3 12 0v-6M22 8v9" /></>,
  explore: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" /></>,
  tracker: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16M5.5 8h1M11.5 12h1M17.5 8h1" /></>,
  resume: <><path d="M14 3H5v18h14V8Z" /><path d="M14 3v5h5M8 12h8M8 16h6" /></>,
  tools: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M17.5 14v7M14 17.5h7" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  filter: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" /><circle cx="15" cy="17" r="2" fill="currentColor" /></>,
  shield: <><path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
  github: <><path d="M9 21v-4c-4 1-4-2-6-2m12 6v-4c0-1-.5-2-1-2 4 0 7-2 7-6 0-2-1-3-2-4 0-1 0-2-.5-3-2 0-3 1-4 2a12 12 0 0 0-5 0C8 3 7 2 5 2c-.5 1-.5 2-.5 3C3 6 3 7 3 9c0 4 3 6 7 6-.5 0-1 1-1 2" /></>,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 10v7M7 7h.01M11 17v-7m0 3c0-4 6-4 6 0v4" /></>,
  essay: <path d="M13 4H4v17h17v-9M10 14l1-4 8-8 3 3-8 8Z" />,
  extension: <path d="M9 3H4v6a3 3 0 1 1 0 6v6h6a3 3 0 1 1 6 0h5v-6a3 3 0 1 1 0-6V3h-6a3 3 0 1 1-6 0Z" />,
  home: <path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  chevron: <path d="m9 5 7 7-7 7" />,
};
export function Icon({ name, size = 20, style, className }: { name: IconName; size?: number; style?: CSSProperties; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style} className={className}>{paths[name]}</svg>;
}
