# Phase 1: Ten-Star Spine Foundation — Specification

**Created:** 2026-06-27
**Ambiguity score:** 0.09 (gate: ≤ 0.20)
**Requirements:** 10 locked

## Goal

A launch-ICP Australian urgent/local-service owner can claim without ABN, publish a truthful public business service catalog, appear in registry/search/API and AE-hosted discovery, see visibility and discovery health, and be safely suppressed or repaired by source-owned operator controls.

## Background

Current repo state is planning-only. `node .codex/gsd-core/bin/gsd-tools.cjs init phase-op 1` finds Phase 1 at `.planning/phases/01-ten-star-spine-foundation`; Phase 2-5 are roadmap phases but do not yet have GSD phase directories. The fresh repo still has no `package.json`, `apps/`, `src/`, `convex/`, or `tests/` runtime tree. `.planning/REQUIREMENTS.md` is referenced by GSD init but is absent, so this SPEC remains the locked Phase 1 what/why source for discuss/plan.

Authority docs already exist for the phase boundary: `PROJECT.md`, `ENGINEERING-STANDARDS.md`, `SOURCE-MINING.md`, `source-mining/phase-1-ledger.md`, `SECURITY-SPEC.md`, `AI-SPEC.md`, `SEO-AEO-SPEC.md`, `GTM-READINESS.md`, `PRODUCT-LENS.md`, `ROADMAP.md`, `STATE.md`, `PHASE.md`, `PREMORTEM.md`, and `FABLE-5-FOUNDATION-REVIEW.md`. The old kickoff context and deleted PR00 plan are no longer executable inputs; source-mining evidence is preserved in `.planning/source-mining/phase-1-ledger.md`.

The accepted Phase 1 story is Sam from Parramatta Emergency Plumbing: Sam claims without ABN, publishes emergency plumbing service facts and a safe first-request disclosure, appears on `/{slug}`, `/registry`, `/api/businesses/search?q=emergency+plumber+parramatta`, `/{slug}/ucp`, and `/llms.txt`, sees separate status/readback fields, and can be fully removed from every public output by suppression.

## Requirements

1. **Source-mining and import guardrails**: Phase 1 implementation must prevent copied backup runtime code, future-surface directories, phase-numbered runtime names, and banned Phase 1 symbols before runtime work proceeds.
   - Current: `source-mining/phase-1-ledger.md` records source evidence and banned scan seed; no executable runtime scans exist because runtime substrate is absent.
   - Target: PR01 creates executable `test:imports` and `test:source-mining` gates over runtime source and fixtures, using the ledger as the source-mining contract.
   - Acceptance: Seeded bad fixtures fail for backup path imports, banned future-surface identifiers, phase-numbered runtime names, and direct route/private-module coupling; clean runtime source passes; every mined backup source is represented by a ledger row before adaptation.

2. **Durable source model and type contracts**: Phase 1 must define Convex-owned source state, literal unions, validators, indexes, idempotency state, admin authority, audit events, funnel events, owner activation state, and projection attempt state before public catalog data is exposed.
   - Current: Tables, indexes, state unions, public seams, and audit/event shapes are specified in planning docs only; no Convex schema or module types exist.
   - Target: `convex/` and `src/modules/**` contain one owner per state machine: business, catalog, registry, discovery, lifecycle, observability, security, and seo.
   - Acceptance: `npm run check:convex-codegen`, `npm run typecheck`, `npm run test:types`, and `npm run test:ts-standards` prove state variants match `PROJECT.md`, validators infer the exported domain types, required maps are exhaustive, no `any`/`as any`/`as unknown as`/non-null assertions/`v.any()`/broad status strings exist in domain paths, and all required indexes are present for public/admin queries.

3. **Claim and publish without ABN**: An authenticated launch-ICP owner must be able to claim and publish a business without ABN when required T0 facts are valid, with non-empty service rows, safe first-request disclosure, CSRF/Origin protection, rate limiting, duplicate detection, wrong-owner rejection, and idempotent publish behavior.
   - Current: Claim/publish behavior exists only as a Phase 1 plan and source-mining invariants from the backup repo.
   - Target: `claimBusiness`, `publishBusinessCatalog`, `rateLimitClaim`, `detectDuplicateClaim`, and `assertCsrf` are module/Convex seams; routes never accept browser-supplied actor/owner/admin authority.
   - Acceptance: Tests prove no-ABN claim succeeds; empty service list, missing/foreign CSRF, anonymous publish, wrong-owner publish, rate-limit, and duplicate/suspicious claim paths return typed failures and audit events; repeated publish with the same logical key yields one business/service/capability state transition and one projection/audit side effect per target.

4. **Public business page and owner status readback**: `/{slug}` and owner/status UI must render source-owned service facts, workflow-critical unavailable capabilities, separate `publicStatus`, `trustTier`, `indexStatus`, `discoveryStatus`, service/capability status, `callable=false`, `paymentRequired=false`, and next actions without public overclaims.
   - Current: Public routes and UI are absent.
   - Target: `apps/web` route adapters consume only public module DTO/result unions; public and owner-facing copy avoids protocol jargon and does not claim booking, payment, verification, partner integrations, guaranteed demand, agent action, or owner response.
   - Acceptance: E2E proves no-ABN claim to published page; mobile 375px, keyboard/focus, labels/errors, loading, empty, invalid input, publish pending, publish failed, published-not-indexed, degraded discovery, unavailable capability, suppressed/unavailable, and noindex/not-found states are covered; copy scan passes across route text and form validation.

5. **Registry/search/API from one catalog DTO**: `/registry`, `/api/businesses`, `/api/businesses/search?q=`, and `/api/businesses/{slug}` must expose eligible published catalog facts from the same allowlisted public DTO or explicit subset.
   - Current: Public JSON catalog routes are planned but absent.
   - Target: List/search/detail routes return stable slugs/IDs, stable pagination, explicit empty and 404 behavior, business/service/category/suburb/service-area search matching, no private owner/contact fields, and schema parity with `/{slug}`, `/{slug}/ucp`, `llms.txt`, sitemap, and registry projections.
   - Acceptance: Tests prove published eligible business services appear; unpublished/suppressed businesses and scoped suppressed services are absent; search matches the Sam emergency plumber story; empty search returns an explicit empty result; missing slug returns 404; API DTOs never include raw owner/contact/admin/private evidence fields.

6. **Projection attempts, readback, and repair**: Registry and discovery projection attempts must be durable, source-hashed, retryable, operator-visible, and repairable from Convex source state without duplicate audit or projection side effects.
   - Current: `indexStatus`/projection attempts and repair loops are specified but not implemented.
   - Target: Publish queues registry and discovery attempts; attempts store logical key, source hash/version, retry state, failure code, redacted error, started/finished timestamps, latest readback, stale thresholds, and repair actions.
   - Acceptance: Forced adapter/manifest failure persists a failed attempt, owner/operator readback names affected business/service/public surfaces and next repair action, retry/rebuild succeeds from Convex source, stale threshold produces a readback, and repeated retry does not duplicate audit/projection rows.

7. **Honest AE-hosted discovery**: AE-hosted `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, and public discovery headers must be generated from eligible source catalog state, route-tested, suppression-aware, stale-aware, and explicit that Phase 1 has no callable, payment, MCP, OpenAPI, API-key, or standard merchant-origin UCP capability.
   - Current: AI/discovery contract exists in `AI-SPEC.md`; no routes or generators exist.
   - Target: Discovery outputs include `pathKind='ae_hosted_fallback'`, version/source hash/status/readback, source-owned services, safe first-request disclosure, explicit negative capability flags where needed, valid content-type/cache/CORS/no-store behavior, and only advertised URLs that resolve.
   - Acceptance: Tests prove valid published and degraded manifests; suppressed business or scoped suppressed service has no public manifest exposure and is absent from search/API/sitemap/llms; dead-link test passes; prompt-injection fixture stays inert; `.well-known/ucp`, MCP, OpenAPI, API key, payment, payment-required, callable, agent-callable, and truthy `paymentRequired`/`callable` claims fail copy/output scans.

8. **Source-owned admin, suppression, dispute, removal, and operator controls**: Admin and recovery paths must enforce source-owned role/action permissions, deny non-admin access, audit denied actions, and remove suppressed or ineligible records from every public surface.
   - Current: Security/admin roles, permission matrix, suppression, disputes, removal, and operator controls are specified only in planning docs.
   - Target: `/admin/claims`, `/admin/audit-events`, `/admin/index-health`, `/privacy/remove-business`, admin membership, dispute, suppression, and operator-control modules exist before public discovery exposure.
   - Acceptance: Non-admin `/admin/*` returns 401/403; reviewer/support are denied for suppression, membership changes, operator controls, and dispute-close transitions with `admin.action_denied`; owner_admin grant/revoke/break-glass and emergency suppression are audited with evidence/reason/correlation ID; suppression hides page, registry, API, search, sitemap, llms, and UCP through one eligibility predicate.

9. **Lifecycle descriptor contract only**: Phase 1 must preserve lifecycle primitives as a descriptor-only moat without shipping workflow/action/payment/proof runtime.
   - Current: Lifecycle primitives are in planning docs and source-mining anchors only.
   - Target: `src/modules/lifecycle` exports literal primitives `held_money`, `external_authority`, `time_bound`, and `proof_gap`, plus one reference vertical descriptor and tests; no runtime engine, protected action, booking, settlement, or physical-world proof claim ships.
   - Acceptance: Type/unit tests prove the primitive union and reference descriptor; discovery/public DTOs may emit descriptor-only lifecycle metadata but no executable action, workflow engine, settlement, booking, or physical-world proof fields/copy.

10. **Phase closeout and launch readiness proof**: Phase 1 is complete only when the Sam emergency-trade story passes end to end through local tests, copy/SEO/AEO/security/type/import gates, deployment/readback smoke, Matt Pocock Standards and Spec review axes, and GTM internal-alpha readiness gates.
   - Current: Runtime commands cannot run because runtime implementation has not started.
   - Target: Required scripts exist and are non-no-op; local, deployed, operator, SEO/AEO, GTM, and review evidence all pass without unresolved P0 claim/publish/index/security/copy/discovery gaps.
   - Acceptance: `npm run typecheck`, `npm run check:convex-codegen`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run test:a11y`, `npm run test:copy`, `npm run test:imports`, `npm run test:source-mining`, `npm run test:types`, `npm run test:ts-standards`, `npm run test:seo`, and `npm run build` pass; Vercel/Convex/Clerk/readback smoke covers `/`, `/claim`, `/registry`, `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`, `/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, and `/admin/*` non-admin denial; `/mattpocock-review` reports Standards and Spec axes separately and every finding is fixed or explicitly recorded.

## Boundaries

**In scope:**
- Fresh runtime substrate: `package.json`, `apps/web`, `convex`, `src/modules`, and test directories required by Phase 1.
- Source-mining/import/TypeScript/copy/SEO/security test gates before public exposure.
- Claim without ABN, owner binding, publish, services, first-request disclosure, and public business catalog source state.
- Durable idempotency, audit, projection attempts, index/discovery status, funnel events, owner activation state, and operator controls.
- Source-owned admin membership, role/action permission matrix, suppression, disputes/removal, and admin/operator readbacks.
- Public routes: `/`, `/claim`, `/claim/success`, `/{slug}`, `/registry`, `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/privacy/remove-business`, `/admin/claims`, `/admin/index-health`, `/admin/audit-events`.
- AE-hosted UCP fallback, public JSON catalog, llms, sitemap, robots, schema/canonical/noindex policy, and discovery headers.
- Descriptor-only lifecycle primitives and one reference vertical descriptor.
- Local verification, deployment/readback smoke, Matt Pocock two-axis review, and GTM internal-alpha readiness gates.

**Out of scope:**
- Chat, owner inbox, customer messaging, notifications, and owner reply flows — Phase 2.
- Payments, wallet, credits, billing, Stripe, x402, settlement, payment handlers, price fields, and payment-required flows — Phase 5 decision record required first.
- Protected actions, callable tools, booking/orders, propose/approve/execute action gateway, provider actions, receipts, reversal/dispute handling for money/actions — later authority phases.
- Skills, request market, experts, hosted agents, voice, persona, marketplaces, rankings, benchmarks, native mobile, SDK/CLI/plugin surfaces — not needed for owner-controlled visibility/readiness.
- API keys, MCP, OpenAPI action/service descriptors, business-origin standard `/.well-known/ucp`, and developer platform docs — Phase 3 only after read-only demand and route-tested support matrix.
- ABR/registry verification as a publish gate — ABN/ABR is optional trust evidence later, not required for T0 claim/publish.
- Server-side fetch of owner-supplied provider URLs — quarantined until a future endpoint verification phase.
- Broad public launch, paid ads, Product Hunt/developer/protocol launch, or demand/partner claims — blocked until GTM readiness stages are green.

## Constraints

- Convex is the Phase 1 source of truth; browser input never supplies actor, owner, admin, or claimed-by authority.
- Routes are adapters only; they import public module seams/DTOs, not provider SDKs, `convex/schema`, stores/runtime internals, module private files, or backup paths.
- No public route exposes catalog/discovery data until abuse controls, source-owned admin authority, suppression, and allowlisted projections exist.
- Every retryable mutation/projection has durable idempotency and typed audit in the same logical operation.
- Public outputs are allowlist projections from source state, never DB row spreads.
- Owner-authored text is untrusted data and must be escaped, length-capped, stripped of raw HTML/scripts where appropriate, and never treated as agent instructions.
- Public DTO/manifest schemas may include `callable: false` and `paymentRequired: false` only as explicit negative flags; truthy/executable/payment-positive behavior and public copy implying live actions/payments are banned.
- `DiscoveryStatus='available'` means the route can serve a validating manifest; it does not mean callable, payable, verified, or standard merchant-origin UCP.
- Public API/search/list/detail must use one catalog DTO or an explicitly documented subset; documented public routes returning 404 fail launch.
- Required scripts are non-no-op and run against real source/tests, not placeholders.

## Acceptance Criteria

- [ ] Runtime substrate exists with required scripts and no rejected Phase 1 directories, tables, fields, or provider/future-surface identifiers.
- [ ] Source-mining/import scans fail on seeded bad fixtures and pass on clean runtime source.
- [ ] Convex schema, indexes, validators, and module-owned literal unions match the authority docs and pass codegen/type tests.
- [ ] Sam can claim without ABN, publish at least one service, and land on a public business service catalog page.
- [ ] Claim/publish security paths reject missing/foreign CSRF, anonymous publish, wrong-owner publish, duplicate/suspicious claim, rate-limit abuse, and empty services with typed errors and audit events.
- [ ] Public page and owner readback preserve separate `publicStatus`, `indexStatus`, `discoveryStatus`, `trustTier`, service/capability status, `callable=false`, `paymentRequired=false`, and next action.
- [ ] Public page/UI covers loading, empty, invalid input, failure, degraded, suppressed, mobile 375px, keyboard/focus, labels, and errors.
- [ ] `/registry`, `/api/businesses`, `/api/businesses/search?q=`, and `/api/businesses/{slug}` return allowlisted public DTOs with explicit empty/404/pagination behavior and no private fields.
- [ ] Forced projection/discovery failure is visible to owner/operator, retryable/rebuildable from source state, and does not duplicate audit/projection side effects.
- [ ] `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, and `/robots.txt` route-test successfully, use eligible source catalog state, and are suppression/stale aware.
- [ ] Suppression removes business/service/capability exposure from page, registry, API/search, sitemap, llms, and UCP through one eligibility predicate.
- [ ] Admin routes deny non-admins, enforce owner_admin/support/reviewer permissions, audit denied actions, and expose operator controls with reason/evidence/correlation ID.
- [ ] Lifecycle primitives exist as descriptor-only types/tests and no workflow/action/payment/proof runtime ships.
- [ ] Copy, DTO, discovery, SEO, and GTM scans reject booking/payment/verification/agent-action/partner/demand/protocol overclaims.
- [ ] Prompt-injection fixture remains inert in manifest/llms/discovery outputs.
- [ ] Funnel events and owner activation state are recorded/queryable; broad launch remains blocked until internal-alpha GTM gate is green.
- [ ] Required local command suite passes: typecheck, Convex codegen, unit, integration, e2e, a11y, copy, imports, source-mining, types, TS standards, SEO, build.
- [ ] Deployment/readback smoke passes for public routes, discovery headers, Convex, Clerk, and `/admin/*` non-admin denial.
- [ ] `/mattpocock-review` Standards and Spec axes complete separately; every finding is fixed or explicitly recorded.

## Edge Coverage

**Coverage:** 48/48 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| empty, encoding, idempotency, concurrency | R1 | ✅ covered | Acceptance covers empty/missing runtime tree, seeded bad/clean fixtures, repeatable scans, and interrupted/parallel implementation through hard gates before runtime proceeds. |
| adjacency, empty, ordering, idempotency, concurrency | R2 | ✅ covered | Acceptance covers duplicate state variants/indexes, missing tables, exhaustive map ordering/dispatch, idempotency records, and source-owned schema before public routes. |
| adjacency, empty, encoding, ordering, idempotency, concurrency | R3 | ✅ covered | Acceptance covers slug collision/duplicate claims, empty services, safe encoded disclosure, deterministic slug behavior, repeated publish, and concurrent abuse/wrong-owner cases. |
| adjacency, empty, encoding, ordering, concurrency | R4 | ✅ covered | Acceptance covers multiple services/capabilities, empty/degraded/suppressed states, escaped owner text, stable status presentation, and route/readback behavior under status changes. |
| adjacency, empty, encoding, ordering, concurrency | R5 | ✅ covered | Acceptance covers duplicate/equal search matches, empty search and 404, encoded query/text handling, stable pagination/order, and suppression/public eligibility races. |
| adjacency, empty, ordering, idempotency, concurrency | R6 | ✅ covered | Acceptance covers overlapping attempts, missing attempts, latest/readback ordering, repeated retry, and concurrent retry/rebuild without duplicate side effects. |
| empty, encoding, idempotency, concurrency | R7 | ✅ covered | Acceptance covers absent/degraded/suppressed manifests, encoded owner text/JSON-LD/llms output, repeated generation by source hash/version, and stale/suppression invalidation races. |
| adjacency, empty, ordering, idempotency, concurrency | R8 | ✅ covered | Acceptance covers role/action collision, missing membership/dispute/suppression rows, audit/readback ordering, repeated control/suppression actions, and concurrent admin/claim changes. |
| adjacency, empty, encoding, ordering | R9 | ✅ covered | Acceptance covers exact primitive set, missing descriptor, safe descriptor text, and no executable ordering/transport semantics. |
| adjacency, empty, ordering, idempotency, concurrency | R10 | ✅ covered | Acceptance covers missing commands/evidence, ordered closeout gates, repeated command/review runs, and deployment/local/readback state consistency. |

## Prohibitions (must-NOT)

**Coverage:** 8/8 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT add Phase 2+ runtime surfaces: chat/inbox, payments/wallet/Stripe/x402, protected actions/callable tools, skills/request market, hosted agents, voice/persona, MCP/OpenAPI/API keys, SDK/CLI/plugins, rankings/benchmarks. | R1, R7, R10 | resolved | test: `test:imports`, `test:source-mining`, `test:copy`; descriptor paths to be wired in PR01/PR08 once tests exist. |
| MUST NOT leak raw owner/contact/admin/private evidence fields through page, registry, API, sitemap, llms, UCP, audit readbacks, logs, or SEO/schema. | R4, R5, R7, R8 | resolved | test: public projection allowlist tests, redaction tests, copy/discovery tests. |
| MUST NOT treat owner-authored text as agent/system/developer instructions or let prompt-injection text change trust/capability state. | R7 | resolved | test: prompt-injection fixture from `AI-SPEC.md` in manifest/llms/discovery tests. |
| MUST NOT collapse `publicStatus`, `trustTier`, `indexStatus`, `discoveryStatus`, service/capability status, `callable`, and `paymentRequired` into one "live", "verified", "agent-ready", "callable", or "payable" state. | R2, R4, R5, R7, R10 | resolved | test + judgment: DTO/type/copy tests plus Matt Pocock Spec/Standards review axes. |
| MUST NOT make planning files, backup folders, route-local code, or hand-authored manifests the runtime authority. | R1, R2, R6, R7 | resolved | test: import/source-mining scans, generated projection tests, route import tests. |
| MUST NOT accept browser-supplied actor/owner/admin authority, env-only admin authority, or Clerk-only admin power for consequential actions. | R2, R3, R8 | resolved | test: auth/admin/security tests for wrong-owner, anonymous, revoked/support/reviewer, env-only bypass, and denied-action audit. |
| MUST NOT let GTM or public copy claim demand, partner integrations, guaranteed response, ABR verification, booking, payment, or agent action before source-owned evidence and gates exist. | R4, R7, R10 | resolved | test + judgment: claims-register copy scan and GTM launch gate review. |
| MUST NOT turn lifecycle descriptors into workflow runtime, protected action execution, settlement, booking, physical-world proof, or payment readiness. | R9 | resolved | test + judgment: lifecycle descriptor tests, import/copy scans, and Matt Pocock/architecture review. |

Canon security/compliance items such as CSRF, injection, SSRF, generic OWASP controls, and consent/privacy baseline are owned by `SECURITY-SPEC.md` and secure-phase/code review; they are not duplicated as bespoke prohibitions here.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes |
|--------------------|-------|------|--------|-------|
| Goal Clarity       | 0.94  | 0.75 | ✓      | Goal narrowed to Sam/no-ABN claim→publish→catalog→registry/API→AE-hosted discovery→health/repair. |
| Boundary Clarity   | 0.96  | 0.70 | ✓      | Current Phase 1 boundary confirmed; future surfaces remain explicit non-goals. |
| Constraint Clarity | 0.83  | 0.65 | ✓      | Constraints grounded in authority docs; runtime absent and `.planning/REQUIREMENTS.md` absent are documented. |
| Acceptance Criteria| 0.88  | 0.70 | ✓      | Pass/fail criteria cover source-mining, security, status separation, projections, discovery, suppression, GTM, deployment, and review. |
| **Ambiguity**      | 0.09  | ≤0.20| ✓      | Gate passed after one interview round. |

Status: ✓ = met minimum, ⚠ = below minimum.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 0 | Researcher | Current state scout | Fresh repo is planning-only; no runtime tree; GSD finds Phase 1 and one PR00 plan; requirements file absent; phase docs are authority. |
| 0 | Scoring | Initial ambiguity from roadmap plus missing requirements file | Goal 0.83, boundary 0.80, constraint 0.62, acceptance 0.66, ambiguity 0.25; interview required. |
| 1 | Researcher / Boundary Keeper | Should SPEC lock the current Phase 1 boundary? | Keep current boundary: claim, publish, public catalog, registry/search/API, AE-hosted discovery, operator health/repair; no chat/payments/callable/developer surfaces. |
| 1 | Acceptance Closer | Which acceptance story should dominate? | Sam emergency trade story is primary. |
| 1 | Gate | Ambiguity after answers | Goal 0.94, boundary 0.96, constraint 0.83, acceptance 0.88, ambiguity 0.09; user selected “Yes — write SPEC.md”. |
| 2 | Edge Probe | Resolve 48 applicable edge probes | User selected “Resolve explicitly”; edge rows converted into acceptance criteria/coverage. |
| 3 | Prohibition Probe | Resolve product-specific must-NOTs | User selected “Resolve all”; eight bespoke prohibitions added as negative acceptance criteria. |

---

*Phase: 01-ten-star-spine-foundation*
*Spec created: 2026-06-27*
*Next step: /gsd:discuss-phase 1 — implementation decisions (how to build what is specified above)*
