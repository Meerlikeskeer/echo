# Google/email accounts and personal provider keys (WEB-034)

The existing installation stays in private owner mode unless `ECHO_AUTH_MODE=accounts` is explicitly set. Account mode does not accept owner Basic credentials or use owner inference keys. Recordings remain browser-local per account; this is not cloud sync or a verified backup. Hardware development is paused at the owner's request.

## Configure before enabling

1. Create a Supabase project (or use self-hosted Supabase). Apply `migrations/WEB-034-provider-credentials.sql` in its SQL editor. It creates only encrypted credentials, with row-level policies requiring the authenticated user to own the row. Do not grant anonymous access or use a service-role key.
2. In Supabase Auth, enable email/password with email confirmation. Configure SMTP and its rate limits for real users. Set the Site URL to Echo's HTTPS origin and allow that origin's `/auth/callback` and `/auth/callback?next=password` redirects. For token-hash email templates, confirmation links are `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`; recovery uses `type=recovery`. PKCE default email links require the same browser that requested them.
3. In Google Cloud, create a Web OAuth client, configure branding/consent/audience, and add the exact Supabase Auth callback shown in its dashboard as the authorized redirect URI. Enter that client ID/secret in Supabase's Google provider settings. Google secrets belong there, never in browser code or this repository. While Google's consent app is in testing, only authorized test users can use it.
4. Set these server-side runtime variables through your deployment dashboard (or private local configuration). Never paste real values into chat or Git:

   - `ECHO_AUTH_MODE=accounts`
   - `ECHO_APP_URL`: the exact public HTTPS origin, no path. Loopback HTTP is allowed only for local development.
   - `SUPABASE_URL`: the project's HTTPS URL (loopback for local self-hosting).
   - `SUPABASE_PUBLISHABLE_KEY`: its publishable/anonymous API key, **not** service-role. Although this key is designed to be public, Echo uses it server-side.
   - `ECHO_CREDENTIAL_ENCRYPTION_KEY`: a randomly generated 32-byte key encoded as 64 hexadecimal characters. Generate/store it privately in a secret manager. Losing it makes saved provider keys unreadable; rotation currently requires users to replace their keys. Back it up separately from the database.
   - Existing `TRANSCRIPTION_BASE_URL`, `TRANSCRIPTION_MODEL`, `LLM_BASE_URL`, `LLM_MODEL`: administrator-controlled OpenAI-compatible providers. Current prototype is Groq. No arbitrary user URL or model selection is exposed. Use HTTPS for hosted providers. Every account supplies its own key for each configured provider. `TRANSCRIPTION_API_KEY`/`LLM_API_KEY` are ignored in account mode.

5. Use a distinct preview origin with corresponding redirect configuration; do not point a preview's auth cookies at production. Restart/redeploy explicitly after setup. Public sign-in and compiled assets are intentional in account mode; workspace, APIs and unknown paths still require authentication. Missing/invalid account configuration returns 503 rather than opening owner mode.

## User flow

Sign up with Google or email → confirm email if needed → Account & API keys → save transcription and notes keys → return to recording. The same provider key can be entered twice when both ports use the same provider. Keys are sent over HTTPS to Echo, encrypted using user-bound AES-256-GCM, and saved in the user's database row. They are decrypted only server-side for processing, never returned in settings or logs. Missing keys stop processing; no fallback charges the owner. Removing keys stops new requests, but does not cancel requests already sent to a provider. The current retry ledger is still in-process, not exactly-once.

Sign out unmounts the current workspace by navigating away. Other open account workspaces poll identity every ten seconds and stop on sign-out/account change; switching accounts also broadcasts a browser storage event. Every paid request must carry the original workspace user ID and same origin, independently checked against the current verified session before loading keys. Browser data is namespaced, not locally encrypted: use separate browser profiles on shared laptops. Existing owner recordings remain separate and are not automatically assigned to an account.

## Live notes and usage planning

Existing capture sends roughly one complete audio container per minute (shorter when encoded bitrate demands it), plus overlap and a final tail. Each normal chunk currently invokes transcription and clip notes. A live session-note refresh adds a separate notes call over the accumulated transcript. Re-sending the whole growing transcript each minute grows input-token use roughly quadratically with session length; a later incremental summarizer can reduce that, but needs its own grounding/revision design. Keep automatic updates opt-in and bounded, skip unchanged revisions, allow one request at a time and pause on errors. Provider token/audio pricing and account-specific quotas determine cost; estimate from measured usage rather than inventing a fixed price.

Personal keys move inference charges and quotas to the user's provider account. More keys in one organization do not multiply that organization's limits. Neither personal keys nor Google login remove Echo's auth, server compute, concurrency, bandwidth or eventual storage costs. Do not promise unlimited users or rotate keys to evade provider limits.

## Acceptance before rollout

Verify two real accounts cannot see each other's browser library, ledger results or credential rows; test RLS using user tokens, not an administrative SQL session. Exercise Google allowlists/consent, signup/confirmation, wrong passwords, recovery, expiration/refresh, logout across tabs, missing/invalid/deleted keys, provider rate limits and no owner fallback. Confirm secure HttpOnly cookies over HTTPS and origin checks. Test native browser capture/storage for each account and old-owner recovery. Synthetic tests and green CI do not certify Google provisioning, actual database policies, email delivery or live provider billing. No deployment or dashboard changes are performed by this task.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Google provider](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [password auth](https://supabase.com/docs/guides/auth/passwords), [self-hosting](https://supabase.com/docs/guides/self-hosting), [Groq organization limits](https://console.groq.com/docs/rate-limits).
