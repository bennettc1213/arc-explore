/** Retain the shard and case-sensitive site; a tenant can have several boards. */
export function workdayBoardFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.port || u.username || u.password) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    // Workday's second public hostname encodes the tenant in the path.
    if (/^wd\d+\.myworkdaysite\.com$/.test(u.hostname) && parts[0] === "recruiting" && /^[a-z0-9-]+$/.test(parts[1] ?? "") && /^[a-zA-Z0-9_-]+$/.test(parts[2] ?? "")) {
      return `${parts[1]}.${u.hostname.split(".")[0]}.myworkdayjobs.com/${parts[2]}`;
    }
    if (!/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(u.hostname)) return null;
    if (/^[a-z]{2}-[a-z]{2}$/i.test(parts[0] ?? "")) parts.shift();
    const site = parts[0];
    if (!site || !/^[a-zA-Z0-9_-]+$/.test(site) || site === "job" || site === "wday") return null;
    return `${u.hostname}/${site}`;
  } catch { return null; }
}

export function parseWorkdayBoard(slug: string) {
  const canonical = workdayBoardFromUrl(`https://${slug}`);
  if (!canonical || canonical !== slug) throw new Error("Invalid Workday board: expected tenant.wdN.myworkdayjobs.com/site");
  const [host, site] = slug.split("/");
  const origin = `https://${host}`;
  return { origin, site, tenant: host.split(".")[0], api: `${origin}/wday/cxs/${host.split(".")[0]}/${site}` };
}

/** Read the public shell's internal tenant without changing stable source ids. */
export function workdayApiFromShell(slug: string, html: string): string {
  const board = parseWorkdayBoard(slug);
  const tenant = html.match(/\btenant:\s*"([a-z0-9_-]+)"/)?.[1];
  const site = html.match(/\bsiteId:\s*"([a-zA-Z0-9_-]+)"/)?.[1];
  if (!tenant || tenant.replaceAll("_", "-") !== board.tenant || site !== board.site) {
    throw new Error("Workday public configuration does not match board");
  }
  return `${board.origin}/wday/cxs/${tenant}/${site}`;
}
