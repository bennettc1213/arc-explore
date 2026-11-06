"use client";

import { useActionState } from "react";
import { EmbeddedApplyFrame } from "./EmbeddedApplyFrame";
import { markAppliedAction, type ApplyActionState } from "./actions";

const IDLE: ApplyActionState = { status: "idle" };
export function ApplicationWorkspace({ postingId, url, embedded }: { postingId: string; url: string; embedded: boolean }) {
  const [state, action, pending] = useActionState(markAppliedAction, IDLE);
  return <section className="application-workspace" data-instela-application-url={url} data-instela-embedded={embedded ? "true" : "false"}>
    {embedded ? <>
      <div className="memory-privacy"><div><h2>Your application, right here</h2><p>Complete the official application below without leaving this Instela page. Choose Autofill with Instela, answer any missing questions, then review and submit the form.</p><p>If this is your first application on this site, open the Instela extension here and allow access to the application site.</p></div></div>
      <EmbeddedApplyFrame key={url} url={url} />
      <details className="application-packet"><summary>Having trouble with the form?</summary><p>Try reloading the form below its toolbar. If a sign-in, redirect, or upload requires a separate tab, your Instela workspace will remain open.</p><a href={url} data-instela-open-application target="_blank" rel="noopener noreferrer" className="btn">Open a separate application tab</a> <a href={url} target="_blank" rel="noopener noreferrer" className="btn">Open application directly</a><p data-instela-launch-status role="status" /></details>
    </> : <div className="memory-privacy"><div><h2>In-page application unavailable for this site</h2><p>This opportunity has its own Instela workspace, but its official form is not currently supported inside Instela. Some sites block embedded forms or require a separate sign-in. Your saved details and this workspace stay available here.</p><details><summary>Continue on the official application site</summary><p>This opens a separate tab only when you choose it. Open the Instela extension there to connect and autofill the form.</p><a href={url} data-instela-open-application target="_blank" rel="noopener noreferrer" className="btn">Open a separate application tab</a> <a href={url} target="_blank" rel="noopener noreferrer" className="btn">Open application directly</a><p data-instela-launch-status role="status" /></details></div></div>}
    <form action={action} className="application-finish"><input type="hidden" name="postingId" value={postingId} /><div><strong>Finished submitting?</strong><p>After the application site confirms your submission, add it to your tracker.</p></div><button type="submit" className="btn" disabled={pending || state.status === "saved"}>{pending ? "Saving…" : state.status === "saved" ? "Added to tracker" : "I submitted this application"}</button></form>
    {state.message && <p role="status">{state.message}</p>}
  </section>;
}
