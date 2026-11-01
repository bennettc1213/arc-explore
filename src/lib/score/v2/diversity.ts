/** Alternate sponsors only inside contiguous groups of comparably supported matches. */
export function diversifyWithinGroups<T>(items: T[], groupOf: (item: T) => string, sponsorOf: (item: T) => string): T[] {
  const result: T[] = [];
  for (let start = 0; start < items.length;) {
    const group = groupOf(items[start]);
    let end = start + 1;
    while (end < items.length && groupOf(items[end]) === group) end++;
    const pending = items.slice(start, end);
    let previous = "", streak = 0;
    while (pending.length) {
      const alternative = streak >= 2 ? pending.findIndex(item => sponsorOf(item) !== previous) : 0;
      const index = alternative >= 0 ? alternative : 0;
      const [next] = pending.splice(index, 1);
      const sponsor = sponsorOf(next);
      streak = sponsor === previous ? streak + 1 : 1;
      previous = sponsor;
      result.push(next);
    }
    start = end;
  }
  return result;
}
