# Codebase Concerns

**Analysis Date:** 2026-07-18  
**Inspected revision:** `f56f98a2` (post residual deepen campaign Waves 23–32)  
**last_mapped_commit:** `f56f98a2`

## Residual campaign Waves 23–32 — CLOSED

Gold pattern: provide-facts (`src/modules/...` ports type + pure fn) → thin `convex/*Ports.ts` → host auth → module → ports. Deletion test must concentrate complexity; Convex sibling chops without ports fail.

Every **implementation** wave used: `engineering-software-architect` → onboarding → backend-architect → minimal-change → code-reviewer → thermo-nuclear → commit after PASS. Design-only ADR waves: architect chain only.

Hard bans still in force: no journal `…Start`/`…Lease`/`…Outcome` sibling chops; no `WritePlan` DTOs in pure journal; no reopen of closed Application/supply/predicate/inquiry-source deepens; validators stay in Convex forever; ADR-002 governed-send stays inquiry-owned.

| Wave | Outcome |
|------|---------|
| 23–26 | Inquiry source-state / notification / serializers / host thinness — **host-done** |
| 27 | ADR-011 journal write-plan ports — **Accepted** |
| 28 | Evidence load assembly ports — done |
| 29 | Journal machines behind ADR-011 — done (integration green) |
| 30 | capabilitySupply graph/probe ports — done |
| 31 | hosted-agent-journey kernel + scenarios — done |
| 32 | catalog-from-rows shared by registry/discovery — done |

Fresh line counts (`wc -l` at close):

| File | Lines | Campaign status |
|------|------:|-----------------|
| `convex/customerRequestApplication.ts` | 1749 | **host-done** — validators + thin actions |
| `convex/inquiries.ts` | 1435 | **host-done** — Waves 23–26; validators + thin handlers |
| `convex/customerRequestRouteExecution.ts` | 1606 | machines deepened (ADR-011); cancel/problem residual |
| `convex/registry.ts` | 1622 | catalog-from-rows shared (Wave 32); search residual |
| `convex/discovery.ts` | 1565 | catalog-from-rows shared (Wave 32); manifest residual |
| `convex/capabilitySupply.ts` | 804 | **host-done** — graph/probe deepened (Wave 30) |
| `hosted-agent-journey.ts` (re-export) | 8 | split under `hosted-agent-journey/` (Wave 31) |

## Tech Debt

**Dual customer surfaces (Answer Thread vs Customer Request):**
- Issue: Public product is split across `/` (Answer Thread + registry search) and `/engine` (authenticated Customer Request), plus `/api/v1/requests` for agents. RoutePlan multi-capability work persists internally but stays below customer projection.
- Files: `PRODUCT.md` (current-vs-target sections), `AGENTS.md`, `src/modules/answer-thread/`, `src/modules/customer-request/`, `src/components/ae/chat/AeChat.tsx` (821), `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` (413)
- Why: Migration toward a single Request lifecycle while preserving the older discovery/inquiry journey.
- Impact: New semantics added to Answer Thread create a second intent/history path; assistants and humans can disagree about which surface is canonical; cutover evidence for `/engine` → `/` is still required.
- Fix approach: Keep Answer Thread read/compare/inquiry-only; route all Request/RoutePlan/authority work through `src/modules/customer-request/`; prove human cutover before collapsing `/engine`.

**God-file Convex residual (post Waves 1–32):**
- Issue: Primary deepen campaign closed. Residual host mass is mostly validators + cancel/problem/register surfaces, not undeepened command gods.
- Current sizes (verified): Application 1749 host-done; inquiries 1435 host-done; RouteExecution 1606 (machines in `route-execution/machines/` + `customerRequestRouteExecutionJournalPorts.ts`); capabilitySupply 804 host-done.
- Already deepened (do not re-open as primary): Application command set; supply writers/eligibility/publication/ledger/graph-probe; inquiry source-state/notification/serializers; journal integrity/evidence/decisions/machines; evidence-load; hosted-agent-journey scenarios; catalog-from-rows.
- Locked by thinness tests under `tests/unit/customer-request/application/*-thinness.test.ts`, `tests/unit/capability-supply/*-thinness.test.ts`, `tests/unit/capability-supply/graph-probe-thinness.test.ts`, `tests/unit/inquiries/*-thinness.test.ts`, `tests/unit/customer-request/route-execution/{journal,machines,evidence-load}-thinness.test.ts`.
- **ADR-011:** `.planning/adr/ADR-011-journal-write-plan-ports.md` — machines use semantic `JournalMutationPorts`; no `WritePlan` in pure `journal/`; no Start/Lease/Outcome sibling chops.
- Next residual (optional, not campaign-primary): RouteExecution cancel/problem host glue; fat `commitSucceededOutcome` further split; notification outbox share with inquiry bridge; registry/discovery search/manifest leftovers; `customerRequestV2` / `notificationOutbox` / Ae* UI.

**capabilitySupply graph/probe (Wave 30 closed):**
- Deepened behind `src/modules/capability-supply/internal/graph/` + `convex/capabilitySupplyGraphPorts.ts`. HTTP readiness probe remains separate. Do not reopen as a line-count chop.

**`convex/inquiries.ts` (Waves 23–26 host-done):**
- Source-state ports (`inquirySourceStatePorts`), notification ports (`inquiryNotificationPorts`), serializers (`projections/serialize` + `inquirySerializeOperator`), thinness locks under `tests/unit/inquiries/`. Residual ~1435 is mostly validators + thin handlers. Quiet-door write still high blast radius — change carefully; do not re-inline load/persist.

**Other large residual modules (post-campaign):**
- Files: `convex/registry.ts` (1622), `convex/discovery.ts` (1565), `convex/customerRequestV2.ts` (~1492), `convex/notificationOutbox.ts` (~1455), `src/modules/discovery/developer-discovery.ts` (~1534), `convex/security.ts` (~1008), `src/modules/answer-thread/internal/turn-orchestrator.ts` (~849), `src/modules/inquiries/inquiry.functions.ts` (~1381 dual-path).
- Impact: Size alone is not a deepen warrant; prioritize product risk.
- Fix approach: Prefer shared catalog-from-rows (done) before further registry/discovery chops; confine local e2e in inquiry.functions; outbox/inquiry bridge convergence is the main inquiry follow-up.

**Legacy Customer Request v1 compiler retained:**
- Issue: Parallel legacy compilers remain beside the current Customer Request path.
- Files: `src/modules/customer-request/legacy-v1.ts` (533), `src/modules/customer-request/legacy-compiler-v1.ts` (635), `convex/customerRequestV2.ts` (`legacyAggregateIsInternallyConsistent`, `kind: 'legacy'`)
- Why: Integrity and replay for older aggregates during v2 migration.
- Impact: Dual code paths for the same domain; easy to fix the wrong compiler; integrity failures surface as typed throws (`customer_request_v2_legacy_*_integrity_failure`).
- Fix approach: Bound legacy reads with an explicit retirement gate; stop writing legacy aggregates; delete compilers once migration tests prove no remaining rows.

**Legacy registry sync helpers on HTTP routes:**
- Issue: Durable handlers use actions, but sync `legacyPublicRegistry*` helpers remain exported and wired for local/e2e fallback.
- Files: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/modules/registry/registry.functions.ts` (`legacyPublicRegistryList`, `legacyPublicRegistrySearch`, `legacyPublicRegistryDetail`, `queryRegistryWithLegacyFallback`)
- Why: Local e2e and source-query failure fallbacks need an in-process catalog.
- Impact: Callers of the sync helpers can silently serve fixture/local state instead of Convex-backed catalog; confusion between “durable” and “legacy” handlers.
- Fix approach: Keep durable action handlers as the only production entry; confine legacy helpers to test/e2e packages; fail closed outside `isLocalE2EAuthBypassEnabled()` in `src/lib/server/local-e2e-bypass.ts`.

**Bespoke `Ae*` UI still dominant vs Astryx mandate:**
- Issue: Large `src/components/ae/**` tree (chat, artifacts, workspace, listing) remains the primary UI, while `AGENTS.md` forbids extending bespoke `Ae*` presentation components and requires Astryx first.
- Files: `src/components/ae/**` (e.g. `AeChat.tsx` 821, `src/components/ae/artifacts/AeGenerativeAnswer.tsx` 774, `AeCustomerRequestWorkspace.tsx` 413 after panel deepen), `AGENTS.md`, `.agents/skills/ae-design-system/SKILL.md`
- Why: Behavioral modules predate the Astryx-era design authority.
- Impact: New UI work tends to extend `Ae*` instead of Astryx; design-system drift and larger remount surfaces (see Fragile Areas).
- Fix approach: Re-skin existing behavioral modules onto `@astryxdesign/core` + `@astryxdesign/theme-neutral`; do not add new `Ae*` presentation components.

**Orphaned Phase 5/6 billing & business-action surface references:**
- Issue: Runtime modules `src/modules/billing/`, `src/modules/business-action/`, `convex/businessActions.ts`, and `src/lib/server/billing-provider.ts` are absent, but operator nav, env placeholders, copy/import scanners, deploy-smoke, and planning docs still describe them as present or closable.
- Files: `src/lib/operator/navigation.ts` (`/owner/business-actions`, `/admin/business-actions`), `.env.example` (Autumn/Stripe block), `src/lib/ui/contract-scans.ts` (billing/business-action path allowlists around lines 592–610), `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `package.json` scripts referencing provider smokes, `.planning/STATE.md`, `.planning/adr/ADR-005-transactions-receipts.md`
- Why: Source/local Phase 6 closeout and payment hardening landed historically; modules removed or relocated without full reference cleanup.
- Impact: Dead operator links; smoke/config that cannot run against current source; planners may assume payment adapters exist; claim/boundary confusion.
- Fix approach: Either restore modules behind ADR-005 gates with readback, or delete/relabel nav, env, scanners, smokes, and STATE claims so “absent” matches “not claimed.”

**Quarantined transport SDKs still in production dependencies:**
- Issue: `@x402/core`, `@x402/evm`, `@x402/extensions`, and `viem` ship in `package.json` but deep Handshake / MCP / broad `@x402` / `viem` imports are banned by contract scans except one reviewed signer file.
- Files: `package.json`, `src/modules/capability-supply/internal/x402-payment-signer.ts`, `src/lib/ui/contract-scans.ts` (`isReviewedTransportSdkImport`), `tests/imports/*`
- Why: Capability-supply route transport needs an EVM x402 payment-signature helper under a narrow allowlist.
- Impact: Accidental un-quarantine expands wallet/payment surface area; copy/product claims can drift ahead of evidence.
- Fix approach: Keep the single-file allowlist; never import `@x402`/`viem` from routes/UI; treat any new import as an ADR + `test:imports` change.

## Known Bugs

**Chat settle / remount jank on Answer Thread:**
- Symptoms: After a turn settles, streamed content unmounts/remounts; research trace collapses in one frame; follow-up submit collapses the answer being read; landing→thread is a hard remount chain.
- Trigger: Complete a streamed answer on `/` then settle, or submit a follow-up while reading the prior answer.
- Files: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/chat/AeThreadTranscript.tsx`, `src/components/ae/chat/AeThreadScroller.tsx`, `src/components/ae/primitives/AeCollapsible.tsx`, `.planning/audits/ux/2026-07-05-PLATFORM-BEHAVIOR-AUDIT.md` (R5)
- Workaround: Wait for projection refresh; avoid rapid follow-ups during settle.
- Root cause: Live-turn identity swap (`live-…` → `turnId`) plus async `refreshProjection` and fixed-timeout scroll settler racing layout collapse.
- Fix: Optimistically fold settled live turns into transcript with stable identity; sequence collapse→measure→anchor→reveal; keep prior turn expanded while the next streams.

**Operator business-actions destinations missing:**
- Symptoms: Operator shell advertises Business actions links that have no matching route tree entries in this revision.
- Trigger: Open owner/admin operator navigation and follow Business actions.
- Files: `src/lib/operator/navigation.ts` (owner `:69`, admin `:97`); absent `src/routes/**/business-actions*`; absent matching entries in `src/routeTree.gen.ts`
- Workaround: Avoid those nav items until modules are restored or links removed.
- Root cause: Navigation retained after module/route removal (see Tech Debt).
- Fix: Remove or gate the nav entries until routes and source exist.

**Mitigated — scrollbar gutter CLS (do not regress):**
- Symptoms (historical): Centered `max-w-*` layouts shifted when scrollbars appeared/disappeared.
- Files: `src/styles/base.css:18` now sets `scrollbar-gutter: stable both-edges` on `html`; originally tracked in `.planning/audits/ux/2026-07-05-PLATFORM-BEHAVIOR-AUDIT.md` (R6).
- Status: Source mitigation present at map time; keep the rule when re-skinning to Astryx theme layers.

## Security Considerations

**Live money / PSP processing remains gated (do not enable):**
- Risk: Treating Stripe/Autumn env presence, historical Phase 6 docs, or x402 signer code as permission to process live funds or claim payment/booking/dispatch.
- Files: `PRODUCT.md`, `AGENTS.md`, `.env.example`, `src/modules/capability-supply/internal/x402-payment-signer.ts`, `.planning/adr/ADR-005-transactions-receipts.md`, `.planning/audits/redteam/2026-07-04-PAYMENT-SECURITY-PATH-FORWARD.md`
- Current mitigation: current-vs-target split; copy scans (`npm run test:copy`); ADR-005 defer posture; FIX-NOW wave closed SSRF / source-write key split / nonce consumption / WBA binding.
- Recommendations: Do not claim or enable live money until ADR-005 D6 / live-money evidence decision, deployed test-mode smokes, refunds/disputes/reconciliation/kill switch exist. Keep card entry PSP-hosted (SAQ-A-compatible wording only).

**Provider API base-URL fail-closed allowlist incomplete in runtime:**
- Risk: Misconfigured `AUTUMN_API_BASE_URL` / Stripe base URLs could send bearer secrets to an unexpected host if billing adapters return.
- Files: `.env.example` (documents intended Autumn/Stripe hosts); notification providers under `src/lib/server/notification-provider.ts`
- Current mitigation: Env docs and notification test base URLs; billing provider module absent.
- Recommendations: Before restoring billing/business-action providers, enforce production allowlists for Autumn (`api.useautumn.com`) and Stripe (`api.stripe.com`); fail closed on non-allowlisted hosts; keep overrides test-only.

**Inquiry PII retention / purge automation incomplete:**
- Risk: Inquiry bodies and related private content persist longer than a defined retention policy; combining with future payment state expands blast radius.
- Files: `src/modules/inquiries/internal/privacy/commands.ts`, `convex/inquiries.ts` (`deleteCurrentOwnerInquiryPrivateContent`, export paths), `.planning/audits/redteam/2026-07-04-PAYMENT-SECURITY-PATH-FORWARD.md` (§4)
- Current mitigation: Owner privacy tombstone / private-content delete commands exist; audit redaction utilities under `src/modules/observability/`.
- Recommendations: Define TTL, automated purge, DSAR/export ownership, and notification/observability redaction SLAs before any payment-adjacent PII.

**Admin membership legacy subject fallback:**
- Risk: When `CLERK_JWT_ISSUER_DOMAIN` is unset/empty, admin lookup may fall back from `tokenIdentifier` to `clerkUserId` subject matching.
- Files: `convex/authz.ts` (`allowsLegacySubjectFallback`, `readActiveAdminMembership`)
- Current mitigation: Fallback skipped when issuer mismatches expected domain; tokenIdentifier mismatch rejects subject row.
- Recommendations: Require issuer domain in all deployed envs; migrate all admin rows to `tokenIdentifier`; remove subject fallback once data is clean.

**Local e2e Clerk bypass:**
- Risk: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` widens registry fallback and session checks; catastrophic if ever true in production.
- Files: `src/lib/server/local-e2e-bypass.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `src/lib/server/claim-owner-session.ts`, `src/lib/server/require-operator-session.ts`
- Current mitigation: Throws if enabled when production is detected (`local-e2e-bypass.ts`).
- Recommendations: Keep production detection strict; never set the flag outside hermetic e2e; prefer dedicated test identities over bypass when possible.

**Web Bot Auth trust list and draft protocol:**
- Risk: Widening `AE_WBA_SIGNATURE_AGENT_ALLOWLIST` or treating WBA identity as authorization; `web-bot-auth@0.1.3` tracks IETF draft status.
- Files: `src/modules/clearance/` (per `.agents/skills/ae-agent-identity-and-mandates/SKILL.md`), `src/routes/api.agent.tools.ts`, `.env.example`
- Current mitigation: Identity ≠ authority (clearance mandates / write admission); unsigned writes fail closed; copy bans collapsing signature into permission.
- Recommendations: Treat allowlist changes as trust decisions; re-verify draft status before external claims; keep mandate evaluation separate from WBA.

**Storefront import SSRF (mitigated — do not regress):**
- Risk: Authenticated `storefront.importDraft` fetching private/metadata URLs.
- Files: `src/modules/storefront/internal/import-draft.ts`, `src/modules/network-guard/public.ts`, `tests/unit/storefront/import-draft.test.ts`
- Current mitigation: Manual redirects with per-hop re-guard, DNS/literal private-range rejection, connect-time guarded undici lookup, timeout, 2 MiB cap, HTML content-type checks (RESOLVED in 2026-07-04 path-forward audit).
- Recommendations: Preserve hermetic network-guard tests on any importer change; keep `undici` pinned as the SSRF boundary dependency.

**Route-execution journal machines concentrate authority writes:**
- Risk: `startOrResume` / `leaseNextDispatch` / `recordOutcome` own lease grants, outcomes, and run advancement in one host file; incorrect extract or partial port can desync integrity digests from durable state.
- Files: `convex/customerRequestRouteExecution.ts`, `src/modules/customer-request/route-execution/journal/`, `convex/customerRequestRouteTransportWorker.ts` (calls `leaseNextDispatch` / `recordOutcome`), `convex/customerRequestApplication.ts` (calls `startOrResume`)
- Current mitigation: Integrity/decision helpers deepened and locked; thinness test forbids write-plan DTOs in the pure journal module; integration coverage in `tests/integration/customer-request-v2-multi-capability-route.test.ts`.
- Recommendations: No shallow Convex sibling chops (ADR-011); Wave 29 deepen via mutation ports; keep machines atomic at the mutation boundary.

## Performance Bottlenecks

**Answer Thread hero / motion settle time:**
- Problem: Home hero motion settles ~1s (700ms + 300ms delay) vs design target feel of ≤250ms-class interactions.
- Files: `.planning/audits/ux/2026-07-05-PLATFORM-BEHAVIOR-AUDIT.md` (R4), ad-hoc Tailwind durations across `src/components/ae/**`, token shim `src/styles/tokens.css`
- Measurement: Audit-measured ~1000ms hero settle; motion tokens largely unused.
- Cause: Un-tokenized motion (5 durations / multiple easings) and legacy `--ae-*` tokens not wired through Astryx theme.
- Improvement path: Define 3 durations + 2 easings in Astryx theme layer; retire 500/700ms; add Motion section to `DESIGN.md`.

**Large Convex mutation/query modules:**
- Problem: Remaining multi-thousand-line Convex files increase parse/bundle cost and raise risk of rewriting large documents in one mutation.
- Files: `convex/customerRequestApplication.ts` (1749 host-done), `convex/customerRequestRouteExecution.ts` (1606 — machines deepened; cancel/problem residual), `convex/registry.ts` (1622), `convex/discovery.ts` (1565), `convex/inquiries.ts` (1435 host-done), `convex/capabilitySupply.ts` (804 host-done).
- Measurement: Line counts above; Convex document limit 1 MiB (see `convex/_generated/ai/guidelines.md`).
- Cause: Unbounded arrays or growing aggregates inside single documents would rewrite whole docs; residual hosts still concentrate validators + secondary surfaces.
- Improvement path: Keep high-churn children in separate tables (schema convention already enforced in `tests/unit/schema/convex-schema.test.ts`); deepen cancel/problem or outbox convergence behind ports — not via shallow host file splits; profile hot paths under `npm run check:convex-codegen` + integration suites.

**Customer Request workspace client payload:**
- Problem: Workspace shell still owns a large interactive surface; likely heavy first paint for `/engine` (panels already split; shell file 413 lines).
- Files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` (413), projection families in `src/modules/customer-request/customer-projection.ts` (830), `src/modules/customer-request/route-plan-customer-projection.ts` (829)
- Measurement: File size / composition complexity (no fresh p95 captured in this map).
- Cause: Clarification, options, authority, and recovery still compose a large client surface across panel modules.
- Improvement path: Lazy-load non-first-paint panels; keep projection families in the customer-request module, not in Convex hosts.

**Hosted agent journey script size (Wave 31 closed):**
- Status: Split under `src/modules/customer-request/hosted-agent-journey/` (kernel + scenario adapters); thin re-export at `hosted-agent-journey.ts` (8 lines). Preserve `claimBoundary` sandbox honesty.
- Files: `hosted-agent-journey/{run,runtime,types,discovery,happy,cancel,partial,front-door}.ts`, `tests/unit/customer-request/hosted-agent-journey.test.ts`
- Residual: `runtime.ts` (~683) still the heaviest scenario helper — split further only if journey edits keep colliding.

## Fragile Areas

**Clearance + quiet agent door write admission:**
- Why fragile: Multi-layer fail-closed chain (WBA identity → tool scope → clearance/source-write admission → `allowWrites`) must stay ordered; collapsing layers reopens authorization bugs.
- Files: `src/routes/api.agent.tools.ts`, `src/modules/clearance/**`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`, `src/modules/harness/tool-policy.ts`
- Common failures: Missing nonce consumption, scope/key-family mismatch, treating signature as permission.
- Safe modification: Follow `.agents/skills/ae-agent-identity-and-mandates/SKILL.md` and `.agents/skills/ae-agent-surfaces/SKILL.md`; extend refusal taxonomies, never booleans; run integration tests for agent tools.
- Test coverage: Strong unit/integration around admissions; keep replay/nonce tests green on every change.

**Route-execution journal machines (Wave 29 deepened per ADR-011):**
- Why fragile: Lease/outcome/start sequencing remains correctness-critical; orchestration now in `route-execution/machines/` with semantic `JournalMutationPorts`, but cancel/problem residual and fat `commitSucceededOutcome` still need care.
- Files: `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteExecutionJournalPorts.ts`, `src/modules/customer-request/route-execution/{journal,machines}/`, thinness tests `journal-thinness` + `machines-thinness`
- Common failures: Shallow sibling file chops; leaking `WritePlan` / `intendedPatches` into pure `journal/`; breaking lease expiry / cancel disposition invariants; thickening host shells past thinness budgets.
- Safe modification: Change predicates via journal module; change machine orchestration via `machines/` + ports; keep host `internalMutation` shells thin; never invent Convex sibling Start/Lease/Outcome hosts.
- Test coverage: Unit thinness + journal/machines tests; heavy integration in `tests/integration/customer-request-v2-multi-capability-route.test.ts`.

**Capability supply quarantine / publication / probe:**
- Why fragile: Offerings, bindings, eligibility, publication, and readiness must all be current for routeable supply; quarantine and probe transitions are easy to get wrong.
- Files: `convex/capabilitySupply.ts`, `src/modules/capability-supply/**`, `tests/unit/capability-supply/convex-host-thinness.test.ts`
- Common failures: Treating registered pages as routeable supply; publishing without readiness; parent/child quarantine inconsistency; probe target digest mismatch.
- Safe modification: Use existing command mutations (`quarantineBinding`, publish/refresh/withdraw paths); never short-circuit eligibility hashes; deepen graph/probe only behind ports.
- Test coverage: Substantial unit coverage; production useful-supply proof still separate from sandbox.

**Convex `node:*` import bundling trap:**
- Why fragile: Any `node:` import pulled into a query/mutation module graph breaks `npm run check:convex-codegen`.
- Files: Documented in `.agents/skills/ae-convex-guardrails/SKILL.md`; Node-only patterns in `src/lib/server/notification-provider.ts`, `src/modules/storefront/internal/network-guard.ts`, `convex/capabilityCheck.ts` (`"use node"`)
- Common failures: Sharing a Node crypto helper into Convex query modules.
- Safe modification: Isolate Node actions with `"use node"` and no co-exported queries/mutations; keep pure domain in `src/modules/*/public.ts`.
- Test coverage: `check:convex-codegen` gate; do not disable it for convenience.

**Import / copy / claim boundary scanners:**
- Why fragile: Product honesty depends on mechanical scans; path allowlists that reference deleted modules go stale (billing/business-action paths still listed).
- Files: `src/lib/ui/contract-scans.ts`, `tests/copy/**`, `tests/imports/**`, `tests/ui-contract/**`
- Common failures: New public copy implying booking/payment/dispatch; forbidden Handshake deep imports; scanners allowing dead paths.
- Safe modification: Run `npm run test:copy`, `test:imports`, `test:ui-contract` on surface changes; update scanners when modules are removed.
- Test coverage: Broad; keep scanners aligned with actual tree.

**Cross-surface parity helper is Request-terminal only:**
- Why fragile: `compareCustomerRequestSurfaces` checks six terminal fields + reload flag — not mid-lifecycle action-plane parity.
- Files: `src/modules/customer-request/cross-surface-parity.ts`, `.planning/phases/02-one-action-plane-cross-surface-parity/02-RESEARCH.md`
- Common failures: Assuming terminal parity proves UI/API action equivalence mid-flow.
- Safe modification: Extend parity only with typed observation fields and falsifiable tests (Phase 2 plan); do not overload the existing helper silently.
- Test coverage: Existing terminal parity tests; action-plane parity still design-phase.

## Scaling Limits

**Convex document size (1 MiB):**
- Current capacity: Per-document ~1 MiB hard limit; unbounded arrays inside documents rewrite whole documents on update.
- Limit: High-churn inquiry threads, route execution journals, or supply audit blobs that grow without child tables.
- Symptoms at limit: Mutation failures / document too large errors; slow writes.
- Scaling path: Child tables with foreign keys (schema convention in `tests/unit/schema/convex-schema.test.ts` and Convex guidelines); never append unbounded arrays to parent docs.

**Sandbox / fixture supply ≠ production capacity:**
- Current capacity: Hosted sandbox Customer Request journeys and local e2e fixtures prove contract behavior.
- Limit: Does not prove useful real supply, human production `/engine` journey completeness, or external fulfilment.
- Symptoms at limit: Demos look green while registry/search against real businesses is thin or empty.
- Scaling path: Admitted businesses + capability bindings + readiness evidence; deployed human readback (`PRODUCT.md`).

**Agent write throughput (quiet door):**
- Current capacity: Signature age defaults (~60s) and single-use nonces bound replay; allowlist defaults narrow (chatgpt.com unless widened).
- Limit: Directory fetch latency and admission store contention under bursty agent writers.
- Symptoms at limit: `directory_fetch_failed` / nonce replay / signature age refusals.
- Scaling path: Cache directories carefully without skipping freshness checks; scale clearance protocol store; keep writes fail-closed under load.

## Dependencies at Risk

**nitro-nightly (Vite Start adapter):**
- Risk: `nitro` resolves to `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609` — pre-release, date-stamped, can break builds without semver warning.
- Impact: `vite build` / `vite start` and SSR route handlers fail.
- Migration plan: Pin to a stable Nitro 3 release when available; keep dry-run deploy checks in CI.

**web-bot-auth@0.1.3:**
- Risk: Implements draft HTTP message signatures / bot-auth architecture; API and draft status can change.
- Impact: Quiet-door verification regressions; external agents fail write admission.
- Migration plan: Track IETF draft updates; wrap behind `src/modules/clearance/internal/web-bot-auth.ts`; keep exhaustive error taxonomy.

**TypeScript 6.0.3:**
- Risk: Newer major than many ecosystem plugins expect; occasional tooling lag (oxlint, Vite plugins, Convex types).
- Impact: Typecheck or IDE false negatives/positives.
- Migration plan: Keep `npm run typecheck` and `test:ts-standards` as gates; upgrade plugins in lockstep.

**@x402/* + viem (quarantined):**
- Risk: Payment-rail SDKs in the dependency graph invite accidental production use beyond the reviewed signer.
- Impact: Wallet/custody/payment claim creep; larger attack surface.
- Migration plan: Retain import quarantine; remove packages if capability-supply no longer needs the signer.

## Missing Critical Features

**Customer-reachable multi-capability RoutePlan decision:**
- Problem: RoutePlan compilation and persistence exist, but customer-facing choose/approve/run/inspect of multi-step plans is not the current public product.
- Current workaround: Discovery, comparison, qualified inquiry; authenticated Request API with narrow sandbox journey; internal persistence only.
- Blocks: Target Request → RoutePlan → Approve → Run → Inspect lifecycle as a customer claim (`PRODUCT.md`).
- Implementation complexity: High — projection boundary, authority binding, HTTP/UI parity, deployed human proof.

**Proven complete human `/engine` production journey:**
- Problem: Authenticated workspace exists; complete human journey through real production dependencies is not proven.
- Current workaround: Agent sandbox journey + development smokes (`package.json` `smoke:customer-request:*`); Playwright `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`.
- Blocks: Treating `/engine` as cutover-ready or redirecting `/` to Request.
- Implementation complexity: Medium–high — deployed smokes + dependency readiness + UX settle fixes.

**Unified provider webhook replay ledger:**
- Problem: After billing module absence, remaining notification webhooks still need a single replay/ordering standard before money returns.
- Current workaround: Per-provider verification patterns where present (e.g. Resend/Novu paths under `convex/notificationOutbox.ts` and deploy-smoke phase2 specs).
- Blocks: Safe live provider events and future PSP webhooks.
- Implementation complexity: Medium — shared ledger + conflict-hold + metrics.

**Action-plane cross-surface parity (ADR-010 / Phase 2):**
- Problem: Human UI and agent API lack a mid-lifecycle parity contract for available actions, authority boundaries, and continuations.
- Current workaround: Terminal `compareCustomerRequestSurfaces` only (`src/modules/customer-request/cross-surface-parity.ts`).
- Blocks: One-action-plane product claims across surfaces.
- Implementation complexity: Medium — design in `.planning/phases/02-one-action-plane-cross-surface-parity/`; then falsifiable tests.

**Journal write-plan ADR (Wave 27 done — unlocks Wave 29 deepen):**
- Problem: ~~No accepted ADR~~ **Resolved by ADR-011** (`.planning/adr/ADR-011-journal-write-plan-ports.md`) for extracting `startOrResume` / `leaseNextDispatch` / `recordOutcome` behind mutation ports without Convex DTOs in the pure journal module.
- Current workaround: Machines remain host-exported until Wave 29 implements ADR-011; predicates/evidence already deepened.
- Blocks: Safe further reduction of `convex/customerRequestRouteExecution.ts` below the deferred-machine floor — **unblocked for Wave 29 only** under ADR-011 constraints.
- Implementation complexity: High — must preserve lease/outcome atomicity and integrity digests; shallow sibling chops remain explicitly out of scope.

## Test Coverage Gaps

**Deployed human Customer Request lifecycle:**
- What's not tested in CI by default: Full production human journey through real dependencies (beyond local unit/integration and optional deploy-smoke scripts).
- Files: `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`
- Risk: Source-green while hosted human path fails or lacks dependencies.
- Priority: High
- Difficulty to test: Needs deployed credentials, seeded supply, and Playwright deploy-smoke config.

**Phase 6 Stripe / billing provider smokes vs missing modules:**
- What's not tested: `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts` and related package scripts cannot exercise absent `business-action`/billing routes in this revision.
- Risk: False confidence from historical STATE/ADR wording; broken smoke scripts waste release time.
- Priority: High (process/honesty); Low for current inquiry-only product until modules return
- Difficulty to test: Restore modules or retire scripts/docs together.

**Live money / refund / dispute / reconciliation:**
- What's not tested: Production live-mode payment state machines (correctly absent until ADR-005 D6).
- Risk: Premature enablement without evidence.
- Priority: High before any live money; N/A for current public claims
- Difficulty to test: Requires PSP test mode + decision record + kill switch.

**Chat settle remount behavior:**
- What's not tested end-to-end: Identity-stable settle without remount flicker (browser evidence still audit-driven).
- Risk: UX regressions land without failing unit tests.
- Priority: Medium
- Difficulty to test: Playwright visual/scroll assertions around settle timing.

**Useful real supply vs sandbox cohorts:**
- What's not tested: That production registry search returns admitted, ready, published bindings for real businesses at useful density.
- Risk: Sandbox/eval green while customer discovery is empty.
- Priority: High for launch claims
- Difficulty to test: Needs production or staging catalog evidence, not only `convex/devSeed.ts` / local fixtures.

**Journal machine deepen (Wave 29 — ADR-011 unlocked):**
- What's not tested as a deepen seam: Port-backed start/lease/outcome machines (intentionally deferred until Wave 29).
- Files: `tests/unit/customer-request/route-execution/journal-thinness.test.ts` (locks host export + no write-plan DTOs in journal module); design: `.planning/adr/ADR-011-journal-write-plan-ports.md`
- Risk: Premature extracts that green thinness tests while breaking mutation atomicity.
- Priority: High for Wave 29; design gate cleared by ADR-011
- Difficulty to test: Requires new port fakes per ADR-011; do not add Convex sibling-file “thinness” as a substitute.

---

*Concerns audit: 2026-07-18*  
*Inspected revision: `19e988f5`*  
*last_mapped_commit: `19e988f5`*  
*Update as issues are fixed or new ones discovered*
