# Tiered capability admission: flexible onboarding without sacrificing determinism

- Date: 2026-08-05
- Status: design (reference-informed; implementation pending coordination)
- Scope: AE's capability/generic admission seam only. Does NOT touch the deterministic
  kernel (compiler/authority/replay/digest), the engine, the router, RouteMandate/money
  ledger, the x402 payment boundary, or the transports.

## 1. Problem (this is real, observed today)

Porting 4 real keyed providers (OpenWeather, Tavily, SerpAPI, CoinGecko-demo) through the
curated seed exposed three distinct admission barriers, each a *hard* `refused` from the
single canonical-contract gate:

1. **`capability_input_disclosure_undeclared`** — `defineCapabilityContract`
   (`src/modules/capability-contract/public.ts:277-280`) requires every top-level input
   property be covered by a `dataUse` inputPointer, and every *required* input be customer
   annotated. Because the `openapi_http` importer derives the GET input schema from ALL
   query params, provider API keys carried in query (`appid`, `api_key`) become phantom
   required inputs with no data-use disclosure → bounce. Correct posture (and the fix that
   worked): credentials belong in the OpenAPI **security scheme** and are injected by the
   binding; they must never be dynamic input properties.
2. **Optional-body-field disclosure** — Tavily's `days`/`include_answer`/`include_raw_content`
   /`domains` and CoinGecko's `include_*` all needed hand-authored `dataUse` entries. That is
   AE-authored semantic opinion layered on the provider's real schema.
3. **Non-canonical output pointer** — CoinGecko's dynamic-keyed output has no guaranteed
   field; a root `'/'` pointer is non-canonical (`pointerSyntaxIsCanonical`, public.ts:820-824),
   so the contract must be hand-restructured to a bounded `{'/prices': ...}` shape.

The single gate is *binary*: conform to the full canonical contract or be refused before ever
reaching the existing publication lifecycle. Every real port therefore needs bespoke
hand-transcription. That is the rigidity.

## 2. What AE already has (do not rebuild — extend)

AE is NOT without an onboarding process. It already owns:

- A **publication lifecycle** state machine `src/modules/capability-supply/internal/publication/lifecycle.ts`
  with states `inactive | active | withdrawn | incompatible` and reasons
  `admission_unproven | conformance_unproven | credential_readiness_unobserved |
  credential_unavailable | health_unobserved | health_unhealthy | health_stale`.
  It already separates *credential* and *health* readiness tiers.
- A real **admission command** `admitCapabilityPublicationCommand`
  (`internal/publication/admit.ts`) and a publish command (`publish.ts`), driven by
  `normalizeCapabilityPublication` (`internal/publication-importers.ts:120`) which dispatches
  to 4 importers (`openapi_http`, `mcp`, `x402`, `ae_envelope`), each ending in
  `normalizedFromSchemas` → `defineCapabilityContract`.
- The generic Contract → Offering → Binding → Publication path in `convex/curatedProviders.ts:seed`
  and `convex/capabilitySupply.ts`.

The real gap: **schema/contract depth is a single strict gate at admission**, not a tiered
dimension. The lifecycle's readiness tiers exist, but a provider that can't satisfy the full
canonical contract never reaches them.

## 3. Reference designs consulted (no hand-rolling)

- **CDP Bazaar / x402** — no submit API. Listing triggers on first successful `settle`
  (`paymentPayload.resource` set). Discovery metadata (`extensions.bazaar`) is declarative;
  missing output schema is *advisory* (lowers rank), not blocking. Lesson: a
  **discoverable-but-not-schema-deep** state is legitimate; proof-of-first-execution promotes.
- **agentic.market** — one-call quickstart (agent + wallet + test credits, no auth); a
  **validator that also scaffolds/generates integration code** rather than just rejecting.
  Lesson: admission can *adapt/fix* the input deterministically instead of refusing.
- **Apicurio Registry `references=DEREFERENCE` + OpenAPI Generator normalizer** — mature,
  deterministic OpenAPI normalization: inline all `$ref`/`allOf`/`oneOf` (`SIMPLIFY_ONEOF_ANYOF`,
  `REFACTOR_ALLOF_WITH_PROPERTIES_ONLY`, `NORMALIZE_31SPEC`), extract security schemes.
  Lesson: `$ref` inlining and security-scheme extraction are **solved, deterministic problems**
  — reuse the pattern, don't hand-write it.
- **JetBrains / commercetools / Apiable marketplace approval state machines** — draft → review →
  approved with automated checks + a human/advisory gate; production access gated more strongly
  than sandbox. Lesson: staged approval + tiered control (public vs privileged) is the norm;
  AE's lifecycle already mirrors the state-machine side.

## 4. Proposed architecture: two-axis admission

Replace the single binary gate with **admission profile** (schema/contract depth tier) × the
**existing lifecycle** (readiness tier). Both stay 100% deterministic. The keyword-normalizing
seam is additive — it runs in the importer's input stage and emits the SAME canonical
`CapabilityPublicationImport`/contract documents the kernel already consumes.

### 4.1 Admission profiles (schema/contract depth)

| profile | schema depth required at admission | credential | target class | reference |
|---|---|---|---|---|
| `reference` | auto-derived: input/output schemas inline, evidence pointer = first guaranteed output field | none | keyless GET (Frankfurter, Open-Meteo…); free/fair-use | Bazaar advisory metadata; OpenAPI-gen normalizer |
| `credential` | full canonical contract + data-use disclosure + spend ceiling | binding-injected `env:*` (never a query/input property) | keyed/paid (Exa, Tavily, CoinGecko…) | current AE strict gate (keep, but now reachable) |
| `observed` | declarative only; schema optional; not executable | n/a | agentic.market/Bazaar x402 or external listings | Bazaar `not_available_yet`; observed tier (already ported) |

Determinism is preserved per tier: `reference` and `credential` admit through the full
`defineCapabilityContract` path; `observed` admits as discoverable-and-inert with no contract
depth and can be promoted to `reference`/`credential` only via verified readiness/execution
evidence (proof-of-first-execution), matching Bazaar's first-settle trigger.

### 4.2 Adapter-normalizer (the flexibility mechanism)

Add a deterministic `admitProviderSchema(spec, profile)` step inside the `openapi_http` importer
input stage (and analogously for `mcp`), before `normalizedFromSchemas`. It applies the
OpenAPI-Generator/Apicurio-style transformations by **rule**:

1. **Inline `$ref`/`allOf`/`oneOf`** — walk and substitute to a self-contained schema (mirror
   `references=DEREFERENCE`); keep the bounded, `additionalProperties:false` canonical output
   shape only where AE genuinely needs it.
2. **Extract credentials from security schemes** → set `credentialRef` on the binding; strip
   query/header `api_key`/`appid` params from the input schema so they are never dynamic inputs
   (this is the concrete `capability_input_disclosure_undeclared` fix, enforced by rule).
3. **Auto-derive `dataUse`** for inputs from a placement rule (public/constraint/request by
   pointer role) instead of hand-authored declarations — closing the Tavily/CoinGecko disclosure gap.
4. **Map the first guaranteed output field** to canonical completion evidence; restructure
   dynamic-keyed outputs deterministically (e.g. wrap in a required key) instead of a root `'/'` bounce.
5. **Actionable refusal** — anything that truly cannot normalize returns a *named, per-rule*
   reason (not blanket `schema_profile_unsupported`) so a human/agent can fix precisely, or the
   curator can file it to the `observed` tier.

### 4.3 Lifecycle reuse

The existing lifecycle reasons already cover credential/health readiness; the only addition is
that `observed`-profile publications enter the lifecycle already `inactive` with
`admission_unproven` (discoverable, never executable) and only promote when a verified
readiness/conformance/execution path exists. No new state machine — reuse `lifecycle.ts`.

## 5. Blast radius (respect it)

- **In scope (additive seam):** `internal/publication-importers.ts` (normalize/normalizer),
  `capability-contract/public.ts` (only if a new schema-type/rule is needed — preferred to keep
  untouched), new `admitProviderSchema` module, and the admission command's profile plumbing.
- **Untouched:** compiler/authority/replay/digest, engine discovery/selection (`discover.ts`),
  router/compiler, RouteMandate/money/x402, transports, and the seed's Exa-required mapping check.
- **Invariants preserved (RULES.MD + repo memory):** never shrink models/bindings/registry
  digest; deterministic authority precedes effects; fixtures are never live proof; credentials
  injected via binding, never schema.

## 6. Migration path (lean rule #3: layer, don't rewrite)

1. Land the `admitProviderSchema` normalizer behind the existing importers (no behavior change
   for already-conformant providers; it only *accepts more*). Keep all current normalization
   passing.
2. Add the `profile` field to admission without changing existing `reference`-style ports.
3. Re-run the curated seed through the new normalizer; the 4 keyed providers should now admit
   with zero hand-authored disclosure/pointer fixes.
4. Port the remaining observed tier; verify live discovery sees them as inert candidates.
5. Add tests per tier asserting (a) keyless auto-admission, (b) keyed auto-extraction of
   security-scheme credentials, (c) `$ref` inlining, (d) `observed` inert non-executable, and
   (e) named actionable refusals for truly unsupported constructs.

## 8. agentic.market reverse-engineering (2026-08-05; 2,020-service catalog)

Field dissection (report: src `agentic.market/llms.txt`, `/validate`, `/about`, `/robots.txt`, `/sitemap.xml`,
`api.agentic.market/v1/services`, `docs.cdp.coinbase.com/x402/{validate-endpoint,bazaar}.md`,
`x402-foundation/x402` `extensions/bazaar.mdx`, `schemes/{exact,upto}.mdx`).

**Verdict:** a buyer-facing directory over a permissive auto-indexed-on-first-settle catalog (CDP Bazaar) plus a
small operator-curated tier. NO self-service provider submit API and no AE-side registration surface; the only
seller surface is a read-only pre-flight `/validate` tool + a code-generating wizard (neither registers).

### 8.1 Provenance tri-state (corrects the earlier binary assumption)
`/v1/services` reveals a real three-way provenance flag on every service:
- `integrationType:'1P'` (45 records) — curated AND direct with the provider's own x402 endpoint (Exa, CoinGecko, CoinMarketCap, Tavily, The Graph, Alchemy, QuickNode).
- `integrationType:'3P'` (29 records) — curated but surfaced via a third-party gateway (Claude via Venice/Bankr, Tripadvisor via Paysponge, StableEmail via MeritSystems).
- absent (1,946 records) — auto-indexed/observed; no curation bump.

This maps almost 1:1 to AE's admission profiles: **1P ≈ `reference`/`credential` (direct, curated), 3P ≈ `credential` via a gateway binding (the normalizer's security-scheme binding-injection target), absent ≈ `observed` (inert until proven).** Adopt the tri-state as AE's provenance flag; it is not a binary 1P.

### 8.2 How a real listing enters (two gates, not one)
1. **Auto-index-on-first-settle (CDP):** provider points an x402 endpoint at the CDP Facilitator with a `bazaar` extension (`declareDiscoveryExtension` with input/inputSchema/output), then ONE successful `settle` (with `paymentPayload.resource` set) triggers indexing; `verify` alone does not. Idle >30 days drops out; curated endpoints health-probed (~99% availability).
2. **Operator curation (Coinbase):** a separate partner-admission + health bar promotes ~74 entries to `1P`/`3P` with provider/icon enrichment.
Also confirmed: `POST /v1/publish|/v1/submit|/v1/providers|/v1/endpoints` are 404 — there is genuinely no write/submit API. `/v1/services?category|network|integrationType=` params are accepted but ignored (discovery is only real via `/v1/services/search?q=`).

### 8.3 What AE adopts vs rejects
REJECT: (1) catalog-prose/shallow-`parameters[]`-as-contract admission — the public feed has ZERO full inputSchema/output/exponent across all 2,020 records; (2) 402-settle as invocation/payment authority; URL+method+price as the only operation identity (lossy domain slug + CDP route consolidation); (3) `/v1/services` filter params as a discovery contract (ignored).
ADOPT: (1) provenance tri-state (1P/3P/observed → reference/credential/observed); (2) **first-execution-proof promotes observed → real tier**, mirroring CDP first-settle + 30-day recency + liveness, reusing `lifecycle.ts` (`inactive/active/withdrawn` + `admission_unproven`) — do not rebuild; (3) 1P vs 3P vs observed provenance flag on the publication import; (4) **pre-flight validate endpoint** (CDP `POST /v2/x402/validate` model: read-only, no payment, no index, returns 'would it be accepted') as the self-serving admission check that complements the deterministic normalizer's named refusals — the usability half; (5) health/recency demotion on active capabilities; (6) semantic+full-text hybrid + quality ranking as a SELECTION signal only (never admission authority); (7) sub-cent pricing with EXPLICIT `scheme` (exact/upto/batch-settlement) + atomic/exponent semantics pinned to AE-owned asset metadata — reject a bare decimal string with no exponent.

### 8.4 Pricing/exponent mechanics (for the credential tier)
Protocol `accepts[].amount` is ATOMIC units (USDC 6 decimals, e.g. `100000 // $0.10`); `scheme ∈ {exact, upto, batch-settlement}`; `exact` = buyer authorizes fixed amount; `upto` = buyer signs max, server settles actual via `setSettlementOverrides(res,{amount})` (LLM tokens/bandwidth/compute). AE must carry this scheme + exponent explicitly in the money/asset metadata (a fix already flagged for sub-cent prices), not flatten to decimal strings.


## 9. Admission-normalizer: reuse-vs-handroll decision (recorded 2026-08-05)

Lean rule #6 says check existing dependencies before writing from scratch. Applied to the Layer-1
`admitProviderSchema` normalizer (`src/modules/capability-supply/internal/admit-provider-schema.ts`, ~405 lines):

**Candidate library:** `@apidevtools/json-schema-ref-parser` (v15.4.0) is present in `node_modules` as a
TRANSITIVE dependency (not a declared AE dep), ESM-only (`type: module`), depends on `js-yaml`.

**Verdict: keep the hand-rolled normalizer. Recorded reason (the library does not do AE's job):**
1. The library only resolves `$ref`. It provides NONE of AE's canonical admission logic — canonical
   completion-evidence output-pointer planning, dynamic-keyed output wrapping, input `additionalProperties`
   closure, security-scheme credential extraction + API-key-param stripping, dataUse/annotation derivation,
   depth-cap + circular + named-refusal taxonomy, or deterministic byte-identity. ~80% of the 405 lines are
   AE-specific; the library only overlaps the small `$ref` inlining step.
2. Adoption would swap ~60 lines of inliner for: a declared-dependency addition, an adapter call, an
   unverified Convex-bundle-safety risk (this repo already hit `node:`-builtin Convex esbuild refusals), and
   ESM/CJS + browser-editor resolution friction observed in testing — a net-loss trade.
3. The hand-rolled inliner is deterministic, depth-capped, byte-identity-tested, and named-refusal on
   circular/unresolvable — properties a general dereferencer does not guarantee.

**This is a judgment call, not a reimplementation of an existing capability.** It does NOT claim the
normalizer is small or trivial — it is AE-domain canonicalization that no off-the-shelf dereferencer provides.
If a future library genuinely covers the full canonical admission surface AND bundles edge-safe, revisit;
until then the hand-rolled normalizer is the minimal correct implementation for AE's determinism contract.

**Follow-up audit of internal duplication (2026-08-05, same session):** checked whether the normalizer
re-implements an EXISTING AE helper rather than just an external lib.
- `resolvePointedSchema` (capability-contract/public.ts:1147, exported) resolved a JSON pointer AND eagerly
  normalizes the pointed schema (recursive `$ref` resolution via `normalizePointedSchema`). The normalizer's
  private `resolveDocumentPointer` is a bare, purpose-fit pointer-segment lookup that feeds the normalizer's
  OWN depth-capped/circular-stack/sibling-merge recursion — it does NOT eagerly normalize. They are not
  drop-in substitutes; using `resolvePointedSchema` would double-inline and defeat the depth-cap/stack/refusal
  taxonomy. So this is NOT a duplicated internal capability; the two serve different roles.
- No other exported schema-walk/inline helper overlaps the normalizer's job. `pointerSyntaxIsCanonical`
  validates pointer syntax only.
**Net verdict:** the hand-rolled normalizer is AE-domain canonicalization with no existing lib or internal
helper that covers it. The §9 decision stands; no de-handrolling of the normalizer is warranted.
