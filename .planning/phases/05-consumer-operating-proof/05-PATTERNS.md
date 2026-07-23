# Phase 05: Consumer Decision Support - Pattern Map

**Mapped:** 2026-07-23
**Observed tree:** `1bbc52a4dd1133526285af87fc9143547a3a2581` plus shared dirty Offering predecessor WIP
**Decision supported:** how to deliver public inspect-only Offering comparison without importing execution, inventing historical publication truth, or claiming human/agent parity across the present v1/v2 split
**Files classified:** 36 anticipated source, route, projection, test, and evidence files/groups
**Analogs found:** 34 / 36; the two intentionally new semantics are closed category profiles and exact Offering public-history eligibility

## Gate 0: Pattern Use Is Conditional

The current Offering lane is not an integrated baseline. Its core contracts, projection, Convex bridge, components, and tests include untracked files, while schema, registry, generated, discovery, and public-route consumers are modified in the shared tree. Treat those files as predecessor WIP under parent custody, not as Phase 05-owned current capability.

Before implementation parcels are dispatched, the parent integrator must freeze one coherent Offering tree/revision, publish a literal file allowlist, integrate its generated/schema/route edges, and establish safe v2 readback. No child should recreate, partially absorb, or overwrite that lane. If this cannot be done, Phase 05 stops before comparison work.

The second hard gate is source truth: `businessOfferingRevisions` proves that a row existed, not that an exact revision was ever public or remains safe to show. Historical public eligibility must become a catalog-owned fact before a shared URL or route can resolve old revisions. A browser timestamp, snapshot, current DTO, or `legacy-offering:*` adapter identity cannot supply that fact.

The third gate is semantic parity: current HTTP and human routes read Offering v2, while `registry.list`, `registry.search`, and `registry.detail` still return service-shaped v1 through the old application functions. Fix that cutover as its own owned parcel before registering comparison and before claiming human/agent parity.

## File Classification and Pattern Assignments

| New/modified file | Owner | Role / data flow | Closest source analog | Reusable seam | Anti-pattern / integration risk | Match |
|---|---|---|---|---|---|---|
| `src/modules/catalog/internal/offering-supply.ts` | Catalog | model, immutable revision / transform | same file lines 29-150, 164-215 | Extend `BusinessOfferingRevisionRecord`; include the closed profile in projection only after lineage checks | Separate mutable profile table, property bag, or profile facts omitted from `sourceHash` | exact, predecessor WIP |
| `src/modules/catalog/internal/offering-source.ts` | Catalog | source service / CRUD | same file lines 32-54, 62-91, 94-121 | Validate profile inside `OfferingFactsInput`; hash it in create/revise and return discriminated ordinary errors | Renderer validation or a post-revision join that can change without a revision | exact, predecessor WIP |
| `src/modules/catalog/internal/schema.ts` | Catalog | Convex schema / CRUD | same file lines 40-83; `capability-supply/internal/convex-schema.ts:39-69` for immutable publication revisions | Keep profile validators and public-history table with catalog; exact compound indexes in field order | Inline root schema, `v.any()`, arbitrary JSON profile, or current-only snapshot as history | role/data-flow |
| `src/modules/catalog/public.ts` | Catalog | supported module interface / transform | `src/modules/registry/public.ts:29-41` | Export only intentional Offering/profile/history contracts; callers never import catalog `internal/*` | Exporting storage rows, hashes, private reasons, or one-off renderer helpers | role |
| `src/modules/catalog/internal/offering-public-history.ts` (or equivalent accepted catalog owner) | Catalog | model/service / event-history + exact read | `capability-supply/internal/convex-schema.ts:39-69`; `offering-supply.ts:164-215` | Exact tuple `(businessId, offeringRef, revision, sourceHash)`, `publishedAt`, optional withdrawal, safe-display disposition; ordinary unavailable result | Reading any immutable revision as public; silent current substitution; treating `projectionObservedAt` as content identity | partial; new semantic owner |
| `convex/catalog.ts` and/or phase-owned catalog command adapter | Catalog | persistence / CRUD-event | existing Offering write commands backed by `offering-source.ts`; fail-closed controls in `convex/catalogSupplyProjection.ts:12-18` | Record publication eligibility atomically with the source transition that makes the exact revision public | UI/registry writing history, or backfilling provenance without stable crosswalk/source hashes | role/data-flow |
| `convex/catalogSupplyProjection.ts` | Catalog projection | batch projection / file-like snapshot I/O | same file lines 12-40 | `buildBusinessSupplyProjection` remains owner; bounded indexed rows; snapshot is a removable projection | `.collect()` growth at lines 19-23; copying mutable truth; treating the one-current snapshot as history | exact, predecessor WIP |
| `src/modules/registry/internal/offering-api-projection.ts` | Registry | safe DTO projection / transform | same file lines 30-67, 91-140, 226-248 | Extend `PublicOfferingDto` with safe closed profile facts/provenance; continue having no destination for hashes, credentials, adapter config, internal reasons | Adapting v2 back into `services[]`; exposing reason codes/source hashes; durable use of `legacy-offering:*` from lines 179-200 | exact, predecessor WIP |
| `src/modules/registry/public.ts` | Registry | module interface / request-response | same file lines 29-41 | Export v2 DTOs and the v2 application interface; internal projection remains private | Both v1 and v2 presented as equally canonical after cutover | exact |
| `src/modules/registry/registry.functions.ts` | Registry | application source port / request-response | same file lines 33-68, 153-203 | Introduce one Offering-v2 list/search/detail application port used by HTTP and actions; preserve source fallback as an explicit migration concern | Current duplicate v1/v2 paths; action/HTTP divergence; fallback that resurrects legacy after Offering cutover | exact |
| `src/modules/registry/registry.actions.ts` | Registry | registered actions / request-response | same file lines 35-134, 194-286 | Preserve stable IDs where compatible; strict Zod input/output; `readOnly: true`; invocation contract `authorityRequirement: none`; run delegates to v2 application owner | Current v1 `services[]`, `trustTier`, casts, or action-only semantics; registration mistaken for reachable agent invocation | exact but must be cut over |
| `src/modules/actions/index.ts` | Shared action registry | config / event registration | same file lines 1-12, 39-69 | Explicit import and array registration after contracts/parity pass; uniqueness assertion | Module-eval registration or adding `comparison.compare` before an accepted machine invocation surface exists | exact |
| `convex/registry.ts` | Registry persistence | query / bounded request-response | lines 292-354, 636-679 | Exact validators; indexed exact-revision resolution; suppression before history read; parse stored snapshots through a strict codec | `returns: v.any()`; wide scan lines 324-332; `JSON.parse(...) as` lines 660-674; N+1/unbounded fan-out | exact with required hardening |
| `src/modules/registry/internal/offering-projection-codec.ts` (or equivalent) | Registry | codec / transform | `offering-api-projection.ts:91-140`; hostile fixture in `discovery-llms-offering-parity.test.ts:37-63` | One strict safe snapshot decoder before projection; refuse extra/private/mismatched fields | Cast-only parsing that can expose injected `credentialRef` or arbitrary keys | partial; no current strict analog |
| `src/modules/comparison/internal/contract.ts` | Comparison | model / transform | `offering-supply.ts:141-160`; `customer-option-set.ts:38-70` for discriminated outcome posture only | Versioned selection, fact/cell, priority, refusal, changed-revision, and ordering unions; max 4 selections and 3 priorities | Universal score, property bag, empty-string sentinel, thrown ordinary refusal | role/data-flow |
| `src/modules/comparison/internal/profiles/professional-service-v1.ts` | Comparison profile | model/validator / transform | closed access-path union in `offering-supply.ts:52-75`; strict action schemas in `registry.actions.ts:46-70` | Fixed field IDs, types, units/directions and labels; strict object; fact states share the common contract | Free-form category keys, display labels as semantic IDs, renderer-owned normalization | no exact analog; use union pattern |
| `src/modules/comparison/internal/profiles/machine-data-v1.ts` | Comparison profile | model/validator / transform | same as professional profile; machine access vocabulary in `offering-supply.ts:60-71` | Same host/profile interface and fact vocabulary; only closed fields differ | New route/workflow for machine offerings or treating similar labels as comparable | no exact analog; use union pattern |
| `src/modules/comparison/internal/resolve.ts` | Comparison | source service / bounded request-response | `registry.functions.ts:153-203`; `convex/registry.ts:636-679` | Resolve every tuple server-side through a supplied exact-public-revision port; verify business ownership, lineage, public history, current suppression, and newer public revision | Trusting URL eligibility, reading current DTO, automatic replacement, endpoint fetch/probe | role/data-flow |
| `src/modules/comparison/internal/compare.ts` | Comparison | pure service / transform | `customer-option-set.ts:38-107` as principle-only analog | Pure deterministic rows; default unranked; lexicographic stated priorities; missing/stale/not-comparable blocks total ordering; ties stay unranked | Importing Customer Request types, weighted/LLM score, favorable missing defaults, UI sort | exact role/data-flow; dependency forbidden |
| `src/modules/comparison/internal/projection.ts` | Comparison | safe DTO projection / transform | `offering-api-projection.ts:91-140`; `route-plan-customer-projection.ts:89-159` for frozen semantic result | One `offering-comparison:v1` semantic object consumed by human and agent surfaces; projection includes reasons and safe links, never recomputes meaning | Separate human and agent comparisons, renderer-derived currentness, internal literals in public copy | role/data-flow |
| `src/modules/comparison/comparison.actions.ts` | Comparison | registered action / request-response | `registry.actions.ts:194-286` | Strict selection/priority schemas; read-only action; no authority; replayable; delegates to the same application function as route | Generic tools runtime, execution surface, Customer Request creation, provider effect | exact role/data-flow |
| `src/modules/comparison/public.ts` | Comparison | module interface / request-response | `src/modules/registry/public.ts:29-41` | Small interface exporting semantic contracts/application function only | Routes importing `comparison/internal/*` or every helper becoming public | exact role |
| `src/routes/$slug.offerings.$offeringRef.tsx` | Public UI adapter | route / SSR request-response | `$slug.tsx:29-94,208-269` | File route, thin loader, canonical head, pending/error components, `AePublicShell`; loader receives exact source result | Import inquiry/admission machinery present in parent route; current-only lookup; business slug/ref mismatch leakage | exact role/data-flow |
| `src/routes/compare.tsx` | Public UI adapter | route / SSR request-response | `registry.tsx:46-90`; `$slug.tsx:29-94` | Zod-validated search state, `loaderDeps`, server authoritative resolution, `noindex,follow`, stable pending/error projections | Ad hoc base64/localStorage, free-text in URL, client comparator, loader crash on malformed/fifth item | exact role/data-flow |
| `src/routes/registry.tsx` | Public UI adapter | route/component / request-response | same file lines 46-180, 396-409, 443-565 | Keep bounded URL search and v2 loader; render Offering-aware browse and view links through a read-only composition | Current mutating demand capture lines 286-388 inside Phase 05 empty loop; client “Newest” ambiguity; business-level compare | exact, change required |
| `src/routes/$slug.tsx` | Public UI adapter | route/component / request-response | same file lines 38-64, 229-269 | Keep business context and Offering v2 read; isolate Phase 05 region and onward Offering links | Sharing callbacks/imports with inquiry admission at lines 15-20 and 54-57; nested route accidentally rendering parent action group | exact, integration risk |
| `src/routeTree.gen.ts` | Generated routing | config / request-response | repository TanStack generator output | Regenerate from frozen integrated source only; parent includes generated edge in custody allowlist | Manual edit or child-owned generation against an incoherent shared tree | exact generated pattern |
| `src/components/ae/offerings/offering-presentation.ts` | Offering UI projection | utility / transform | same file lines 14-61, 74-120 | Map source semantic object to customer language only; keep provenance and support distinct | `as never` identity casts, reconstructing missing fact semantics, presenting run/test/call actions | exact, predecessor WIP |
| `src/components/ae/offerings/AeOfferingSupplyList.tsx` | Offering UI projection | component / render | same file lines 28-69, 71-118 | Split reusable summary from detail; Astryx Card/Badge/Button/Text; explicit revision/observed/missing states; view and selection controls | Current omitted optional fields at lines 83-87; “Ways to get started” execution adjacency; all-in-one card | exact, refactor required |
| `src/components/ae/primitives/AeProviderCard.tsx` | Public browse projection | component / render | registry variant in same file; `registry.tsx:396-409` caller | Split/read-only registry composition showing business plus up to two Offerings and view actions | `tel:` action at line 167, contact-availability emphasis, adding more behavior to a generic primitive | role-match; split rather than deepen primitive |
| `src/components/ae/comparison/AeShortlistBar.tsx` | Comparison UI | component / URL events | `AeShortlistTerminal.tsx:75-115` for labelled region/control mechanics only | `aria-pressed`, bounded URL edit, focus retention/recovery, one polite live region, 44px controls | `AnswerSource`, contact ordering, call/copy-export analytics, local persistence, dropping oldest item | role-match only |
| `src/components/ae/comparison/AeOfferingDetail.tsx` | Comparison UI | component / render | `AeOfferingSupplyList.tsx:71-164`; `AePublicShell.tsx:80-99` | Thin Astryx composition over exact semantic object; native disclosure for technical facts | Parsing profile facts, invoking endpoint, route-local palette/primitives | role/data-flow |
| `src/components/ae/comparison/AeOfferingComparison.tsx` | Comparison UI | component / render | `AeGenerativeAnswer.tsx` `ProviderCompareTable` mechanics around lines 559+; Astryx patterns in Offering list | Native desktop table plus CSS-selected semantic `<dl>` mobile projection; exact same cells/order; source result owns rank | Reuse of `AnswerSource`/business rows/trust/contact ranking; div-grid ARIA recreation; JS viewport fork; client sorting | role/data-flow only |
| `tests/unit/comparison/{contract,profiles,resolve,compare}.test.ts` | Comparison | unit tests / transform + request-response | `offering-supply.test.ts:38-169`; `customer-option-set.ts` focused tests | Table-driven ordinary outcomes and hostile tuples; wrong business, never-public revision, suppression, stale/missing/blocking rank, tie | Happy-path snapshots only or tests against UI-owned logic | exact testing pattern |
| `tests/integration/registry-offering-parity.test.ts` | Registry | integration / request-response | `discovery-llms-offering-parity.test.ts:13-101`; `tests/unit/actions/registry.test.ts` | Seed exact source once; call HTTP/application/action surfaces; compare safe v2 Offering semantics; assert private/legacy exclusion | Treating descriptor registration as invocation parity or adapting action result back to v1 | exact |
| `tests/integration/comparison-surface-parity.test.ts` | Comparison | integration / request-response | discovery parity test plus Offering API projection test | Same fixture and priorities through human loader and action; deep-compare semantic object after transport-only fields | Separate fixtures/logic allowing false parity | role/data-flow |
| `tests/imports/comparison-boundaries.test.ts` | Comparison | architecture test / graph traversal | `action-invocation-host-boundaries.test.ts:17-53,55-94` | Recursively traverse imports from comparison/routes/components and forbid inquiry, demand, Customer Request, RoutePlan, Action Invocation, mandate, booking, payment, provider transport/effects | One-file regex that misses aliased/transitive imports; forbidding catalog/registry read ports | exact |
| `tests/unit/ui/offering-comparison.test.tsx` | Public UI | component test / events-render | `offering-surfaces.test.tsx:1-80` | Testing Library roles/text; keyboard/focus/live-state; assert protocol words and effect actions absent | Class-name snapshots, jsdom as browser/a11y proof, testing only desktop table | exact |
| `tests/eval/offering-comparison-transfer.test.ts` | Comparison | eval / transform | `adr009-transfer-comparison.test.ts:22-74` | One vertical professional-service dataset, one machine/data transfer, and cross-profile pair; mutate one falsifier and require recommendation/refusal to change | Two nearly identical categories or a second host/profile workflow | exact eval pattern |
| `tests/e2e/comparison-surface.spec.ts` and `tests/e2e/a11y/comparison.spec.ts` | Public UI | browser eval / request-response | `customer-request-human-lifecycle-smoke.spec.ts:19-84,267-319`; existing discovery a11y specs | Public origin, exact route, refresh/share, 320px/400%, keyboard/focus, reduced motion, state matrix, network/zero-mutation assertions | Source imports/direct Convex as journey proof; automated checks claimed as comprehension or real screen-reader evidence | role/data-flow |
| `tests/deploy-smoke/consumer-comparison-smoke.spec.ts` | Release evidence | hosted browser / request-response | `customer-request-human-lifecycle-smoke.spec.ts:19-84,285-319` | Require explicit HTTPS base URL, exact revision/deployment identity, labelled demo identities, human and structured readback, refresh and zero-effect proof | Falling back to local silently, hosted URL without exact revision, fixture claim upgraded to customer value | exact role/data-flow |
| `tools/release/consumer-comparison-evidence.{mjs,ts}` plus verifier/test | Release evidence | utility / file-I/O batch | `tools/release/kernel-proof-manifest.mjs:4-65`; verifier lines 1-19; unit test lines 13-58 | Versioned manifest, expected git revision, deployment/base URL, demo/profile versions, selection tuples, response digests, observations, zero-effect evidence; generate once and independently verify | Self-reported prose, regeneration until green, missing source/deployment binding, secrets/customer text in packet | exact role/data-flow |

## Concrete Patterns to Copy

### 1. Lineage refusal before projection

**Source:** `src/modules/catalog/internal/offering-supply.ts:164-215`

```ts
if (input.offering.status !== 'published') {
  return { kind: 'unavailable', reason: 'offering_not_published' }
}
if (
  input.revision.offeringRef !== input.offering.offeringRef
  || input.revision.businessId !== input.offering.businessId
  || input.revision.revision !== input.offering.currentRevision
) {
  return { kind: 'unavailable', reason: 'offering_revision_missing' }
}
```

Copy the refusal shape, not the current-only condition. The historical resolver replaces `revision === currentRevision` with exact public-history eligibility and returns a separate newer-current reference. It never substitutes.

### 2. Immutable revision hashing at the source owner

**Source:** `src/modules/catalog/internal/offering-source.ts:62-91`

```ts
const facts = validateFacts(command.facts)
if (!facts) return fail(state, 'invalid_offering', 'Offering facts are invalid.')
const sourceHash = stableHash({
  businessId: command.businessId,
  offeringRef: command.offeringRef,
  revision: 1,
  ...facts,
}) as SourceHash
```

The closed comparison profile belongs inside `facts`, validation, and the hash. A later mutable join would break exact-revision share/readback.

### 3. Safe DTO has no destination for private data

**Source:** `src/modules/registry/internal/offering-api-projection.ts:91-140`

```ts
/**
 * The only public registry projection for canonical Offering supply.
 * Source digests, lineage hashes, credentials, adapter configuration and
 * internal support reasons deliberately have no destination in this DTO.
 */
export function projectBusinessSupplyToPublicApi(
  projection: BusinessSupplyProjection,
  now = projection.observedAt,
): PublicBusinessCatalogApiV2Dto {
  // map only explicit safe fields
}
```

Comparison projection should follow the same allowlist principle. Strict decoding must happen before this mapping; a TypeScript cast is not validation.

### 4. Read-only registered action delegates to source

**Source:** `src/modules/registry/registry.actions.ts:249-284`

```ts
export const registryDetailAction = defineAction({
  id: 'registry.detail',
  schema: registryDetailInputSchema,
  outputSchema: registryDetailOutputSchema,
  readOnly: true,
  surfaces: ['http', 'agentJson', 'answerThread'],
  invocationContract: {
    version: 'registry.detail:v1',
    consequenceClass: 'read_only',
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_registry_detail_result'],
    safeContinuations: ['inspect_result'],
  },
  run: async ({ data }) => readSourceOwnedDetail(data),
})
```

Only declare surfaces backed by a real adapter. `agentJson` is an exposure marker, not proof of public invocation reachability.

### 5. Deterministic ordering refuses without explicit, comparable evidence

**Source:** `src/modules/customer-request/customer-option-set.ts:38-70` (principle only; importing this module is forbidden)

```ts
if (
  preference === undefined
  || !hasComparableShape(candidateSet.candidates)
) return { kind: 'unranked', commercialInfluence }

const ordered = [...candidateSet.candidates].sort(compareKnownValues)
if (selected === undefined || next === undefined || isTie(selected, next)) {
  return { kind: 'unranked', commercialInfluence }
}
```

Phase 05 generalizes this as lexicographic stated priorities. Unknown, not supplied, stale, or not comparable on a decisive dimension blocks the whole ordering; it never receives a default.

### 6. Server-authoritative validated URL route

**Source:** `src/routes/registry.tsx:46-90`

```ts
const searchSchema = z.object({ /* bounded public references */ })

export const readRouteServer = createServerFn()
  .validator((data) => searchSchema.parse(data))
  .handler(({ data }) => loadSourceOwnedReadback(data))

export const Route = createFileRoute('/compare')({
  validateSearch: validateBoundedCompareSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readRouteServer({ data: deps }),
  pendingComponent: ComparisonLoading,
  errorComponent: ComparisonError,
})
```

The URL carries references and closed priority IDs only. Every load re-resolves public eligibility, suppression, facts, provenance, support, and newer revision on the server.

### 7. Recursive import-fence eval

**Source:** `tests/imports/action-invocation-host-boundaries.test.ts:17-53`

```ts
function graphViolations(entries: readonly string[]): readonly string[] {
  const visited = new Set<string>()
  const visit = (path: string) => {
    if (visited.has(path)) return
    visited.add(path)
    const source = readFileSync(path, 'utf8')
    violations.push(...boundaryViolations(source))
    for (const dependency of localImports(path, source)) visit(dependency)
  }
  entries.forEach(visit)
  return violations
}
```

Comparison entries must be fenced transitively from inquiry, demand capture, Customer Request, RoutePlan, Action Invocation, mandate, booking, payment, provider transport, and effect modules. Catalog/registry read interfaces remain allowed.

### 8. Revision-bound evidence manifest and independent refusal

**Source:** `tools/release/kernel-proof-manifest.mjs:9-65` and `verify-kernel-proof-manifest.mjs:4-18`

```js
if (manifest.sourceRevision !== expectedRevision) errors.push('source_revision_mismatch')
if (deployment.sourceRevision !== expectedRevision) errors.push('deployment_revision_mismatch')
return { ok: errors.length === 0, errors: [...new Set(errors)].sort() }
```

The comparison packet adds deployment identity, canonical base URL, labelled demo seed/profile versions, exact selection tuples, public payload digests, human observations, structured action results, and zero-effect evidence. Generate once from the frozen hosted revision; verify separately.

## Shared Patterns

### Ownership and imports

Catalog owns immutable Offering facts and public-history eligibility. Registry owns safe browse/detail transport. Comparison owns reference resolution orchestration, comparability, priority ordering, and the shared semantic result. Routes and components only validate transport state and render. Outside code imports each module's `public.ts`, never `internal/*`.

### Ordinary outcomes

Use discriminated results for unavailable selection, refused URL item, partial source, stale/unknown/not-supplied/not-comparable fact, changed revision, no priority, tie, and ordered outcome. Throw only for unexpected infrastructure faults. Preserve valid selections when another selection is refused.

### Astryx UI

Copy the Astryx imports and shell structure from `$slug.tsx:1-12,97-205` and `AePublicShell.tsx:80-99`. Use official `Layout`, `Card`, `Button`, `Badge`, `Banner`, `Skeleton`, `Selector`, `Table`, `Text`, `Heading`, `Stack`, `Divider`, and `EmptyState`. Tailwind is layout glue only. Do not add Ae primitives, a local palette, shadcn/Radix/CVA wrappers, gradients, score visuals, or a global Compare navigation item.

Desktop comparison is a native table with caption and scoped headers. Under `md`, CSS selects a semantically equivalent fact-by-fact `<dl>`; no JavaScript viewport branch. Both projections consume identical source cells and order. Persistent labels, 44px targets, visible focus, bounded live announcements, focus recovery, 320px, 400% zoom, and reduced motion are acceptance behavior.

### Inspect-only effect fence

Allowed controls are view Offering, add/remove reference, compare, change/clear closed priorities, explicitly replace a revision, view published details, and copy/share the URL. Public technical navigation uses `rel="noopener noreferrer"` and `referrerPolicy="no-referrer"`. No Phase 05 action group imports or shares a callback with registry demand capture, business inquiry/call controls, endpoint invocation, Customer Request, booking, payment, or provider effect code.

### Query and fan-out bounds

Maximum four selections and three priorities. Exact tuple reads use indexes; no public scan, query-by-presentation-text, crawler, endpoint probe, or `collect()` then slice. Replace all three v2 `returns: v.any()` declarations and cast-only snapshot parsing before hosted proof. Comparison remains `no-store` until a cache key demonstrably includes every exact revision plus suppression/currentness dependency.

### Evidence ceiling

Source/unit/integration/browser/hosted evidence remain distinct. The maximum Phase 05 claim is that one exact hosted revision took the labelled Perth request from a blank session to a grounded answer or exact insufficiency, then publicly exposed and compared exact revisions of labelled professional-service and machine/data demonstration Offerings through equivalent human and structured semantics, including honest missing/stale/changed states, without an external effect. A fresh-evaluator record may establish bounded comprehension of that named flow only. It does not prove real demand, supplier quality, useful real-world recommendations, endpoint correctness, fulfilment, willingness to pay, conversion, retention, revenue, production safety, broad screen-reader usability, or broad human comprehension.

## Integration Risks and Planner Stop Conditions

1. **Dirty predecessor custody:** do not assign overlapping Offering/schema/registry/generated files until the parent freezes and integrates a coherent lane.
2. **Canonical data-model decision:** exact historical public eligibility changes Offering/public-history meaning and requires an accepted ADR-026 amendment or new ADR before implementation.
3. **Registry consumer blast radius:** v2 action cutover affects Answer Thread DTO consumers, provider-card projections, discovery descriptors, and tests. Give it a literal consumer list and its own plan; do not hide it inside UI work.
4. **Synthetic migration identities:** `legacy-offering:*` and `legacy-access:*` are presentation adapters only. They cannot enter durable shared URLs or comparison references.
5. **Suppression/privacy:** live business/Offering suppression precedes historical reads. Never reveal facts for never-public, withdrawn-unsafe, suppressed, or cross-business revisions.
6. **Currentness semantics:** “newer revision available” preserves exact selected history; “out of date” describes fact validity. Do not conflate them.
7. **Generated edges:** `convex/_generated/api.d.ts` and `src/routeTree.gen.ts` regenerate only from the integrated source lane under parent custody.
8. **Machine reachability:** registered action parity is not enough. The plan must name and test the accepted public structured invocation surface.
9. **Hosted authority:** no authorized exact-revision hosted Phase 05 environment is currently evidenced. Without it, D-13 closure remains open; local/browser fixtures cannot substitute.
10. **Unrelated red:** Phase 05 owns failures it introduces. Existing shared-tree type errors are assigned or recorded, not silently absorbed.

## Planner Dependency Order

```text
Gate 0: freeze + integrate Offering predecessor lane
  -> catalog exact public-history decision and storage
  -> strict v2 snapshot/query hardening
  -> registry HTTP/action v2 parity cutover
  -> pure comparison contracts + profiles + resolver + comparator
  -> public Offering detail + URL shortlist + compare projections
  -> import/parity/vertical/horizontal/browser evals
  -> exact-revision hosted smoke + frozen evidence packet
```

Do not dispatch route/component work ahead of the historical resolver and single semantic comparison result. Do not dispatch comparison action registration ahead of registry v2 parity and a named invocation surface.

## Metadata

**Source search scope:** `src/modules/catalog`, `src/modules/registry`, `src/modules/actions`, `src/modules/customer-request` (precedent only), `src/routes`, `src/components/ae`, `convex`, `tests`, `tools/release`
**Strong analogs read:** Offering model/source/schema/projection, registry application/actions/queries, public routes/shell/Offering UI, pure option ordering precedent, import graph fence, parity tests, hosted smoke, revision-bound manifest verifier
**Pattern extraction evidence:** current shared-tree source inspection only; no implementation, test, deployment, or hosted capability claim
**Excluded source dependency:** Customer Request, Action Invocation, inquiry, demand, payment, capability transport, and provider effects are reference/negative-fence material only

## PATTERN MAP COMPLETE
