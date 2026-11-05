import { getText, HttpError } from "./http";

/** Select crawler-specific groups, then the longest matching allow/disallow. */
export function robotsAllows(text: string, path: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let group: (typeof groups)[number] | undefined;
  let hasRules = false;
  for (const line of text.split(/\r?\n/)) {
    const match = line.split("#")[0].trim().match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, field, value] = match;
    if (field.toLowerCase() === "user-agent") {
      if (!group || hasRules) { group = { agents: [], rules: [] }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (/^(allow|disallow)$/i.test(field) && group) {
      hasRules = true;
      if (value) group.rules.push({ allow: field.toLowerCase() === "allow", path: value });
    }
  }
  const specific = groups.filter(g => g.agents.some(a => a && a !== "*" && "instela ingest".includes(a)));
  const applicable = specific.length ? specific : groups.filter(g => g.agents.includes("*"));
  let best = -1;
  let allowed = true;
  for (const rule of applicable.flatMap(g => g.rules)) {
    const pattern = rule.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const re = new RegExp(`^${pattern.replace(/\\\$$/, "$")}`);
    const length = rule.path.replace(/[*$]/g, "").length;
    if (re.test(path) && (length > best || (length === best && rule.allow))) { best = length; allowed = rule.allow; }
  }
  return allowed;
}

export async function checkPublicRobots(origin: string, paths: string[]): Promise<string> {
  let text: string;
  try { text = await getText(`${origin}/robots.txt`, { attempts: 1, timeoutMs: 15_000 }); }
  catch (e) { if (e instanceof HttpError && e.status === 404) return ""; throw e; }
  if (paths.some(path => !robotsAllows(text, path))) throw new Error("Public source path excluded by robots.txt");
  return text;
}
