---
# ADR-002: Capability Registry — Agent-Native Supply Remodel
Status: Proposed
Date: 2026-07-03
Scope: 2 — Capability registry (agent-native supply remodel)

## Context

AE today is a trust kernel with no network attached (`local://five-scopes.md` §Diagnosis).
Its supply model is AE-hosted, service-shaped rows: a `businesses` row
(`src/modules/business/internal/schema.ts:22-39`) fans out to per-service
`businessServices` (`src/modules/catalog/internal/schema.ts:14-29`) and
per-service `serviceCapabilities` whose `kind` enum is
`phone_inquiry | quote_request | emergency_callout_interest | ae_hosted_discovery`
(`src/modules/catalog/internal/catalog-model.ts:31-37`). That enum is
local-trades-shaped — exactly the wedge-anchoring the approved direction wants
to shed. A business that is a software factory, content agency, or e-commerce
operation has no "service area / suburb / hours" and cannot be represented as a
supplier, only as a mis-shaped local-services listing.

The approved Scope 2 target: **Business = identity + trust states +
capabilities[]** where a capability is one of
`informational page | inquiry intake | business-hosted endpoint | action card`
(`local://five-scopes.md` §Scope 2). These four are not new mechanisms — they
are the four admission/clearance radii AE already runs at different trust
levels (`local://research-ae-seams.md` §Orientation): read-only projection
(P1), qualified inquiry (P2), and receipt-backed action (P6/`business-action`).
Scope 2 unifies them under one per-business supply declaration + a trust-state
axis, plus business-origin manifest ingestion with scheduled re-checks against
a named standard.

Why now: Scope 2 is "the moat" and is parallelizable with Scope 3
(`local://five-scopes.md` §Sequencing); Scope 4 (comms) and Scope 5
(transactions) both depend on Scope 2 shipping endpoints. It starts only after
Scope 1 (deployed env, canonical base-URL helper, authz canonicalization).

## Grilling record

### Q1 — Is `(informational page | inquiry intake | business-hosted endpoint | action card)` the right closed enum? Extension without schema soup?
Evidence: the four kinds map 1:1 to AE's existing trust radii —
informational_page = read-only catalog (`registry.detail`, AGENTS.md:43-45);
inquiry_intake = qualified inquiry (`inquiry.submit`, AGENTS.md:46-49);
business_endpoint = the enum-anticipated but unbuilt `business_origin_standard`
discovery path (`src/modules/discovery/public.ts:24`); action_card = the P6
`provision-paid-intake-endpoint` card (`local://research-ae-seams.md` §(d),
`src/modules/business-action/internal/schema.ts:21`). Every enum in the tree is
a closed `literalUnion(...Values)`; the bloat detector bans "one-implementation
adapter for later" and P6 bans a generic `other` slug
(`.planning/ROADMAP.md:224,236`). A per-kind payload differs (page needs a URL;
intake a channel; endpoint a URL + schema ref; card a P6 reference), which the
codebase already models as discriminated unions (`ModuleResult`,
`RegenerateDiscoveryManifestResult`).
Answer: YES — a **closed** enum of exactly the four v1 kinds, with the
per-kind payload carried in a **discriminated `descriptor` union** (not wide
optional columns). Extension = adding a literal in a future ADR, each new kind
admitted with its own check semantics (mirrors P6's per-slug rigor), never a
generic escape hatch. Confidence: HIGH (kinds), MEDIUM (final names).

### Q2 — New capability tables vs widening business rows?
Evidence: the bloat detector bans "payment/provider field in core domain",
"Phase 6 action/payment/provider field in core catalog/registry/discovery
before source-owned card/checkpoint/receipt enforcement", and "boolean state
soup" (`.planning/ROADMAP.md:228-240`); the money-rail quarantine bans
rail/provider fields in `business`/`registry`/`discovery` rows (ROADMAP.md:201).
Widening `businesses` with endpoint/card/provider fields is therefore
prohibited. The established shape is a source-owned table + an idempotent
attempt table (status/retry/repair/readback + `sourceHash`/`generatedHash`),
e.g. `discoveryManifests` + `discoveryManifestAttempts`
(`src/modules/discovery/internal/schema.ts:66-121`),
`registryProjectionItems` + `registryProjectionAttempts`
(`src/modules/registry/internal/schema.ts:40-76`).
Answer: NEW business-grain tables. Widening business rows is banned. The
action_card descriptor holds a **reference** to the P6 card, never copied
provider/payment fields. Confidence: HIGH.

### Q3 — Business-origin manifest format, relationship to AE-hosted UCP, injection safety?
Evidence: today `/{slug}/ucp` emits `pathKind: 'ae_hosted_fallback'`
unconditionally (`src/modules/discovery/internal/ucp-manifest.ts:69`); the door
decision "AE-hosted fallback UCP … Do not claim standard business-origin UCP"
(ROADMAP.md:18) and the P3 candidate "business-origin /.well-known/ucp strategy
if deployable" (ROADMAP.md:141) set the posture. Injection precedent:
`safePublicText` (`ucp-manifest.ts:130-146`) NFKC-normalizes, strips
bidi/control chars, neutralizes `javascript:`, "ignore previous instructions",
markdown, "endpoint", "verified/callable/payable", and pins
`callable:false`/`paymentRequired:false` in the schema
(`discovery/internal/schema.ts:38-39`). The agent door strict-parses input
(`local://research-ae-seams.md` §(b), line 84).
Answer: a business publishes at its **own** origin `/.well-known/ucp` in the
same `ae-ucp:v1` schema family; AE ingests it as a **checked input, not
authority** — AE keeps publishing its own projection and the business manifest
only raises trust state (`checked`/`contradicted`). Injection rules: (1) ingest
as data, never proxy/execute (`five-scopes` boundary); (2) all owner free text
through `safePublicText` before any republish; (3) trust/capability claims
(`callable`/`paymentRequired`/`verified`/price/`endpoint`) are never trusted —
present = contradiction signal, republished pinned false; (4) **strict-parse,
no `.passthrough()`** on ingest, unknown fields dropped; (5) endpoint + manifest
URLs must be on the business's controlled origin (host allowlist → Q8 admission).
Confidence: HIGH (rules), MEDIUM (exact path/version strings).

### Q4 — Check engine: cron cadence, backoff, transition writer, failure surfacing?
Evidence: `convex/crons.ts` holds two hourly interval crons
(`crons.interval(name, { hours: 1 }, internal.X, {})`), a thin, proven
substrate. Attempt/repair machinery already exists: `retryCount`,
`staleThresholdAt`, `repairAction`, `repairResult`
(`registry/internal/schema.ts:56-76`; `discovery/internal/schema.ts:98-120`),
default stale window `3_600_000` ms
(`discovery/internal/manifest-attempts.ts:23`), transitions computed by **pure
functions** over source state (`regenerateDiscoveryManifest`) and persisted by
Convex under a source-write scope (`discovery_repair` exists,
`local://research-ae-seams.md` risk 1). Failure messages are redacted (risk 2).
Answer: an hourly cron selects capabilities with `staleThresholdAt <= now` and
enqueues a check attempt; per-kind freshness windows (Q5); exponential backoff
via `retryCount` + `retryAfter`, capped, then `repairAction: no_repair` →
degrade to `unsupported`/`contradicted`. A **pure module function** computes the
next trust state; a Convex mutation persists it under a source-write scope; the
pure function is the reconstruction oracle. Failures surface via
`failureCode` + `failureMessageRedacted` to owner health readback
(per-capability status + recovery action, like `readDiscoveryHealth`) and
operator admin (like `/admin/index-health`) — never public. Confidence: HIGH.

### Q5 — Draft "AE endpoint check v1" as a named standard.
Evidence: AGENTS.md:17-19 — "verified" requires a named standard;
`checked` = "a defined check passed" (PRODUCT.md:51). Facets modeled on the
Bazaar readback pattern the market study endorses as shape-only
(`.planning/archive/root/AGENTIC-MARKET-STUDY.md:81-88`).
Answer — **`ae-endpoint-check:v1`** (drafted in Decisions D6), four facets
(reachability, schema conformance, freshness, contradiction), GET/HEAD only,
read+describe, mapping to trust states `checked/stale/contradicted/unsupported`.
Public label stays "checked / last checked / needs confirmation" — **never
"verified"** (this is a check standard, not a verification standard).
Confidence: HIGH (structure), MEDIUM (window/timeout numbers → ticket).

### Q6 — Capability filters on `registry.search`; backward compat; llms.txt/UCP changes?
Evidence: `registrySearchInputSchema` = query/limit/cursor/mode/location
(`src/modules/registry/registry.actions.ts:42-62`); the DTO already exposes
`services[].capabilities[]: { kind, status }` with `z.string()` (not enums) and
`.passthrough()` (`registry.actions.ts:103-110,128`). `registry.search` is an
agentTools action (AGENTS.md:40-42), so schema changes touch the agentTools
snapshot (Scope 1 concern).
Answer: add an **optional** `capability` filter param (existing callers
unaffected); add a business-grain `capabilities[]` array to the DTO
(additive; passthrough + `z.string()` kind/status tolerate new values). Update
the agentTools snapshot deliberately in one commit. llms.txt/UCP gain a
per-business capability summary through `safePublicText`, `callable:false`/
`paymentRequired:false` pinned. Human copy maps kinds to plain labels — never
the public-banned words "capability"/"endpoint". Confidence: HIGH.

### Q7 — Migrate existing service-shaped listings with zero public-page breakage?
Evidence: new tables are additive; existing public pages/API/UCP read
`businessServices` + `serviceCapabilities`; the ICP door is two-way "only if
fields/copy still fit unchanged" (ROADMAP.md:16).
Answer: **derive, don't rewrite.** Backfill business-grain `businessCapabilities`
from published state — every published business → an `informational_page`
(`listed`/`business_supplied`); any phone_inquiry/quote_request/
emergency_callout serviceCapability → one `inquiry_intake` capability whose
descriptor references the serviceId; ae_hosted_discovery → informational_page.
`serviceCapabilities` is untouched (reversible). Public URL/slug/service rows
unchanged; copy identical to today's first-request disclosure. Idempotent
backfill via a projection attempt keyed by `logicalKey`. Confidence: HIGH.

### Q8 — How does a listing truthfully disclose agent operation? Admission requirements?
Evidence: "Businesses increasingly agent-operated (Dark Factory-style)"
(`five-scopes.md`); AGENTS.md bans "autonomous"/"agent-native"/"callable" in
public copy and reserves "verified" for a named standard; the claim flow
(`claimBusiness`, `business/public.ts:270`) admits without ABN (PRODUCT.md).
Answer: agent operation is an **orthogonal business-grain disclosure**
(`operationMode: human_operated | agent_operated | hybrid`), NOT a fifth
capability kind. It is a factual disclosure ("operated by an automated system"),
stays `business_supplied` (AE cannot verify no human is behind it), and never
implies AE transacts with it. Admission to register a `business_endpoint`:
(1) claimed business (owner/principal attribution); (2) **domain-control proof
of the endpoint origin** (host allowlist for Q3) — a NEW requirement beyond
no-ABN claim [INFERENCE]; (3) endpoint starts `business_supplied`, reaches
`checked` only after `ae-endpoint-check:v1` passes; (4) `action_card` requires
full P6 rigor, cannot be self-declared. Confidence: MEDIUM-HIGH (mechanism
decided; proof bar → ticket).

### Q9 — Confirm nothing local-services-shaped leaks into core rows.
Evidence: standing veto on urgency/jobSuburb-style fields
(`five-scopes.md` §Scope 2; project memory); local-shaped fields today are
`serviceArea`/`suburb`/`stateTerritory`/`hoursOrUnknown` (businessServices) and
`emergency_callout_interest` (serviceCapabilities).
Answer: the four kinds are commerce-generic — none encodes trade/area/urgency.
`businessCapabilities`/`capabilityCheckAttempts` carry NO
serviceArea/suburb/hours/urgency/emergency fields; local data stays in
`businessServices`/`businessContexts` (referenced, not absorbed).
`emergency_callout_interest` is NOT promoted; it migrates to generic
`inquiry_intake`. A grep-style invariant guards the new tables. Confidence: HIGH.

## Decisions

D1. **Capability axis = a new business-grain enum, closed, four v1 kinds.**
Add `BusinessCapabilityKindValues = ['informational_page','inquiry_intake','business_endpoint','action_card']`
(internal name; distinct from the retained service-grain `CapabilityKindValues`).
No generic `other`/open kind. New kinds require a future ADR + per-kind check
semantics.

D2. **New tables, never widened business rows.**
`businessCapabilities` (source-owned): `businessId`, `capabilityId`, `kind`,
`trustState`, `descriptor` (discriminated union by `kind`), optional `serviceId`
(migration link only), `sourceHash`, `sourceVersion`, timestamps; indexes
`by_business`, `by_business_kind`, `by_business_status`. Reuse the existing
`VisibilityTargetTypeValues` `'capability'` suppression target (targetRef =
capabilityId) — no new suppression enum. The `action_card` descriptor holds a
**reference** to the P6 card (id/hash), never copied provider/payment fields.

D3. **`descriptor` is a discriminated union, no wide optional columns.**
informational_page → `{ publicUrl }`; inquiry_intake →
`{ serviceId?, firstRequestMode, publicChannel }` (reusing existing enums);
business_endpoint → `{ originUrl, manifestUrl, schemaRef }`; action_card →
`{ actionSlug, cardRef }` (pointer into `business-action`, gated on P6
enforcement for that slug).

D4. **Per-capability trust state = the five PRODUCT.md fact labels.**
`CapabilityTrustStateValues = ['business_supplied','checked','stale','contradicted','unsupported']`
(exactly the five in `five-scopes.md` §Scope 2). `business_supplied` is the
owner-declared default; the check engine drives the rest. Never `verified`
unless a stricter verification standard is later defined and met.

D5. **Business-origin ingestion = checked input, not authority.**
A business publishes `/.well-known/ucp` in the `ae-ucp:v1` schema family;
`pathKind: 'business_origin_standard'` (the existing enum value). AE still
publishes its own `ae_hosted_fallback` projection; the business manifest only
raises/lowers trust state. Ingest is **strict-parse (no passthrough)**, all
owner text through `safePublicText`, all trust/capability claims stripped and
pinned false, URLs host-allowlisted to the business's controlled origin,
read+describe only (never proxy/execute).

D6. **Named standard `ae-endpoint-check:v1`.** Four facets, GET/HEAD only:
(a) **Reachability** — HTTPS 2xx + valid TLS within timeout; else FAIL.
(b) **Schema conformance** — strict-parses `ae-ucp:v1`; a forbidden claim
(callable:true / paymentRequired:true / price / "verified") is a FAIL.
(c) **Freshness** — `generatedAt`/`sourceHash` within the per-kind window and
hash matches last check; window exceeded = STALE (not fail).
(d) **Contradiction** — declared name/category/location/service facts vs
AE-held claimed facts; disagreement = CONTRADICTED.
State mapping: all pass + fresh → `checked`; window exceeded → `stale`;
reachability/schema fail (backoff exhausted) → `unsupported`; contradiction →
`contradicted`; never checked → `business_supplied`.
Draft windows: informational_page 24h, inquiry_intake 24h, business_endpoint 1h
(matches `defaultStaleAfterMs`), action_card not cron-checked (its check is the
P6 receipt reconstruction at propose-time). Public label: "checked / last
checked / needs confirmation" — never "verified".

D7. **Check engine reuses the attempt/repair/cron substrate.**
`capabilityCheckAttempts` (mirrors `discoveryManifestAttempts`): `attemptId`
(idempotent), `businessId`, `capabilityId`, `checkStandardVersion`, `status`
(`queued|succeeded|failed|stale|contradicted`), facet results, `retryCount`,
`retryAfter`, `failureCode`, `failureMessageRedacted`, `staleThresholdAt`,
`latestReadback`, `repairAction`, `repairResult`; indexes `by_business_status`,
`by_capability_status`, `by_attemptId`. An hourly `crons.interval('recheck due
business capabilities', { hours: 1 }, …)` selects `staleThresholdAt <= now`.
A pure module function computes transitions; a Convex mutation persists under a
source-write scope (reuse `discovery_repair` or add `capability_check` to both
the TS enum and `convex/sourceWriteAdmission.ts`). Failures surface to owner
health + operator admin, redacted, never public.

D8. **`registry.search` gains an optional `capability` filter; DTO gains a
business-grain `capabilities[]`.** Both additive; `kind`/`status` stay
`z.string()`; output keeps `.passthrough()`; existing agentJson/http/agentTools
callers unaffected; the agentTools snapshot is updated in one deliberate commit.
llms.txt/UCP add a per-business capability summary via `safePublicText`.

D9. **Migration = derive-then-additive, zero public breakage.**
Idempotent backfill derives `businessCapabilities` from published state
(`serviceCapabilities` untouched, reversible); public pages read the additive
DTO field; slug/URL/service rows and human copy unchanged.

D10. **Agent operation = orthogonal disclosure, not a capability kind.**
`operationMode: human_operated | agent_operated | hybrid` on the business,
plain-copy public label, `business_supplied` trust (unverifiable), never
implying AE transacts. `business_endpoint` registration requires a claimed
business + domain-control proof; `action_card` requires P6 rigor.

D11. **Wedge-agnostic invariant, enforced.** `businessCapabilities` /
`capabilityCheckAttempts` carry no service/area/suburb/hours/urgency/emergency
fields; a grep-style check (like the money-rail quarantine) guards them. Local
data stays in `businessServices`/`businessContexts`.

## Consequences

Positive:
- De-anchors supply from local-trades shape without deleting the local model —
  a software factory or content agency is now representable as a capability set.
- Reuses proven source-owned + attempt/repair + cron + safePublicText patterns;
  no new architectural primitive.
- Trust states become first-class per capability, so staleness/contradiction
  visibly degrade a listing (Scope 2 "Done" criterion).
- Additive, passthrough-safe DTO/search changes → no consumer breakage.
- Business-origin ingestion never grants authority → boundary stays honest.

Negative / cost:
- Two tables named "capabilit*" (`businessCapabilities` vs the retained
  `serviceCapabilities`) — a readability tax until a later fold (ticket).
- The check engine adds a new external-fetch surface AE must run safely from
  Convex crons (SSRF/egress hardening — ticket).
- A new admission gate (domain-control proof) raises onboarding friction for
  agent-native businesses.

Risks:
- Prompt injection via business-origin manifests — mitigated by strict-parse +
  safePublicText + claim-stripping + host allowlist, but the manifest is a live
  machine surface and the highest-value attack target in the scope.
- Contradiction precedence (AE-held vs business manifest) is subtle and could
  mislabel honest updates as `contradicted` (grilling ticket).
- Convex query/mutation runtimes cannot fetch; the fetch path must be a Convex
  action + scheduler, which changes the pure-function/handler split (ticket).

## Alternatives considered

- **Widen `businesses`/`businessServices` rows with capability/endpoint/provider
  columns.** Rejected: directly banned by the bloat detector and money-rail
  quarantine (ROADMAP.md:201,228-240); produces boolean/optional-column soup.
- **Open/extensible capability kind with a generic `other` + free-form payload.**
  Rejected: bloat detector bans "one-implementation adapter for later"; P6
  already bans a generic `other` slug (ROADMAP.md:224). Closed enum + per-kind
  admission preserves the safety envelope.
- **Promote the existing `CapabilityKindValues` (phone_inquiry/quote_request/…)
  to the new axis.** Rejected: it is the exact local-trades shape Scope 2 sheds
  and violates the wedge-agnostic veto (Q9).
- **Treat the business-origin manifest as authoritative (overrides AE facts).**
  Rejected: violates "indexing = read + describe, never proxy/execute" and the
  "do not claim standard business-origin UCP" door (ROADMAP.md:18); a spoofed or
  compromised origin would poison AE's trust layer.
- **Reference the P6 card by copying its fields into the capability row.**
  Rejected: bloat detector bans Phase-6 action/provider fields in core catalog
  before source-owned enforcement (ROADMAP.md:237). Reference-only keeps P6 the
  single owner of card/checkpoint/receipt.
- **Fold `serviceCapabilities` into `businessCapabilities` now.** Rejected for
  v1: breaks the zero-public-breakage migration constraint (Q7); deferred to a
  grilling ticket.

## Boundary posture

- AE reads, describes, compares, summarizes, and routes; a `business_endpoint`
  being `checked` means AE fetched + schema-checked it (GET/HEAD), NOT that AE
  executes against it. Execution/dispatch is Scope 4; payment/action is Scope 5.
- No public human copy uses `capability`, `endpoint`, `manifest`, `gateway`,
  `operator`, `callable`, `autonomous`, `agent-native`, or `verified`
  (AGENTS.md:90-92, PRODUCT.md:78). Internal enums may use these words; human
  surfaces map kinds to plain labels ("Read business details", "Send an
  inquiry", "This business publishes machine-readable details", "Operated by an
  automated system").
- Trust states use PRODUCT.md labels only: `business_supplied`, `checked`,
  `last checked` (stale), `needs confirmation`/withheld (contradicted/
  unsupported). "verified" is reserved for a future named verification standard.
- `KNOWN`/`UNKNOWN`/`UNAVAILABLE`/`NEXT_STEP` stay in JSON/llms.txt/agent-JSON/
  owner/admin only (AGENTS.md:67-72).
- Machine surfaces (llms.txt, UCP, agent JSON) pin `callable:false` /
  `paymentRequired:false` and pass all owner text through `safePublicText`.
- No money/provider/rail fields in `business`/`registry`/`discovery` or the new
  capability rows (ROADMAP.md:201). This ADR proposes NO amendment to any
  decision door; the `business_origin_standard` path it activates is the P3 ship
  candidate already registered (ROADMAP.md:141) and must ship its own "checked"
  wording, not a "standard UCP" claim.

## Open questions -> tickets

- Resolve Convex-safe external-fetch path for capability checks
- Prototype domain-control proof for business_endpoint admission
- Settle contradiction precedence: AE-held facts vs business manifest
- Decide capability-table naming and serviceCapabilities fold path
- Decide agent-operation disclosure proof bar
- Tune ae-endpoint-check:v1 freshness windows and timeouts
- Define locality × capability filter composition for registry.search

## References
- `local://five-scopes.md` §Scope 2, §Sequencing
- `AGENTS.md` (trust contract, banned public words, epistemic vocabulary)
- `PRODUCT.md` (trust states :46-55, principles, anti-references :74-79)
- `.planning/ROADMAP.md` (decision-door register :11-24, capability ladder,
  Phase 3 :132-149, money-rail quarantine :201, bloat detector :228-240)
- `.planning/archive/root/AGENTIC-MARKET-STUDY.md` (Bazaar readback pattern :77-98,
  copy/adapt/reject :127-157)
- `local://research-ae-seams.md` (three clearance layers; agent door;
  reconstruction verifier; injection/redaction risk notes)
- `src/modules/registry/internal/schema.ts` (projection + attempt + search-doc
  source-state pattern)
- `src/modules/registry/registry.actions.ts` (search schema, passthrough DTO)
- `src/modules/catalog/internal/schema.ts`, `.../catalog-model.ts:18-40`
  (service-grain capability enum being de-anchored)
- `src/modules/business/internal/schema.ts` (business/context/claim rows)
- `src/modules/discovery/internal/schema.ts`, `.../ucp-manifest.ts:130-146`
  (`safePublicText`), `.../manifest-attempts.ts` (attempt/repair engine),
  `src/modules/discovery/public.ts:21-43` (path/status/attempt enums)
- `convex/crons.ts` (interval cron substrate)
