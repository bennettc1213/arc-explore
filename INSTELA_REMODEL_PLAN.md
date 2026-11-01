# Instela Remodel Plan

Prepared: November 1, 2026

Status: Proposed, awaiting owner approval or edits. Saving this document does not authorize implementation or release.

## Direction And Evidence

The proposed remodel centers on one promise: **find relevant opportunities, understand the requirements, and finish stronger applications.** Improve that complete journey before expanding the feature list.

The earlier **74/100 is a provisional expert assessment**, not a measured conversion score. Mobile clipping was observed; its exact CSS cause still needs confirmation. Recommendations about headlines, colors, and signup timing should be tested with students.

## Implementation Phases

| Phase | Proposed Changes | Approval Criteria |
|---|---|---|
| **1. Repair The Foundation** | Diagnose mobile overflow; fix layouts, navigation, text wrapping, keyboard focus, and loading/error states. Verify links and distinguish available tools from unfinished ones. | Core routes work at 390, 430, 768, 1024, and 1440px. No horizontal clipping or blocked primary actions. |
| **2. Remodel The Homepage** | Sharpen the offer, simplify the primary action, bring verification proof forward, combine repetitive sections, and make the opportunity preview useful on phones. | Visitors can explain what Instela does, why they should trust it, and what to click after a brief view. |
| **3. Remodel Discovery** | Create distinct internship and scholarship paths, improve search and filtering, clarify eligibility versus fit, and connect every result to a useful next action. | A guest can find, inspect, and save a relevant opportunity without unnecessary setup. |
| **4. Connect Application Tools** | Reorganize tools around the selected opportunity; improve resume, essay, cover-letter, LinkedIn, and GitHub outputs; preserve progress through account creation. | Users can move from a listing to prepared materials and tracking without repeatedly entering the same facts. |
| **5. Strengthen The Engine** | Enforce publication rules, improve fact provenance and extraction, add reliable background jobs, and standardize tool results and artifact versions. | Source evidence, eligibility decisions, tool runs, and notifications are explainable and recoverable. |
| **6. Validate And Release** | Test complete workflows, measure performance and funnel behavior, conduct student usability sessions, and prepare a reviewed release. | Critical workflows pass; public claims match working capabilities; remaining limitations are visible. |

## Visual Direction

Retain Instela's recognizable orange and identity, while making working screens calmer and easier to scan. Use charcoal and neutral surfaces, orange for primary actions, and distinct semantic colors for verified information, cautions, and errors.

Keep ordinary body text comfortably readable, reduce decorative motion, and use consistent controls and spacing. A light workspace theme can follow after the initial remodel; changing both themes immediately would increase the work substantially.

## Homepage Structure

1. **Clear offer and primary action.** Proposed headline: "Verified internships and scholarships." Supporting copy explains direct source checks and matching. Primary CTA: **"Explore opportunities"**, with "No signup required" beside it.
2. **Compact live proof.** Relevant open-listing counts and check timestamps, with precise definitions. The owner-stated "10,000+ students helped" moves out of the live metrics row until its basis is explained.
3. **Interactive starting point.** Choose internships or scholarships, add a field or goal, and inspect real results. This replaces the duplicated walkthrough and preview.
4. **Why the results deserve attention.** Show source links, eligibility checks, and what remains unknown using an actual listing.
5. **Free plan and application workflow.** Explain available value and limits plainly.
6. **Focused toolkit, FAQ, and final Explore CTA.** Unverified autofill receives a clear beta status.

## Discovery And Application Workflow

Use a consistent sequence:

**Results -> listing details -> prepare materials -> open the official application -> confirm progress in the tracker.**

Account creation should appear when saving durable progress becomes useful. Guest preferences and selections should survive that transition.

## Backend Improvements

Extend what already exists:

| Component | Proposed Improvement |
|---|---|
| **Opportunity data** | Keep `postings` as the fast display model; add versioned evidence records where facts need quotes, source URLs, observation dates, or conflict history. |
| **Eligibility and ranking** | Preserve separate eligibility, fit, confidence, and priority. Audit extraction accuracy before changing weights; evaluate changes against reviewed examples. |
| **Tool results** | Share a small result contract for findings, evidence, limitations, and next actions. Keep each tool's domain rules independent. |
| **Application materials** | Version saved drafts and record which profile, resume, and listing facts produced them. Add stronger checks for unsupported generated claims. |
| **Background work** | Audit current job reliability first, then add durable retries, leases, and failure visibility where needed. Use an outbox for deduplicated notifications. |
| **Autofill** | Resolve the currently removed routes and intended scope, then verify supported forms end to end before enabling or promoting it. |

## Recommended Approval Scope

Approve **Phases 1-4 as the initial remodel**, with Phase 5 scoped through a short engineering audit and Phase 6 required before release. This provides a coherent product improvement without committing prematurely to a broad backend rewrite.

## Success Measures

Judge success through completed tasks and measured behavior:

- Finding a useful listing.
- Saving an opportunity.
- Preparing application materials.
- Returning to the tracker.
- Recording an application.

Set conversion targets after establishing a baseline. No percentage lift is promised before that evidence exists.

## Authorization And Release

Owner approval would authorize local implementation and testing of the agreed phases. Production deployment, database migrations, and enabling paid or external services would be presented separately as concrete release changes.
