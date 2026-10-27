# Student discount verification

The onboarding offer is 50% off Pro. Displaying this offer is not verification
and never grants paid access. Billing activation remains separate.

## University SSO

University SSO verifies enrollment only when the university releases a trusted
current-student affiliation. Faculty, staff, alumni, and a generic successful
campus login do not qualify. No university integrations are configured by default.

1. Arrange a SAML integration with a university, or use an approved federation/
   verification provider. Supabase SAML requires a Pro or higher Supabase plan.
2. Register the university's signed SAML metadata in Supabase. Map the institution's
   **current** student affiliation to a custom claim named `affiliation`. Do not
   configure a default `student` value; a missing claim must fail verification.
3. Allow the exact `/auth/student/callback` URL on the Instela origin in Supabase's
   auth redirect allowlist.
4. Set `STUDENT_SSO_PROVIDERS` to JSON using the actual Supabase provider UUID:

   ```json
   [{"providerId":"REPLACE-WITH-PROVIDER-UUID","name":"Example University","domains":["example.edu"],"affiliationClaim":"affiliation","studentValue":"student"}]
   ```

5. Set `STUDENT_SSO_STATE_SECRET` to a random server-side secret, or use the existing
   Supabase service-role secret as the state-signing fallback.
6. Run a real student, alumni, and staff login with that institution before enabling
   its discount. Confirm the institution's affiliation represents current enrollment,
   rather than lifetime membership. Verification expires after 90 days.

The secondary Supabase client has separate cookies so campus verification does not
replace the user's existing Instela session. Its callback verifies PKCE, the signed
flow state, the original Instela user, the allowlisted SSO provider, a fresh identity,
and the provider's `identity_data.custom_claims` affiliation. Editable user metadata
is never accepted as enrollment evidence. Campus credentials stay with the university.

Sources: [Supabase SAML setup and attribute mapping](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml),
[Supabase signInWithSSO](https://supabase.com/docs/reference/javascript/auth-signinwithsso),
[Proxi.id's comparison, including university integration agreements](https://www.proxi.id/blog/how-to-verify-student-status-for-discounts/).

## School-inbox fallback

Set `STUDENT_VERIFICATION_FROM_EMAIL` to a verified Instela sender in Resend
(or use `REMINDER_FROM_EMAIL`) and supply `RESEND_API_KEY`. Codes expire after
10 minutes, allow at most 5 guesses, and are limited to 5 sends per account per
hour with a 60-second cooldown. No code is sent when a sender is unconfigured.
Inbox verification reserves a claim with enrollment status `pending`; it never
establishes current enrollment or activates the discount.

## Database and rollout

Migration `0028_student_discount_claims.sql` creates server-only email challenges
and RLS-protected claims. Both school-email hashes and university identity hashes
are unique. A user can have one claim. Case and plus-address aliases collapse to
the same email hash. Hashes remain after account deletion to prevent reuse; the
account reference is removed. Discount redemption must check verified, unexpired
enrollment and consume `redeemed_at` atomically when billing is connected.

Apply migrations to staging before a production release. Do not run the unrelated
pending migration chain against production merely to add these tables. The local
app handles an unapplied verification migration by withholding student eligibility.
