# Deep security audit, 11 October 2026

## Summary

- 24 findings reached retest. 20 confirmed, 4 disputed, plus 3 refuted earlier (27 candidates in total).
- Confirmed by final severity: 0 critical, 0 high, 4 medium, 16 low.
- No confirmed critical or high finding. The one finding that arrived rated high (open client registration) was disputed, and both refuters rated the surviving risk as medium.
- Highest-value fixes: the Stripe webhook dead end (paid top-ups can strand), the unchecked MCP authorization URL, and consent-screen hardening for dynamically registered OAuth clients.

## Method

1. Pattern scan with deepsec 2.3.10: 2160 matches in 1418 files. 524 production candidates in 361 files were reviewed. Test, fixture and generated files were excluded.
2. Eight white-box lenses, using agentic red-team techniques drawn from T3MP3ST: convex-authz, webhooks, ssrf-outbound, agentic-injection, secrets-logging, api-abuse, supply-chain-headers, plus the deepsec per-batch reviews. Each lens traced a source to a sink in code and wrote the scenario in words.
3. Two-refuter retest. Every finding was handed to two independent refuters who tried to disprove it from the code. A finding is "confirmed" when both agree the code path is real. "Disputed" means the refuters disagreed on a premise or on severity. "Refuted" means the premise was false.
4. Final severity is the refuters' consensus, not the original lens rating.

Limits. node_modules was absent, so third-party library behaviour (the MCP SDK) was not read. Model behaviour (prompt injection success) was not reproduced. External quotas and platform environment protection rules were not visible in the repository. Each affected finding says so.

## Confirmed findings, ranked

### Medium

**M1. Paid Stripe top-up is stranded when webhook processing fails terminally**
`convex/moneyStripeWebhookInbox.ts:61` (also `:135-141`, `convex/moneyStripeWebhookWorker.ts:45-47`, `src/modules/money/internal/stripe-webhook.ts:125-128`)
Scenario: a verified checkout event is queued and its worker action keeps failing until the workpool gives up (13 attempts, roughly four to five days). The row is marked failed. Stripe redelivers, but `ingest()` sees an existing row with the same digest and returns "replayed" without checking state, so the route answers 200 and Stripe stops retrying. Nothing re-drives a failed row and nothing alerts. The customer has paid and is never credited. Mitigation found: the owner-driven funding readback can still recover it if the owner returns, which is why this was lowered from high.
Fix: in `ingest()`, when the existing row is `failed` (or any state other than queued, applied or ignored), reset it to queued and re-enqueue, or return a non-2xx so Stripe keeps retrying. Add an operator query or cron that alerts on rows in `failed` or `reconciliation_required`.

**M2. Unchecked MCP OAuth authorization URL is assigned to the browser location**
`src/components/ae/supply/connection-handoff/useConnectionHandoff.ts:164` (server side `src/lib/server/provider-connection-handoff.ts:423-457`)
Scenario: an owner adds an MCP OAuth source whose origin is attacker-chosen. The remote server's metadata supplies the authorization endpoint, and the server returns it after checking only that it exists. The client then navigates to it with no scheme or host check, so a non-https scheme could run in the owner's signed-in origin. Whether the MCP SDK already rejects such schemes is unverified.
Fix: before returning the redirect, parse the URL and require `https:` (loopback http only in development), optionally matching the discovered authorization server host. Reject again on the client if the scheme is not https.

**M3. Open client registration lets an attacker choose the consent screen name and return origin**
`src/lib/server/agent-access-oauth-api.ts:152` (validation `src/lib/server/agent-access-oauth/protocol.ts:245-254`; consent `ConsentRequestFacts.tsx:9-16,38`)
Scenario: anyone can register a client with a lookalike name and an attacker-owned https return address, then send a signed-in owner a link to the consent screen requesting spending authority. The consent screen does show "Returns to <origin>", so the attack depends on the owner approving an unfamiliar origin, but the name is unverified and no warning marks the client as unverified. On approval the code goes to the attacker, who holds the PKCE verifier. Exact-match redirect checks and server-side tool narrowing do not help, because the attacker controls the registration.
Fix: label dynamically registered clients as unverified, make the return origin visually prominent, require review or an allowlist before a registered client can request spend authority, default such clients to read-only or approval-required, and cap new clients per owner.
Note: the first lens reported this as high with a false claim that the host is never shown (see Disputed D1). This entry is the merged, corrected version.

**M4. Provider-written tool text can steer the chat agent into paid Calls within the owner's caps**
`convex/lib/chat/tools/purchase.ts:159` (prompt `convex/lib/chat/tools/agent.ts:75`; sanitiser `src/modules/chat/search-presentation.ts:11-15`)
Scenario: provider-authored titles and descriptions reach the model as tool results with only tag stripping. The system prompt tells the model to quote and call "right away without asking" for Calls within limits. A hostile description could push the model to buy a tool the person never asked for. The server gate is budget caps and approval mode only, with no check that the user's latest message asked for the Call. Injection success depends on model behaviour and was not reproduced.
Fix: require server-side evidence of user intent for `tool.call` (a toolRef or price the user named, or a card click), quarantine provider prose in a labelled untrusted-data block, and require approval for the first Call to any provider or after a description change.

### Low

**L1. Consumed refresh token inside the 60 second replay window returns the current access secret**
`src/lib/server/agent-access-oauth/token-family.ts:162` (logic `convex/lib/agentAccess/oauth/refreshFamilies.ts:151-175`)
Scenario: a captured, already-rotated refresh token presented within 60 seconds skips reuse detection, rotates the family and returns the live access secret. Bounded: the legitimate client's next refresh hits the invalidated token and revokes the same credential (`refreshRevocation.ts:73-80`). Requires prior capture of the token.
Fix: treat any consumed-token presentation as reuse, or answer a lost-response retry idempotently from the first claim without returning the current key.

**L2. Agent-facing markdown relies on a bypassable phrase blocklist**
`src/modules/discovery/internal/manifest-projection.ts:83` (sinks `page-markdown.ts:237,240-241`)
Scenario: `safePublicText` replaces only one exact phrase, so a slight variant passes. A provider can steer an agent's recommendation. Spend is still gated server-side.
Fix: treat it as display hygiene only, deliver provider text in a labelled untrusted block, and add a regression test with a variant phrase.

**L3. Windows browser open passes the server-supplied verification URL through cmd.exe**
`tools/ae/commands/connect.ts:171` (validation `:80-104`)
Scenario: on Windows, `ae connect` launches the URL via `cmd /c start`, where shell separators are live. A hostile origin response, or a tampered plain-http base URL, could append a second command. macOS and Linux launchers use argv with no shell.
Fix: launch with an argv-only opener (`explorer.exe <uri>`), reject URLs outside a strict charset, and require https except loopback in `verificationUri()`.

**L4. `ae call` auto-accepts a re-quoted higher price with no caller ceiling**
`tools/ae/commands/call.ts:264` (also `:465-467`; `src/modules/capability-execution/call-contracts.ts:98-101`)
Scenario: after a `price_changed` refusal the CLI fetches a fresh quote and pays it without showing it or comparing it to any maximum. Server custody caps bound the loss; whether they are the intended ceiling is unconfirmed.
Fix: carry the first quote's price forward and refuse a higher fresh price, or add an explicit max spend flag as `ae procure` has.

**L5. Third-party listing titles are printed to the terminal unsanitised**
`tools/ae/commands/search.ts:117` (writers `tools/ae/lib/output.ts:258-268`)
Scenario: control sequences in a listing title can spoof terminal output, and instruction-like text reaches any agent reading text mode. `--json` is unaffected.
Fix: strip C0 and C1 control characters (keeping newline and tab) for remote-sourced values in the text renderers.

**L6. CLI config read-modify-write has no lock**
`tools/ae/lib/config.ts:182` (also `:240-257`, `:259-284`)
Scenario: concurrent `ae` processes can overwrite each other, resurrecting a removed token locally or dropping a new one. Local only, tiny window, server revocation unaffected.
Fix: serialise config cycles with the same lock library the call journal uses, or move thread ids to their own file.

**L7. Public catalog search action fans out to a discovery API with no rate limit**
`convex/capabilityToolCatalog.ts:117`
Scenario: a public action with no identity check makes a live outbound request plus a per-reference detail query on every call. Risk is quota and read-load abuse, not data exposure. External quota not verified.
Fix: apply the shared rate limiter or a short-TTL cache keyed by source, cursor and limit, and cap or batch the detail fan-out.

**L8. Internal provider-consequence route has no channel-level authentication**
`src/routes/api.internal.provider-consequence.ts:560`
Scenario: unlike `api.internal.secret-lifecycle.ts:364`, the route does not authenticate the caller before reading the body. Journal tokens and HMAC tickets still gate real effects, and the execute path is only a boolean MAC check, so this is defence in depth.
Fix: add the same constant-time channel check before `readRequest`.

**L9. Unsubscribe tokens never expire or revoke**
`convex/lib/principalAccount/notifications/unsubscribe.ts:52`
Scenario: a leaked token can switch off the recipient's alert emails indefinitely. No money or data exposure.
Fix: add an issued-at or expiry claim and a key version, and keep alert-stream opt-out behind the authenticated settings page.

**L10. Backend logs serialise raw error causes, bypassing the telemetry sanitiser**
`src/lib/observability/degrade-backend.ts:76`
Scenario: `serializeCause` writes full messages and stacks to console, which log streaming forwards to third parties. The Sentry-side redaction in `private-route-safety.ts` is not applied. No concrete leaking call site was shown.
Fix: move the redaction into a shared pure module used by `serializeCause`, or pass `boundaryCauseKind` at provider and fetch boundaries.

**L11. Anonymous chat spend is bounded only per IP**
`convex/lib/chat/anonymous/http.ts:14` (policy `src/modules/security/rate-limit-policy.ts:44-45`)
Scenario: 30 requests per hour per IP at the edge and in Convex, with no global or session budget, so rotating IPs scales model spend. Each request is a single model step (`stream.ts:103`), so the original multi-step claim was overstated. Provider-side key limits were not visible.
Fix: add a global daily spend breaker and a bot challenge on the anonymous endpoint.

**L12. Anonymous MCP rate bucket is bypassed by any Authorization header**
`src/lib/server/mcp-api.ts:739`
Scenario: header presence, not authentication outcome, selects the stricter 30 per minute bucket, so a junk header gets 120 per minute on discovery methods. Protected actions still require valid credentials.
Fix: choose the bucket by authentication result.

**L13. Public funding-session read has no rate limit**
`src/routes/api.v1.account.funding-sessions.public.$fundingSessionId.ts:7`
Scenario: each request runs a Convex query with only a prefix check. Identifiers are high-entropy so enumeration is infeasible; the risk is query amplification.
Fix: wrap in `withHttpRateLimit(..., 'public-read', ...)`.

**L14. Production secrets sit in job-level env in the live gateway proof workflow**
`.github/workflows/kernel-release-gate.yml:415`
Scenario: about 40 production secrets reach every step of the job. Actions used are first-party, so exposure needs a compromised dependency or a write-capable actor already able to dispatch on main. Environment protection rules are not visible in the repository.
Fix: move each secret to the step that needs it and confirm required reviewers on the production environment.

**L15. Mutable action tags in a signing and release job**
`.github/workflows/cli-release.yml:21` (also `:34`, `:76`)
Scenario: `checkout@v6`, `setup-node@v4` and `cosign-installer@v4.0.0` are tag references in a job with `id-token: write`. Exploitation needs an upstream compromise. `react-doctor.yml` already pins by SHA.
Fix: pin all actions in `cli-release.yml` and `kernel-release-gate.yml` to full commit SHAs, and scope `id-token` to the signing step.

**L16. Nightly nitro snapshot in the production build toolchain**
`package.json:173` (loaded at `vite.config.ts:8,92`)
Scenario: a non-release nightly runs at build time where project secrets may be present. The lockfile pins integrity, but trust in the snapshot is unreviewed. No compromise shown.
Fix: move to a stable release, or record a review of this exact snapshot and gate upgrades on it.

## Disputed findings

- **D1. Open client registration plus name-only consent enables code interception (arrived high).** Premise that the return host is never shown is wrong; the consent screen shows "Returns to <origin>". Residual risk survives and is tracked as M3 (medium). Same root cause, so one fix.
- **D2. IPv4-compatible IPv6 (::/96) not blocked** (`src/modules/network-guard/public.ts:31`). Code gap is real, but mainstream OS stacks do not route it to the embedded IPv4 host. Hardening only: add `::/96` to the blocked list with a unit test.
- **D3. PayAI discovery fetch is a pre-check only, so DNS rebinding is not blocked** (`convex/capabilityToolCatalog.ts:60`). The host is a fixed third-party name an attacker cannot re-point. The comment overstates the guarantee. Optional: use the guarded dispatcher as `runRelease.ts` does, and correct the comment.
- **D4. Raw SyntaxError logged for malformed stored Call input** (`convex/lib/capabilityExecution/callLifecycle/admissionApprovals.ts:42`). Logging is real, but no writer was found that stores unvalidated input. Cheap fix: log only the error kind.

## Refuted

3 candidates were refuted outright (false premise on re-read) and are not listed.

## Remediation plan

Ordered by severity. Each task is atomic and independently shippable. No critical or high items exist.

Medium
1. Stripe inbox: re-queue or refuse on replayed `failed` rows in `ingest()` (`convex/moneyStripeWebhookInbox.ts`). Add a unit case in `tests/unit/convex/money-stripe-webhook-inbox.test.ts`.
2. Stripe inbox: add an operator query and alert for `failed` and `reconciliation_required` rows.
3. MCP handoff: require an https authorization URL in `provider-connection-handoff.ts`, and guard the client assign in `useConnectionHandoff.ts`.
4. OAuth consent: label unverified dynamic clients and emphasise the return origin (`ConsentRequestFacts.tsx`).
5. OAuth registration: block spend-capable authority for unverified clients (default to approval-required) and add a per-owner client cap.
6. Chat agent: add a server-side user-intent check on `tool.call` and first-Call-per-provider approval (`purchase.ts`).
7. Chat agent: wrap provider prose in an untrusted-data block (`output.ts`, `search-presentation.ts`).

Low
8. Refresh families: treat consumed-token presentation as reuse, or make retry idempotent (`refreshFamilies.ts`, `token-family.ts`).
9. CLI: argv-only Windows opener and https-only `verificationUri()` (`connect.ts`).
10. CLI: strip control characters in text output (`output.ts`), and add a price ceiling to `ae call` (`call.ts`).
11. CLI: lock config read-modify-write (`config.ts`).
12. Rate limits: catalog search action, funding-session GET, and MCP bucket choice by authentication outcome.
13. Provider-consequence route: add channel authentication.
14. Anonymous chat: global spend breaker and bot challenge.
15. Observability: share the telemetry redaction with `serializeCause`; log error kind only in `admissionApprovals.ts`.
16. Discovery markdown: stop treating `safePublicText` as an injection control; add a variant-phrase test.
17. Unsubscribe: add expiry and key version.
18. CI: SHA-pin actions in both workflows, move secrets to step-level env, confirm production environment reviewers.
19. Build: replace the nitro nightly with a stable release or document its review.
20. Hardening: block `::/96` in the network guard; use the guarded dispatcher in `fetchCatalogPage` and fix its comment.
