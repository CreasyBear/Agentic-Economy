# Cross-Cutting Concerns

**Analysis Date:** 2026-09-01

Source-grounded map of security, request-safety, error/observability, fail-closed, privacy, background-attribution, accessibility, runtime, and secrets concerns. Every claim carries a real file anchor. USE-method data-flow maps exist separately at `.planning/codebase/PROMPT-DATA-FLOW.md` and `.planning/codebase/IA-DATA-FLOW.md`.

## 1. Authority & Consequence Security

The authority kernel is type- and policy-driven, not string-driven:

- **Consequence action taxonomy**: 17 frozen Package-3 consequence actions with per-action policy (action class, proof policy, confirmation fields, recovery class) in `src/modules/authority/context/consequence-authority.ts:167-208` (`PACKAGE_3_CONSEQUENCE_ACTION_POLICY`). Spend/transfer actions (`funding.top_up`, `payout.transfer`) are `irreversible`; `payout.transfer` and all publish actions require `clerk_reverification` (strict preset, `uniquePerCommand: true`); authority-reduction actions require no proof (safe direction asymmetry, `consequence-authority.ts:216-224`).
- **Provenance firewall**: `ServerAuthorityResolutionPort` (consequence-authority.ts:262-267) documents that request bodies/credentials/callback payloads "may select a canonical record in the adapter, but can never become the returned Principal, Account or Grant provenance directly" — identity always resolves server-side from persisted bindings.
- **Two principal classes** with different surfaces: `interactive` vs `workload`; workload surfaces are `callback|worker|job|cron|reconciliation` (`WORKLOAD_AUTHORITY_SURFACES`, consequence-authority.ts:234-241). `AuthorityBoundaryError` carries a closed error-code vocabulary (`authority_surface_invalid|binding_missing|binding_invalid|workload_required|admission_invalid`).
- **Interactive authority (Convex)**: `convex/interactiveAuthority.ts` resolves Clerk-verified identities through binding→credential→principal→account→ownership chains with a 22-code `InteractiveAuthorityError` vocabulary (interactiveAuthority.ts:32-58). Session window anchored at 60s (`INTERACTIVE_OWNER_SESSION_WINDOW_MS`, :17) because "Convex does not surface the JWT `exp` claim on UserIdentity" (:15-16). Context value includes revision objects (`binding|credential|...`) for stale-binding refusal.
- **Agent binding authority**: `convex/authorityBoundary.ts:37-41` enforces strict ref patterns (`prn_/acc_/crd_/grt_` + 32 hex), caps required scopes at 64 (:38), and canonical agent bindings carry `grantGeneration` + `snapshotRef` for stale-generation refusal (:64-77). Writes go through `requireSourceWrite` (:8-10).
- **Clerk reverification hook**: the Clerk dashboard signed claim `{ "reverification_id": "{{session.reverification_id}}" }` is a documented env dependency (`.env.example` Clerk issuer section).

## 2. Network Egress Guard (SSRF)

`src/modules/network-guard/public.ts` implements a full SSRF blocklist:

- Blocked IPv4 ranges: `0.0.0.0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16 (link-local), 172.16/12, 192.168/16, 198.18/15 (benchmark), 224/4, 240/4` plus IPv6 `::, ::1, fc00::/7, fec0::/10, fe80::/10, ff00::/8` (public.ts:14-29).
- **DNS-rebinding defense**: `createGuardedLookup` (public.ts:70-108) is a `LookupFunction` that vetts every resolved address and refuses when *any* resolved address is blocked (not just the first) — all-or-nothing admission, callback rejects with `ECONNREFUSED` ("Storefront importer refused a non-public DNS resolution.", :127-131).
- Hostname blocklist: `localhost`, `local`, `*.local` (public.ts:145-147); bracketed/trailing-dot host normalization (:131-142); **IPv4-mapped IPv6 unmasking** via `::ffff:` extraction checked against the v4 blocklist (public.ts:168-200) — classic bypass closed.
- `isPublicHttpTarget` fails closed: DNS error → `false` (public.ts:56-59).

## 3. Source-Write Admission (server-write trust envelope)

All privileged writes (Convex mutations, server fns) pass a signed-admission seam:

- `src/lib/server/source-write-admission.ts` wraps `@/modules/security/source-write-admission`: middleware attaches admission context per serverFn (:14-21); admission requires the *exact Convex command object* — missing command throws `missing_source_write_request` (:34-37). Body digest + command digest bind the signed envelope to the exact bytes/command (:31-44).
- Key rotation is first-class: per-scope family keys with previous-key and derived-key-ID slots for `BILLING, PROTECTED, CATALOG, OPERATOR, REPAIR, SESSION` families (`.env.example` "Source-write:v2 trust envelope"). Production configures each family as `safeKeyId:at-least-32-byte-secret`; non-production HKDF-derives from `AE_SOURCE_WRITE_SECRET`; "all material is server-only".
- A cron prunes expired admission nonces hourly (`cleanupExpiredSourceWriteNonces`, convex/crons.ts:38-40).

## 4. Request Safety Middleware Chain

Middleware order in `src/start.ts:102-113` (deliberately ordered):

1. `requestCorrelationMiddleware` — `X-AE-Request-Id` propagated; incoming header validated against `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$` else fresh UUID (`src/lib/server/request-correlation.ts:11,22-25`); WeakMap-scoped, echoed on every response incl. redirects (:54-63).
2. `apiRequestBoundaryMiddleware` — blocks `/api/*` paths containing `.`/`%2e` dot-segments before TanStack's encoded-segment normalization, returning RFC 9457 404 (`src/lib/server/api-request-boundary.ts:23-29`); reads the raw Node request URL because TanStack normalizes first (:14-16).
3. `observabilityRequestMiddleware` — Sentry + PostHog, see §6; `/api/health` & `/api/ready` exempt (start.ts:31-33).
4. `securityHeadersRequestMiddleware` — CSP via `resolveCspModeFromEnv()` (`AE_CSP_REPORT_ONLY` env, start.ts:76-82).
5. `agentContentNegotiationMiddleware` — markdown agent pages for bots, placed before auth because public reads (start.ts:85-93).
6. `csrfMiddleware` — TanStack CSRF on `serverFn` handlers only (start.ts:95-97).
7. `sourceWriteAdmissionMiddleware` (§3).
8. `clerkMiddleware` with `authorizedParties: [resolveCanonicalOrigin()]` (start.ts:96-99); local-e2e auth bypass removes Clerk entirely and "fails closed if enabled in production" (`.env.example` `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`).

Body bounds: `readBoundedRequestText` (`src/lib/server/bounded-request-body.ts:33-63`) checks declared `content-length` first, then streams with a running byte counter and cancels the reader on overflow → typed `{ ok: false; code: 'payload_too_large' }` union, never throws on size. Method hygiene: `methodNotAllowed(allowed)` (`src/lib/server/method-guard.ts:10-18`) emits RFC 9457 405 with `Allow` header so "a wrong method doesn't fall through to the SPA shell."

Rate limiting (`src/lib/server/rate-limit.ts`): closed name vocabulary `public-read | public-mutation | oauth-issuance | oauth-device-poll | chat-anonymous | chat-anonymous-edge` (:10-17); admission results are a typed union `{ok:true, retryAfter?} | {ok:false, retryAfter}` (:23-25); the edge chat path uses a *service-authenticated* Convex assertion (`createConvexServerFunctionAssertion`, :60-65) rather than trusting the browser. Admission delegates to Convex source mutations (`rateLimit:admitHttp`, :29-30).

## 5. Error Model (RFC 9457 + google.rpc.Code)

Single canonical model in `src/lib/errors.ts`:

- 14 problem kinds; `no_data` is a *non-error* ok-outcome kind with default status 200 (errors.ts:13-29, 49). Status↔kind bidirectional maps with `kindForStatus` fallback to `UNKNOWN` (:31-55).
- `buildProblem` (errors.ts:118-137) spreads `extras` FIRST so canonical members always win — callers cannot overwrite reserved keys.
- **Untrusted-content firewall**: `remoteProblemToProblem` (errors.ts:247-262) never copies remote `title`/`detail` ("arbitrary backend prose... hostile `--base-url`"); only stable `code` (validated by `^[a-z][a-z0-9_:-]{0,95}$`, `isStableProblemCode` :225-227), canonical `kind`, and retryability cross the boundary. Same policy for provider text in `gatewayFailureToProblem` (:273+): "callers receive stable taxonomy and retryability, never content-shaped exceptions."
- ~41 gateway refusal codes mapped to kinds (errors.ts:157-204): `outcome_unknown → UNAVAILABLE`, `reconciliation_required → FAILED_PRECONDITION`, `budget_exhausted → RESOURCE_EXHAUSTED`, `lease_not_current → FAILED_PRECONDITION`, etc.
- HTTP projection helper `problem()` in `src/lib/server/problem.ts`; per-route 405 via §4.

## 6. Observability & Telemetry Safety

- Wiring is entirely in `src/start.ts:31-63`: lazy dynamic imports, Sentry `withIsolationScope` per request, tags `ae.path` / `ae.request_id` from the correlation context, `captureServerException` in catch, `flushPostHogServer()` in finally with swallow. Config gate: `readObservabilityServerConfig().enabled`; health endpoints exempt; emergency brakes `AE_DISABLE_OBSERVABILITY` / `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC` (`.env.example` observability section).
- **Telemetry sanitization** before send: `sanitizeTelemetryValue`/`sanitizeTelemetryError` from `src/lib/observability/private-route-safety` wrap every path/correlation value and error (start.ts:11, 46-52).
- **Payload redaction**: `src/modules/observability/internal/redaction.ts:8-24` — recursive redaction keyed on `/email|phone|contact|cookie|authorization|secret|token|session/i` → `[redacted]`, with `payloadHash` over the *redacted* payload (`canonicalDigest`) so hashes are stable without storing sensitive material.
- Audit envelope: Package-3 audit events created via `src/modules/observability/public.ts` (`createPackage3AuditEvent`, :36-39) and persisted in `convex/securityShared.ts` (`persistAuditEvent`, referenced at authorityBoundary.ts:34).
- Funnel analytics owned by PostHog, errors by Sentry, "Owner activation milestones stay in Convex" (`.env.example`).

## 7. Fail-Closed Execution Semantics

- **Refusal vocabulary is closed and typed**: `operationInvokeRefusalCodeValues` — 30 codes as a zod enum in `src/modules/capability-execution/operation-invoke-contracts.ts:23-53`; input schema is `z.strictObject` with bounded lengths (`operationRef` ≤300, `idempotencyKey` ≤200, :56-60).
- **Unknown outcomes are never retried automatically**: the retry-class vocabulary includes `reconcile_before_retry` (contracts:73-78), and `reconciliationStateSchema` (:81-88) demands `attemptRef + effectGeneration + evidenceSource` — reconciliation evidence must exist before a retry, `retry` is literally the `'reconcile_before_retry'` literal.
- **Charge states include `outcome_unknown`** as a first-class settlement state (`chargeStateSchema`: `free_tier|paid|insufficient_credit|outcome_unknown|refunded`, contracts:55-61); receipt states `settled|refunded|reconciliation_required` (:115-119). Money is never silently charged/refunded when the provider outcome is unknown.
- Public read projections are refused-not-fabricated: `PublicInvocationCommandResult` unions (`cancelled/not_released` vs `reconciliation_required/possibly_released` vs `reconciled` vs `refused`) in `src/modules/action-invocation/operation-public.ts:56-62` — the `possibly_released` fence survives to the public surface.
- Cross-principal reads refuse with a dedicated code `cross_principal_refused` (operation-public.ts:69, 86-89).

## 8. Privacy & Evidence Redaction (public vs owner views)

- `readPublicInvocationStatus` (`src/modules/action-invocation/operation-public.ts:73-95`) documents its own contract: "Read a durable invocation without returning owner, source, input, or provider material." Authorization against the persisted owner happens *before* any projection; caps: 100 attempts, 100 history rows (:16-17).
- Public shapes expose only refs, generations, states, and digests — `PublicInvocationAttempt { attemptRef, attemptNumber, effectGeneration, release, outcome, retry }` (:27-34); no input/output payloads.
- Observability audit payloads are redacted-by-key-pattern (§6) before hashing.
- Source-unavailable / authority-reader-unavailable codes (errors.ts:169-176) let reads fail closed rather than degrade to weaker projections.

## 9. Background Work Attribution

- All scheduled work is declared in `convex/crons.ts`: 6xx facilitator reconciliation every 15min; facilitator discovery 12h; Agentic-Market snapshots 6h; API registry 24h; market presence & capability-supply readiness hourly; source-write-nonce + OAuth-grant cleanup hourly; daily supplier settlement `0 0 * * *` (crons.ts:8-52). Comment: "Pre-launch cadence... Tighten these only when the market is actually live" (:6-7).
- Every cron routes through `internal.workloadCron.*` — a single attribution gate: `admitWorkloadCron` (`convex/workloadCron.ts:55+`) resolves a declared `WorkloadCronSnapshot` (`declarationByName`) and stamps the **system workload principal** (`SYSTEM_WORKLOAD_PRINCIPAL_REF/ACCOUNT_REF/OWNERSHIP_REF/MEMBERSHIP_REF/OWNER_PRINCIPAL_REF`, workloadCron.ts:22-26) plus `WorkloadContextAdmission` — cron work never borrows user identity; it runs as an explicit dedicated workload principal with delegation-service context (`createConvexDelegationStore/ContextPort`, :24-30). Violations raise `WorkloadCronBoundaryError` (workloadCron.ts:28).
- This pairs with `WORKLOAD_AUTHORITY_SURFACES` (§1): cron/worker surfaces must resolve workload-class authority.

## 10. Accessibility

`.planning/design-system/ACCESSIBILITY.md` (2026-09-01, refreshed) is a source-grounded map, explicitly "not a runtime certification":

- **Baseline (from BRAND.md/DESIGN.md)**: AA text contrast, visible two-part focus indicator, semantic tables/headings, complete keyboard operation, 44px mobile touch targets, `prefers-reduced-motion`, explicit loading/empty/error/recovery states.
- Focus: `--ae-focus-ring` defined as two-layer shadow `0 0 0 2px var(--ae-bg), 0 0 0 4px var(--ae-fg)` in `src/styles/globals.css`; shadcn controls use `focus-visible:ring-[3px]` etc. **Known gap**: the token itself is rarely consumed by components — controls spell out ring utilities, so the central treatment can drift; Dialog/Sheet close buttons use `focus:ring-2` not `focus-visible` and lack 44px sizing.
- Keyboard: command-panel hotkeys (`useCommandPanelHotKeys.ts` — Cmd/Ctrl-K, `/`, Escape with text-entry guards); Radix primitives own focus traps; skip links in `AePublicShell`/`AeOperatorShell`; operator table uses `@radix-ui/react-roving-focus` (`AeOperatorDataTable.tsx`); real `<table>` with `<caption>`, `aria-sort` headers.
- Automated coverage is narrow: `tests/e2e/a11y/` has only 3 specs — `engine-product-a11y.spec.ts`, `operator-shell-a11y.spec.ts`, `developer-discovery-a11y.spec.ts`; the doc flags no exhaustive check of operator forms, dialogs/sheets, chat, reduced motion, touch geometry, or measured contrast. Broader e2e suites exist in `tests/e2e/` (`application-recovery.spec.ts`, `local-auth-boundary.spec.ts`, `package3-account-security.spec.ts`, `multi-agent-lifecycle.spec.ts`, authenticated `global.setup.ts`).

## 11. Runtime & Secrets

- **Node 22 is required** for Convex (memory + repo convention; scripts assume it).
- `.env.example` is the secrets inventory; all secrets are server-only "never expose to Vite" except `VITE_*` publishable keys. Families:
  - Auth: Clerk publishable/secret keys, webhook signing secret, JWT issuer domain, reverification claim.
  - Source-write keyring (§3): 6 families × key/previous-keys/derived-key-ids + base secret.
  - x402 payer custody: CDP Server Wallet (`CDP_API_KEY_*`, `CDP_WALLET_SECRET`); "Raw private keys are development-only and rejected by the production gate"; exact per-call 10,000 / daily 50,000 caps; non-secret `AE_X402_CDP_POLICY_RULES_DIGEST` gates the signing preflight; custody caps `AE_X402_CUSTODY_MAX_ATOMIC/DAILY_MAX_ATOMIC`; RPC endpoints pinned via `AE_X402_RPC_URLS_JSON` with an EVM-network map.
  - Billing: Autumn + Stripe, "provider readiness is proven by source-owned readback rows, not env presence"; production host allowlist (api.useautumn.com, api.stripe.com); production accepts live-mode Stripe keys only.
  - Model/proxy: `OPENROUTER_API_KEY`, `AE_LLM_MODEL=deepseek/deepseek-v4-flash`, `AE_CHAT_PROXY_SECRET`.
  - Integrity keys: chat-share HMAC, inquiry access/receipt KEK, governed-send integrity, customer-request journey signing — each with key-id rotation slots.
  - E2E/dev: local auth bypass (`VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, production fail-closed), authenticated-e2e gate (`AE_REQUIRE_AUTHENTICATED_E2E` fails closed unless fully configured), destructive paid smoke gated by `AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND=false` default.
- **Programmatic secret plane** at `src/modules/secrets/`: typed `SecretPlane`/`SecretPointer`/`SecretMaterialLease` abstractions (`public.ts` re-exports `secret-plane.ts`), `InfisicalCloudSecretStore` with Vercel OIDC identity-token provider (`vercel-oidc.ts`), `createProductionSecretRuntime`, `ProductionSecretGenerationValidator` + `ProductionSecretLifecycleService` with journal and rotation (`production-lifecycle.ts`). Ephemeral material is leased via `withEphemeralSecretMaterial` — long-lived plaintext copies are avoided by design.

## 12. Cross-Cutting Invariants (summary)

| Concern | Mechanism | Anchor |
|---|---|---|
| Provenance | Identity resolved server-side; request bodies never become provenance | consequence-authority.ts:262-267 |
| Egress | IPv4+IPv6+CGNAT+link-local blocklist, DNS-rebinding-proof lookup, mapped-v6 unmasking | network-guard/public.ts:14-108,168-200 |
| Server writes | Signed per-family admission bound to exact command digest; key rotation slots | lib/server/source-write-admission.ts; .env.example |
| Methods/paths | 405 w/ Allow; API dot-segment boundary pre-TanStack | method-guard.ts:10-18; api-request-boundary.ts:23-29 |
| Errors | RFC 9457 + google.rpc.Code, no remote prose crossing boundary | lib/errors.ts:118-137,247-262 |
| Telemetry | Sanitized values/errors, redacted-by-pattern payloads hashed post-redaction | start.ts:44-52; observability/internal/redaction.ts |
| Fail-closed | Closed refusal enums, `outcome_unknown` charge state, `reconcile_before_retry` mandatory evidence | operation-invoke-contracts.ts:23-88 |
| Privacy | Public projections exclude owner/input/provider material; auth before projection | operation-public.ts:73-95 |
| Background | All crons via workload principal admission, never user identity | convex/crons.ts; workloadCron.ts:22-26 |
| A11y | AA baseline, double-focus token (partially consumed), 3 a11y e2e specs | .planning/design-system/ACCESSIBILITY.md; tests/e2e/a11y/ |
| Secrets | Server-only env families with rotation slots + programmatic lease-based SecretPlane | .env.example; src/modules/secrets/ |
