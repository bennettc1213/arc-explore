# Guided onboarding release — October 26, 2026

Published to https://instela.org with the user's explicit instruction to deploy
while student verification remains inactive.

- Vercel project: `project-o66x1` (`prj_jsTVqq1vfWgzS6SfGBBFBerNlXT7`).
- Deployment: `dpl_6YAnezMSAMQ6bMFfbC34esCKzbQb` (Ready, Production).
- Deployment URL: https://project-o66x1-9h2kfhx6o-bennettch1213-1215s-projects.vercel.app
- Previous production deployment for rollback: https://project-o66x1-jh7po9d4u-bennettch1213-1215s-projects.vercel.app
- Published through the Vercel CLI from the tested workspace; no Git push or
  ingestion/backfill job was run as part of this release.
- No database migrations were run during this release. The existing schema
  already supported the authenticated upload/profile checks.

The homepage CTA now opens seven-step onboarding with a translucent form panel,
shorter text, resume imports, broad searchable/custom interests, two plan cards,
and a prominent free continuation. University SSO and inbox-code verification
still require institution/sender setup; no unverified student receives eligibility.

Production now has DATABASE_URL configured as a Vercel secret, rather than
relying on an uploaded local .env. NEXT_PUBLIC_SITE_URL is https://instela.org.
STUDENT_SSO_PROVIDERS is an empty list, MARKET_READY_BILLING is 0, and
RESUME_AI_ENABLED is 0. Existing unrelated production secrets were preserved.
Local .env files and test/tool artifacts are excluded from deploy uploads.

Validation: typecheck and lint passed (two existing lint warnings); 1,025 tests
passed and one was skipped; the Vercel production build passed. Live browser
checks used isolated synthetic Supabase accounts without sending email, uploaded
HTML/DOCX/PDF files, checked resume records/autofill and profile persistence,
selected medical and custom interests, checked both plan cards, checked free
continuation and mobile layout, and confirmed an unconfigured university cannot
grant verification. Test accounts and profile data were removed afterward.

Rollback: promote the previous production deployment in Vercel. The explicit
production environment settings can remain; neither deployment needs a local
.env file after the database secret has been configured.
