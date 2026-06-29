---
milestone: phase-1-5-agentic-marketplace-closeout
status: active
created: 2026-06-28
updated: 2026-06-28
source_files:
  - .planning/PROJECT.md
  - .planning/ROADMAP.md
  - .planning/phases/01-ten-star-spine-foundation/01-SPEC.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md
  - .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
  - .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
  - .planning/phases/05-paid-activation-money-rails/05-SPEC.md
---

# Requirements: Phase 1-5 Agentic Marketplace Closeout

## Vision

Turn Agentic Economy into a futuristic marketplace for the agentic economy: a source-owned marketplace spine where businesses can publish truthful service facts, customers can make conservative human inquiries, builders and agents can discover read-only public facts, consequential actions require owner approval, and paid activation is added only after authority, receipt, reversal, and reconciliation posture exists.

## Completion Rule

This milestone is not complete until every phase has spec, discussion/context, plan, implementation, verification, validation, audit, and closeout evidence. A requirement may be marked complete only when the linked evidence proves current behavior. Explicit deferrals must name the waived requirement, reason, owner, risk, and follow-up gate.

## Phase 1: Ten-Star Spine Foundation

Source: `.planning/phases/01-ten-star-spine-foundation/01-SPEC.md`

- [x] **P1-R1 Substrate and import guardrails:** runtime substrate, required scripts, import/source-mining scans, and banned future-surface checks exist and pass.
  - Evidence: `01-VERIFICATION.md` R1, command evidence, source-mining/import tests.
- [x] **P1-R2 Durable source model and type contracts:** Convex schema, indexes, validators, literal unions, module ownership, idempotency, audit, owner activation, and projection state match authority docs and pass type/codegen gates.
  - Evidence: `01-VERIFICATION.md` R2, Convex codegen, type/type-standards tests.
- [x] **P1-R3 No-ABN claim and publish:** authenticated owner can claim and publish without ABN; invalid, anonymous, duplicate, wrong-owner, rate-limited, CSRF, and empty-service paths fail safely with audit.
  - Evidence: `01-VERIFICATION.md` R3, claim/publish integration and browser tests.
- [x] **P1-R4 Public page and owner status readback:** public and owner readbacks preserve separate public, trust, index, discovery, service, and capability states with truthful unavailable labels.
  - Evidence: `01-VERIFICATION.md` R4, local E2E, copy tests.
- [x] **P1-R5 Registry, search, and public API:** registry/list/search/detail routes return allowlisted public DTOs, explicit empty/404/pagination behavior, and no private fields.
  - Evidence: `01-VERIFICATION.md` R5, registry/search/API tests, deploy smoke.
- [x] **P1-R6 Projection and repair readback:** forced projection/discovery failures are visible, retryable/rebuildable from source state, stale-aware, and idempotent.
  - Evidence: `01-VERIFICATION.md` R6, projection/repair tests, admin index-health smoke.
- [x] **P1-R7 AE-hosted discovery:** UCP, llms, sitemap, and robots route-test successfully, derive from eligible source catalog state, and remain suppression/stale aware without standard merchant-origin claims.
  - Evidence: `01-VERIFICATION.md` R7, SEO/discovery tests, deploy smoke.
- [x] **P1-R8 Admin, suppression, dispute, and operator controls:** admin routes deny non-admins, enforce source-owned permissions, audit denied/actions, and suppress exposure through one eligibility predicate.
  - Evidence: `01-VERIFICATION.md` R8, admin/security/operator tests, deploy smoke.
- [x] **P1-R9 Lifecycle descriptor-only contract:** lifecycle primitives remain descriptor-only and no runtime action, booking, payment, settlement, or proof execution ships.
  - Evidence: `01-VERIFICATION.md` R9, lifecycle/copy/import gates.
- [ ] **P1-R10 Closeout and readiness proof:** local, deployed, operator, SEO/AEO, GTM, and review evidence pass without unresolved P0 claim, publish, index, security, copy, or discovery gaps.
  - Evidence: `01-VERIFICATION.md`, `01-CLOSEOUT.md`, `01-DEPLOY-READBACK-EVIDENCE.md`, `01-ALPHA-EVIDENCE.md`, `01-INTERNAL-ALPHA-READINESS.md`, `01-MATT-REVIEW.md`.
  - Deferred debt: technical local/codegen/deploy smoke gates pass, requirements traceability exists, and the Standards/Spec review has been recorded, but five real friendly-owner activation rows remain 0/5. User accepted this as non-blocking for Phase 2-5 execution on 2026-06-28; it still blocks internal-alpha and launch claims.

## Phase 2: Human Inquiry And Owner Inbox

Source: `.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md`

- [ ] **P2-R1 Inquiry availability gate:** inquiry availability appears only when published service eligibility, contact/consent policy, inquiry readiness, owner handling, and notification readback gates are true.
- [ ] **P2-R2 Inquiry submit command:** valid public inquiry submission persists one durable thread/message/audit event and rejects invalid, ineligible, suppressed, duplicate, replayed, rate-limited, or malformed inputs.
- [ ] **P2-R3 Owner inbox projection:** owner inbox list/detail exposes only owner-authorized inquiries with stable ordering, buckets, empty/sparse states, and no cross-owner leakage.
- [ ] **P2-R4 Owner reply state machine:** owner reply/read/close transitions are idempotent, audited, length-capped, version-safe, and reject wrong-owner, terminal, stale, duplicate-different-body, empty, and too-long paths.
- [ ] **P2-R5 Notification outbox and readback:** one adapter records queued/sent/retryable/permanent/suppressed/provider-missing states, and provider failure never loses inquiry or reply state.
- [ ] **P2-R6 Private content boundary:** inquiry body, contact, owner notes, provider payloads, and notification secrets remain absent from public page, registry, API, UCP, llms, sitemap, SEO schema, logs, and marketing copy.
- [ ] **P2-R7 Inquiry and inbox UI states:** public inquiry and owner inbox/reply UI pass mobile, keyboard, focus, labels, loading, empty, invalid, abuse-blocked, submitted, failed, unresolved, resolved, and suppressed-state checks.
- [ ] **P2-R8 Phase 2 closeout proof:** closeout reconstructs customer inquiry to owner read to owner reply to notification readback to audit from source state, with excluded future surfaces still absent.

## Phase 3: Standard Agent And Builder Discovery

Source: `.planning/phases/03-standard-agent-builder-discovery/03-SPEC.md`

- [ ] **P3-R1 Discovery support matrix:** business-origin UCP, OpenAPI, MCP, API keys, SDK, CLI, and plugin surfaces have shipped/unavailable/degraded/deferred states with evidence.
- [ ] **P3-R2 Read-only API docs and schemas:** docs, schemas, examples, fixtures, live API responses, UCP/llms references, and optional projections share the same public catalog DTO or documented subsets.
- [ ] **P3-R3 Developer discovery readback:** developer/agent readback shows route health, schema version, cache freshness, blockers, unsupported capabilities, examples, and operational readbacks without mutation authority.
- [ ] **P3-R4 Business-origin UCP honesty:** standard merchant-origin claims are absent unless merchant-origin readback proves them; AE-hosted fallback remains honest.
- [ ] **P3-R5 Optional MCP/OpenAPI read projections:** any projection is read-only, route-tested, non-authoritative, and free of mutation, payment, action, request-market, and provider-operation descriptors.
- [ ] **P3-R6 Read-only API key gate:** keys are explicitly unavailable or prove reveal-once, hash-at-rest, revocation, read-only scope, rate limiting, audit, and mutation denial.
- [ ] **P3-R7 Fetch telemetry and cache readback:** telemetry captures route, status, schema, cache, freshness, error, bot, and public IDs without private payloads.
- [ ] **P3-R8 Phase 3 closeout proof:** builder/agent smoke proves current public facts, unsupported/degraded capabilities, schema parity, route/cache readback, and no accidental invocation/payment/platform bloat.

## Phase 4: Owner-Pending Protected Actions

Source: `.planning/phases/04-owner-pending-protected-actions/04-SPEC.md`

- [ ] **P4-R1 Single action-class decision:** one non-money action class is selected from observed Phase 2/3 evidence and broad catalogs/autonomy are rejected.
- [ ] **P4-R2 Selected proposal contract:** the selected-action-specific proposal command persists one candidate/audit with canonical hash, idempotency, correlation, actor principal, target, owner context, and parameter allowlist.
- [ ] **P4-R3 Policy and lifecycle classification:** policy returns review_required, refused, expired, or proof_gap without provider side effects.
- [ ] **P4-R4 Owner decision UI:** owner approval/rejection requires source-owned owner access, visible consequence, reason/evidence where required, and audit before provider attempt.
- [ ] **P4-R5 Provider attempt and proof gap:** provider attempt occurs only after approval and one-use gateway admission; timeout, mismatch, failure, and proof gaps become typed readbacks.
- [ ] **P4-R6 Reconstruction readback:** readback reconstructs actor, proposal, policy, decision, gateway, attempt, outcome, audit, dispute/reversal posture, and repair/no-repair action.
- [ ] **P4-R7 Discovery wording for protected actions:** public/developer discovery says owner-pending or approval-required only, and autonomous/callable/direct-execute/payment claims fail scans.
- [ ] **P4-R8 Phase 4 closeout proof:** closeout proves duplicate, stale, concurrent, wrong-owner, expired, refused, proof-gap, downstream-failure, success, UI, source-mining, no-money, and no-autonomy paths.

## Phase 5: Paid Activation And Money Rails

Source: `.planning/phases/05-paid-activation-money-rails/05-SPEC.md`

- [ ] **P5-R1 Money-rail decision record:** one Autumn Cloud plus Stripe PSP paid-activation rail is selected with product/pricing object, charge model, controller responsibilities, boundaries, rollback/disable plan, and non-goals.
- [ ] **P5-R2 Core money quarantine:** core business, catalog, registry, and discovery schemas remain free of unapproved Autumn refs, stripe refs, x402, wallet, credits, balance, payment handlers, provider IDs, and rail-specific fields.
- [ ] **P5-R3 Server-created billing start:** billing start binds owner/business authority, source-owned plan/quote, idempotency, correlation, pending operation, and selected provider refs while rejecting client-supplied money/provider/entitlement authority.
- [ ] **P5-R4 Provider webhook and readback ingest:** provider ingest verifies signed raw payloads, retrieves provider state when required, normalizes events, dedupes objects, binds pending operations, and does not grant direct entitlement.
- [ ] **P5-R5 Append-only billing state and receipts:** paid activation creates append-only billing, receipt, entitlement, and readback state with stable operation/evidence/receipt refs and idempotent replay.
- [ ] **P5-R6 Refund, reversal, dispute, failure, and cancellation posture:** negative money outcomes preserve history and expose next actions.
- [ ] **P5-R7 Operator reconciliation:** reconciliation surfaces stale, missing, duplicate, disputed, mismatched, and provider-unavailable records with retry/no-repair actions and redacted evidence.
- [ ] **P5-R8 Payment claims gate and closeout proof:** selected-rail public/discovery/GTM claims pass only after provider readback, receipt, reversal/dispute, reconciliation, smoke, permission denial, redaction, and Phase 1-4 boundary checks.

## Sprint Commit Discipline

- Group commits by coherent sprint checkpoints.
- Do not include unrelated dirty worktree changes in a closeout sprint.
- Do not push until the sprint has passing relevant gates and updated evidence.
