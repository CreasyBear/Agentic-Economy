# Phase 4 master/child worktree contracts

This file is the common dispatch contract and the Phase 4B/4C dispatch
authority. `04A-INSTANCE-CONTRACTS.md` is the sole Phase 4A dispatch authority.
A child receives one active parcel copied verbatim, with placeholders replaced
by the parent. “Inspect and improve” is not a valid task.

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
> completely before editing. Phase 4A children also read
> 04A-BUSINESS-ACCOUNT-MANAGEMENT, 04A-INSTANCE-CONTRACTS and ADR-024
> completely. Live source decides
> what exists. Preserve every
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

## Superseded narrow 4A parcel history — do not dispatch

All sections from this heading through the historical `Parent cut 4A-R` are
non-executable provenance from the earlier onboarding-only plan. They are
replaced in full by `04A-INSTANCE-CONTRACTS.md`. No child may receive or claim
completion from these historical parcels.

### Historical 4A-01 — Business Account, custody and onboarding contracts

**Starts from:** final Phase 3C integration base.

**Owns only:**

- `src/modules/capability-supply/onboarding-contract.ts`
- `src/modules/capability-supply/internal/convex-schema.ts`
- `src/modules/capability-supply/internal/credential-custody.ts`
- `src/modules/capability-supply/internal/environment-credential-custody.ts`
- `src/modules/business-account/public.ts`
- `src/modules/business-account/internal/schema.ts`
- `src/modules/business-account/internal/validators.ts`
- `src/modules/security/public.ts`
- `convex/schema.ts`
- `tests/unit/capability-supply/onboarding-contract.test.ts`
- `tests/integration/capability-supply-onboarding.test.ts`
- `tests/unit/business-account/contracts.test.ts`
- `tests/unit/business-account/schema.test.ts`
- `tests/imports/business-account-boundaries.test.ts`

**RED:** `owner_or_form_input_cannot_create_routeable_supply` and
`raw_credential_material_is_rejected`, plus
`business_account_is_not_business_identity_membership_or_routeability`.

**Implement:** ADR-024 relationship/membership/invitation/task/note/support/
commercial/activity contracts and schema, strict capability draft schema,
revision/status contracts, token-identifier authority type, opaque custody port
and hostile gate substitutions. No Convex route or UI. Use the exact lifecycle,
roles and indexes in `04A-BUSINESS-ACCOUNT-MANAGEMENT.md`.

Define `businessAccountSummaryItems` as a removable portfolio projection with
`businessId`, relationship revision/status, assigned admin, health,
attention reasons, bounded source counts and `updatedAt`. Exact indexes:

- `by_businessId`;
- `by_relationshipStatus_and_updatedAt`;
- `by_assignedAdminTokenIdentifier_and_relationshipStatus_and_updatedAt`;
- `by_health_and_updatedAt`.

Portfolio pages read at most 51 rows to return 50 plus continuation. One account
dashboard reads exactly one summary and at most 10 current members, services,
operations, tasks and support cases per section; larger sections return counts
and explicit detail continuations. No account projection is canonical truth.

**Command:**

```text
npm exec -- vitest run tests/unit/capability-supply/onboarding-contract.test.ts tests/integration/capability-supply-onboarding.test.ts tests/unit/business-account/contracts.test.ts tests/unit/business-account/schema.test.ts
git diff --check
```

Expected RED: named cases fail because account separation, credential mode or
draft authority is absent. Expected GREEN: all reject before canonical business
or supply mutation and all tables have bounded intended indexes. Handoff:
`.planning/handoffs/phase-04/4A-01.json`.

**Stop:** owner identity cannot be derived server-side; credential custody
requires raw material in Convex; canonical publication must be duplicated; a
new account record would replace `businesses` or Customer Request.

**Ceiling:** source plus focused in-memory/mock custody fixtures.

### Historical 4A-02 — Canonical identity, membership and invitations

**Starts from:** parent-integrated 4A-01.

**Owns only:**

- `src/modules/business/public.ts`
- `src/modules/business/internal/schema.ts`
- `src/modules/business/internal/claim.ts`
- `src/modules/business/internal/visibility.ts`
- `convex/business.ts`
- `src/modules/business-account/internal/membership.ts`
- `src/modules/business-account/internal/invitations.ts`
- `src/modules/business-account/authorization.ts`
- `src/modules/inquiries/inquiry.functions.ts`
- `src/modules/settings/settings.functions.ts`
- `src/modules/settings/public.ts`
- `src/modules/settings/internal/schema.ts`
- `convex/businessAccount.ts`
- `convex/inquiries.ts`
- `convex/settings.ts`
- `tests/unit/business/claim.test.ts`
- `tests/unit/business/suppression.test.ts`
- `tests/integration/durable-claim-route.test.ts`
- `tests/unit/business-account/membership.test.ts`
- `tests/integration/business-account-membership.test.ts`
- `tests/unit/convex/inquiries-runtime.test.ts`
- `tests/unit/actions/settings-preferences.test.ts`

**RED:** `owner_token_identifier_is_canonical` fails because owner records and
publication authorization still resolve only `clerkUserId`/subject;
`last_active_business_owner_cannot_be_removed` and
`invitation_is_expiring_single_use_and_business_bound` fail because there is no
team authority model.

**Implement:** optional token-identifier compatibility field/index, exact
server-derived dual-read, bounded idempotent backfill command and closure test.
Historical `ownerId` and `clerkUserId` remain unchanged; caller input never
selects identity. Implement multi-business memberships, role checks, hashed
single-use invitations, ownership transfer, suspension/revocation and last-owner
protection from server-derived identity. Replace single-owner authorization on
the intended owner inquiry/settings paths with business-bound membership roles:
operations/admin/owner may handle enquiries; viewer remains read-only; billing
cannot acquire operations authority merely from its label.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/business/claim.test.ts tests/unit/business/suppression.test.ts tests/integration/durable-claim-route.test.ts tests/unit/business-account/membership.test.ts tests/integration/business-account-membership.test.ts tests/unit/convex/inquiries-runtime.test.ts tests/unit/actions/settings-preferences.test.ts
git diff --check
```

Expected GREEN: token identifier authorizes the same owner, subject-only legacy
rows dual-read during migration, cross-owner access is non-enumerating. Handoff:
`.planning/handoffs/phase-04/4A-02.json`.

**Stop:** global migration requires rewriting owner IDs or any unlisted module.

### Historical 4A-03 — Relationship, profile, services and onboarding application

**Starts from:** parent-integrated 4A-02.

**Owns only:**

- `src/modules/capability-supply/onboarding-application.ts`
- `src/modules/capability-supply/onboarding-projection.ts`
- `src/modules/business-account/internal/relationship.ts`
- `src/modules/business-account/application.ts`
- `src/modules/business-account/profile-application.ts`
- `src/modules/business-account/support.ts`
- `src/modules/business-account/customer-success.ts`
- `src/modules/business-account/commercial.ts`
- `src/modules/business-account/data-export.ts`
- `src/modules/business-account/closure.ts`
- `src/modules/business-account/business-account.functions.ts`
- `src/modules/business/public.ts`
- `src/modules/business/internal/profile.ts`
- `src/modules/catalog/public.ts`
- `src/modules/catalog/internal/schema.ts`
- `src/modules/catalog/owner-profile.ts`
- `src/modules/catalog/owner-services.ts`
- `convex/capabilitySupplyOnboarding.ts`
- `convex/businessAccount.ts`
- `convex/business.ts`
- `convex/catalog.ts`
- `src/modules/security/internal/admin-authority.ts`
- `convex/authz.ts`
- `tests/integration/capability-supply-onboarding-application.test.ts`
- `tests/integration/business-owner-token-identifier.test.ts`
- `tests/integration/business-account-lifecycle.test.ts`
- `tests/integration/business-account-profile-services.test.ts`
- `tests/integration/business-account-support-commercial.test.ts`
- `tests/integration/business-account-export-closure.test.ts`
- `tests/unit/security/admin-authority.test.ts`

**RED:** `draft_publish_failure_creates_no_partial_routeable_supply`,
`relationship_state_does_not_publish_or_route_supply` and
`profile_service_revision_conflict_preserves_current_truth`.

**Implement:** expected-revision draft commands; authenticated owner derivation;
bounded owner reads; complete relationship lifecycle; revision-checked business
profile and zero-to-many service editing/preview/publication; canonical
capability publish orchestration; inactive-on-readiness-failure behavior;
support cases/messages, private notes, assigned tasks and truthful
no-charge/manual/provider-managed commercial context; resumable migration.
Never accept public `ownerId` as authority. Lifecycle
pause/offboarding/closure withdraws future work but preserves references.
Export is bounded, attributable and reference-based. Add explicit admin actions
for relationship/support/commercial transitions; founder commands never borrow
business-member authority.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/integration/capability-supply-onboarding-application.test.ts tests/integration/business-owner-token-identifier.test.ts tests/integration/business-account-lifecycle.test.ts tests/integration/business-account-profile-services.test.ts tests/integration/business-account-support-commercial.test.ts tests/integration/business-account-export-closure.test.ts tests/integration/capability-publication-security.test.ts tests/unit/security/admin-authority.test.ts
git diff --check
```

Expected RED: partial canonical rows survive a failed publish/readiness path.
Expected GREEN: no routeable state and a resumable source-issued blocker.
Handoff: `.planning/handoffs/phase-04/4A-03.json`.

**Stop:** mutation cannot keep the draft/publish boundary truthful; migration
requires rewriting historical identities; owner access becomes enumerable.

### Historical 4A-04 — Account projections, routeable discovery and bounded reads

**Starts from:** parent-integrated 4A-03.

**Owns only:**

- `src/modules/registry/operation-projection.ts`
- `src/modules/registry/internal/operation-search-port.ts`
- `src/modules/registry/internal/schema.ts`
- `convex/registry.ts`
- `src/modules/capability-supply/internal/graph/query-graph.ts`
- `src/modules/capability-supply/internal/eligibility/list.ts`
- `src/modules/business-account/account-summary.ts`
- `src/modules/business-account/activity-projection.ts`
- `src/modules/business-account/portfolio-query.ts`
- `convex/businessAccount.ts`
- `tests/unit/registry/operation-projection.test.ts`
- `tests/integration/routeable-operation-search.test.ts`
- `tests/integration/business-account-dashboard-query.test.ts`
- `tests/integration/business-account-portfolio-query.test.ts`

**RED:** `ten_thousand_unrelated_operations_do_not_increase_page_read_budget`
and `ten_thousand_unrelated_business_accounts_do_not_increase_portfolio_or_dashboard_page_budget`.

**Implement:** removable projection; index
`by_routeabilityStatus_and_readinessValidUntil`; batches of 100 for expiry;
three cursor pages/150 hard scan ceiling; explicit incomplete coverage;
canonical exact revalidation; query counters. Do not modify public catalog
service inventory or create a registry aggregate. Add removable account-summary
and activity projections referencing membership, relationship, catalog,
capability, inquiry, action, support and commercial source records. Portfolio
filters use lifecycle/assignee/health/update indexes; no N+1 hydration.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/registry/operation-projection.test.ts tests/integration/routeable-operation-search.test.ts tests/integration/business-account-dashboard-query.test.ts tests/integration/business-account-portfolio-query.test.ts
npm exec -- vitest run tests/unit/registry/schema.test.ts
git diff --check
```

Expected RED: query calls grow with 10,000 unrelated rows or an underfilled page
claims completeness. Expected GREEN: fixed budget and explicit continuation/
incomplete state. Handoff: `.planning/handoffs/phase-04/4A-04.json`.

**Stop:** query needs a full-network scan; projection is required to reconstruct
canonical supply; public search could authorize execution.

### Historical 4A-05 — Complete Business Account workspace

**Starts from:** parent-integrated 4A-04 after projection DTO freeze.

**Owns only:**

- `src/components/ae/business-account/BusinessAccountDashboard.tsx`
- `src/components/ae/business-account/BusinessProfileEditor.tsx`
- `src/components/ae/business-account/BusinessTeamManager.tsx`
- `src/components/ae/business-account/BusinessServiceManager.tsx`
- `src/components/ae/business-account/BusinessConnectionList.tsx`
- `src/components/ae/business-account/BusinessWorkList.tsx`
- `src/components/ae/business-account/BusinessActivityList.tsx`
- `src/components/ae/business-account/BusinessCommercialSummary.tsx`
- `src/components/ae/business-account/BusinessSupportWorkspace.tsx`
- `src/components/ae/layout/AeOperatorShell.tsx`
- `src/components/ae/layout/AeOperatorSidebar.tsx`
- `src/components/ae/layout/AeOperatorSectionNav.tsx`
- `src/components/ae/layout/AeOperatorCommandMenu.tsx`
- `src/components/ae/supply-onboarding/AeCapabilityList.tsx`
- `src/components/ae/supply-onboarding/AeCapabilitySetupForm.tsx`
- `src/components/ae/supply-onboarding/AeCapabilityReadiness.tsx`
- `src/components/ae/supply-onboarding/AeCapabilityBlockers.tsx`
- `src/routes/_operator/owner.capabilities.tsx`
- `src/routes/_operator/owner.capabilities.new.tsx`
- `src/routes/_operator/owner.capabilities.$publicationRef.tsx`
- `src/routes/_operator/owner.index.tsx`
- `src/routes/_operator/owner.business.tsx`
- `src/routes/_operator/owner.team.tsx`
- `src/routes/_operator/owner.services.tsx`
- `src/routes/_operator/owner.connections.tsx`
- `src/routes/_operator/owner.work.tsx`
- `src/routes/_operator/owner.activity.tsx`
- `src/routes/_operator/owner.commercial.tsx`
- `src/routes/_operator/owner.support.tsx`
- `src/routes/_operator/owner.support.$caseRef.tsx`
- `src/routes/_operator/owner.settings.tsx`
- `src/routes/_operator.tsx`
- `src/lib/operator/navigation.ts`
- `tests/unit/business-account/dashboard-ui.test.tsx`
- `tests/unit/business-account/team-ui.test.tsx`
- `tests/unit/business-account/profile-services-ui.test.tsx`
- `tests/unit/business-account/support-commercial-ui.test.tsx`
- `tests/unit/supply-onboarding/capability-list.test.tsx`
- `tests/unit/supply-onboarding/capability-setup.test.tsx`
- `tests/e2e/supply-onboarding.spec.ts`
- `tests/e2e/business-account-management.spec.ts`

**RED:** `business_account_is_not_a_listing_or_capability_draft`,
`owner_navigation_remains_usable_across_eleven_account_destinations`,
`dead_navigation_is_not_mature_product` and
`published_profile_with_failed_readiness_is_not_rendered_as_live`.

**Implement:** the complete owner IA and mature state matrix from
`04A-BUSINESS-ACCOUNT-MANAGEMENT.md`, plus source-driven operation setup.
Dashboard attention/work comes from the account summary; profile, team,
services, connections, work, activity, commercial and support stay distinct.
Every intended navigation destination has a source-backed route/readback; hide
any unsupported legacy destination. Include mock labels, error focus, keyboard,
direct-URL resume and narrow-screen behavior. Missing source fields are a stop;
client inference is forbidden.

**Stop:** UI needs to parse contracts/provider responses, hold secrets, decide
routeability/membership/commercial truth, or substitute a dead placeholder for
an intended destination.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/business-account/dashboard-ui.test.tsx tests/unit/business-account/team-ui.test.tsx tests/unit/business-account/profile-services-ui.test.tsx tests/unit/business-account/support-commercial-ui.test.tsx tests/unit/supply-onboarding/capability-list.test.tsx tests/unit/supply-onboarding/capability-setup.test.tsx tests/unit/operator-navigation.test.ts
npm exec -- playwright test tests/e2e/business-account-management.spec.ts tests/e2e/supply-onboarding.spec.ts
git diff --check
```

Expected GREEN: a direct-URL, reload-safe owner can complete the ten account
scenarios, every intended navigation item resolves, and all canonical states
work at keyboard/320px with persistent fixture labels. Handoff:
`.planning/handoffs/phase-04/4A-05.json`.

### Historical 4A-06 — Credential-mode transport integration

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

### Historical 4A-07 — Founder/customer-success console

**Starts from:** parent-integrated 4A-06.

**Owns only:**

- `src/components/ae/business-account/admin/BusinessPortfolio.tsx`
- `src/components/ae/business-account/admin/BusinessAccountOverview.tsx`
- `src/components/ae/business-account/admin/BusinessOnboardingWorkspace.tsx`
- `src/components/ae/business-account/admin/BusinessOperationsInspector.tsx`
- `src/components/ae/business-account/admin/BusinessSupportManager.tsx`
- `src/components/ae/business-account/admin/BusinessCommercialManager.tsx`
- `src/components/ae/business-account/admin/BusinessAccountAudit.tsx`
- `src/routes/_operator/admin.businesses.tsx`
- `src/routes/_operator/admin.businesses.$businessId.tsx`
- `src/routes/_operator/admin.businesses.$businessId.onboarding.tsx`
- `src/routes/_operator/admin.businesses.$businessId.operations.tsx`
- `src/routes/_operator/admin.businesses.$businessId.support.tsx`
- `src/routes/_operator/admin.businesses.$businessId.commercial.tsx`
- `src/routes/_operator/admin.businesses.$businessId.activity.tsx`
- `src/lib/operator/navigation.ts`
- `tests/unit/business-account/admin-portfolio-ui.test.tsx`
- `tests/unit/business-account/admin-account-ui.test.tsx`
- `tests/e2e/business-account-founder-console.spec.ts`

**RED:** `founder_assist_is_not_owner_impersonation` and
`portfolio_page_budget_is_constant_at_ten_thousand_accounts`.

**Implement:** the founder IA in `04A-BUSINESS-ACCOUNT-MANAGEMENT.md` using
explicit admin membership and source-issued commands/readbacks. Portfolio
supports indexed lifecycle/assignee/health filters and cursor pagination.
Detail exposes people, profile, supply, work, onboarding tasks, support,
commercial context and source-linked activity without copying their truth.
Private notes and customer-visible support are visibly and structurally
separate. Lifecycle reduction requires reason/evidence.

**RED/GREEN command:**

```text
npm exec -- vitest run tests/unit/business-account/admin-portfolio-ui.test.tsx tests/unit/business-account/admin-account-ui.test.tsx tests/integration/business-account-portfolio-query.test.ts tests/integration/business-account-lifecycle.test.ts
npm exec -- playwright test tests/e2e/business-account-founder-console.spec.ts
git diff --check
```

Expected GREEN: the founder can complete onboarding/support/commercial/
offboarding scenarios without database edits or borrowed owner authority, and
the 10,000-account fixture keeps the declared page read budget. Handoff:
`.planning/handoffs/phase-04/4A-07.json`.

**Stop:** any command requires owner impersonation, raw credential handling,
unbounded portfolio hydration, or UI-authored business/readiness truth.

### Historical parent cut 4A-R — Generate and verify route reachability

**Starts from:** parent-integrated 4A-07. This is not child work.

The parent runs the repository's existing route generator and owns only
`src/routeTree.gen.ts` for this cut. It verifies imports and route IDs for every
route in the Business Account and founder IA, including:

- `/owner`;
- `/owner/business`;
- `/owner/team`;
- `/owner/services`;
- `/owner/capabilities`;
- `/owner/capabilities/new`;
- `/owner/capabilities/$publicationRef`;
- `/owner/connections`;
- `/owner/work`;
- `/owner/activity`;
- `/owner/commercial`;
- `/owner/support` and `/owner/support/$caseRef`;
- `/admin/businesses` and every planned `/admin/businesses/$businessId/**`
  child route.

The parent then runs the focused Business Account, founder-console and
supply-onboarding route tests plus typecheck.
Children remain forbidden from editing generated route output manually. If the
generator changes any other generated artifact or an unrelated route, stop and
classify the diff before integration. Handoff:
`.planning/handoffs/phase-04/4A-R.json`.

## Parcel 4B-01 — Reference RFQ contract and three mock adapters

**Starts from:** parent-integrated 4A-A from `04A-INSTANCE-CONTRACTS.md`.

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
