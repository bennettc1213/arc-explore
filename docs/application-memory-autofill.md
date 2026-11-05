# Profile memory and guided autofill

## This build

- `/profile#application-memory` and `/memory` display the same account-backed reusable facts. Students can edit and remove them on any plan. Removal stores a null override so an older resume cannot silently restore a forgotten autofill fact.
- Existing profile fields and memory edits synchronize in a transaction. Profile information, resume details, and matching preferences remain accessible from the profile. The older story library is preserved separately in browser storage; it is not account-synced.
- `/listing/[id]/apply` opens the application workspace immediately. Known Lever and Ashby application routes skip the advert page; Greenhouse links target the inline application. Unknown portals retain the official listing URL rather than inventing a form URL.
- The Pro extension fills known values and presents text/select/radio prompts for supported visible unanswered controls. Stable recognized facts are saved to the account. Employer/scholarship-specific questions have no memory key and never call the memory endpoint. Newly revealed controls are scanned again after answers.
- A multi-page portal still requires the student to navigate to its next page and invoke autofill again. Custom comboboxes, cross-origin nested forms, account creation, file uploads, and blocked declarations may require direct interaction.
- Final submission remains the student's action. The workspace offers a separate, self-reported tracker confirmation after the portal confirms submission.
- Autofill is `unverified` in pricing for internships and scholarships. Do not promote either as verified or broadly supported until actual portal checks pass.

## Deployment prerequisite

Migration `0033_application_memory.sql` adds the private `application_memory_facts` table, per-user RLS policy, allowlisted keys, length checks, and cascading deletion. Apply it to staging before deploying these routes. Follow the repository's normal approved production migration process. No database migration is executed by this build.

The migration is hand-written because the repository's Drizzle generator cannot preserve existing RLS and constraints. Keep the journal entry; do not regenerate the migration chain.

## Extension setup

Extension version 0.3.0 adds tab-scoped application sessions for direct forms,
redirects, multiple pages, and child tabs. Open a session using the workspace's
**Open application with Instela** link or its toolbar. Only the worker can
assign listing identity, using a trusted Instela workspace. Each new site still
requires Chrome permission, and each page requires a fresh autofill action.
The session expires after four hours, tab closure, browser exit, changing
Instela environments, or the student's **End this application session** action.
The packet and memory endpoints accept a session posting ID only from a
configured extension origin and recheck active listing and Pro entitlement.
Session memory writes require the exact document and URL last authorized by
the toolbar. No profile facts or answers are stored in the session.

The separate-tab flow is the default. The toolbar also recognizes an application embedded
inside an Instela workspace. It targets Chrome document IDs rather than
broadcasting profile values to every frame. Clicking autofill acknowledges the
start immediately and closes the popup; the question flow runs in the form.
Reopening the popup shows its current progress or last report. New navigations
are rechecked, and an old popup cannot fill a different document.

Only the configured Instela origin is stored in local extension storage.
Session storage holds listing identity, expiry, application URLs and frame/document IDs so routing
survives worker suspension, and removes them when the tab closes. It never
stores profile facts or answers. Only packaged static imports are used by the
service worker, as required by Chrome's extension worker API:
https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics

Run `npm run package:extension` for a ZIP in
`.local/extension-builds/instela-extension-0.3.0.zip`, or load the project’s
`extension/` folder directly after building. No extension is installed or
published automatically.

1. Run `npm run build:extension`; the vendor directory is generated and ignored by Git.
2. Load `extension/` unpacked in Chrome and record its extension ID.
3. Configure `EXTENSION_ORIGINS=chrome-extension://<id>` in the server environment. Memory writes reject unconfigured origins, even when a browser would bypass CORS.
4. Extension default: `https://instela.org`. For development, set the popup's Instela address to `http://localhost:3000` and sign in there in the same browser.
5. Reload the extension after source changes. For additional scholarship hosts, grant the specific site's optional permission through the popup. It registers the content script for that granted site, including subsequent embedded visits.

`web_accessible_resources` exposes only compiled public rule modules to HTTPS pages so optional scholarship hosts can import them. It does not grant access to those pages or expose account data.

## Before release

Use a synthetic Pro staging account; do not submit a real application as a test.

1. Save a phone and degree in the profile. Reload and check they persist on another signed-in browser. Check another account cannot read or modify them.
2. Edit school in memory, then in the regular profile form; verify neither editor restores the old value. Remove phone and confirm a resume phone does not return through autofill.
3. Open a Greenhouse application inside Instela. Verify extension detection and the exact “Autofill with Instela” button. Check existing answers are preserved.
4. Remove a stable fact, autofill, answer the prompt, and confirm it appears in profile memory on the next read. Simulate a failed memory save: the prompt must stay open and must not report success.
5. Answer “Why this employer?” and a friends/family scholarship question. Check the form gets the answer but the memory API receives no request for it. Exercise native select and fieldset radio choices, skip, Escape, and Finish in form.
6. Exercise a conditional question and a second application page. Verify no Next or Submit button is pressed automatically.
7. Test a scholarship host after per-site permission is granted, including reload/revisit. Confirm ungranted hosts offer the separate-tab path and do not imply the extension is installed incorrectly.
8. Check a Free account: profile editing remains available, autofill packet/memory endpoints refuse Pro-only use.
9. Confirm the tracker is marked only after the student's separate confirmation. Check mobile layout and keyboard navigation.
10. Launch a scholarship whose listing and form URLs differ. Follow its redirect,
    allow the destination site, and verify the toolbar retains the scholarship
    title. On a second page, explicitly start autofill again. Test a child tab,
    expired session, and End session. Check another tab cannot borrow its facts.

Automated coverage exercises key/value validation, memory overrides and forgetting, contextual question classification, direct ATS URLs, the DOM fill workflow with conditional questions, and existing extension invariants. Actual Chrome extension/session/database integration is still a required release check.
