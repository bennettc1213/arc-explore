"use client";

import { useActionState, useState } from "react";
import { EmbeddedApplyFrame } from "./EmbeddedApplyFrame";
import { markAppliedAction, type ApplyActionState } from "./actions";

const IDLE: ApplyActionState = { status: "idle" };
export function ApplicationWorkspace({ postingId, url, embedded }: { postingId: string; url: string; embedded: boolean }) {
  const [state, action, pending] = useActionState(markAppliedAction, IDLE);
  const [showEmbedded, setShowEmbedded] = useState(false);
  return <section className="application-workspace" data-instela-application-url={url} data-instela-embedded={showEmbedded ? "true" : "false"}>
    <div className="memory-privacy"><div><h2>Open your application</h2><p>Open the application, then click the Instela extension and choose Autofill with Instela. If the site sends you to another page, reopen the extension there to continue. Instela asks for access to each new site.</p><a href={url} data-instela-open-application target="_blank" rel="noopener noreferrer" className="btn btn-primary">Open application with Instela</a>{embedded && <button type="button" className="btn" onClick={() => setShowEmbedded(value => !value)}>{showEmbedded ? "Hide embedded form" : "Use form inside Instela"}</button>}<p data-instela-launch-status role="status" /></div></div>
    {showEmbedded && <EmbeddedApplyFrame url={url} />}
    <form action={action} className="application-finish"><input type="hidden" name="postingId" value={postingId} /><div><strong>Finished submitting?</strong><p>After the application site confirms your submission, add it to your tracker.</p></div><button type="submit" className="btn" disabled={pending || state.status === "saved"}>{pending ? "Saving…" : state.status === "saved" ? "Added to tracker" : "I submitted this application"}</button></form>
    {state.message && <p role="status">{state.message}</p>}
  </section>;
}
