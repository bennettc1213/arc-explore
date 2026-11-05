"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { editMemoryFact } from "@/app/memory/actions";
import { MEMORY_FIELDS, type MemoryFact, type MemoryKey } from "@/lib/profile/memory";

export function ApplicationMemory({ facts }: { facts: MemoryFact[] }) {
  const [editing, setEditing] = useState<MemoryKey | null>(null);
  const [answer, setAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  function save(key: MemoryKey, value: string | null) {
    startTransition(async () => {
      const result = await editMemoryFact({ key, value });
      setNotice(result.ok ? (value ? "Saved to your Instela profile." : "Removed from autofill memory. Your original resume is unchanged.") : result.error ?? "Could not save.");
      if (result.ok) setEditing(null);
    });
  }
  return <section id="application-memory" className="application-memory settings-section">
    <header className="memory-heading"><div><div className="eyebrow">YOUR INSTELA MEMORY</div><h2>Tell us once. Apply faster.</h2><p>The facts Instela can reuse on your applications. View, change, or remove any answer.</p></div><span className="memory-count">{facts.filter(f => f.value).length} saved details</span></header>
    <div className="memory-privacy"><ShieldCheck size={20} aria-hidden="true" /><p>Saved to your Instela account, so you stay in control. When you choose autofill, the answers used are shared with the application site. Questions about a specific employer or scholarship are not added to this profile. <Link href="/privacy">How your information is used</Link></p></div>
    {["Contact", "Education", "Links"].map(group => <section key={group} className="memory-fact-group"><h3>{group}</h3>{MEMORY_FIELDS.filter(f => f.group === group).map(field => {
      const fact = facts.find(f => f.key === field.key);
      return <div key={field.key} className="memory-fact-row"><div><strong>{field.label}</strong><span className="memory-source">{fact?.value ? `From ${fact.source === "memory" ? "your saved answers" : fact.source}` : "Not saved"}{fact?.updatedAt ? ` · updated ${fact.updatedAt.slice(0, 10)}` : ""}</span></div>{editing === field.key ? <form onSubmit={e => { e.preventDefault(); save(field.key, answer); }} className="memory-fact-form"><label className="sr-only" htmlFor={`memory-${field.key}`}>{field.label}</label><input id={`memory-${field.key}`} autoFocus value={answer} maxLength={500} onChange={e => setAnswer(e.target.value)} type={field.key === "email" ? "email" : field.key.endsWith("Url") ? "url" : "text"} /><button type="submit" className="btn" disabled={pending}><Check size={15} /> Save</button><button type="button" className="btn" disabled={pending} onClick={() => setEditing(null)}>Cancel</button></form> : <><span className="memory-fact-value">{fact?.value ?? "Add your answer"}</span><div className="memory-fact-actions"><button type="button" className="btn" aria-label={`Edit ${field.label}`} disabled={pending} onClick={() => { setEditing(field.key); setAnswer(fact?.value ?? ""); }}><Pencil size={15} /></button>{fact?.value && <button type="button" className="btn" aria-label={`Remove ${field.label} from autofill`} disabled={pending} onClick={() => save(field.key, null)}><Trash2 size={15} /></button>}</div></>}</div>;
    })}</section>)}
    <p role="status" className="t-sm">{pending ? "Saving…" : notice}</p>
    <p className="t-sm" style={{ color: "var(--muted)" }}>Instela also holds the resume details you uploaded, including skills, experience, and projects. <Link href="/resume">View and edit your resume details</Link>. Matching preferences and account settings are on <Link href="/profile#intake">your profile</Link>.</p>
  </section>;
}
