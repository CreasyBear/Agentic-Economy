# ADR-001: Scope 1 — Production landing

Status: Proposed
Date: 2026-07-03
Scope: 1 — Production landing

## Context

AE is deploy-unproven. Every load-bearing capability is validated by
source/local checks; the five deployed provider smokes are open and the
0/5 friendly-owner activation debt gates all launch claims
(`.planning/STATE.md` Blockers §L163-171; `.planning/codebase/CONCERNS.md`
§Tech Debt L7-11, §Missing Critical Features L187-210). The approved
direction (`local://five-scopes.md` §"Scope 1") is to convert local proof
into a deployed product and clear the STATE.md blockers, plus five named
hardening items: security-header middleware, a canonical base-URL helper,
auth canonicalization to `tokenIdentifier`, an `agentTools` snapshot test,
and a source-state index guard. Scope 1 blocks every other scope
(five-scopes.md §Sequencing: "S1 -> everything").

Why now: scopes 2-5 add agent identity, capability supply, a message rail,
and a widened action set on top of this substrate. Landing auth
canonicalization and the agent-door surface lock *before* scope 3 attaches
identity is a stated prerequisite (five-scopes.md §"Scope 1"; CONCERNS.md
§Security L53-57). This ADR must not silently violate a ROADMAP door; it
touches the Phase 2 provider smokes and the Phase 5/6 money doors, which
stay test-mode/sandbox only (ROADMAP.md §Decision-door register L22, L24).

## Grilling record

### Q1 — What deploy target does the repo already assume? Is it decidable?
Evidence: `tests/deploy-smoke/vercel-bypass.ts` reads
`VERCEL_AUTOMATION_BYPASS_SECRET` and sends `x-vercel-protection-bypass`
(L30-40); `vite.config.ts:13` falls back to `VERCEL_GIT_COMMIT_SHA` for the
Sentry release; `.planning/phases/02-.../02-DEPLOY-SMOKE-BLOCKERS.md`
probes `https://agentic-economy-phi.vercel.app` (L30-63). Stack is
`@tanstack/react-start` + `nitro` (`nitro-nightly`) + `vite`
(`package.json` deps). There is **no** `vercel.json`, `nitro.config.*`, or
`app.config.*` in the repo (glob returned only `vite.config.ts`), so the
Nitro preset is auto-detected at build, not pinned.
Answer: Vercel is the de-facto assumed target across tests, build, and
blocker probes. It is decidable and adopted. The open residue is narrow —
whether to *pin* the Nitro preset and choose the node vs edge runtime for
the header middleware, and whether Vercel's runtime meets scope-3
agent-signature verification (ticket T2). Confidence: **high** (target),
medium (runtime pin).

### Q2 — Exact ordered plan for the 5 deploy smokes; env graph; test-mode vs live; evidence format?
Evidence — the `required` env blocks read directly from the specs:
- **phase2-support** (`phase2-support-record-smoke.spec.ts:41-44`):
  `DEPLOY_BASE_URL`, `SMOKE_PHASE2_BUSINESS_SLUG`. No provider send — it
  drives the public `/{slug}/inquiry` form and asserts it renders the human
  inquiry form (not "Inquiry unavailable"). Deployed server still needs
  Convex source state + a complete `human_inquiry_owner_inbox` support row
  (blocker doc L65-85).
- **resend** (`phase2-resend-dispatch-smoke.spec.ts:48-52`):
  `DEPLOY_BASE_URL`, `AE_NOTIFICATION_OUTBOX_SECRET`,
  `SMOKE_NOTIFICATION_DISPATCH_ID`. Needs a real Resend account
  (`RESEND_API_KEY`, `RESEND_FROM`) on the server; dispatch ID must be an
  inquiry-created owner Resend dispatch proven via `/admin/inquiries`
  (blocker doc L87-94). No Resend "test mode" — sends to an operator inbox.
- **novu** (`phase2-novu-dispatch-smoke.spec.ts:51-55`): same shape with
  `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`; needs `NOVU_SECRET_KEY`,
  `NOVU_WORKFLOW_INQUIRY_OWNER`.
- **phase5 autumn-stripe** (`phase5-...spec.ts:70-79`): 8 vars incl.
  `SMOKE_P5_OWNER_STORAGE_STATE` (owner Clerk session file),
  `SMOKE_P5_BUSINESS_SLUG`, `..._BILLING_OPERATION_ID`, `..._RECEIPT_ID`,
  `..._PROVIDER_EVENT_ID`, `..._RECONCILIATION_ID`, `..._PUBLIC_CLAIM_TEXT`.
  Autumn `sandbox` (`.env.example:13`) + Stripe test-mode.
- **phase6 stripe** (`phase6-...spec.ts:71-82`): 10 vars, all source-owned
  refs passed through `assertSourceEvidenceRef`, `operatorNextAction`
  passed through `assertRedactedOperatorNextAction`. Stripe test-mode only
  per `06-MONEY-EVIDENCE-DECISION.md` (ROADMAP.md L226).
Shared root: `DEPLOY_BASE_URL` must be HTTPS and non-localhost (every spec's
`parseHttpsUrl`). resend/novu depend on a real inquiry, which depends on
phase2-support being green on the same slug. Evidence artifact format is
prescribed by the blocker doc (L125): timestamps, deployed host, slug,
non-secret inquiry/thread refs, dispatch IDs, provider family, redacted
provider refs, payload hashes, final states, readback state, operator next
action, and an explicit "no secret values recorded" statement.
Answer: ordering is decidable now (D2). Green execution is not — it needs
real accounts nobody has recorded (ticket T4). Confidence: **high**.

### Q3 — Security headers: app middleware vs deployment layer?
Evidence: `src/start.ts` composes TanStack Start `requestMiddleware`
(observability, `createCsrfMiddleware` filtered to `serverFn`,
source-write-admission, clerk) — L52-59, proving middleware runs for all
handler types and filters per type. `src/routes/__root.tsx` sets **no**
security headers (grep clean). Only `api.discovery.schema.ts:57` sets
`X-Content-Type-Options: nosniff`. CONCERNS.md L65-69 flags page-level
protections as relying on unchecked deployment config.
Answer: implement headers at the **app layer** (a new response middleware
in `start.ts`) so they are source-owned and in-process testable, not solely
`vercel.json`. The hard part is a CSP that does not break TanStack SSR
hydration + injected `ld+json`/Clerk/PostHog/Sentry scripts — that needs a
prototype (ticket T1). Confidence: **high** (location + header set), medium
(exact CSP directives).

### Q4 — Canonical base-URL helper: env var, allowlist, fallback, routes to migrate?
Evidence: six routes each define a private `requestOrigin(request)` that
returns `new URL(request.url).origin` and falls back to the placeholder
`https://ae.example` — `llms.txt.ts:35`, `sitemap.xml.ts:37`,
`robots.txt.ts:24`, `$slug.ucp.ts:71`, `api.discovery.schema.ts:205` (also
the developer-discovery snapshot at :98-172), and the default in
`src/modules/discovery/internal/discovery-files.ts:37,76,94`. Worse,
`src/routes/$slug.tsx:32` **hardcodes** `canonicalBaseUrl:
'https://ae.example'` for the business-page SEO — production `rel=canonical`
would point at the placeholder domain, and the phase1 smoke only asserts the
canonical path contains the slug (`phase1-deploy-smoke.spec.ts:175`), so the
bug passes today. No canonical env var exists (`.env.example` has
`VITE_CONVEX_URL` but no site/base URL).
Answer: add a server helper (`resolveCanonicalBaseUrl(request)`) reading a
new env var, host-allowlisted, request-origin used only as a validated
fallback. Migrate all seven sites above. The `$slug.tsx` hardcode is a real
bug fixed first. Confidence: **high** (routes + bug); env-var name is a
proposal (D4). Confidence on name: medium `[INFERENCE]`.

### Q5 — Auth canonicalization to `tokenIdentifier`: migration + tests?
Evidence: `convex/authz.ts:74` sets `clerkUserId: identity.subject` (not
`tokenIdentifier`, which is only stored as `sessionRef` at :77). Admin
authority looks up membership by `clerkUserId` (=subject) via the
`by_clerkUserId_state` index (`authz.ts:56-63`; lookup registered in
`source_state.ts:370`). `adminMemberships` rows are keyed by `clerkUserId`.
CONCERNS.md L53-57 records that Convex guidance recommends `tokenIdentifier`
and that `auth.config.ts` pins a single Clerk issuer. Because the issuer is
pinned, `tokenIdentifier = "${issuer}|${subject}"` is deterministically
derivable from existing rows.
Answer: canonicalize to `tokenIdentifier` (documented as issuer+subject) via
widen-migrate-narrow (D5): add `tokenIdentifier` to `adminMemberships`,
backfill existing rows, run a dual-read window (accept subject OR
tokenIdentifier) for one deploy, then narrow to tokenIdentifier-only. Must
land before scope 3. Tests extend `tests/unit/convex/authz.test.ts`.
Confidence: **high** (deterministic backfill); the dual-read necessity vs
atomic switch is the one open item (Convex rollout atomicity — ticket T3).

### Q6 — `agentTools` snapshot test: exact assertion set + location?
Evidence, read directly:
- `registry.list` — `surfaces: ['http','agentJson']`, `readOnly: true`
  (`registry.actions.ts:206,219-220`) → **excluded** from agentTools ✓.
- `registry.search` — `surfaces: ['http','agentJson','agentTools']`,
  `readOnly: true` (`:231,246-247`).
- `registry.detail` — `surfaces: ['http','agentJson','agentTools']`,
  `readOnly: true` (`:261,274-275`).
- `inquiry.submit` — `surfaces: ['agentJson','agentTools']`,
  `readOnly: false` (`inquiry.actions.ts:97,111-112`) — the sole write.
Answer: a snapshot unit test (D6) asserting exactly
`{registry.search, registry.detail, inquiry.submit}` expose `agentTools`;
`registry.list` explicitly excluded; among agentTools actions only
`inquiry.submit` is a write (`readOnly:false`); plus the answer-thread
tool-runner rejects non-read tools. Runs under `test:unit`.
Confidence: **high**.

### Q7 — Source-state index guard + registrySearchDocuments read model: mechanism?
Evidence: `convex/source_state.ts` declares `indexedUpsertLookups`
(L362-374) and `findExistingUpsertRow` (L284-305) returns `undefined` when a
spec has no lookup, which makes `applyUpsert` fall back to
`(await collect(db, table)).find(...)` (L269-270) — the silent scan CONCERNS
warns about (L25-29, L91-96). `registrySearchDocuments` has a `by_documentId`
lookup (L367) and is the required search read model:
`convex/registry.ts:545-549` queries it via
`withSearchIndex('search_searchText_by_publicStatus')` with a bounded
fallback scan `readPublicCatalogsFromPublishedBusinessScan(... SEARCH_FALLBACK_BUSINESS_SCAN_LIMIT)`
(L525-531).
Answer (D7): (a) a unit test enumerates every `UpsertSpec` table built in
`source_state.ts` and asserts `indexedUpsertLookup(table, fields)` resolves,
failing when any persisted table would fall to `collect()`. (b) A
test/metric fails when the registry-search fallback scan is exercised for
the seeded catalog, and emits a "search fallback used" metric so production
fallback usage is visible. Whether to *delete* the `collect()` fallback
entirely vs keep it guarded is an open design call (ticket T7).
Confidence: **high** (mechanism).

### Q8 — Minimal CI gate justified today, and where?
Evidence: `.github/workflows/eval-gate.yml` is the only CI. It runs on
push/PR to `main`: `typecheck`, `check:convex-codegen`, `test:unit`,
`test:integration`, `test:copy`, `test:ui-contract`, `test:imports`,
`test:eval`, `build` (L27-68). It does **not** run `test:types`,
`test:source-mining`, `test:ts-standards`, `test:seo`, `test:e2e`,
`test:a11y`, or any deploy-smoke. `package.json` already defines
`test:all` (adds types/source-mining/ts-standards/seo) and `test:release`
(adds eval/graph-freshness/e2e/a11y).
Answer (D8): extend the PR gate with the cheap deterministic scans it is
missing (`test:types`, `test:source-mining`, `test:ts-standards`,
`test:seo`) plus the three new unit tests from D6/D7/security (they ride
`test:unit`). Deploy-smokes stay OUT of the PR gate (need secrets/deployed
env) — a separate manual/scheduled deployed job emits evidence artifacts.
e2e/a11y stay off the blocking gate for now (browser flake is a separate
remediation track) and run nightly — the exact boundary is ticket T6.
Confidence: **high** (cheap adds), medium (e2e placement).

### Q9 — What engineering work unblocks the 0/5 friendly-owner activation evidence?
Evidence: STATE.md L165-166 (0/5 rows; internal-alpha/launch blocked),
five-scopes.md §"Scope 1" ("Unblocks the 0/5 friendly-owner activation
debt"), ROADMAP.md L106 ("Owner activated" = publish succeeded + owner
viewed status + copied/shared URL or submitted next-capability interest +
attribution exists). The blocker doc shows the deployed inquiry form
rendering "Inquiry unavailable / not public" (L56-65) — no eligible
published business with a support row exists on the deployment.
Answer (D9): engineering unblocks activation by making the deployed
claim→publish→status→inquiry loop work on Vercel with a seeded eligible
business + `human_inquiry_owner_inbox` support row + green notification path
(i.e. the same substrate as D2/T4) and by keeping owner-activation
attribution readback intact. Capturing the *five real owner packets* is a
GTM/user action, not engineering, and remains deferred debt (STATE.md L122;
user accepted 2026-06-28). Confidence: **high**.

## Decisions

- **D1.** Adopt **Vercel** as the canonical scope-1 deploy target
  (evidence: vercel-bypass, `VERCEL_GIT_COMMIT_SHA`, `phi.vercel.app`).
  Pin the Nitro preset explicitly (`preset: 'vercel'`) and standardize the
  server runtime so the header middleware behaves identically in dev and
  prod. This is a two-way door until scope 3 (revisit only if agent-signature
  verification needs an edge/runtime Vercel cannot serve — T2).
- **D2.** Run the five smokes in this order once env is provisioned:
  (1) `test:phase2-support-smoke` → (2) create a real inquiry via
  `/{slug}/inquiry` to mint owner Resend + Novu dispatch IDs, proven through
  `/admin/inquiries` → (3) `test:provider-smoke:resend` → (4)
  `test:provider-smoke:novu` → (5) seed a P5 billing operation then
  `test:provider-smoke:autumn-stripe` → (6) seed a P6
  request→checkpoint→receipt + test-mode Stripe checkout/event then
  `test:provider-smoke:business-action-stripe`. All run against
  sandbox/test-mode providers; **no live money** (ROADMAP.md L22, L226).
  Evidence artifacts follow the blocker-doc non-secret schema (L125).
- **D3.** Implement browser security headers as a **source-owned TanStack
  Start response middleware** in `src/start.ts`, not deployment-only config.
  Minimum header set on HTML and JSON routes: `Content-Security-Policy`
  (with `frame-ancestors 'none'`), `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` (deny
  geolocation/camera/microphone by default), `X-Content-Type-Options:
  nosniff`, and `X-Frame-Options: DENY` (belt-and-braces with
  frame-ancestors). Assert them in the **existing** phase1 deploy smoke by
  extending `RouteExpectation` with a per-route `securityHeaders` check
  (`phase1-deploy-smoke.spec.ts` publicRoutes loop).
- **D4.** Add a server helper `resolveCanonicalBaseUrl(request)` backed by a
  new env var **`AE_CANONICAL_BASE_URL`** `[INFERENCE: name proposed;
  matches the `AE_` server-config convention in `.env.example`]` and a host
  allowlist env var `AE_CANONICAL_HOST_ALLOWLIST` (comma-separated). Policy:
  prefer the configured canonical; use `new URL(request.url).origin` only
  when its host is in the allowlist; **never emit `https://ae.example` in
  production**. Migrate: `$slug.tsx` (fix the hardcode first), `llms.txt.ts`,
  `sitemap.xml.ts`, `robots.txt.ts`, `$slug.ucp.ts`,
  `api.discovery.schema.ts` (response + developer-discovery snapshot), and
  the `discovery-files.ts` default. Add route tests for forwarded-host and
  explicit-canonical scenarios.
- **D5.** Canonicalize authority identity to `tokenIdentifier` (documented
  as issuer+subject) in `convex/authz.ts`, using widen-migrate-narrow: add
  `tokenIdentifier` to `adminMemberships` with a new index, backfill
  existing rows (`${issuer}|${subject}`, deterministic given the pinned
  issuer), run a one-deploy dual-read window (subject OR tokenIdentifier),
  then narrow to tokenIdentifier-only. Extend
  `tests/unit/convex/authz.test.ts` with tokenIdentifier-keyed membership, a
  dual-read case, and a wrong-issuer rejection. This lands **before** scope
  3 attaches the agent-identity surface.
- **D6.** Add an `agentTools` surface snapshot unit test
  (`tests/unit/modules/actions/agent-tools-surface.test.ts`) asserting:
  exactly `{registry.search, registry.detail, inquiry.submit}` expose
  `agentTools`; `registry.list` explicitly excluded; among agentTools
  actions only `inquiry.submit` is a write; and the answer-thread tool-runner
  rejects non-read tools. Any future agentTools write requires an explicit
  boundary test.
- **D7.** Add a source-state index guard unit test that fails when any
  `UpsertSpec` table lacks a resolving entry in `indexedUpsertLookups`
  (i.e. would fall to `collect().find`). Enforce `registrySearchDocuments`
  as the required search read model: a test/metric fails when the
  registry-search fallback scan is exercised for the seeded catalog and
  emits a "search fallback used" metric.
- **D8.** Extend `.github/workflows/eval-gate.yml` (the PR gate) with
  `test:types`, `test:source-mining`, `test:ts-standards`, and `test:seo`;
  the D3/D6/D7 tests ride `test:unit`. Deploy-smokes run in a separate
  manual/scheduled deployed job (secrets required), never on the PR gate.
  e2e/a11y stay off the blocking gate (nightly) pending T6.
- **D9.** Scope 1 delivers the deployed claim→publish→status→inquiry loop +
  attribution readback that owners activate against; the five owner
  activation packets remain GTM-side deferred debt, not engineering scope.

## Consequences

Positive:
- Every scope-1 claim becomes deploy-provable, not source/local only,
  clearing STATE.md blockers and the launch-gating activation debt.
- Auth, agent-door surface, canonical URLs, and index invariants are locked
  and CI-guarded *before* scopes 2-5 build on them, shrinking their blast
  radius.
- The `$slug.tsx` canonical-host bug (production `rel=canonical` →
  `ae.example`) is fixed, removing a live SEO/discovery defect.

Negative / cost:
- Requires provisioning real Resend/Novu accounts and sandbox
  Autumn/Stripe + operator Clerk storage-state artifacts and seeded
  deployed source state — coordination and secret-handling overhead.
- A CSP that does not break SSR hydration + third-party scripts is
  non-trivial and may need iteration (T1).
- The authz migration is a multi-deploy sequence (widen → backfill →
  dual-read → narrow), not a single commit.

Risks:
- Resend has no test mode; the provider smoke sends a real email to an
  operator inbox — mis-scoped recipients could leak. Mitigation: dedicated
  operator address, redacted evidence only.
- A too-strict CSP silently breaks Clerk/PostHog/Sentry/maps at runtime
  without failing the smoke. Mitigation: prototype against live third-party
  scripts before enforcing; add report-only phase.
- Committing to Vercel is a soft one-way door if scope-3 signature
  verification needs an unsupported runtime (T2).

## Alternatives considered

- **Security headers in `vercel.json` / Nitro `routeRules` only** — rejected:
  not source-owned, invisible to in-repo tests, and CONCERNS.md L65-69
  explicitly flags reliance on unchecked deployment config.
- **Keep per-route `requestOrigin` derivation** — rejected: it already
  produces the `ae.example` fallback and the `$slug.tsx` hardcode bug, and
  emits inconsistent hosts under proxy forwarding (CONCERNS.md L123-127).
- **Atomic one-commit switch to `tokenIdentifier`** — rejected: a rolling
  Vercel/Convex deploy can interleave old subject-keyed writes with new
  tokenIdentifier reads; dual-read is safer (open verification is T3).
- **Put all suites (`test:release`, incl. e2e/a11y/deploy-smoke) on the PR
  gate** — rejected: deploy-smokes need secrets/deployed env, and e2e is a
  known-flaky separate remediation track; blocking PRs on them stalls
  delivery.
- **Cloudflare hosting now (to pre-stage scope-3 Web Bot Auth)** — rejected:
  WBA is an identity *verification* dependency, not a hosting requirement,
  and the whole toolchain already assumes Vercel; premature migration.

## Boundary posture

Scope 1 ships no new public capability — it deploys and hardens the
existing Phase 1-3 surface plus test-mode Phase 5/6 evidence. It stays
inside the AGENTS.md trust contract:
- No copy change claims booking/payment/dispatch/autonomous fulfillment.
  P5/P6 smokes are sandbox/test-mode; **live money stays gated** on the
  money-rail decision records (ROADMAP.md L22, L226; STATE.md L169-170).
- "Verified" is not introduced anywhere; deployed evidence uses
  "checked"/"published"/"last checked" language. Evidence artifacts record
  env-var *names*, receipt/dispatch IDs, and redacted refs only — no secret
  values (blocker doc L125; CONCERNS.md L77-81).
- The `agentTools` surface stays exactly `{registry.search, registry.detail,
  inquiry.submit}` with `inquiry.submit` the only write; the snapshot test
  (D6) makes any widening a deliberate, boundary-tested act.
- Security-header and canonical-URL work is hardening, not new nav/surface;
  no future-surface or protocol vocabulary reaches human copy.

## Open questions -> tickets

- Prototype a CSP that survives TanStack Start SSR
- Confirm Vercel runtime meets scope-3 agent-signature needs
- Verify Convex rollout safety for tokenIdentifier authz migration
- Stand up deployed env and capture five smoke evidence artifacts
- Decide if P5/P6 live-mode money smokes stay out of scope 1
- Set CI gate boundary: blocking PR suites vs nightly
- Decide whether to delete the source-state collect() fallback

## References

- `local://five-scopes.md` §"Scope 1", §Sequencing
- `AGENTS.md` §What AE is not, §The safe contract, §Actions
- `.planning/ROADMAP.md` §Decision-door register (L22, L24), Phase 2/5/6
- `.planning/STATE.md` §Blockers (L163-171), §Decisions (L122)
- `.planning/codebase/CONCERNS.md` §Tech Debt, §Security, §Fragile Areas,
  §Test Coverage Gaps
- `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md`
- `tests/deploy-smoke/{phase1,phase2-support-record,phase2-resend-dispatch,phase2-novu-dispatch,phase5-paid-activation-provider,phase6-business-action-stripe}-*.spec.ts`
- `tests/deploy-smoke/vercel-bypass.ts`
- `src/start.ts`; `src/routes/__root.tsx`; `vite.config.ts`
- `convex/authz.ts`; `convex/source_state.ts`; `convex/registry.ts`
- `src/routes/{llms.txt,sitemap.xml,robots.txt,$slug.ucp,api.discovery.schema,$slug}.ts(x)`;
  `src/modules/discovery/internal/discovery-files.ts`
- `src/modules/registry/registry.actions.ts`;
  `src/modules/inquiries/inquiry.actions.ts`
- `.github/workflows/eval-gate.yml`; `package.json` scripts
- `local://research-ae-seams.md` (agent-door anonymity; authz coupling)
