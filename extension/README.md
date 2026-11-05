# Instela browser extension · 0.3.0

Autofill supported internship and scholarship applications from your Instela
profile. Answer missing questions in an Instela prompt, review the form, and
submit it yourself. Chrome 106 or later is required.

This is a development preview. Chrome Web Store publication and real signed-in
Chrome/portal verification remain pending.

## Build and load

From the project root:

```
npm run build:extension
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and
select the project's `extension/` folder. Reload it there after source changes.

For a shareable ZIP:

```
npm run package:extension
```

The output is `.local/extension-builds/instela-extension-0.3.0.zip`. Extract it
to a folder before using Load unpacked. Compiled rule modules are included;
no environment files, credentials, or account data are packaged.

## Connect your account

The default Instela address is `https://instela.org`. Sign in there in the same
Chrome browser. Autofill requires Instela Pro; profile memory can be edited on
any plan.

For local testing, use extension Settings to choose `http://localhost:3000`.
Only Instela's production origins and that local development origin are
accepted. The backend must have migration `0033_application_memory` applied,
and must configure this extension's ID:

```
EXTENSION_ORIGINS=chrome-extension://<extension-id>
```

Use a synthetic staging account to test. Restart the server after updating its
environment. The extension reuses your existing Instela session; it stores no
password or separate authentication token.

## Applying

1. Choose **Apply with Instela** on an opportunity.
2. Choose **Open application with Instela**. The extension opens a new tab and
   binds it to that listing. If the extension was just reloaded, reload the
   Instela workspace first so its launch bridge is available.
3. Navigate to the actual form, including redirects or another portal page.
   Open the extension toolbar there. Grant access to that specific site when
   asked. A new domain requires its own permission.
4. Start autofill. The toolbar closes so you can answer prompts in the form.
   On each new page, reopen the toolbar and start again. No next-page or submit
   controls are clicked. Child tabs opened by the application can inherit the
   listing identity when you open the toolbar there.
5. **End this application session** in the toolbar disconnects the listing.
   Sessions also end after four hours, tab closure, browser exit, or changing
   the configured Instela environment. They survive worker suspension.

For compatible portals, **Use form inside Instela** retains the embedded option.
The separate-tab flow is the default for wider compatibility. Without the
extension, the application link still opens normally, but cannot establish a
redirect-aware session. The toolbar on the Instela workspace can also launch it.

Known values fill only the selected application document. Missing recognized
facts can be saved to Instela memory. Questions about this employer or
scholarship receive your explicit answer for this application only. You can
skip a question, press Escape, or choose **Finish in form**.

Native text, textarea, select, and labeled fieldset radio controls are handled.
Dynamic questions are rescanned after an answer. On another application page,
invoke autofill again. Custom widgets, file uploads, logins, CAPTCHAs, and
declarations may require you to interact with the original form.

## Data and permissions

- Authentication and profile requests run in the background worker.
- Autofill refreshes facts when you start, then sends them only to the chosen
  Chrome document. A stale popup cannot fill a newly navigated document.
- Choosing autofill shares the filled answers with the application site.
- Local extension storage holds the selected Instela address only. Session
  storage holds listing identity, expiry, and application URLs/frame identifiers
  until tab closure or browser exit so routing survives worker suspension. It
  holds no profile or answers. Session identity is resolved only by the
  configured extension origin; closed/hidden listings still cannot be filled.
- A separate launch bridge runs on Instela only and carries no profile data.
  Form content scripts run automatically on the declared ATS hosts. Additional
  sites are requested individually, with no blanket access granted at install.
- Public compiled matching modules are exposed to HTTPS application pages;
  they contain no account data.
- The extension does not submit applications, overwrite existing answers, or
  fill blocked declarations. Tracking is a separate “I submitted” action.

## Verification

Run `npm run check` and `npm run build:extension`. Tests cover document routing,
stale documents, fresh profile reads, worker resumption, popup handoff, per-site
permission cancellation, field matching, and the question flow.

The full signed-in release checklist is in
`docs/application-memory-autofill.md` in the project repository. Unit tests do
not establish that every portal or Chrome session works end to end.
