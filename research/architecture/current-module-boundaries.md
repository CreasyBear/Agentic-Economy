# Current module boundaries

**Evidence date:** 2026-08-25  
**Checkout:** `8c38b57b2`  
**Authority:** `PRODUCT.md`, the current source and tests, recent Git history, and `research/WHOP-AE-MATURITY.md`.

This is a source-boundary report, not a product redesign. It preserves the current Operation-market loop and externally observable behaviour. It does not propose new endpoints, data models, packages, or product spines.

## Method and scope

The inventory traversed every `.ts` and `.tsx` file below `src/modules`: **22 top-level modules and 357 files**. A TypeScript-AST pass resolved every static `@/modules/<module>/...` import/export, constructed the module adjacency graph, found strongly connected components, and checked cross-module `/internal/` imports. Routes, `src/lib`, Convex hosts, components, and the CLI were inspected as composition/consumer surfaces rather than counted as domain modules. Import-boundary tests and the last 30 source-touching commits were also reviewed.

“Public surface” below means the source surface other modules or hosts currently consume. `public.ts` is the general convention; `server.ts` and `convex.ts` are environment-specific seams; `*.functions.ts` and `*.actions.ts` are server/action adapters. Where no barrel exists, current direct imports make the named top-level file a de facto surface even if that is structurally weak.

## Module inventory

| Module (TS files) | Current responsibility | Current module imports | Public or host surface actually in use |
|---|---|---|---|
| `action-invocation` (42) | Low-level durable call control: claim, lease/fence, attempt transitions, mandate checks, reconciliation, literal result identity. | `capability-contract`, `capability-supply`, `common`, `money` | `index.ts` is the broad runtime/development barrel; `public.ts` is the Convex-value seam; several execution files directly import `contracts.ts`, `application-service.ts`, and dynamic-published files. |
| `actions` (3) | Central machine-action registry and strict tool-schema projection shared by HTTP/MCP/CLI/chat. | `capability-execution`, `capability-supply`, `common`, `registry` | `index.ts` (`listActions`, `findAction`, MCP and route descriptors); `tool-contract.ts` and `strict-schema.ts` are re-exported there. |
| `agent-access` (15) | Caller principal, access grant/key/OAuth policy, delegated budget/rate policy, and operator view. | `capability-contract`, `capability-supply`, `common`, `money` | `public.ts` exposes Convex values/tables; `agent-access.ts`, `policy.ts`, `oauth-state.ts`, `service-auth-envelope.ts`, `*.functions.ts`, and console/view-model files are de facto direct seams. |
| `business` (4) | Supplier identity/context, public status, trust tier, ownership and source records. | `common` | `public.ts`; Convex schema is composed through `internal/schema.ts`. |
| `capability-contract` (5) | Neutral bounded JSON/schema grammar and decision/preparation model. It deliberately owns no provider, route, or Operation lifecycle. | `common` | `public.ts`. |
| `capability-contract-registry` (2) | Durable encode/decode and Convex storage shape for exact neutral contracts. | `capability-contract`, `common` | `public.ts`; Convex schema composition through `internal/convex-schema.ts`. |
| `capability-execution` (28) | Operation call admission, keyless execution, paid invoke worker, receipt/status/cancel/reconcile, approval and server adapters. | `action-invocation`, `agent-access`, `capability-contract`, `capability-supply`, `common`, `money`, `network-guard` | `index.ts` for eligible keyless execute; `convex.ts`; `operation-invoke-entry.ts`; `operation-*.actions.ts`; `operation-*.functions.ts`; recovery and approval functions. No current `public.ts`. |
| `capability-supply` (122) | Supplier publication/admission, exact Operation projection/search/compare/inspect, readiness, route transport, provider connection, external-supply qualification and liquidity evidence. | `action-invocation`, `actions`, `agent-access`, `capability-contract`, `capability-contract-registry`, `capability-execution`, `catalog`, `common`, `money`, `network-guard`, `registry`, `security` | `public.ts` is the large general seam; `server.ts` isolates Node/transport work; `convex.ts`; `operation-source.ts`, `operation-schemas.ts`, `route-transport-runtime.ts`, `supply-actions.ts`, `supplied-quote.actions.ts`, and `supply-funnel.functions.ts` are de facto secondary seams. |
| `catalog` (12) | Supplier business/offering publication, price/access-path projection, owner status, and public business-page read model. | `business`, `common`, `discovery`, `money`, `registry`, `seo` | `public.ts`, `convex.ts`, `schema-values.ts`, `owner-status.functions.ts`, `public-route.functions.ts`. |
| `chat` (2) | Durable chat-thread schema and share-token validation only; chat orchestration is outside this module. | `common` | No general barrel. `share-token.ts` is the direct seam; Convex composes `internal/convex-schema.ts`. |
| `common` (22) | Cross-cutting identifiers, hashing/canonicalisation, bounded helpers, audit/action contracts, text/slug/JSON primitives. | `agent-access`, `capability-contract`, `capability-execution`, `capability-supply`, `security` | No barrel; each top-level helper is imported directly. `action.ts` is a high-level action contract despite living in `common`. |
| `dev` (3) | Development-only empty/fixture catalogue seed assembly. | `business`, `catalog`, `common`, `registry` | `public.ts`. |
| `discovery` (17) | Agent discovery documents (`SKILL.md`, `llms.txt`, manifests, sitemap/robots), route examples and developer support projection. | `actions`, `agent-access`, `business`, `capability-contract`, `capability-execution`, `catalog`, `common`, `money`, `observability`, `registry` | `public.ts`, `convex.ts`, `discovery.functions.ts`, plus `developer-discovery.ts` re-exported by `public.ts`. |
| `market` (11) | Website market/home projections, external-registry metadata ingestion, market metrics/listing evidence, and the explicit registry-to-admission probe. | `capability-contract`, `capability-supply`, `common`, `money` | `market.functions.ts` and `server.ts`; UI currently deep-imports `home-catalogue.ts` and `operation-view-model.ts`. No `public.ts`. |
| `model-gateway` (1) | OpenRouter model configuration, construction and cost calculation. | none | `public.ts`. |
| `money` (23) | Exact amounts, pricing, ledger/charge/top-up/delivery, provider accrual/payout, Stripe adapters and reconciliation. | `capability-supply`, `common`, `security` | `public.ts` for domain/ledger contracts; `server.ts` for provider HTTP/server work. |
| `network-guard` (2) | SSRF-safe public-address resolution and guarded HTTP. | none | `public.ts` for DNS/lookup policy; `server.ts` for guarded requests. |
| `observability` (9) | Audit events, operation keys, invalidation, redaction and product-funnel event contracts/readbacks. | `business`, `common` | `public.ts`; `funnel.functions.ts`; Convex schema via `internal/schema.ts`. |
| `registry` (18) | Canonical public catalogue read/search/detail projections, Operation market action contracts/paths, and retained business/services API projections. | `business`, `capability-contract`, `capability-supply`, `catalog`, `common`, `money`, `observability` | `public.ts`; `operation-entry.ts`; `operation-paths.ts`; `operations.actions.ts`; `registry.actions.ts`; `registry.functions.ts`; detail-route functions. |
| `security` (10) | Admin authority, CSRF, audit readbacks, removal disputes, and signed source-write admission. | `business`, `capability-contract`, `common`, `registry` | `public.ts`; `source-write-admission.ts`; admin/removal `*.functions.ts`. |
| `seo` (4) | Public supplier-page SEO and JSON-LD projection. | `business`, `common`, `registry` | `public.ts`; `public-route.ts` is also directly consumed. |
| `storefront` (2) | Web-search-backed discovery of real published businesses, isolated behind a model gateway. | `common`, `model-gateway` | `public.ts`. |

The 22 rows above are exhaustive for `src/modules`. Folder size is not a package boundary: `capability-supply` is the largest module, but it has no independent build/release lifecycle or independent consumer. The only independently distributed consumer today is `packages/cli`, whose `package.json` publishes the `ae` binary. No additional workspace package is justified by this inventory alone.

## Public surfaces

The current public-surface conventions are plural rather than uniform:

| Surface kind | Meaning | Examples |
|---|---|---|
| General domain seam | Runtime-safe values, types and pure/domain functions | `business/public.ts`, `capability-contract/public.ts`, `capability-supply/public.ts`, `catalog/public.ts`, `money/public.ts`, `registry/public.ts` |
| Convex seam | Validators/schema fragments safe for Convex hosts | `capability-execution/convex.ts`, `capability-supply/convex.ts`, `catalog/convex.ts`, `discovery/convex.ts` |
| Server seam | Node-only credentials, HTTP/provider and source adapters | `capability-supply/server.ts`, `market/server.ts`, `money/server.ts`, `network-guard/server.ts` |
| Action seam | One action contract projected to machine surfaces | `actions/index.ts`, `registry/operations.actions.ts`, `capability-execution/operation-invoke.actions.ts`, `capability-supply/supply-actions.ts` |
| Server-function seam | Authenticated route/Convex bridge rather than general domain API | `*.functions.ts` across access, execution, supply, catalogue, discovery, money, observability, registry and security |
| Compatibility projection | Existing business/services shapes kept separate from canonical Operation truth | `registry/internal/offering-api-projection.ts`, `registry/internal/services-api-projection.ts`, exported through `registry/public.ts` and actions |

**Finding F1 — the canonical machine surface has a clear public composition point (confidence: 10/10).** `src/modules/actions/index.ts:1-11` says:

> “Registered actions are explicit public machine-operation contracts… To add an action-backed surface: create `<module>/<module>.actions.ts` … Do not rely on module-eval side effects.”

The registry is explicit at `src/modules/actions/index.ts:39-54`, and Operation market discovery is a single four-entry list at `src/modules/registry/operation-entry.ts:54-59`:

```ts
export const OPERATION_MARKET_ACTION_ENTRIES = Object.freeze([
  operationMarketActionEntry('search', ...),
  operationMarketActionEntry('detail', ...),
  operationMarketActionEntry('compare', ...),
  operationMarketActionEntry('inspect_plan', ...),
])
```

That composition point should remain the public parity authority for search, detail, compare, inspect-plan and the controlled call/recovery actions.

**Finding F2 — `public.ts` does not currently mean one stable boundary (confidence: 9/10).** The import guard’s stated policy is “Routes and sibling modules must use module public seams” (`src/lib/ui/contract-scans.ts:87-92`), but its pattern only rejects a path containing `/internal/` (`src/lib/ui/contract-scans.ts:93-94`). Current source therefore legitimately passes while importing top-level implementations such as:

```ts
// src/modules/capability-execution/operation-invoke.ts:14-22
import type { ActionInvocationView, InvocationActor }
  from '@/modules/action-invocation/contracts'
import type { DynamicPublishedInvocationResult }
  from '@/modules/action-invocation/dynamic-published-contract'
import { createInvocationApplication }
  from '@/modules/action-invocation/application-service'
```

This is not an `/internal/` violation, but it is a deep-import bypass of both `action-invocation/public.ts` (which only exposes Convex values) and its broad `index.ts` barrel. The supported seam is consequently encoded by convention and current consumers, not enforced architecture.

## Dependency direction

The product-shaped direction should be:

1. routes/MCP/CLI/chat adapt into the central action and server-function seams;
2. registry/market project canonical Operation discovery and supplier facts;
3. capability-execution owns controlled call, result, receipt and recovery orchestration;
4. capability-supply owns supplier publication, Operation truth/readiness and provider transport capability;
5. action-invocation and money provide narrow lifecycle/economic kernels;
6. capability-contract, business, security, observability, network-guard and focused common helpers remain lower-level policies/primitives.

The current graph does not enforce that direction. Sixteen of the 22 modules are in one strongly connected component:

`action-invocation`, `actions`, `agent-access`, `business`, `capability-contract`, `capability-contract-registry`, `capability-execution`, `capability-supply`, `catalog`, `common`, `discovery`, `money`, `observability`, `registry`, `security`, `seo`.

The acyclic islands are `chat`, `dev`, `market`, `model-gateway`, `network-guard`, and `storefront` (although several depend into the large component).

### Cycles

**Finding F3 — the main cycle is architectural, not an analysis false positive (confidence: 10/10).** Three direct two-way pairs are enough to prove it:

- `common -> capability-execution`: `src/modules/common/action.ts:3-6` imports `OperationInvokeService`, `SupplyManagementService`, access and security types. `capability-execution -> common`: `src/modules/capability-execution/operation-invoke.ts:7-8` imports canonical hashing.
- `capability-supply -> capability-execution`: `src/modules/capability-supply/internal/operation-project.ts:15-16` imports registry navigation and `OPERATION_INVOKE_ROUTE_CONTRACT`. `capability-execution -> capability-supply`: `src/modules/capability-execution/invocation-worker/runPreparation.ts:12-27` imports supply server/public seams.
- `catalog -> registry`: `src/modules/catalog/public.ts:7-8` imports the registry API projector/DTO. `registry -> catalog`: `src/modules/registry/internal/offering-api-projection.ts:1-7` imports catalogue validation and types.

The most load-bearing quote is `src/modules/common/action.ts:3-8`:

```ts
import type { SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import type { OperationInvokeService } from '@/modules/capability-execution/operation-invoke'
import type { SupplyManagementService } from '@/modules/capability-supply/supply-actions'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { JsonValue } from '@/modules/capability-contract/public'
```

A file called `common/action.ts` is therefore not lower-level common code; it is a cross-product integration contract. Moving its concrete service/principal aliases outward to `actions` (or making its context structurally generic) breaks several upward edges without changing an action ID, schema, route, result, or receipt.

**Finding F4 — two API projection cycles can be removed by assigning projection ownership, without merging modules (confidence: 9/10).** `catalog/public.ts:7-8` calls into `registry/public.ts`, while `registry/internal/offering-api-projection.ts:1-7` calls back into catalogue validation. The quote at `catalog/public.ts:154-165` shows the boundary crossing happens only after the catalogue has already built its supply projection:

```ts
const projection = buildOfferingSupplyProjection({ ... })
return projection === undefined
  ? { kind: 'hidden', reason: 'not_published' }
  : { kind: 'available', catalog: projectBusinessSupplyToPublicApi(projection) }
```

Keep catalogue ownership of supplier/offering state and registry ownership of wire/API DTO projection; compose them in registry/server adapters. Do not consolidate the modules or change the DTO.

### Boundary bypasses

There are **no cross-module `/internal/` imports in current runtime source**; the clean-runtime guard covers `src` and `convex`, and `tests/imports/private-imports.test.ts:6-18` expects zero violations. Convex schema composition and a module’s own `public.ts`/`convex.ts` re-exports are the two documented exceptions at `src/lib/ui/contract-scans.ts:352-383`.

There are nevertheless two forms of boundary bypass:

1. **Unenforced top-level deep imports.** F2’s execution-to-action-invocation imports, `src/modules/money/internal/payout-http-runtime.ts:13` importing `capability-supply/supply-funnel.functions`, and `src/modules/capability-supply/internal/operation-project.ts:15-16` importing registry/execution entry files all bypass a single named general seam. Some are intentional environment/action seams; the architecture has no machine-readable allow-list distinguishing them from accidental exposure.
2. **Test-only private coupling.** Tests directly import module internals—for example `tests/integration/capability-operation-workpool.test.ts:29` imports `internal/graph/qualify-candidate`, and `tests/unit/action-invocation/operation-public.test.ts:13` imports `internal/durable-contracts`. These do not contaminate production, but they make internal moves expensive unless tests are explicitly classified as white-box tests.

**Finding F5 — the boundary guard proves privacy only for folders literally named `internal` (confidence: 9/10).** Its exact matcher is:

```ts
// src/lib/ui/contract-scans.ts:93-94
/from\s+['"][^'"]*(?:@\/|~\/|src\/)?modules\/[^'"]+\/internal\/[^'"]+['"]/,
```

Strengthen the guard around an explicit allowed entry-surface manifest (`public`, `server`, `convex`, registered action/function seams, and named exceptional contracts). That is a structural test change, not an endpoint or data-model change. Preserve the current allowed imports until each cycle is moved, so observable behaviour stays fixed.

## Compatibility versus retired concepts

### Retained compatibility obligations

- Existing `/api/businesses*` and `/api/v1/services*` responses are compatibility projections over supplier business/offering data, not alternate canonical market units. `src/modules/registry/internal/services-api-projection.ts:55-59` explicitly says it is “a thin view over the public business catalog, not an Agent Service or an execution authority.” Keep the wire shapes/action IDs until deliberately versioned; prevent them from becoming new domain authority.
- The home query accepts `project` for old shared URLs only. `src/modules/market/home-catalogue.ts:26-30` is explicit: “Home never reads WorkTree. `project` remains accepted for old shared URLs.” Keep acceptance behaviour while ensuring it never recreates project ownership.
- “Invocation” remains a valid lifecycle term in the active charter (one invocation is one use of an Operation) and in existing receipt/status paths. Preserve stable call identity, status, idempotency and reconciliation behaviour. Do not elevate invocation machinery into a broader product spine.
- Supplier/business/offering/service names remain legitimate inside supplier catalogue records and compatibility DTOs. New market-facing architecture should lead with supplier and Operation, while adapters retain their published field names.

### Retired product concepts

Orders, Customer Requests, WorkTrees, a general Agent Engine, answer/harness ownership, and general project orchestration are not current modules or product capabilities. They must not be restored. The current conformance test declares this boundary: `tests/imports/operation-product-legacy-independence.test.ts:14-29` rejects `answer`, `answer-thread`, `external-run`, and `harness` imports from CLI, MCP, and Operation HTTP entrypoints.

**Finding F6 — remaining retired nouns are migration residue inside retained kernels, not architectural authorities (confidence: 9/10).** `src/modules/action-invocation/index.ts:44-56` still exports `CustomerRequestCanonicalClaimMaterial`, while `src/modules/action-invocation/development-host-read.ts:10` still names `request_owned_human`. In contrast, the live Operation entrypoints are explicitly tested independent of the removed legacy modules:

```ts
// tests/imports/operation-product-legacy-independence.test.ts:27-29
expect(operationProductEntrypoints.filter((path) => (
  legacyModuleImport.test(readFileSync(path, 'utf8'))
))).toEqual([])
```

When structural moves touch those internal types, rename them around caller/call/authority semantics and retain serialized values only where tests or external receipts prove compatibility. Do not recreate the retired concepts to justify the names.

Verification caveat: a clean-checkout targeted run of the privacy, route, legacy-independence and Operation-surface tests passed three files but the legacy-independence file stopped before its assertion with `ENOENT: packages/cli/dist/ae.js` at line 28. The test hard-codes that generated artifact at lines 5-12. The source entrypoints were inspected directly and contain no forbidden legacy import, but the test is not self-sufficient until the CLI build runs. Fix the test/build ordering when boundary enforcement is changed; do not weaken the forbidden-module assertion.

## Golden journey impact

| Golden-journey segment | Boundary support | Current structural risk | Safe boundary action |
|---|---|---|---|
| Capability gap -> search | `registry/operation-entry.ts` defines the four canonical market reads; `actions/index.ts` fans them to machine surfaces. | Discovery, registry, catalogue and common sit in the 16-module cycle, so a presentation/projection move can reach execution/security types. | Keep action IDs/schemas fixed; make registry the owner of Operation wire projection and inject catalogue reads. |
| Compare -> inspect exact terms/readiness | `capability-supply/public.ts` owns Operation descriptors, comparison, readiness and evidence. | The 122-file module exposes a very broad barrel and imports execution route contracts, making supply truth depend on the caller transport. | Keep one module/package; narrow its public facets and inject call navigation from the composition layer. |
| Controlled call | `capability-execution` owns call admission/worker/recovery; `action-invocation` owns durable low-level lifecycle. | Mutual supply/execution imports and direct action-invocation implementation imports blur which layer controls the call. | Execution orchestrates; supply supplies immutable current Operation/route facts; action-invocation exposes narrow lifecycle ports. Preserve refusal codes, idempotency and uncertain-effect behaviour. |
| Usable result -> receipt/status/recovery | Recovery actions/functions and action-invocation durable projections already preserve result identity and uncertainty. | Broad `action-invocation/index.ts` exports development helpers, paid-operation presentation and historical names beside runtime primitives. | Define a narrow runtime seam for execution and keep development/test helpers off it; no wire change. |
| Supplier publication -> routeable market | Supply owns admission/readiness; market’s registry-graduation probe is explicit. | `market` lacks a public seam and UI imports its implementation/view files directly; external registry language can look canonical. | Add a clear market public/view seam and keep registry graduation as an explicit admission call into supply. |
| Settlement and supplier earnings | `money` owns exact ledger/charge/payout; supply owner surfaces read earnings. | `money/internal/payout-http-runtime.ts:13` imports a supply server-function DTO, reversing the economic dependency. | Move the joined owner readback to a server composition adapter; money returns money facts, supply returns supplier facts. |

**Finding F7 — external registry metadata is correctly separated from canonical Operations, but the boundary is procedural (confidence: 9/10).** `src/modules/market/registry-graduation.ts:56-76` refuses anything without a valid HTTP 402 document and calls `admitRegistryPaymentRequiredItem` before returning `kind: "admitted"`:

```ts
if (response.status !== 402) return refused(candidate, "payment_required_missing")
...
const admission = await admitRegistryPaymentRequiredItem(paymentRequired)
const draft = admission.admitted[0]
if (draft === undefined || admission.admitted.length !== 1) {
  return refused(candidate, "admission_refused")
}
```

Preserve this explicit graduation dependency. External registry adapters may populate awareness/listing evidence, but only capability-supply admission/publication may create canonical callable Operation truth.

**Finding F8 — the proposed boundary cleanup targets the current weak layer above a mature transaction kernel (confidence: 9/10).** `research/WHOP-AE-MATURITY.md` concludes that the repository has a “mature Operation transaction kernel wrapped around an early, still falsifiable market hypothesis.” The source matches that assessment: `src/modules/actions/index.ts:42-50` registers the four market reads followed by execute, invoke, status, cancel and reconcile as one explicit surface:

```ts
registryOperationsSearchAction,
registryOperationsDetailAction,
registryOperationsCompareAction,
registryOperationsInspectPlanAction,
operationExecuteAction,
operationInvokeAction,
operationStatusAction,
operationCancelAction,
operationReconcileAction,
```

Search/projection/action composition is entangled with the transaction modules even though this external list is clear. The priority is therefore to make the existing golden journey easier to change and prove—not to add Orders, Customer Requests, WorkTrees, an Agent Engine, or speculative packages.

## Recommended dependency contract

Apply these as behaviour-preserving structural moves, in order; each step should keep current source and conformance tests green before the next:

1. **Make action contracts dependency-neutral.** Remove concrete execution/supply/access/security imports from `common/action.ts`; let `actions` compose those concrete services. This shrinks the largest SCC without changing registered actions.
2. **Make registry own wire projection.** Catalogue returns supplier/offering domain projection; registry turns it into public business/services/Operation DTOs. Remove the catalogue-to-registry edge, not either module.
3. **Invert supply-to-execution navigation.** Supply projects exact Operation/readiness facts; registry/actions inject the call/status navigation descriptor. Execution may read the supply seam, but supply must not import execution.
4. **Narrow execution’s invocation dependency.** Add a deliberately small runtime lifecycle seam in `action-invocation` for claim/fence/result/reconcile ports. Keep development helpers and compatibility aliases off that seam.
5. **Move joined owner readbacks to adapters.** Money must not import supply UI/server-function DTOs. A route/server composition adapter can join supplier and earnings facts while preserving the response.
6. **Declare allowed source surfaces.** Upgrade the import test from “not `/internal/`” to an explicit per-module surface allow-list. Initially encode every intentional existing `public`, `server`, `convex`, action, function and exceptional contract seam; tighten it as moves land.
7. **Do not create packages for large folders.** Keep these as source modules unless an independent consumer or independent build/release lifecycle appears. The current CLI package is the only demonstrated case.

These moves preserve the single product loop: capability gap -> Operation search/compare/inspect -> controlled call -> literal result or durable receipt -> caller continues in its own harness.
