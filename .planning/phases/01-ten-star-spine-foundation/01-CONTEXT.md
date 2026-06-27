# Phase 01: ten-star-spine-foundation - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning after Fable 5 decisions

<domain>
## Phase Boundary

Phase 1 delivers a narrow launch foundation for Australian urgent/local-service owners: claim without ABN, publish a truthful public business service catalog, expose eligible facts through page/registry/search/API/AE-hosted discovery, show owner/operator health and repair readbacks, and prevent every Phase 2+ overclaim.

The current repo is planning-only. Runtime implementation has not started. The old kickoff `CONTEXT.md` and old PR00 source-mining plan were purged at user request; source-mining evidence remains in `.planning/source-mining/phase-1-ledger.md` and is treated as completed context, not an executable plan to recreate.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**10 requirements are locked.** See `01-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `01-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Fresh runtime substrate: `package.json`, `apps/web`, `convex`, `src/modules`, and test directories required by Phase 1.
- Source-mining/import/TypeScript/copy/SEO/security test gates before public exposure.
- Claim without ABN, owner binding, publish, services, first-request disclosure, and public business catalog source state.
- Durable idempotency, audit, projection attempts, index/discovery status, funnel events, owner activation state, and operator controls.
- Source-owned admin membership, role/action permission matrix, suppression, disputes/removal, and admin/operator readbacks.
- Public routes: `/`, `/claim`, `/claim/success`, `/{slug}`, `/registry`, `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/privacy/remove-business`, `/admin/claims`, `/admin/index-health`, `/admin/audit-events`.
- AE-hosted UCP fallback, public JSON catalog, llms, sitemap, robots, schema/canonical/noindex policy, and discovery headers.
- Descriptor-only lifecycle primitives and one reference vertical descriptor.
- Local verification, deployment/readback smoke, Matt Pocock two-axis review, and GTM internal-alpha readiness gates.

**Out of scope (from SPEC.md):**
- Chat, owner inbox, customer messaging, notifications, and owner reply flows — Phase 2.
- Payments, wallet, credits, billing, Stripe, x402, settlement, payment handlers, price fields, and payment-required flows — Phase 5 decision record required first.
- Protected actions, callable tools, booking/orders, propose/approve/execute action gateway, provider actions, receipts, reversal/dispute handling for money/actions — later authority phases.
- Skills, request market, experts, hosted agents, voice, persona, marketplaces, rankings, benchmarks, native mobile, SDK/CLI/plugin surfaces — not needed for owner-controlled visibility/readiness.
- API keys, MCP, OpenAPI action/service descriptors, business-origin standard `/.well-known/ucp`, and developer platform docs — Phase 3 only after read-only demand and route-tested support matrix.
- ABR/registry verification as a publish gate — ABN/ABR is optional trust evidence later, not required for T0 claim/publish.
- Server-side fetch of owner-supplied provider URLs — quarantined until a future endpoint verification phase.
- Broad public launch, paid ads, Product Hunt/developer/protocol launch, or demand/partner claims — blocked until GTM readiness stages are green.

</spec_lock>

<decisions>
## Implementation Decisions

### PR slicing after purge

- **D-01:** Treat PR00 source-mining as completed context. Do not recreate the deleted PR00 executable plan.
- **D-02:** New executable plan files should renumber from `01-01` and start with substrate/guardrails, then contracts/schema, claim/publish, admin/repair, public routes, registry/API, discovery, gates, and deployment/readback.
- **D-03:** The master `PHASE.md` remains historical phase authority, but the rewritten plan must not run broad execution against it. PR-specific plans are the executable units.
- **D-04:** Source-mining evidence authority is `.planning/source-mining/phase-1-ledger.md` only. PR descriptions may mirror it but cannot replace it.

### Owner page/status posture

- **D-05:** Owner experience is outcome-first readback: one-screen status card showing public URL, service status, public/index/discovery/trust state, unavailable capability, and next action.
- **D-06:** Owner/public copy uses human labels. Raw `callable=false` and `paymentRequired=false` stay in machine DTOs/manifests/admin diagnostics; owner pages say bookings, payments, and automated actions are not live.
- **D-07:** First-request availability is executable or unavailable. `inquiry_available`/`quote_request_available` require a source-owned public contact target/instruction with consent/evidence. Otherwise use `not_available_yet` or `ae_status_only` plus `noContactReason`.
- **D-08:** Phase 1 urgent-trades T0 facts include service category, suburb, state/territory, optional postcode, service-area tokens, hours or unknown, public contact target or no-contact reason, source refs, and explicit unavailable/not-supplied states.
- **D-09:** Route inventory includes `/` and `/claim/success`; keep roadmap, SPEC, GTM destinations, smoke tests, and public copy in parity.

### Registry/API/search contract

- **D-10:** Use a strict shared public catalog DTO. `catalog` is the sole owner of `PublicCatalogDto` and typed derived subsets for page, registry, API, UCP, llms, sitemap, and SEO.
- **D-11:** `business` owns transitions only: claim, owner binding, suppression, contention/recovery, and status changes. It must not own public read DTOs.
- **D-12:** Search is deterministic and simple first: match business name, service name, category, suburb/state/postcode/service-area tokens; no external/fuzzy engine until source/readback basics prove insufficient.
- **D-13:** “Measure everything” means privacy-safe event/readback streams: attribution, searches, result clicks, API/detail fetches, manifest/discovery fetches, share URL, owner status views, route/method/status/schema version/error code/bot class, and applicable business/service IDs. No raw private payloads.
- **D-14:** Public outputs expose non-sensitive freshness: `updatedAt`, `schemaVersion`, and catalog/public version. Raw source hashes may stay admin-only unless needed for public cache validation.
- **D-15:** Add global discovery-file projection/readback state for `/llms.txt`, `/sitemap.xml`, and `/robots.txt`, not only per-business UCP manifests.

### Operator repair/admin posture

- **D-16:** Public discovery is blocked until source-owned admin membership, suppression, operator controls, audit, repair readbacks, queues, and dispatchable repair actions exist.
- **D-17:** Minimum admin surface before public discovery: claims queue, audit events, index/discovery health, suppression/unsuppression, operator controls, retry registry projection, regenerate per-business/global discovery files, and explicit no-repair decisions.
- **D-18:** Operation keys are a state machine: reserve `(scope, actor, operation, key)`, store request/source hash and in-progress/succeeded/failed/result/effect refs, replay stored result, reject same-key/different-body retries.
- **D-19:** `auditEvents` is the single append-only authority for consequential events. `adminMembershipAuditEvents` may exist only as a derived/read model keyed by `auditEventId`.
- **D-20:** First-admin bootstrap is a one-time audited setup command: allowed only when no active `owner_admin` exists, emits `admin.membership_bootstrapped`, and denies/audits every later bootstrap attempt. Env/session identity never grants admin power by itself.
- **D-21:** Repair actions are typed dispatches tied to failed/stale source hash: retry projection, regenerate manifest/global discovery file, suppress/unsuppress, operator control, or explicit `no_repair`, all idempotent.
- **D-22:** Discovery `available` means latest successful readback for the current eligible source hash and surface body/URL hash. Missing or mismatched readback downgrades to stale/degraded with repair action.
- **D-23:** Suppression is cache-safe: every public handler/generator evaluates `isPubliclyDiscoverable` at serve or generation time, uses no-store or sourceHash/suppressedAt cache tags, and purge/rebuilds public surfaces on suppression/unsuppression.

### Fable 5 and Matt review gates

- **D-24:** Fable 5 gate runs in docs auto mode before accepting the rewritten plan and again at closeout. The findings register is `.planning/phases/01-ten-star-spine-foundation/FABLE-5-FOUNDATION-REVIEW.md`.
- **D-25:** Fable findings require owner, disposition, and SPEC/standard/source link in the plan review. Every accepted Fable finding must map to a plan task or an explicit rejection reason.
- **D-26:** `/mattpocock-review` runs before closeout with Standards and Spec axes kept separate. Every finding is fixed or explicitly recorded; axes are never merged.
- **D-27:** Closeout cannot pass with green tests alone. It must include real friendly-owner activation rows and recorded friction/failure notes from internal alpha.

### Type and module boundaries

- **D-28:** Cross-boundary primitives are branded/opaque after validation: `BusinessId`, `OwnerId`, `ServiceId`, `Slug`, `OperationKey`, `CorrelationId`, `SourceHash`, `AuditEventId`.
- **D-29:** Module public seam convention is `src/modules/<module>/public.ts`; implementation lives under `internal/`; `index.ts` barrels are banned for domain modules.
- **D-30:** Generated Convex hooks may be used by routes only to call public Convex functions whose args/returns are imported from owning module public seams. Generated Convex document/raw return types are never route domain contracts.
- **D-31:** Scanner contract is precise: literal negative flags pass only in approved DTO/schema/test contexts; truthy flags, provider/payment/callable descriptors, and payment-required copy fail.

### Security/data handling

- **D-32:** Normalized business identity has one active owner binding. Unresolved impersonation/duplicate fingerprints force `contested`/`pending_review` and cannot publish or divert public contact.
- **D-33:** Audit before/after snapshots are redacted allowlisted diffs or hashes, never raw source documents. Raw evidence stays behind private refs.
- **D-34:** Owner text is untrusted data in current Phase 1 agent-facing outputs. Use escaped JSON/string fields or explicit untrusted-data blocks; `llms.txt` does not include owner free text except links/status.

### Claude's Discretion

None. User selected concrete decisions or directed docs auto mode, and Fable 5 recommendations were accepted into this context.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements and discussion output

- `.planning/phases/01-ten-star-spine-foundation/01-SPEC.md` — locked Phase 1 requirements, boundaries, acceptance criteria, edge/prohibition coverage.
- `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md` — this implementation-decision context.
- `.planning/phases/01-ten-star-spine-foundation/FABLE-5-FOUNDATION-REVIEW.md` — accepted Fable 5 docs auto review findings and must-not-regress checks.
- `.planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md` — UI/IA/UX contract, shadcn posture, SaaS-inspired patterns, state rendering, copy, accessibility, responsive, and polish obligations.

### Product and roadmap authority

- `.planning/PROJECT.md` — ICP, product contract, source-owned module ownership, state variants, public interfaces, durable model, done definition.
- `.planning/ROADMAP.md` — phase graph, hard scope cuts, decision doors, Phase 1 route list, exit gates.
- `.planning/STATE.md` — current phase state and active risks. Note: old next action referenced a deleted PR00 plan; plan-phase should supersede it with the rewritten `01-01` substrate plan.
- `.planning/phases/01-ten-star-spine-foundation/PHASE.md` — master Phase 1 authority/old PR sequence; use with this context's purge/renumber decision.
- `.planning/phases/01-ten-star-spine-foundation/PREMORTEM.md` — failure register, no-launch gates, kill-switches, repair loops, launch rehearsal.

### Engineering and source-mining authority

- `.planning/ENGINEERING-STANDARDS.md` — TypeScript, Convex, route, audit, admin/security, discovery, SEO/GTM, import/source-mining, test and review gates.
- `.planning/SOURCE-MINING.md` — rules for mining `Agentic-Economy-Backup`; this context narrows authority to the committed ledger file only.
- `.planning/source-mining/phase-1-ledger.md` — concrete backup source anchors, kept invariants, cuts, fresh seams, tests, banned symbols.
- `../Agentic-Economy-Backup` — source mine only; no direct imports or copied folders.

### Security, AI discovery, SEO, and GTM authority

- `.planning/SECURITY-SPEC.md` — threat model, admin model, audit union, public allowlists, CSRF/Origin, prompt-injection, redaction rules.
- `.planning/AI-SPEC.md` — AE-hosted UCP fallback, manifest shape, public JSON catalog, discovery status, no callable/payment/MCP/OpenAPI/API-key claims.
- `.planning/SEO-AEO-SPEC.md` — public catalog SEO, sitemap, robots, llms, schema, crawl/AEO gates.
- `.planning/GTM-READINESS.md` — launch stages, ORB channel matrix, activation definition, funnel events, claims register, kill rules.
- `.planning/AGENTIC-MARKET-STUDY.md` — registry/API/list/search/detail/llms shape analogy; payment/x402/callable parts rejected.
- `.planning/PRODUCT-LENS.md` — `/ponytail`, Stripe, Coinbase/protocol, Matt Pocock, codebase-design, security, CEO, SEO/AEO, AI/protocol, GTM, accessibility review lenses.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- No runtime assets exist yet: no `package.json`, `apps/`, `src/`, `convex/`, or `tests/` tree was found during scout.
- Reusable material is planning/source-mining only: `.planning/source-mining/phase-1-ledger.md` and backup evidence anchors from `../Agentic-Economy-Backup`.

### Established Patterns

- Routes must be TanStack Start adapters only; Convex/source modules own state and authority.
- Public projections must use allowlist DTO builders, not DB row spreads.
- Convex is source of truth; planning files and hand-authored manifests are never runtime authority.
- Domain modules expose `public.ts`; internals live under `internal/`; no domain barrels.
- Tests are seam-first and include fail-first bad fixtures for import/source-mining/copy/type prohibitions.

### Integration Points

- New runtime substrate must create `package.json`, `apps/web`, `convex`, `src/modules`, and tests directories.
- Module seams to plan: business, catalog, registry, discovery, lifecycle, observability, security, seo.
- Public route adapters connect to module DTO/result unions; generated Convex raw document types must not leak into route contracts.
- Public surfaces share `PublicCatalogDto` or typed derived subsets.

</code_context>

<specifics>
## Specific Ideas

- Primary acceptance story remains Sam from Parramatta Emergency Plumbing.
- Owner status must fit in a one-screen card with public URL, service status, visibility/index/discovery/trust state, unavailable capability, and next action.
- Registry/API/search contract is “strict but measure everything”: one DTO and privacy-safe telemetry, not fuzzy search or raw logs.
- Public discovery waits for queues and repair controls, not manual ops.
- Fable 5 docs auto mode is now a planning gate, not an informal vibe check.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 1 scope. Existing deferred surfaces remain in later phases: inquiry/inbox, payments, protected actions, builder/developer discovery, MCP/OpenAPI/API keys, hosted agents, voice/persona, SDK/plugin surfaces.

</deferred>

---

*Phase: 01-ten-star-spine-foundation*
*Context gathered: 2026-06-27*
