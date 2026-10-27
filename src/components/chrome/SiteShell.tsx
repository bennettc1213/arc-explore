"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Mascot } from "./Mascot";
import { ToolsMenu } from "./ToolsMenu";

type ShellProps = { children: ReactNode; footer: ReactNode; signedIn: boolean; email: string | null; isAdmin: boolean; plan: string; dev: { forced: boolean; label: string | null } | null };
const workspaceLinks: { href: string; label: string; icon: IconName }[] = [
  { href: "/explore", label: "Explore", icon: "explore" },
  { href: "/tracker", label: "Application tracker", icon: "tracker" },
  { href: "/resume", label: "Resume", icon: "resume" },
];
const toolLinks: { href: string; label: string; icon: IconName }[] = [
  { href: "/github", label: "GitHub audit", icon: "github" },
  { href: "/linkedin", label: "LinkedIn tools", icon: "linkedin" },
  { href: "/essay", label: "Essay review", icon: "essay" },
  { href: "/extension", label: "Autofill extension", icon: "extension" },
];

export function SiteShell(props: ShellProps) {
  const pathname = usePathname();
  const workspace = [...workspaceLinks, ...toolLinks, { href: "/profile" }, { href: "/compare" }, { href: "/listing" }, { href: "/admin" }].some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  return <div className={workspace ? "site-shell workspace-shell" : "site-shell public-shell"}>
    <a className="skip-link" href="#page-content">Skip to content</a>
    {workspace ? <WorkspaceNavigation key={pathname} {...props} pathname={pathname} /> : <PublicNavigation key={pathname} {...props} />}
    <div className="site-content" id="page-content" tabIndex={-1}>{props.children}{workspace ? <footer className="workspace-footer"><span>Checked at the source. Your data is never sold.</span><div><Link href="/how-we-verify">How we verify</Link><Link href="/pricing">Pricing</Link><Link href="/privacy">Privacy</Link></div></footer> : props.footer}</div>
  </div>;
}
function Brand() {
  return <Link href="/" className="brand" aria-label="Instela home"><Mascot size={30} className="brand-mark" /><span className="brand-word">instela<span className="brand-period">.</span></span></Link>;
}
function DevMarker({ dev }: Pick<ShellProps, "dev">) {
  return dev ? <Link href="/dev" className={`dev-marker ${dev.forced ? "is-forced" : ""}`}>{dev.forced ? `Dev mode · ${dev.label} plan` : "Dev settings"}</Link> : null;
}
function PublicNavigation({ signedIn, plan, dev }: ShellProps) {
  const [open, setOpen] = useState(false);
  return <header className="public-header print-hide"><div className="wrap public-header-inner">
    <Brand />
    <nav aria-label="Main navigation" className="public-nav"><Link href="/explore">Explore</Link><ToolsMenu /><Link href="/pricing">{signedIn ? `${plan} plan` : "Pricing"}</Link><Link href="/how-we-verify">How we verify</Link></nav>
    <div className="public-header-actions"><DevMarker dev={dev} /><Link href={signedIn ? "/profile" : "/login"} className="header-signin">{signedIn ? "Your profile" : "Sign in"}</Link><Link href="/explore" className="btn btn-primary header-start">{signedIn ? "Open workspace" : "Get started"}<Icon name="arrow" size={16} /></Link></div>
    <button className="shell-menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="public-mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"}><Icon name={open ? "close" : "menu"} /></button>
  </div>{open && <nav className="public-mobile-menu" id="public-mobile-menu" aria-label="Mobile navigation"><Link href="/explore">Explore opportunities</Link>{toolLinks.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}<Link href="/pricing">Pricing</Link><Link href="/how-we-verify">How we verify</Link><Link href={signedIn ? "/profile" : "/login"}>{signedIn ? "Your profile" : "Sign in"}</Link><DevMarker dev={dev} /></nav>}</header>;
}
function WorkspaceNavigation({ pathname, signedIn, email, isAdmin, plan, dev }: ShellProps & { pathname: string }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function escape(e: KeyboardEvent) { if (e.key === "Escape") { setOpen(false); toggleRef.current?.focus(); } }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  const current = [...workspaceLinks, ...toolLinks, { href: "/profile", label: "Profile & settings" }, { href: "/compare", label: "Compare opportunities" }, { href: "/admin", label: "Administration" }].find(l => l.href === pathname)?.label ?? "Opportunity details";
  function navLink(l: { href: string; label: string; icon: IconName }) {
    const active = pathname === l.href || (l.href === "/explore" && pathname.startsWith("/listing/"));
    return <Link key={l.href} href={l.href} className={`sidebar-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}><Icon name={l.icon} size={18} /><span>{l.label}</span>{active && <span className="sidebar-active-dot" />}</Link>;
  }
  return <>
    <header className="workspace-topbar print-hide"><div className="workspace-breadcrumb"><span>Workspace</span><Icon name="chevron" size={13} /><span>{current}</span></div><div className="workspace-topbar-right"><Link href="/how-we-verify" className="source-assurance"><Icon name="shield" size={15} />Checked at the source</Link><DevMarker dev={dev} /><Link href={signedIn ? "/profile" : "/login"} className="account-avatar" aria-label={signedIn ? "Your profile" : "Sign in"}>{signedIn ? (email?.[0] ?? "S").toUpperCase() : <Icon name="profile" size={16} />}</Link><button ref={toggleRef} className="shell-menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="workspace-sidebar" aria-label={open ? "Close workspace navigation" : "Open workspace navigation"}><Icon name={open ? "close" : "menu"} /></button></div></header>
    {open && <button className="sidebar-backdrop print-hide" onClick={() => setOpen(false)} aria-label="Close workspace navigation" />}
    <aside className={`workspace-sidebar print-hide ${open ? "is-open" : ""}`} id="workspace-sidebar" aria-label="Workspace navigation"><div className="sidebar-brand"><Brand /><span className="workspace-tag">Workspace</span></div><nav aria-label="Workspace"><p className="sidebar-section-label">Discover & apply</p>{workspaceLinks.map(navLink)}<p className="sidebar-section-label tools-section-label">Your toolkit</p>{toolLinks.map(navLink)}{isAdmin && navLink({ href: "/admin", label: "Admin", icon: "tools" })}</nav><div className="sidebar-bottom"><div className="sidebar-plan"><span className="plan-icon"><Icon name="tools" size={17} /></span><div><strong>{plan}</strong><span>Your current plan</span></div><Link href="/pricing" aria-label="View plans"><Icon name="chevron" size={16} /></Link></div>{navLink({ href: "/profile", label: "Profile & settings", icon: "profile" })}<Link href="/" className="sidebar-link"><Icon name="home" size={18} />Back to home</Link>{!signedIn && <Link href="/login" className="btn btn-primary sidebar-signin">Sign in to save your progress<Icon name="arrow" size={16} /></Link>}<div className="sidebar-footnote">Every opportunity starts somewhere.</div></div></aside>
  </>;
}
