/**
 * GitHub profile audit — deterministic, no model call.
 *
 * Same doctrine as `resume/critique.ts`: every finding is something we counted
 * off a real API response, and a check we could not run is dropped from the
 * average rather than scored as a failure. The difference is where the evidence
 * comes from — the resume critique reads a document a student handed us, and
 * this reads github.com.
 *
 * WHAT RECRUITERS ACTUALLY OPEN, WHICH IS WHAT THIS GRADES. A recruiter who
 * clicks the GitHub link on a resume lands on the profile page and spends
 * somewhere under a minute. What is on that page is: the README (or nothing),
 * the sidebar identity, and a list of repository names with their descriptions.
 * If they click through, they land in one repo and either find a README that
 * explains what it is or they leave. Those are the four things scored below.
 *
 * WHAT THIS DELIBERATELY DOES NOT GRADE. The contribution graph. It is
 * GraphQL-only, so an unauthenticated audit cannot read it — and grading it
 * would be advice to farm green squares, which is the one GitHub metric
 * recruiters have learned to discount. Activity here is measured from real push
 * timestamps and the public events feed, over a window we state rather than
 * assume. Pinned repositories are likewise unreadable without auth, so they are
 * *recommended* from the public repo list and never scored.
 */

import {
  originalRepos,
  rankShowcaseRepos,
  type GhRepo,
  type GhSnapshot,
} from "./types";

export type AuditSection = "profile_readme" | "identity" | "repos" | "activity";

export type DimensionKey =
  | "profile_readme"
  | "profile_basics"
  | "repo_descriptions"
  | "showcase"
  | "activity";

export interface Finding {
  section: AuditSection;
  dimension: DimensionKey;
  severity: "high" | "medium" | "low";
  title: string;
  /** Always an instruction, never a diagnosis. */
  fix: string;
  /** The specific thing we counted — repo names, a quoted line. */
  evidence?: string;
}

export interface AuditDimension {
  key: DimensionKey;
  label: string;
  /** 0–100, or null when there was nothing to assess. */
  score: number | null;
  /** What we counted, so the number is auditable rather than asserted. */
  detail: string;
  weight: number;
}

export interface PinRecommendation {
  name: string;
  url: string;
  /** Why this one, stated in terms of what we counted. */
  reason: string;
  /** What it is missing before it is worth the slot. */
  gaps: string[];
}

export interface GitHubAudit {
  username: string;
  profileUrl: string;
  score: number | null;
  dimensions: AuditDimension[];
  findings: Finding[];
  knownDimensions: number;
  totalDimensions: number;
  /** Up to six, because that is how many slots GitHub gives you. */
  recommendedPins: PinRecommendation[];
  /** Verbatim from the snapshot — what we could not read, and why. */
  skipped: string[];
  fetchedAt: Date;
}

/* ------------------------------------------------------------------ *
 * Profile README
 * ------------------------------------------------------------------ */

/**
 * Fragments of GitHub's own starter template, left unedited.
 *
 * This is worth its own check because it is common and because it is worse than
 * having no README at all: an empty profile reads as unfinished, while a
 * profile that says "🔭 I'm currently working on ..." reads as someone who
 * clicked a button and walked away. The apostrophes are the curly ones GitHub
 * actually emits.
 */
const TEMPLATE_MARKERS: Array<{ re: RegExp; label: string }> = [
  { re: /is a ✨\s*_?special_?\s*✨ repository/i, label: "the ✨ special ✨ repository comment" },
  { re: /Here are some ideas to get you started/i, label: '"Here are some ideas to get you started"' },
  { re: /I['’]m currently working on \.\.\./i, label: "“I’m currently working on ...”" },
  { re: /I['’]m currently learning \.\.\./i, label: "“I’m currently learning ...”" },
  { re: /I['’]m looking to collaborate on \.\.\./i, label: "“I’m looking to collaborate on ...”" },
  { re: /How to reach me: \.\.\./i, label: "“How to reach me: ...”" },
];

export function templateRemnants(readme: string): string[] {
  return TEMPLATE_MARKERS.filter((m) => m.re.test(readme)).map((m) => m.label);
}

/** Strips HTML comments and badge images before measuring how much a README says. */
export function readmeProse(readme: string): string {
  return readme
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_README_PROSE = 200;

export function hasContactPath(readme: string): boolean {
  return /\bmailto:|\bhttps?:\/\/|\blinkedin\.com|\[[^\]]+\]\([^)]+\)/i.test(readme);
}

interface Assessed {
  dimension: AuditDimension;
  findings: Finding[];
}

function assessProfileReadme(snap: GhSnapshot): Assessed {
  const findings: Finding[] = [];
  const username = snap.user.login;
  const readme = snap.profileReadme;

  if (!readme) {
    findings.push({
      section: "profile_readme",
      dimension: "profile_readme",
      severity: "high",
      title: snap.hasProfileRepo
        ? `The ${username}/${username} repository exists but has no README`
        : "You have no profile README",
      fix: `Create a public repository named exactly “${username}” — GitHub renders its README.md at the top of github.com/${username}. Without one, the first thing a recruiter sees is a list of repository names. Four or five lines is enough: what you build, what you are studying, what you are looking for, and how to reach you.`,
    });
    return {
      dimension: {
        key: "profile_readme",
        label: "profile README",
        score: 0,
        detail: `github.com/${username} renders no README.`,
        weight: 25,
      },
      findings,
    };
  }

  const checks: Array<{ ok: boolean }> = [];

  const remnants = templateRemnants(readme);
  checks.push({ ok: remnants.length === 0 });
  if (remnants.length > 0) {
    findings.push({
      section: "profile_readme",
      dimension: "profile_readme",
      severity: "high",
      title: "Your profile README still contains GitHub's starter template",
      fix: "Delete the template lines and write your own. Unedited placeholder text is read as abandonment — it is worse for you than an empty profile, because it shows the page was started and left.",
      evidence: remnants.join(", "),
    });
  }

  const prose = readmeProse(readme);
  const longEnough = prose.length >= MIN_README_PROSE;
  checks.push({ ok: longEnough });
  if (!longEnough) {
    findings.push({
      section: "profile_readme",
      dimension: "profile_readme",
      severity: "medium",
      title: `Your profile README is ${prose.length} characters of actual text`,
      fix: "Say what you build, what you are studying and what you are looking for. Badges and banners do not count here — we measured the words after stripping images and comments, because that is what a reader is left with.",
    });
  }

  const contact = hasContactPath(readme);
  checks.push({ ok: contact });
  if (!contact) {
    findings.push({
      section: "profile_readme",
      dimension: "profile_readme",
      severity: "medium",
      title: "Your profile README has no link and no way to contact you",
      fix: "Add your email, LinkedIn, or a portfolio link. A recruiter who has read the page and wants to talk to you should not have to go looking.",
    });
  }

  // Does it name any technology the student's own repos are actually written in?
  const languages = [...new Set(originalRepos(snap.repos).map((r) => r.language).filter(Boolean))] as string[];
  const namesTech =
    languages.length === 0 || languages.some((l) => new RegExp(`\\b${escapeRe(l)}\\b`, "i").test(readme));
  checks.push({ ok: namesTech });
  if (!namesTech) {
    findings.push({
      section: "profile_readme",
      dimension: "profile_readme",
      severity: "low",
      title: "Your README does not mention any language your repositories are written in",
      fix: `Your public repos are written in ${languages.slice(0, 4).join(", ")}. Naming your stack in the README is what makes the page answer “what does this person do” in one line instead of requiring someone to open your repos and infer it.`,
      evidence: languages.slice(0, 6).join(", "),
    });
  }

  const passed = checks.filter((c) => c.ok).length;
  return {
    dimension: {
      key: "profile_readme",
      label: "profile README",
      score: Math.round((passed / checks.length) * 100),
      detail: `${passed} of ${checks.length} checks passed on ${prose.length} characters of text.`,
      weight: 25,
    },
    findings,
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "1 … has" / "3 … have". Findings count real things, so they read as counts. */
function verb(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/* ------------------------------------------------------------------ *
 * Sidebar identity
 * ------------------------------------------------------------------ */

/**
 * The three sidebar fields that survive being seen for two seconds.
 *
 * Location and company are excluded on purpose: a student usually has neither
 * in a form worth stating, and marking their absence as a defect would be
 * inventing a standard rather than reporting one.
 */
function assessProfileBasics(snap: GhSnapshot): Assessed {
  const findings: Finding[] = [];
  const u = snap.user;
  const checks = [Boolean(u.name), Boolean(u.bio), Boolean(u.blog)];

  if (!u.name) {
    findings.push({
      section: "identity",
      dimension: "profile_basics",
      severity: "high",
      title: "Your account has no display name",
      fix: `Set your real name in profile settings. A recruiter matching this account to the resume in front of them currently has only the handle “${u.login}” to go on.`,
    });
  }
  if (!u.bio) {
    findings.push({
      section: "identity",
      dimension: "profile_basics",
      severity: "medium",
      title: "Your account has no bio",
      fix: "One line, under 160 characters, in the sidebar: what you study and what you build. It is the only text that appears next to your name in GitHub search results.",
    });
  }
  if (!u.blog) {
    findings.push({
      section: "identity",
      dimension: "profile_basics",
      severity: "low",
      title: "No website link on your profile",
      fix: "Point it at a portfolio, a LinkedIn profile, or your best project's live URL. It is a clickable field in the sidebar and it is empty.",
    });
  }

  const passed = checks.filter(Boolean).length;
  return {
    dimension: {
      key: "profile_basics",
      label: "sidebar identity",
      score: Math.round((passed / checks.length) * 100),
      detail: `${passed} of ${checks.length} sidebar fields are set (name, bio, website).`,
      weight: 10,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Repository descriptions
 * ------------------------------------------------------------------ */

function assessRepoDescriptions(snap: GhSnapshot): Assessed {
  const findings: Finding[] = [];

  const own = originalRepos(snap.repos);
  const listed = own.filter((r) => !r.isArchived && !r.isEmpty);

  const empties = own.filter((r) => r.isEmpty);
  if (empties.length > 0) {
    findings.push({
      section: "repos",
      dimension: "repo_descriptions",
      severity: empties.length > 2 ? "medium" : "low",
      title: `${empties.length} of your public repositories ${empties.length === 1 ? "is" : "are"} empty`,
      fix: "Delete them or make them private. An empty repository on a public profile is a name with nothing behind it, and it dilutes the list a recruiter is scanning.",
      evidence: empties.slice(0, 4).map((r) => r.name).join(", "),
    });
  }

  if (listed.length === 0) {
    return {
      dimension: {
        key: "repo_descriptions",
        label: "repo descriptions",
        score: null,
        detail: "No original public repositories with content to assess.",
        weight: 20,
      },
      findings,
    };
  }

  const described = listed.filter((r) => r.description);
  const missing = listed.filter((r) => !r.description);

  if (missing.length > 0) {
    findings.push({
      section: "repos",
      dimension: "repo_descriptions",
      severity: missing.length > listed.length / 2 ? "high" : "medium",
      title: `${missing.length} of your ${listed.length} repositories ${verb(missing.length, "has", "have")} no description`,
      fix: "Add one sentence to each from the repo's own page — what it does and what it is built with. The description is the only text under a repo name on your profile and in search results, so a repo without one is a filename.",
      evidence: missing.slice(0, 5).map((r) => r.name).join(", "),
    });
  }

  const forks = snap.repos.filter((r) => r.isFork);
  if (forks.length > 0 && forks.length >= listed.length) {
    findings.push({
      section: "repos",
      dimension: "repo_descriptions",
      severity: "medium",
      title: `${forks.length} of your ${snap.repos.length} public repositories are forks of other people's work`,
      fix: "Unfork or hide the ones you did not contribute to. A profile where forks outnumber original work reads as a collection rather than a body of work — and forks you never pushed to add nothing a recruiter can attribute to you.",
    });
  }

  return {
    dimension: {
      key: "repo_descriptions",
      label: "repo descriptions",
      score: Math.round((described.length / listed.length) * 100),
      detail: `${described.length} of ${listed.length} original repositories carry a description.`,
      weight: 20,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Showcase repositories
 * ------------------------------------------------------------------ */

const SHOWCASE_LIMIT = 5;

/**
 * The repos a recruiter is most likely to open, graded on whether opening one
 * teaches them anything.
 *
 * README presence is the check that matters and it is also the expensive one —
 * a request per repo against a budget of sixty an hour — so the snapshot may
 * only have managed some of them. Those are scored; the rest are not counted
 * either way, and the audit says so.
 */
function assessShowcase(snap: GhSnapshot): Assessed {
  const findings: Finding[] = [];
  const showcase = rankShowcaseRepos(snap.repos).slice(0, SHOWCASE_LIMIT);

  if (showcase.length === 0) {
    return {
      dimension: {
        key: "showcase",
        label: "project depth",
        score: null,
        detail: "No original, non-empty public repositories to open.",
        weight: 25,
      },
      findings: [
        {
          section: "repos",
          dimension: "showcase",
          severity: "high",
          title: "There is no project here for a recruiter to open",
          fix: "Push two or three things you have actually built, each with a README that says what it does and how to run it. For a first internship this is the part of the profile that does the work.",
        },
      ],
    };
  }

  const checks: boolean[] = [];

  const checkedForReadme = showcase.filter((r) => snap.readmePresence[r.name] !== undefined);
  const withoutReadme = checkedForReadme.filter((r) => !snap.readmePresence[r.name]);
  for (const r of checkedForReadme) checks.push(Boolean(snap.readmePresence[r.name]));

  if (withoutReadme.length > 0) {
    findings.push({
      section: "repos",
      dimension: "showcase",
      severity: "high",
      title: `${withoutReadme.length} of your ${checkedForReadme.length} most visible ${verb(checkedForReadme.length, "project", "projects")} ${verb(withoutReadme.length, "has", "have")} no README`,
      fix: "Add a README.md with what it does, a screenshot or a live link, how to run it, and what you would do next. A repository with no README asks a recruiter to read your source code to find out what it is, and they will not.",
      evidence: withoutReadme.map((r) => r.name).join(", "),
    });
  }

  const withoutTopics = showcase.filter((r) => r.topics.length === 0);
  for (const r of showcase) checks.push(r.topics.length > 0);

  if (withoutTopics.length > 0) {
    findings.push({
      section: "repos",
      dimension: "showcase",
      severity: "low",
      title: `${withoutTopics.length} of your ${showcase.length} top ${verb(showcase.length, "project", "projects")} ${verb(withoutTopics.length, "has", "have")} no topics`,
      fix: "Add three or four topic tags per repo from the repo page. They are how GitHub search surfaces a project to someone who was not already looking at your profile.",
      evidence: withoutTopics.map((r) => r.name).join(", "),
    });
  }

  if (checks.length === 0) {
    return {
      dimension: {
        key: "showcase",
        label: "project depth",
        score: null,
        detail: "We had no budget left to open these repositories.",
        weight: 25,
      },
      findings,
    };
  }

  const passed = checks.filter(Boolean).length;
  const readmeNote =
    checkedForReadme.length === showcase.length
      ? ""
      : ` READMEs checked on ${checkedForReadme.length} of ${showcase.length}.`;

  return {
    dimension: {
      key: "showcase",
      label: "project depth",
      score: Math.round((passed / checks.length) * 100),
      detail: `${passed} of ${checks.length} checks passed across your ${showcase.length} most visible repositories.${readmeNote}`,
      weight: 25,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Activity
 * ------------------------------------------------------------------ */

const DAY = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY);
}

/** Distinct UTC dates on which anything happened, from the events feed. */
export function activeDays(events: Array<{ createdAt: Date }>): number {
  return new Set(events.map((e) => e.createdAt.toISOString().slice(0, 10))).size;
}

/**
 * Recency tiers.
 *
 * Deliberately coarse. The honest claim is "this account looks alive" or "this
 * account looks abandoned", and a finer curve would imply a precision that
 * pushing on a Tuesday rather than a Thursday does not carry.
 */
function recencyScore(days: number): number {
  if (days <= 14) return 100;
  if (days <= 45) return 80;
  if (days <= 90) return 60;
  if (days <= 180) return 35;
  return 10;
}

function assessActivity(snap: GhSnapshot): Assessed {
  const findings: Finding[] = [];
  const own = originalRepos(snap.repos);
  const pushes = own.map((r) => r.pushedAt).filter((d): d is Date => d !== null);

  if (pushes.length === 0) {
    return {
      dimension: {
        key: "activity",
        label: "recent activity",
        score: null,
        detail: "No push timestamps on any original repository.",
        weight: 20,
      },
      findings,
    };
  }

  const latest = new Date(Math.max(...pushes.map((d) => d.getTime())));
  const since = Math.max(0, daysBetween(latest, snap.fetchedAt));

  if (since > 180) {
    findings.push({
      section: "activity",
      dimension: "activity",
      severity: "high",
      title: `Nothing has been pushed to any repository in ${since} days`,
      fix: "Push something. A profile that has been still for six months reads as abandoned, and the link on your resume is then evidence against you rather than for you — one commit a week to one project is enough to fix it.",
    });
  } else if (since > 90) {
    findings.push({
      section: "activity",
      dimension: "activity",
      severity: "medium",
      title: `Your most recent push was ${since} days ago`,
      fix: "Get one project moving again before you send this link out. The gap is visible on the profile page without anyone having to look for it.",
    });
  }

  /*
   * The burst pattern.
   *
   * Several repositories created within days of each other is what a course
   * project or a portfolio weekend looks like, and it is worth naming because
   * the fix is small: keep pushing to one of them. This is stated as the fact
   * we counted rather than as a diagnosis of why — we do not know why.
   */
  const created = own.map((r) => r.createdAt).filter((d): d is Date => d !== null);
  if (created.length >= 3) {
    const first = Math.min(...created.map((d) => d.getTime()));
    const last = Math.max(...created.map((d) => d.getTime()));
    const spread = Math.round((last - first) / DAY);
    if (spread <= 7) {
      findings.push({
        section: "activity",
        dimension: "activity",
        severity: "low",
        title: `All ${created.length} of your repositories were created within ${spread === 0 ? "the same day" : `${spread} days`}`,
        fix: "Keep one of them moving over the next few months. A profile where everything appears at once and stops reads as a requirement someone completed; the same repos with commits spread over a term read as work you do.",
      });
    }
  }

  let detail = `Last push ${since} day${since === 1 ? "" : "s"} ago, across ${own.length} original ${own.length === 1 ? "repository" : "repositories"}.`;
  if (snap.events && snap.eventsWindowDays) {
    const days = activeDays(snap.events);
    detail += ` Active on ${days} distinct day${days === 1 ? "" : "s"} in the ${snap.eventsWindowDays}-day window your public event feed covers.`;
  }

  return {
    dimension: {
      key: "activity",
      label: "recent activity",
      score: recencyScore(since),
      detail,
      weight: 20,
    },
    findings,
  };
}

/* ------------------------------------------------------------------ *
 * Pinned-repo recommendations
 * ------------------------------------------------------------------ */

/** GitHub gives you six pinned slots. */
const PIN_SLOTS = 6;

function pinReason(repo: GhRepo, now: Date): string {
  if (repo.stars > 0) {
    return `${repo.stars} star${repo.stars === 1 ? "" : "s"} — the only signal on your profile that is not your own assertion`;
  }
  if (repo.pushedAt) {
    const days = Math.max(0, daysBetween(repo.pushedAt, now));
    if (days <= 30) {
      return `pushed ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`} — your most current work`;
    }
  }
  return "an original, non-empty repository";
}

/**
 * What to pin, and what each one still needs first.
 *
 * A recommendation rather than an audit: pinned items are GraphQL-only and
 * GraphQL requires auth, so we cannot see what is pinned today and will not
 * pretend to. The ranking is the same one the showcase dimension grades, so a
 * repo can never be recommended for a slot and graded as invisible.
 */
export function recommendPins(snap: GhSnapshot): PinRecommendation[] {
  const now = snap.fetchedAt;
  return rankShowcaseRepos(snap.repos)
    .slice(0, PIN_SLOTS)
    .map((repo) => {
      const gaps: string[] = [];
      if (!repo.description) gaps.push("no description");
      if (snap.readmePresence[repo.name] === false) gaps.push("no README");
      if (repo.topics.length === 0) gaps.push("no topics");
      return { name: repo.name, url: repo.htmlUrl, reason: pinReason(repo, now), gaps };
    });
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

const SEVERITY_RANK: Record<Finding["severity"], number> = { high: 0, medium: 1, low: 2 };

export function auditGitHub(snap: GhSnapshot): GitHubAudit {
  const assessed = [
    assessProfileReadme(snap),
    assessProfileBasics(snap),
    assessRepoDescriptions(snap),
    assessShowcase(snap),
    assessActivity(snap),
  ];

  const dimensions = assessed.map((a) => a.dimension);
  const scored = dimensions.filter((d) => d.score !== null);
  const totalWeight = scored.reduce((s, d) => s + d.weight, 0);
  const score =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((s, d) => s + d.weight * (d.score as number), 0) / totalWeight);

  // Ordered by how much fixing each one moves the number, exactly as the resume
  // critique orders its findings — headroom left in a dimension, weighted by
  // how much that dimension counts, then severity within it.
  const headroom = new Map<DimensionKey, number>(
    dimensions.map((d) => [d.key, d.score === null ? 0 : ((100 - d.score) / 100) * d.weight]),
  );

  const findings = assessed
    .flatMap((a) => a.findings)
    .sort(
      (a, b) =>
        (headroom.get(b.dimension) ?? 0) - (headroom.get(a.dimension) ?? 0) ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );

  return {
    username: snap.user.login,
    profileUrl: snap.user.htmlUrl,
    score,
    dimensions,
    findings,
    knownDimensions: scored.length,
    totalDimensions: dimensions.length,
    recommendedPins: recommendPins(snap),
    skipped: snap.skipped,
    fetchedAt: snap.fetchedAt,
  };
}
