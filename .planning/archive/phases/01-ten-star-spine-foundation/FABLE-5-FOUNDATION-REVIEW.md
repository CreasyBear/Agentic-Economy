# Fable 5 Foundation Review — Phase 1

**Created:** 2026-06-27
**Mode:** docs auto mode; five parallel review lenses; all findings accepted into `01-CONTEXT.md` unless explicitly marked deferred.
**Question:** What would Fable 5 require to make Phase 1 an architected, engineered, 10-star launch foundation?

## Verdict

Not implementation-ready until the accepted decisions below are carried into planning.

The existing SPEC is strong on product boundary. Fable 5 raises the bar on the implementation contract: every public claim must resolve to a real source-owned action or an explicit unavailable state; every read model must come from one catalog DTO; every repair must be dispatchable; every public/agent surface must be measurable, freshness-aware, suppression-safe, and free of protocol theatre.

## Accepted Fable 5 Decisions

### Product truth

- First-request availability is executable or unavailable. `inquiry_available` or `quote_request_available` may appear only when the service has an allowlisted, source-owned public contact target/instruction with consent/evidence. Otherwise output `not_available_yet` or `ae_status_only` plus `noContactReason`.
- Owner-facing UI uses human labels, not raw protocol flags. Raw `callable=false` and `paymentRequired=false` remain in machine DTOs/manifests/admin diagnostics; owner/public copy says bookings, payments, and automated actions are not live.
- Route inventory is explicit: `/`, `/claim`, `/claim/success`, `/{slug}`, `/registry`, JSON catalog routes, discovery files, privacy/removal, and admin routes are Phase 1 commitments.
- Urgent-trades T0 facts are explicit: service category, suburb, state/territory, optional postcode, service area tokens, hours or unknown, public contact target or no-contact reason, source refs, and unavailable states.
- Internal alpha closeout requires real owner activation evidence: friendly-owner attempts, activation-state rows, and recorded friction/failure reasons, not only instrumentation presence.

### Stripe-grade platform architecture

- Operation keys are a state machine, not a table checkbox: reserve `(scope, actor, operation, key)`, store request/source hash, in-progress/succeeded/failed/result/effect refs, replay stored results, and reject same-key/different-body retries.
- `auditEvents` is the single append-only authority for consequential events. Admin membership audit tables may exist only as derived/read models keyed by `auditEventId`.
- First-admin bootstrap is one-time, source-owned, audited, and denied after first success. Env/session identity can identify the caller but cannot itself grant admin authority.
- Repair actions are typed dispatches, not free text: `retryRegistryProjection`, regenerate manifest/global discovery file, suppress/unsuppress, operator control, or explicit `no_repair`, all using operation keys and source-hash checks.
- Scanner allowlist is precise: literal negative flags pass only in approved DTO/schema/test contexts; truthy flags, provider/payment/callable descriptors, and payment-required copy fail.

### Matt Pocock / deep module contract

- `catalog` is the sole owner of `PublicCatalogDto` and typed derived subsets for page, registry, API, UCP, llms, sitemap, and SEO. `business` owns transitions: claim, owner binding, suppression, recovery.
- Generated Convex hooks may be used by routes only to call public Convex functions whose args/returns are imported from owning module public seams. Generated Convex document/raw return types are never the route domain contract.
- `.planning/source-mining/phase-1-ledger.md` is the only durable source-mining authority. PR prose can mirror it, not replace it.
- Cross-boundary primitives are branded/opaque after validation: `BusinessId`, `OwnerId`, `ServiceId`, `Slug`, `OperationKey`, `CorrelationId`, `SourceHash`, `AuditEventId`.
- Module public seam convention is explicit: `src/modules/<module>/public.ts`; implementation under `internal/`; no `index.ts` barrels for domain modules; tests fail private imports.

### Security and reliability premortem

- Normalized business identity has one active owner binding. Unresolved impersonation/duplicate fingerprints force `contested`/`pending_review` and cannot publish or divert public first-request contact.
- Audit before/after snapshots are redacted allowlisted diffs or hashes, never raw source documents. Raw evidence stays behind private refs.
- `discoveryStatus='available'` means latest successful readback for the current eligible source hash and surface body/URL hash. Missing/mismatched readback downgrades to stale/degraded with repair action.
- Every public handler/generator evaluates `isPubliclyDiscoverable` at serve or generation time, uses no-store or sourceHash/suppressedAt cache tags, and purge/rebuilds page, registry, API, sitemap, llms, UCP on suppression/unsuppression.
- Owner text appears only as escaped JSON/string data or explicit untrusted-data blocks in agent-facing outputs. `llms.txt` does not include owner free text except links/status.

### AI discovery / SEO / GTM honesty

- Public catalog includes an AU locality tuple: suburb, state/territory, optional postcode, and service-area tokens. Search, schema, titles, and canonical text use it.
- Public-surface fetch/readback telemetry is source-owned and privacy-safe: route, method, status, response/schema version, error code, user-agent/bot class, business/service IDs where applicable, timestamp; no raw private payloads.
- Global discovery files have projection/readback state: `/llms.txt`, `/sitemap.xml`, and `/robots.txt` store source hash/version, generated hash, status, attempt history, and repair path.
- Public outputs expose non-sensitive freshness: `updatedAt`, `schemaVersion`, and catalog/public version. Raw source hashes may remain admin-only unless needed for public cache validation.
- `llms.txt` and API docs must describe only resolving routes and unsupported actions; dead documented routes fail launch.

## Must-Not-Regress Checks

- Sam E2E proves every displayed first-request CTA resolves to a real allowed public contact target/instruction or says unavailable with a next owner step.
- Copy tests fail raw `callable` or `paymentRequired` terms on owner-facing routes while machine DTO/manifest tests require literal false flags.
- Route inventory parity check keeps roadmap, SPEC, GTM destinations, smoke tests, and docs aligned.
- Type tests reject raw strings or swapped branded IDs/keys across route/Convex/module seams.
- Import tests fail route/module private imports, `index.ts` domain barrels, backup paths, future-surface directories, and unapproved payment/callable identifiers.
- Concurrent same-key publish/retry and mismatched-body reuse prove the operation-key state machine.
- Membership bootstrap tests cover first success, second-bootstrap denial, and env/session-only denial.
- Every failed/stale projection or discovery file has exactly one dispatchable repair action or explicit no-repair decision.
- PII-seeded claim/admin/contact fields stay absent from public outputs, audit snapshots, logs, and readbacks.
- Warm-cache suppression test proves page, registry, API, sitemap, llms, and UCP stop exposing suppressed records.
- Prompt-injection corpus covers instruction text, markdown, JSON-breaking payloads, HTML/script, and Unicode bidi across manifest, llms, API, and JSON-LD.
- Public fetch telemetry can compute API/manifest error rate and route coverage without UTM/session.
- Closeout evidence includes friendly-owner activation rows and recorded friction/failure notes.

## Fable 5 Review Sources

- `FableFounder` — founder/product truth.
- `FableStripe` — Stripe-grade platform architecture.
- `FableMatt` — Matt Pocock TypeScript/deep-module standards.
- `FableSecurity` — security/reliability premortem.
- `FableAIGTM` — AI discovery/SEO/GTM honesty.

---

*Next consumer:* `01-CONTEXT.md` and then `/skill:gsd-plan-phase 1`.
