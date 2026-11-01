"use client";

import { useState } from "react";
import { STATUSES } from "@/lib/applications/types";
import type { ApplicationStatus } from "@/db/schema";
import { ApplicationCard, type CardApplication } from "./ApplicationCard";

export function TrackerList({ apps }: { apps: CardApplication[] }) {
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const visible = filter === "all" ? apps : apps.filter(app => app.status === filter);
  return <div className="tracker-list"><div className="tracker-toolbar"><div className="tracker-status-tabs" role="group" aria-label="Filter applications by status"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All applications<span>{apps.length}</span></button>{STATUSES.filter(s => apps.some(a => a.status === s.value)).map(s => <button type="button" key={s.value} aria-pressed={filter === s.value} onClick={() => setFilter(s.value)}>{s.label}<span>{apps.filter(a => a.status === s.value).length}</span></button>)}</div><label className="tracker-status-select">Status<select className="field" value={filter} onChange={e => setFilter(e.target.value as ApplicationStatus | "all")}><option value="all">All applications</option>{STATUSES.map(s => <option value={s.value} key={s.value}>{s.label}</option>)}</select></label></div><p className="tracker-result-count" aria-live="polite">{visible.length} application{visible.length === 1 ? "" : "s"}</p>{visible.length ? visible.map(app => <ApplicationCard key={app.id} app={app} />) : <div className="slot">No applications in this stage yet.</div>}</div>;
}
