# Codebase Concerns

**Analysis Date:** 2026-07-10

## Tech Debt

**Release gates are not represented by one canonical command:**
- Issue: `npm run test:release`, `npm run test:all`, and `.github/workflows/eval-gate.yml` run overlapping but different suites. `test:release` includes eval, graph freshness, E2E, and accessibility, but omits type-contract, import-boundary, source-mining, TypeScript-standards, and SEO suites that CI runs; `test:all` includes those source gates but omits eval, graph freshness, E2E, and accessibility.
- Files: `package.json`, `.github/workflows/eval-gate.yml`
- Impact: “Release passed” is ambiguous, and a local green command does not necessarily reproduce CI or the deployed/provider evidence gates.
- Fix approach: Define a small gate ladder with one named source/CI gate and separate environment-backed deployed/provider gates. Make `test:release` compose the canonical local gate instead of maintaining a second command list.

**Large source-owned state machines remain concentrated in single files:**
- Issue: The largest production files combine orchestration, validation, persistence adaptation, reconstruction, and projection. Current examples include `convex/inquiries.ts` (about 2,800 lines), `src/modules/answer-thread/internal/turn-orchestrator.ts` (about 1,800), `src/modules/protected-action/internal/contact-follow-up.ts` (about 1,800), `src/modules/inquiries/internal/commands.ts` (about 1,700), and `convex/businessActionStore.ts` (about 1,400).
- Files: `convex/inquiries.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/businessActionStore.ts`
- Impact: Changes have wide review surfaces, higher merge-conflict risk, and make it easier to accidentally couple source authority, public projection, and provider behavior.
- Fix approach: Split only at already-real boundaries: pure commands/reducers, source adapters, readback projection, and provider/webhook adapters. Preserve one authority path and add characterization tests before moving behavior.

**The repository is in a broad uncommitted transition:**
- Issue: The 2026-07-10 working tree contains changes across Convex, routes, modules, tests, generated types, planning documents, and many new files; some prior codebase-map documents are deleted while the refresh is running.
- Files: `convex/`, `src/`, `tests/`, `.planning/codebase/`, `convex/_generated/api.d.ts`, `src/routeTree.gen.ts`
- Impact: The current map describes live workspace state, not a clean commit. Partial staging or cleanup could separate implementation from tests/generated artifacts and make the map stale immediately.
- Fix approach: Keep commits domain-sliced, regenerate/check Convex and route outputs with their owning changes, and reconcile this map again after the transition lands. Do not discard unrelated work to manufacture a clean snapshot.

**Planning truth and runtime truth intentionally coexist but drift at different speeds:**
- Issue: Scope indexes and audit records preserve historical blockers and resolution notes, while live source may already contain partial or source-local implementations. Old audit findings are not safe to treat as current without reading their appended resolution notes and current code.
- Files: `.planning/scopes/SCOPE-EXECUTION-READINESS.md`, `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md`, `.planning/audits/redteam/2026-07-04-PAYMENT-SECURITY-READINESS.md`, `src/`
- Impact: Engineers can reopen resolved security findings or, more seriously, infer deployed/live proof from source-local implementation.
- Fix approach: Keep current status in the active scope index, retain audits as append-only evidence, and always classify source/local, deployed, provider, and live proof separately.

## Known Bugs

**Deployed signed inquiry returns HTTP success without satisfying the agent contract:**
- Symptoms: The latest stored deployed agent-experience audit receives `200` for the signed `inquiry.submit`, but the response is neither `inquiry_submitted` nor `inquiry_replayed`. The audit therefore grades D (55/100), reports 0% onboarding success, and fails both signed-inquiry submission and agentic-loop proof.
- Files: `.planning/audits/agent-experience/probe-2026-07-09T16-03-44-764Z.md`, `examples/agent-experience/run-audit.ts`, `src/modules/harness/agentic-loop-proof.ts`, `src/modules/harness/agent-door.ts`, `src/routes/api.agent.tools.ts`
- Trigger: Run the deployed audit with signing/admission environment against `https://agentic-economy-phi.vercel.app`.
- Workaround: Treat the deployed quiet-agent write path as blocked; inspect the exact returned tool envelope and source admission/mandate state rather than accepting HTTP 200 as success.

**The 14-day product gate has not started:**
- Symptoms: Required setup counts are still zero and target-environment dry-runs remain open for attributable sessions, source/profile clicks, supplier actions, and the outside-in assistant audit.
- Files: `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md`, `.planning/scopes/SCOPE-EXECUTION-READINESS.md`
- Trigger: Any claim that demand, supplier pull, assistant completion, or wider platform scope has been proven.
- Workaround: Use source/local language only; do not widen public capability claims until the recorded consumer, supplier, and trust thresholds have evidence.

## Security Considerations

**Identity, admission, mandate, and source-write authority are separate load-bearing checks:**
- Risk: Web Bot Auth proves an agent identity, not permission to mutate. The quiet write path additionally depends on per-tool exposure, signed component coverage, principal admission, mandate/scope evaluation, source-write admission, and durable replay protection.
- Files: `src/modules/harness/agent-door.ts`, `src/modules/harness/agent-tool-write-scope.ts`, `src/modules/harness/approval-policy.ts`, `src/modules/clearance/internal/web-bot-auth.ts`, `src/modules/clearance/internal/mandate.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Current mitigation: Only `registry.search`, `registry.detail`, and `inquiry.submit` are public quiet tools; only `inquiry.submit` writes. Request bodies are bounded and digested, and the admission path fails closed.
- Recommendations: Never collapse identity into authorization. Any new public write needs an explicit action snapshot, scope/key family, nonce/replay decision, mandate rule, boundary copy, and deployed negative/positive proof.

**The local Clerk bypass remains intentionally powerful:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` changes authentication behavior for local tests. A new consumer that reads the flag directly could bypass the canonical production guard.
- Files: `src/lib/server/local-e2e-bypass.ts`, `src/lib/ui/local-e2e-bypass.ts`, `tests/unit/server/local-e2e-bypass.test.ts`, `tests/unit/server/server-seams.test.ts`
- Current mitigation: Server and browser helpers throw when the flag is active in production, and contract scans/tests police known seams.
- Recommendations: Route every new server consumer through `isLocalE2EAuthBypassEnabled()` and every client consumer through its browser mirror. Never persist the bypass in production deployment configuration.

**Dynamic outbound fetches remain an SSRF review boundary:**
- Risk: Website import, endpoint checks, signer-directory reads, provider clients, and model/provider calls all make dynamic network requests. A new caller can turn an owner-controlled URL or environment-configured base URL into an internal-network or secret-exfiltration path.
- Files: `src/modules/storefront/internal/import-draft.ts`, `src/modules/storefront/internal/network-guard.ts`, `tests/unit/security/ssrf-surface-drift.test.ts`, `src/modules/clearance/internal/web-bot-auth.ts`, `src/modules/billing/internal/provider-readback.ts`
- Current mitigation: Storefront import performs public-target checks, guarded DNS lookup at connect time, manual redirect validation, timeout, content-type validation, and a 2 MiB response cap. The SSRF drift test requires review of non-literal `fetch()` sites.
- Recommendations: Treat additions to provider-client allowlists as security decisions. Reuse the network guard for owner/user-controlled URLs and fail closed on unexpected production provider hosts.

**Provider webhooks and dispatch routes are high-consequence secret surfaces:**
- Risk: Stripe, Autumn, Resend, and Novu paths handle server secrets, signed raw bodies, customer/message refs, and operational evidence. Logging or projecting raw payloads can leak private or payment-adjacent information.
- Files: `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/routes/api.notification.resend-webhook.ts`, `src/lib/server/billing-provider.ts`, `src/lib/server/notification-provider.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`
- Current mitigation: Reviewed webhook routes verify raw bodies before normalized persistence; public/operator projections use redacted refs and hashes in tested paths.
- Recommendations: Preserve raw-body-first verification, timestamp tolerance, idempotent event handling, conflict holds, and redacted DTOs. Add deployed invalid-signature, replay, duplicate, conflicting-payload, and out-of-order evidence before provider-readiness claims.

**Inquiry and operational evidence carry retention/privacy obligations:**
- Risk: Inquiry bodies and operational records can contain contact information and private business context. Joining these later with payment or provider state raises sensitivity.
- Files: `src/modules/inquiries/internal/schema.ts`, `convex/inquiries.ts`, `src/modules/notification-outbox/internal/schema.ts`, `src/modules/observability/internal/schema.ts`
- Current mitigation: Hash/redaction fields, owner export/delete paths, and redacted notification/observability projections exist.
- Recommendations: Before material traffic or payment-adjacent expansion, define retention TTLs, automated purge/tombstone behavior, operator access, DSAR ownership, and redaction rules for logs/analytics/support.

## Performance Bottlenecks

**Convex contains unbounded collection paths:**
- Problem: Runtime code still has more than two dozen `.collect()` call sites, including full-table helper fallbacks in notification, protected-action, business-action, billing, observability, source-state, and inquiry paths.
- Files: `convex/answerThreads.ts`, `convex/notificationOutbox.ts`, `convex/protectedActionStore.ts`, `convex/businessActionStore.ts`, `convex/catalog.ts`, `convex/discovery.ts`, `convex/observability.ts`, `convex/source_state.ts`, `convex/inquiries.ts`
- Cause: Source-local reconstruction favors explicit scans and in-memory joins while datasets are small.
- Improvement path: Classify each call as bounded-by-index, admin-only, or genuinely full-table. Replace growth-path scans with owned indexes, pagination, `take`, `first`, counters, or materialized projections; add ordering/pagination contract tests.

**Answer and chat orchestration can amplify network and source reads:**
- Problem: A single answer turn can select a model, query catalog/search tools, stream events, persist turn state, produce projections, and emit evidence. The main orchestrator and UI are both large, making duplicate reads or repeated reconstruction easy to introduce.
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/components/ae/chat/AeChat.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`
- Cause: Streaming UX, tool use, safety gating, public share projection, and persistence share one user flow.
- Improvement path: Instrument turn latency by stage, source-query count, provider duration, abort rate, and token/tool budgets. Keep cancellation signals threaded through providers and prevent disconnected clients from starting new work.

**Runtime rate limiting is process-local in some request paths:**
- Problem: Chat/answer request limiting is resolved in application runtime helpers before streaming. Process-local state does not provide a global limit across serverless instances or deployments.
- Files: `src/routes/api.chat.ts`, `src/routes/api.answer.ts`, `src/modules/answer-thread/internal/turn-guard.ts`
- Cause: The current implementation protects source-local flows without introducing a distributed coordination dependency.
- Improvement path: Before public traffic, move abuse-sensitive limits to a durable shared store keyed by privacy-safe session/principal/IP-derived identifiers, with explicit expiry and failure posture.

## Fragile Areas

**The deployed quiet-agent loop crosses many boundaries:**
- Files: `src/routes/api.agent.tools.ts`, `src/modules/harness/agent-door.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/harness/approval-policy.ts`, `src/modules/clearance/internal/web-bot-auth.ts`, `src/modules/clearance/internal/convex-protocol-store.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Why fragile: Tool discovery, strict schemas, signature teaching, admission, mandate evaluation, action execution, source persistence, and receipt projection must agree. The latest deployed audit demonstrates that an HTTP-level success can still violate the semantic contract.
- Safe modification: Test unsigned refusal, malformed signatures, unadmitted principals, expired/revoked mandates, replay, accepted write, replayed write, and exact response envelope. Preserve stable `Accept-Signature` and `nextStep` teaching data.
- Test coverage: `tests/integration/agent-tools-api.test.ts`, clearance/source-write unit tests, and the deployed agent-experience audit; the deployed positive path is currently failing.

**Convex schema composition and runtime partitioning are easy to break:**
- Files: `convex/schema.ts`, `src/modules/*/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `convex/_generated/api.d.ts`, `tests/unit/schema/convex-schema.test.ts`, `tests/unit/convex/node-runtime-boundary.test.ts`
- Why fragile: Duplicate fragment keys can overwrite tables during object composition, and a transitive `node:*` import can make a non-Node Convex function fail bundling/codegen.
- Safe modification: Keep table ownership in module fragments, assert globally unique schema keys, isolate Node actions in `"use node"` files, and regenerate generated API types with the same change.
- Test coverage: `npm run check:convex-codegen`, `npm run typecheck`, schema ownership tests, and Node-runtime boundary tests.

**Proof classification is part of product correctness:**
- Files: `.planning/scopes/SCOPE-EXECUTION-READINESS.md`, `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md`, `.planning/scopes/PM-05-CLAIM-LEDGER.md`, `tests/copy/`, `tests/deploy-smoke/`
- Why fragile: Source implementation, local tests, deployed readback, provider evidence, and live operation authorize different claims. Copy or docs can turn a technically correct local feature into a misleading public promise.
- Safe modification: State the proof level beside every readiness claim, run copy/SEO/assistant-surface scans, and attach non-secret deployed/provider evidence before strengthening wording.
- Test coverage: Copy and SEO tests enforce many banned claims; they cannot substitute for environment-backed proof.

**Operator readbacks can expose private source material:**
- Files: `src/routes/_operator/`, `src/modules/inquiries/route-readbacks.ts`, `src/modules/harness/internal/run-viewer-projection.ts`, `src/modules/billing/internal/projections.ts`, `src/modules/business-action/internal/business-action.ts`
- Why fragile: Admin and owner pages join source rows, provider refs, audit evidence, contact data, and operational next actions. Passing raw records to components bypasses the redacted DTO boundary.
- Safe modification: Load through module-owned server seams, return explicit view models, and test absence of raw contact/provider payloads, hashes that should remain private, secrets, and authorization-only facts.
- Test coverage: Server-seam, route-readback, unit UI, and selected deploy-smoke tests cover representative paths rather than every projection.

**Procurement is source-present but outside the quiet-agent allowlist:**
- Files: `src/modules/procurement/`, `convex/procurement.ts`, `src/modules/actions/index.ts`, `src/modules/harness/tool-contract.ts`
- Why fragile: `procurement.requestQuotes` now exists in the action registry and source layer, while `PublicQuietAgentToolIds` still intentionally exposes exactly three tools. A generic registry-to-tool projection could accidentally widen the public action surface.
- Safe modification: Keep exposure explicit. Any widening requires action snapshot review, fan-out/abuse limits, supplier-consent semantics, authority/receipt design, public-copy review, and deployed proof.
- Test coverage: Procurement unit/runtime tests cover source behavior; they do not authorize assistant/public exposure.

## Scaling Limits

**The first demand/supply gate is evidence-free:**
- Current capacity: Source-local code and ledgers can support a storefront → qualified inquiry → supplier action experiment.
- Limit: The gate records 0 source-backed profiles, 0 recruited providers, 0 attributable sessions, 0 qualified inquiries, and 0 supplier actions; target-environment dry-runs remain open.
- Scaling path: Complete target dry-runs, then run the fixed 14-day gate with source-owned attribution and zero overclaim before widening product scope.

**Table-scan reconstruction assumes small datasets:**
- Current capacity: Seed/source-local volumes and operator readbacks.
- Limit: Unbounded `.collect()` and in-memory joins will degrade with catalog, inquiry, notification, audit, answer-thread, and receipt growth.
- Scaling path: Set per-query cardinality budgets and add indexes/pagination before onboarding broad traffic or retaining long-lived evidence.

**External proof depends on configured infrastructure and real source rows:**
- Current capacity: Fail-loud smoke harnesses exist for deployed app, support records, Resend, Novu, Autumn/Stripe, business-action Stripe, and capability checks.
- Limit: Local/source tests do not prove Vercel, Convex, Clerk, provider delivery, signer admission, or provider readback in the target environment.
- Scaling path: Provision target secrets/state, seed or create real evidence rows, execute the named smoke suites, and retain non-secret reconstruction pointers.

## Dependencies at Risk

**Nightly and fast-moving runtime dependencies increase upgrade risk:**
- Risk: The app uses React 19, Vite 8, TypeScript 6, TanStack Start/Router, Convex, and a `nitro-nightly` alias. SSR, route generation, server bundling, and runtime compatibility can change rapidly.
- Files: `package.json`, `package-lock.json`, `vite.config.ts`, `src/routeTree.gen.ts`
- Impact: An apparently routine dependency update can alter generated routes, webhook/raw-body behavior, server-only boundaries, or build output.
- Migration plan: Pin intentionally, upgrade in isolated commits, run typecheck/codegen/source gates/build plus browser/deploy smokes, and keep a known rollback version.

**Provider clients are runtime-critical but environment-dependent:**
- Risk: Clerk, Convex, OpenRouter, Stripe, Autumn, Resend, Novu, PostHog, and Sentry each introduce credentials, availability, schema, retry, and privacy assumptions.
- Files: `package.json`, `.env.example`, `src/lib/server/`, `src/modules/billing/`, `src/modules/business-action/`, `src/modules/answer/`, `src/modules/notification-outbox/`
- Impact: Unit tests can remain green while target-environment configuration, provider response shape, or provider availability breaks the user flow.
- Migration plan: Keep adapters narrow, validate env at the server boundary, use timeouts/idempotency/redaction, and require provider-specific deployed readback evidence for readiness.

**Handshake protocol/kernel usage is an authority boundary, not a general utility:**
- Risk: `handshake-protocol-kernel@0.4.0` and `web-bot-auth@0.1.3` encode identity/evidence contracts. Deep or casual reuse could import unsupported protocol surfaces or imply enforcement authority the application does not have.
- Files: `package.json`, `vendor/handshake-protocol-kernel/README-PROVENANCE.md`, `src/modules/clearance/`, `tests/imports/`
- Impact: Runtime bundling and public authority claims can drift together.
- Migration plan: Keep imports behind reviewed module seams and import scans; expand protocol use only with an explicit architecture/authority decision and matching deployed proof.

---

*Concerns audit refreshed: 2026-07-10*
