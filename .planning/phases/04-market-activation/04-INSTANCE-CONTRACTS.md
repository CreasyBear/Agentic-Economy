# Phase 4 master/child worktree contracts

This file is the dispatch authority. A child receives one parcel copied
verbatim, with placeholders replaced by the parent. “Inspect and improve” is
not a valid task.

## Parent preflight

The parent must first:

1. record the final integrated Phase 3C commit/tree and intended integration
   branch;
2. create a complete content-bound custody manifest for every inherited dirty
   path with
   `orchestrate-master-child-worktrees/scripts/custody_manifest.py`;
3. verify required Node, Vitest, Playwright and Convex codegen runtimes without
   installing packages;
4. confirm every required output/handoff path is inside writer ownership;
5. create one worktree from the exact parent-integrated revision;
6. name one RED command, exact writable paths, forbidden paths, evidence ceiling
   and stop conditions;
7. reserve the integration destination before a child creates a commit.

The planning checkout contains 66 inherited founder-owned paths. The planning
manifest is `/tmp/ae-phase4-planning-parent-custody.json` with digest
`c4b2c778e1309846268b55b236202626359f6cb6d440a58e867166b1079ac08f`.
Implementation must generate a fresh whole-overlay manifest after Phase 3C
integration. It must not reuse this digest as proof of future bytes.

## Common child prompt

Every child is told:

> You are not alone in this repository. Work only in your assigned worktree and
> exact writable paths. Read AGENTS.md, PRODUCT.md, DESIGN.md, the accepted
> Phase 4 ADRs, 04-CONTEXT, 04-PLAN, 04-UI-SPEC, 04-VALIDATION and this parcel
> completely before editing. Live source decides what exists. Preserve every
> inherited or sibling change. Do not install packages, edit generated Convex
> output, deploy, contact a provider, use real credentials/payment, stage broad
> paths, clean, reset, restore or delete permanently. Run the named RED before
> implementation, make the smallest coherent source change, run only focused
> commands, then return the required handoff. Stop on an ownership collision,
> source-contract contradiction, unexpected external effect or evidence-ceiling
> breach.

Forbidden for every parcel: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`,
`package.json`, every lockfile, `convex/_generated/**`, generated route trees,
`.planning/phases/03c-hosted-paid-operation-product-trial/**`, all active
Phase 3C source/tool/test paths, every inherited custody-manifest path, and
every repository path not literally listed under that parcel's `Owns only`.
The predecessor's source DTO/projection named in `Starts from` is frozen unless
it is also explicitly listed. One correction may fix a failing owned invariant;
a second correction or contract change stops and returns to the parent.

Every child handoff is:

```text
{parcel, baseRevision, baseTree, parentSha, integrationBranch,
 custodyManifestPath, custodyManifestDigest,
 ownedPaths, changedPaths, forbiddenPathsChecked,
 redCommand, redResult, implementationSummary,
 focusedCommands, exitCodes, observableBehavior,
 queryReadBudget?, counters?, evidenceClass, claimCeiling,
 unresolvedFindings, earliestBlocker, nextSafeAction,
 commitCandidate, resultingTree}
```

The handoff path named in each parcel is parent-owned. The child returns the
complete JSON content in its response; the parent validates and materializes
it. Children never write outside their source/test ownership.

The parent audits every diff and reruns the focused command before integrating.
Children do not merge siblings or make completion claims.

## Parcel 4A-01 — Identity, custody and onboarding RED/contracts

**Starts from:** final Phase 3C integration base.

**Owns only:**

- `src/modules/capability-supply/onboarding-contract.ts`
- `src/modules/capability-supply/internal/convex-schema.ts`
- `src/modules/capability-supply/internal/credential-custody.ts`
- `src/modules/capability-supply/internal/environment-credential-custody.ts`
- `tests/unit/capability-supply/onboarding-contract.test.ts`
- `tests/integration/capability-supply-onboarding.test.ts`

**RED:** `owner_or_form_input_cannot_create_routeable_supply` and
`raw_credential_material_is_rejected`.

**Implement:** strict draft schema, revision/status contract, token-identifier
authority type, opaque custody port, schema/index additions and hostile gate
substitutions. No Convex route or UI.

**Command:**

```text
npm exec -- vitest run tests/unit/capability-supply/onboarding-contract.test.ts tests/integration/capability-supply-onboarding.test.ts
git diff --check
```

Expected RED: both named cases fail because credential mode/draft authority is
absent. Expected GREEN: both reject before canonical supply mutation. Handoff:
`.planning/handoffs/phase-04/4A-01.json`.

**Stop:** owner identity cannot be derived server-side; credential custody
requires raw material in Convex; canonical publication must be duplicated.

**Ceiling:** source plus focused in-memory/mock custody fixtures.

## Parcel 4A-02 — Canonical owner token-identifier migration

**Starts from:** parent-integrated 4A-01.

**Owns only:**

- `src/modules/business/public.ts`
- `src/modules/business/internal/schema.ts`
- `src/modules/business/internal/claim.ts`
- `src/modules/business/internal/visibility.ts`
- `convex/business.ts`
- `tests/unit/business/claim.test.ts`
- `tests/unit/business/suppression.test.ts`
- `tests/integration/durable-claim-route.test.ts`

**RED:** `owner_token_identifier_is_canonical` fails because owner records and
publication authorization still resolve only `clerkUserId`/subject.

**Implement:** optional token-identifier compatibility field/index, exact
server-derived dual-read, bounded idempotent backfill command and closure test.
Historical `ownerId` and `clerkUserId` remain unchanged; caller input never
selects identity.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/business/claim.test.ts tests/unit/business/suppression.test.ts tests/integration/durable-claim-route.test.ts
git diff --check
```

Expected GREEN: token identifier authorizes the same owner, subject-only legacy
rows dual-read during migration, cross-owner access is non-enumerating. Handoff:
`.planning/handoffs/phase-04/4A-02.json`.

**Stop:** global migration requires rewriting owner IDs or any unlisted module.

## Parcel 4A-03 — Durable onboarding application

**Starts from:** parent-integrated 4A-02.

**Owns only:**

- `src/modules/capability-supply/onboarding-application.ts`
- `src/modules/capability-supply/onboarding-projection.ts`
- `convex/capabilitySupplyOnboarding.ts`
- `tests/integration/capability-supply-onboarding-application.test.ts`
- `tests/integration/business-owner-token-identifier.test.ts`

**RED:** `draft_publish_failure_creates_no_partial_routeable_supply`.

**Implement:** expected-revision draft commands; authenticated owner derivation;
bounded owner reads; canonical publish orchestration; inactive-on-readiness-
failure behavior; resumable migration. Never accept public `ownerId` as
authority.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/integration/capability-supply-onboarding-application.test.ts tests/integration/business-owner-token-identifier.test.ts tests/integration/capability-publication-security.test.ts
git diff --check
```

Expected RED: partial canonical rows survive a failed publish/readiness path.
Expected GREEN: no routeable state and a resumable source-issued blocker.
Handoff: `.planning/handoffs/phase-04/4A-03.json`.

**Stop:** mutation cannot keep the draft/publish boundary truthful; migration
requires rewriting historical identities; owner access becomes enumerable.

## Parcel 4A-04 — Routeable operation projection and bounded discovery

**Starts from:** parent-integrated 4A-03.

**Owns only:**

- `src/modules/registry/operation-projection.ts`
- `src/modules/registry/internal/operation-search-port.ts`
- `src/modules/registry/internal/schema.ts`
- `convex/registry.ts`
- `src/modules/capability-supply/internal/graph/query-graph.ts`
- `src/modules/capability-supply/internal/eligibility/list.ts`
- `tests/unit/registry/operation-projection.test.ts`
- `tests/integration/routeable-operation-search.test.ts`

**RED:** `ten_thousand_unrelated_operations_do_not_increase_page_read_budget`.

**Implement:** removable projection; index
`by_routeabilityStatus_and_readinessValidUntil`; batches of 100 for expiry;
three cursor pages/150 hard scan ceiling; explicit incomplete coverage;
canonical exact revalidation; query counters. Do not modify public catalog
service inventory or create a registry aggregate.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/registry/operation-projection.test.ts tests/integration/routeable-operation-search.test.ts
npm exec -- vitest run tests/unit/registry/schema.test.ts
git diff --check
```

Expected RED: query calls grow with 10,000 unrelated rows or an underfilled page
claims completeness. Expected GREEN: fixed budget and explicit continuation/
incomplete state. Handoff: `.planning/handoffs/phase-04/4A-04.json`.

**Stop:** query needs a full-network scan; projection is required to reconstruct
canonical supply; public search could authorize execution.

## Parcel 4A-05 — Owner/founder onboarding UI

**Starts from:** parent-integrated 4A-04 after projection DTO freeze.

**Owns only:**

- `src/components/ae/supply-onboarding/AeCapabilityList.tsx`
- `src/components/ae/supply-onboarding/AeCapabilitySetupForm.tsx`
- `src/components/ae/supply-onboarding/AeCapabilityReadiness.tsx`
- `src/components/ae/supply-onboarding/AeCapabilityBlockers.tsx`
- `src/routes/_operator/owner.capabilities.tsx`
- `src/routes/_operator/owner.capabilities.new.tsx`
- `src/routes/_operator/owner.capabilities.$publicationRef.tsx`
- `src/routes/_operator/admin.supply-onboarding.$caseRef.tsx`
- `src/lib/operator/navigation.ts`
- `tests/unit/supply-onboarding/capability-list.test.tsx`
- `tests/unit/supply-onboarding/capability-setup.test.tsx`
- `tests/e2e/supply-onboarding.spec.ts`

**RED:** `published_profile_with_failed_readiness_is_not_rendered_as_live`.

**Implement:** source-driven six-movement setup, all canonical states, mock
labels, error focus, keyboard and narrow-screen behavior. Missing source fields
are a stop; client inference is forbidden.

**Stop:** UI needs to parse contracts/provider responses, hold secrets, or
decide routeability.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/supply-onboarding/capability-list.test.tsx tests/unit/supply-onboarding/capability-setup.test.tsx
npm exec -- playwright test tests/e2e/supply-onboarding.spec.ts
git diff --check
```

Expected GREEN: all canonical states, keyboard/320px behavior and persistent
fixture labels. Handoff: `.planning/handoffs/phase-04/4A-05.json`.

## Parcel 4A-06 — Credential-mode transport integration

**Starts from:** parent-integrated 4A-05.

**Owns only:**

- `src/modules/capability-supply/internal/transport-adapters.ts`
- `src/modules/capability-supply/internal/readiness-probe.ts`
- `src/modules/capability-supply/internal/binding/write.ts`
- `src/modules/capability-supply/internal/binding/registration.ts`
- `src/modules/capability-supply/internal/publication/draft.ts`
- `src/modules/capability-supply/internal/operation-ledger/commands.ts`
- `src/modules/capability-supply/internal/graph/read-probe-target.ts`
- `src/modules/capability-supply/internal/graph/probe-digest.ts`
- `src/modules/capability-supply/published-operation.ts`
- `src/modules/capability-supply/route-transport-runtime.ts`
- `src/modules/capability-supply/public.ts`
- `convex/capabilitySupplyReadiness.ts`
- `tests/unit/capability-supply/transport-adapters.test.ts`
- `tests/unit/capability-supply/readiness-probe.test.ts`
- `tests/unit/capability-supply/binding-helpers.test.ts`
- `tests/unit/capability-supply/graph-probe-thinness.test.ts`
- `tests/integration/capability-supply-credential-mode.test.ts`

**RED:** `open_transport_requires_no_credential_resolver_or_authorization_header`
and `managed_ref_cannot_admit_or_execute_without_custody_resolution`, plus
`credential_mode_substitution_changes_binding_and_probe_identity`.

**Implement:** thread the frozen `credentialMode` through binding admission,
publication, readiness and execution. For `none`, never invoke a resolver and
never emit an Authorization header. For `managed_ref`, fail closed unless the
source-owned managed reference resolves through the injected custody port.
Never infer the mode from reference presence and never fall back from
`managed_ref` to anonymous execution. Persist and reconstruct the mode in the
canonical binding registration, include it in transport admission, probe target
and probe digest, and invalidate earlier readiness evidence when it changes.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/capability-supply/transport-adapters.test.ts tests/unit/capability-supply/readiness-probe.test.ts tests/unit/capability-supply/binding-helpers.test.ts tests/unit/capability-supply/graph-probe-thinness.test.ts tests/integration/capability-supply-credential-mode.test.ts
git diff --check
```

Expected GREEN: open endpoints admit, probe and execute with zero resolver
calls and no Authorization header; managed endpoints refuse admission,
readiness and execution until exact custody resolution succeeds; changing the
mode changes binding/probe identity and cannot reuse prior readiness. Handoff:
`.planning/handoffs/phase-04/4A-06.json`.

**Stop:** an adapter cannot distinguish public from authenticated transport,
the mode would be caller-selected at execution, or shared records would need
raw credential material.

## Parent cut 4A-R — Generate and verify route reachability

**Starts from:** parent-integrated 4A-06. This is not child work.

The parent runs the repository's existing route generator and owns only
`src/routeTree.gen.ts` for this cut. It verifies imports and route IDs for:

- `/owner/capabilities`;
- `/owner/capabilities/new`;
- `/owner/capabilities/$publicationRef`;
- `/admin/supply-onboarding/$caseRef`.

The parent then runs the focused supply-onboarding route tests and typecheck.
Children remain forbidden from editing generated route output manually. If the
generator changes any other generated artifact or an unrelated route, stop and
classify the diff before integration. Handoff:
`.planning/handoffs/phase-04/4A-R.json`.

## Parcel 4B-01 — Reference RFQ contract and three mock adapters

**Starts from:** parent-integrated 4A-R.

**Owns only:**

- `src/modules/reference-digital-procurement/request-quote-contract.ts`
- `src/modules/reference-digital-procurement/quote-result.ts`
- `src/modules/reference-digital-procurement/request-quote.actions.ts`
- `src/modules/reference-digital-procurement/mock-providers.ts`
- `src/modules/reference-digital-procurement/internal/convex-schema.ts`
- `src/modules/reference-digital-procurement/public.ts`
- `src/modules/actions/index.ts`
- `convex/schema.ts`
- `convex/digitalProcurement.ts`
- `tests/unit/reference-digital-procurement/request-quote-contract.test.ts`
- `tests/unit/reference-digital-procurement/quote-result.test.ts`

**RED:** `three_routeable_suppliers_are_not_three_viable_quotes`.

**Implement:** strict input/result/identity/expiry/currency/price/terms; three
different raw mock shapes normalized operation-locally; Registered Action
definition and central registration; operation-owned durable quote result.
Do not change shared Request, action semantics or UI.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/reference-digital-procurement/request-quote-contract.test.ts tests/unit/reference-digital-procurement/quote-result.test.ts tests/unit/actions/registry.test.ts
git diff --check
```

Expected RED: action lookup/result readback is absent and crossed fixtures can
enter shared quote material. Expected GREEN: registered action plus exact
operation-owned result reference. Handoff:
`.planning/handoffs/phase-04/4B-01.json`.

**Stop:** a provider needs a shared schema branch; raw payload must escape the
operation adapter; fixture requires real endpoint/credential.

## Parcel 4B-02 — Durable structured-quote Convex store

**Starts from:** parent-integrated 4B-01.

**Owns only:**

- `src/modules/routing-kernel/convex-structured-quote-preparation-store.ts`
- `src/modules/routing-kernel/structured-quote-preparation-store.ts`
- `src/modules/routing-kernel/internal/convex-schema.ts`
- `convex/routingKernelStructuredQuoteStore.ts`
- `tests/integration/routing-kernel-structured-quote-store.test.ts`

**RED:** `cold_restore_does_not_redispatch_quote_attempt`.

**Implement:** existing store interface over existing tables; provider-offer
row references `quoteResultRef`; exact bounded candidate/attempt/offer reads;
idempotent commands; independent provider release truth. No second generic
quote table.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/integration/routing-kernel-structured-quote-store.test.ts
git diff --check
```

Expected RED: cold restore uses in-memory state or provider offer is sole truth.
Expected GREEN: exact durable reconstruction and result reference. Handoff:
`.planning/handoffs/phase-04/4B-02.json`.

**Stop:** store interface cannot represent uncertainty; implementation needs
raw provider bodies; existing schema ownership is ambiguous.

## Parcel 4B-03 — Bounded sourcing and Customer Request projection

**Starts from:** parent-integrated 4B-02.

**Owns only:**

- `src/modules/customer-request/quote-sourcing/application.ts`
- `src/modules/customer-request/quote-sourcing/projection.ts`
- `src/modules/customer-request/runtime.ts`
- `src/modules/customer-request/preparation.ts`
- `src/modules/customer-request/kernel-router.ts`
- `src/modules/customer-request/customer-projection.ts`
- `src/modules/customer-request/agent-contract.ts`
- `convex/customerRequestApplication.ts`
- `convex/customerRequestQuoteSourcing.ts`
- `tests/unit/customer-request/phase4-option-set.test.ts`
- `tests/integration/customer-request-three-quotes.test.ts`

**RED:** `provider_uncertainty_is_preserved_and_never_backfilled_to_three`.

**Implement:** exact capability/network candidate read, three-provider policy,
disclosure allocation, one Request-owned Action Invocation/attempt/release per
supplier, independent coverage, operation-result references, quote-domain
projection and human/agent DTO parity. Direct `adapter.quoteStructured` dispatch
is forbidden on this intended path. Do not add to `demandSignals` or expose
development supplied-quote actions.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/customer-request/phase4-option-set.test.ts tests/integration/customer-request-three-quotes.test.ts tests/imports/customer-request-boundaries.test.ts
git diff --check
```

Expected RED: supplier contact lacks registered invocation lineage or
uncertainty is backfilled. Expected GREEN: one exact invocation/release identity
per contact and truthful coverage. Handoff:
`.planning/handoffs/phase-04/4B-03.json`.

**Stop:** source needs unbounded scan; Request must parse raw payload; uncertain
provider becomes retry/fallback.

## Parcel 4B-04 — Durable Activity request host

**Starts from:** parent-integrated 4B-03 after DTO freeze.

**Owns only:**

- `src/components/ae/activity/AeActivityList.tsx`
- `src/components/ae/activity/AeWorkItemShell.tsx`
- `src/components/ae/customer-request/CustomerRequestActivityHost.tsx`
- `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`
- `src/routes/activity.tsx`
- `src/routes/activity.$requestRef.tsx`
- `src/routes/index.tsx`
- `tests/unit/customer-request/phase4-activity-ui.test.tsx`
- `tests/e2e/phase4-activity-resume.spec.ts`

**RED:** `browser_storage_is_not_request_custody`.

**Implement:** durable Activity list/detail, direct-route resume and neutral work
summary. Render one RFQ Request summary and one existing paid-operation summary
through `AeWorkItemShell` without importing either domain panel.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/customer-request/phase4-activity-ui.test.tsx
npm exec -- playwright test tests/e2e/phase4-activity-resume.spec.ts
git diff --check
```

Expected GREEN: direct URL/server state resumes; shell remains neutral while
domain details remain separate. Handoff:
`.planning/handoffs/phase-04/4B-04.json`.

## Parcel 4B-05 — Sourcing progress and quote-domain UI

**Starts from:** parent-integrated 4B-04.

**Owns only:**

- `src/components/ae/customer-request/panels/sourcing/SourcingProgress.tsx`
- `src/components/ae/customer-request/panels/quotes/QuoteComparisonView.tsx`
- `src/components/ae/customer-request/panels/quotes/QuoteEvidenceCard.tsx`
- `src/components/ae/customer-request/CustomerRequestActivityHost.tsx`
- `tests/unit/customer-request/phase4-quote-ui.test.tsx`
- `tests/e2e/phase4-three-quotes.spec.ts`

**RED:** `partial_expired_or_uncertain_quotes_are_not_rendered_as_complete`.

**Implement:** durable route resume, supplier progress, honest coverage,
quote-domain comparison, responsive/accessibility contract. No selection/start
control in 4B.

**Stop:** Activity needs browser-local state; shared renderer needs provider or
website branches; UI adds authority or ranking.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/customer-request/phase4-quote-ui.test.tsx
npm exec -- playwright test tests/e2e/phase4-three-quotes.spec.ts
git diff --check
```

Expected GREEN: partial/expired/uncertain coverage is exact at keyboard, 320px
and 400% zoom; nothing appears selected or started. Handoff:
`.planning/handoffs/phase-04/4B-05.json`.

## Parent cut 4B-R — Generate and verify Activity route reachability

**Starts from:** parent-integrated 4B-05. This is not child work.

The parent runs the repository's existing route generator and owns only
`src/routeTree.gen.ts` for this cut. It verifies the exact imports and route IDs
for `/activity` and `/activity/$requestRef`, then runs the focused Activity
route tests and typecheck. Children never hand-edit generated route output. If
generation touches an unrelated route, stop and classify the diff before
integration. Handoff: `.planning/handoffs/phase-04/4B-R.json`.

## Parcel 4C-01 — Close-operation contract, result and registration

**Starts from:** parent-integrated 4B-R.

**Owns only:**

- `src/modules/reference-digital-procurement/start-work-contract.ts`
- `src/modules/reference-digital-procurement/start-work-result.ts`
- `src/modules/reference-digital-procurement/start-work.actions.ts`
- `src/modules/reference-digital-procurement/internal/convex-schema.ts`
- `src/modules/actions/index.ts`
- `convex/digitalProcurement.ts`
- `tests/unit/reference-digital-procurement/start-work-contract.test.ts`
- `tests/unit/reference-digital-procurement/start-work-result.test.ts`

**RED:** `start_work_action_and_business_result_are_operation_owned`.

**Implement:** exact quote-result/offer/terms input; Registered Action and
central registration; durable operation-owned `startWorkResultRef` that
distinguishes acknowledgement from fulfilment. No Request transition yet.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/reference-digital-procurement/start-work-contract.test.ts tests/unit/reference-digital-procurement/start-work-result.test.ts tests/unit/actions/registry.test.ts
git diff --check
```

Expected RED: the operation is absent or the only result lives in shared
control. Expected GREEN: registered exact operation/result owner. Handoff:
`.planning/handoffs/phase-04/4C-01.json`.

**Stop:** start-work semantics require shared payment/quote fields or lack an
operation-owned completion boundary.

## Parcel 4C-02 — Exact Customer Request quote selection

**Starts from:** parent-integrated 4C-01.

**Owns only:**

- `src/modules/customer-request/internal/convex-v2-schema.ts`
- `src/modules/customer-request/quote-selection/contract.ts`
- `src/modules/customer-request/quote-selection/transition.ts`
- `src/modules/customer-request/quote-selection/readback.ts`
- `convex/customerRequestQuoteSelection.ts`
- `tests/integration/phase4-quote-selection.test.ts`

**RED:** `selection_does_not_authorize_or_start_work`.

**Implement:** `customerRequestV2QuoteSelections`, exact indexes, optimistic
Request revision/idempotency, offer/result/provider/route-generation affinity,
expiry/material-change invalidation, readback and source-owned allowed command.

**Stop:** quote possession becomes authority; business result would have to live
in Customer Request; or start-work meaning is not operation-owned.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/integration/phase4-quote-selection.test.ts
git diff --check
```

Expected GREEN: selection survives reload but creates no approval, invocation
or provider send; stale/cross-principal cases are mutation-free. Handoff:
`.planning/handoffs/phase-04/4C-02.json`.

## Parcel 4C-03 — Execute/reconcile and bounded Activity queries

**Starts from:** parent-integrated 4C-02.

**Owns only:**

- `src/modules/reference-digital-procurement/start-work-adapter.ts`
- `src/modules/customer-request/quote-to-close/application.ts`
- `src/modules/customer-request/quote-to-close/projection.ts`
- `convex/customerRequestQuoteToClose.ts`
- `convex/customerRequestRouteExecutionProblemPorts.ts`
- `tests/integration/phase4-quote-to-close.test.ts`
- `tests/integration/customer-request-phase4-queries.test.ts`

**RED:** `possible_release_survives_cold_restore_and_has_no_retry`.

**Implement:** existing authority/attempt/release/generation/reconciliation
seams; one Request-owned invocation identity; business-owned result reference;
capped Activity source reads; exact problem/history caps; crash-cut fixtures.
No new activity/order/execution table.

**Stop:** reconciliation depends on caller evidence; late result can overwrite
current generation; projection must own business truth.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/integration/phase4-quote-to-close.test.ts tests/integration/customer-request-phase4-queries.test.ts
git diff --check
```

Expected GREEN: crash cuts preserve one send/current generation and uncertainty
is reconcile-only; reads stay capped at 10,000 unrelated heads. Handoff:
`.planning/handoffs/phase-04/4C-03.json`.

## Parcel 4C-04 — Selection, work and recovery UI

**Starts from:** parent-integrated 4C-03 after DTO freeze.

**Owns only:**

- `src/components/ae/customer-request/panels/selection/QuoteSelectionReview.tsx`
- `src/components/ae/customer-request/panels/work/WorkProgress.tsx`
- `src/components/ae/customer-request/panels/work/WorkRecovery.tsx`
- `src/components/ae/customer-request/CustomerRequestActivityHost.tsx`
- `src/components/ae/activity/AeWorkItemShell.tsx`
- `tests/unit/customer-request/phase4-work-ui.test.tsx`
- `tests/e2e/phase4-quote-to-close.spec.ts`

**RED:** `possibly_released_work_exposes_inspect_or_reconcile_only`.

**Implement:** distinct selection/authorization/start; exact consequence;
Activity/resume; partial/cancellation/uncertainty language; accessible safe
commands.

**Stop:** paid-operation DTO becomes universal; UI infers commands/result;
provider switching appears during uncertainty.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/customer-request/phase4-work-ui.test.tsx
npm exec -- playwright test tests/e2e/phase4-quote-to-close.spec.ts
git diff --check
```

Expected GREEN: selection/authority/start are distinct; possible release has
inspect/reconcile only; neutral shell still passes RFQ and paid-operation
summary cases. Handoff: `.planning/handoffs/phase-04/4C-04.json`.

## Parcel 4C-05 — Evidence and release candidate

**Starts from:** parent-integrated 4C-04.

**Owns only:**

- `tools/dev/phase-4-market-activation-evidence.ts`
- `tools/dev/verify-phase-4-market-activation-evidence.ts`
- `tests/unit/evidence/phase-4-market-activation-evidence.test.ts`
- `.planning/phases/04-market-activation/04-SUMMARY.md`

**RED:** verifier accepts tampered supplier, quote, authority, effect count,
projection digest, fixture provenance or served revision.

**Implement:** independent recomputation; working-tree packets labelled; clean
exact-revision packet only after source freeze. Deployment and hosted mutation
remain parent-only and separately authorized.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/evidence/phase-4-market-activation-evidence.test.ts
node --import tsx tools/dev/phase-4-market-activation-evidence.ts run /tmp/phase-4-working.json HEAD
node --import tsx tools/dev/verify-phase-4-market-activation-evidence.ts /tmp/phase-4-working.json HEAD
git diff --check
```

Expected RED: at least one tampered packet verifies. Expected GREEN: all named
tampering refuses; packet remains labelled working-tree until parent freeze.
Handoff: `.planning/handoffs/phase-04/4C-05.json`.

## Parent closeout

The parent integrates in the declared order, runs changed-boundary checks and
one final suite, freezes the revision, then dispatches independent read-only
product, UI, data/performance and goblin reviews. One correction round may fix
source-linked P0/P1 findings inside owned Phase 4 paths. Broad inherited
failures are recorded, not absorbed.
