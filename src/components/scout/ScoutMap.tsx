"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Radar, Database, Check, Building2, GraduationCap, Landmark, Globe2, BriefcaseBusiness, Activity } from "lucide-react";

// Representative discovery destinations, not a log of live provider requests.
const sources = [
  { label: "ASCE chapters", icon: Building2 },
  { label: "USAJOBS", icon: Landmark },
  { label: "CFT scholarships", icon: GraduationCap },
  { label: "Greenhouse", icon: BriefcaseBusiness },
  { label: "SAME chapters", icon: Building2 },
  { label: "UNL awards", icon: GraduationCap },
  { label: "Lever", icon: BriefcaseBusiness },
  { label: "SWE scholarships", icon: GraduationCap },
  { label: "Ashby", icon: Database },
  { label: "Water districts", icon: Globe2 },
  { label: "UNR scholarships", icon: GraduationCap },
  { label: "Tau Beta Pi", icon: Building2 },
  { label: "SmartRecruiters", icon: BriefcaseBusiness },
  { label: "IUP awards", icon: GraduationCap },
  { label: "State DOTs", icon: Landmark },
  { label: "Scholarships.com", icon: Database },
  { label: "Local foundations", icon: Landmark },
  { label: "Public works", icon: Building2 },
  { label: "University awards", icon: GraduationCap },
  { label: "Sponsor pages", icon: Globe2 },
];
const desktop = [
  [12, 12], [37, 9], [63, 12], [88, 9],
  [13, 29], [37, 26], [63, 29], [88, 26],
  [12, 44], [88, 44], [12, 60], [88, 60],
  [13, 76], [37, 73], [63, 76], [88, 73],
  [12, 91], [37, 90], [63, 91], [88, 90],
];
const mobile = [
  [17, 7], [50, 7], [83, 7], [17, 18], [50, 18], [83, 18],
  [17, 29], [50, 29], [83, 29], [17, 42], [83, 42],
  [17, 57], [83, 57], [17, 71], [50, 71], [83, 71],
  [17, 82], [50, 82], [83, 82], [50, 93],
];

function pipeline([x, y]: number[], index: number) {
  const side = x < 50 ? -1 : 1;
  const rail = x === 50 ? (index % 2 ? 58 : 42) : side < 0 ? 29 + index % 3 * 3 : 71 - index % 3 * 3;
  return `M ${x} ${y} H ${rail} V ${index % 2 ? 53 : 47} H 50 V 50`;
}

export function ScoutMap({ active = false, field = "" }: { active?: boolean; field?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick(t => Math.min(t + 1, 44)), 250);
    return () => clearInterval(timer);
  }, [active]);
  const state = (i: number) => !active || tick < i * 2 + 1 ? "waiting" : tick < i * 2 + 4 ? "connecting" : "connected";
  const engineering = /engineer|construction|infrastructure|water|structur|transport/i.test(field);
  const health = /nurs|health|medic|pharma|dental/i.test(field);
  const education = /teach|education|pedagog/i.test(field);
  const labels: Record<number, string> = engineering ? {} : {
    0: health ? "Health associations" : education ? "Educator associations" : "Professional societies",
    4: "Local chapters",
    7: health ? "Nursing foundations" : education ? "Teaching fellowships" : "Field-specific awards",
    9: health ? "Hospital careers" : education ? "School districts" : "Regional employers",
    11: "Honor societies",
    14: health ? "Public health roles" : education ? "State education roles" : "State agencies",
    17: health ? "Community clinics" : education ? "Community programs" : "Public service roles",
  };
  return <div className={`scout-network ${active ? "is-searching" : ""}`} aria-label="Illustrated discovery network">
    <div className="scout-network-top"><span><Activity size={12} /> DISCOVERY NETWORK</span><span>{active ? "BUILDING YOUR SEARCH" : "READY WHEN YOU ARE"}</span></div>
    <div className="scout-network-diagram">
      {[desktop, mobile].map((positions, layout) => <svg key={layout} className={`scout-pipelines ${layout ? "mobile-pipelines" : "desktop-pipelines"}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{positions.map((point, i) => <g key={i} className={state(i)}><path className="pipeline-track" d={pipeline(point, i)} /><path className="pipeline-signal" pathLength="1" d={pipeline(point, i)} /></g>)}</svg>)}
      {sources.map((source, i) => <div key={source.label} className={`scout-source ${state(i)} ${active && tick < i * 2 - 5 ? "not-reached" : ""}`} style={{ "--source-x": `${desktop[i][0]}%`, "--source-y": `${desktop[i][1]}%`, "--mobile-x": `${mobile[i][0]}%`, "--mobile-y": `${mobile[i][1]}%` } as CSSProperties}><source.icon size={16} /><span>{labels[i] ?? source.label}</span><Check className="source-check" size={10} /></div>)}
      <div className="scout-network-core"><Radar size={28} /><strong>Your Scout</strong><span>{active ? "Making connections" : "Ready to discover"}</span></div>
    </div>
    <div className="scout-network-bottom"><span className="scout-network-light" /><span>Discovery network preview</span><span>{active ? `${sources.filter((_, i) => state(i) === "connected").length} / ${sources.length} paths mapped` : `${sources.length} discovery paths`}</span></div>
  </div>;
}
