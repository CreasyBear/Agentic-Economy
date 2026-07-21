# Phase 4A active child contracts

This file is the sole dispatch authority for Phase 4A. It inherits the parent
preflight, common child prompt, forbidden paths and handoff schema from
`04-INSTANCE-CONTRACTS.md`. Earlier narrow 4A parcels in that file are retained
only as superseded planning history and must not be dispatched.

Every parcel starts from the parent-integrated predecessor. Every GREEN is
limited to the named parcel. Only 4A-A may claim Phase 4A complete.

Exact dependency order:

```text
01 → 02 → 02B → 02C → 03 → 04 → 05 → 06 → 07A → 07B → 08
   → 09 → 10A → 10B → 11 → 12A → 12B → parent 4A-R → 4A-A
```

## 4A-01 — Domain, schema and bounded-query contract

**Owns only:**

- `src/modules/business-account/public.ts`
- `src/modules/business-account/internal/schema.ts`
- `src/modules/business-account/internal/validators.ts`
- `src/modules/capability-supply/onboarding-contract.ts`
- `src/modules/capability-supply/internal/credential-custody.ts`
- `src/modules/capability-supply/internal/environment-credential-custody.ts`
- `src/modules/security/public.ts`
- `convex/schema.ts`
- `tests/unit/business-account/contracts.test.ts`
- `tests/unit/business-account/schema.test.ts`
- `tests/imports/business-account-boundaries.test.ts`

**RED:** `business_account_is_not_business_identity_membership_or_routeability`
and `portfolio_schema_has_no_unbounded_intended_read`.

Implement ADR-024 contracts and tables. Include the exact summary projection
table with fields `businessId`, relationship revision/status, assigned admin
token identifier, health, attention reason codes, bounded source counts and
`updatedAt`. Indexes are `by_businessId`,
`by_relationshipStatus_and_updatedAt`,
`by_assignedAdminTokenIdentifier_and_relationshipStatus_and_updatedAt`, and
`by_health_and_updatedAt`. Portfolio performs one query/read of at most 51 rows
to return 50 plus continuation. Dashboard performs at most six queries: one
summary plus five section queries, each reading at most 11 rows to return 10
plus continuation.

```text
npm exec -- vitest run tests/unit/business-account/contracts.test.ts tests/unit/business-account/schema.test.ts tests/imports/business-account-boundaries.test.ts
git diff --check
```

Stop if `businesses`, Customer Request or capability supply would be replaced.
Handoff: `.planning/handoffs/phase-04/4A-01.json`.

## 4A-02 — Identity, team and membership authority

**Owns only:**

- `src/modules/business/public.ts`
- `src/modules/business/internal/schema.ts`
- `src/modules/business/internal/claim.ts`
- `src/modules/business/internal/visibility.ts`
- `src/modules/business-account/internal/membership.ts`
- `src/modules/business-account/internal/invitations.ts`
- `src/modules/business-account/authorization.ts`
- `convex/business.ts`
- `convex/businessAccount.ts`
- `tests/unit/business-account/membership.test.ts`
- `tests/integration/business-account-membership.test.ts`
- `tests/integration/durable-claim-route.test.ts`

**RED:** `last_active_business_owner_cannot_be_removed` and
`invitation_is_expiring_single_use_and_business_bound`.

Implement token-identifier authority, multi-business membership, five roles,
hashed invitations, transfer, suspension/revocation and non-enumerating reads.

```text
npm exec -- vitest run tests/unit/business-account/membership.test.ts tests/integration/business-account-membership.test.ts tests/integration/durable-claim-route.test.ts
git diff --check
```

Stop if caller input selects identity or a last-owner transition can succeed.
Handoff: `.planning/handoffs/phase-04/4A-02.json`.

## 4A-02B — Membership-bound enquiries

**Owns only:**

- `src/modules/inquiries/inquiry.functions.ts`
- `src/modules/inquiries/public.ts`
- `convex/inquiries.ts`
- `src/routes/_operator/owner.inquiries.tsx`
- `src/routes/_operator/owner.inquiries.$threadId.tsx`
- `tests/unit/convex/inquiries-runtime.test.ts`
- `tests/unit/inquiries/customer-access-security.test.ts`
- `tests/integration/business-account-inquiries.test.ts`
- `tests/e2e/business-account-inquiries.spec.ts`

**RED:** `membership_role_and_business_bind_every_inquiry_command`.

Replace single-owner lookup on inbox/thread/reply/close paths with
business-bound membership authority. Owner/admin/operations may read and
respond; viewer is read-only; billing has no operations authority. Prove
multi-business isolation, non-enumerating denial and direct-URL restoration.

```text
npm exec -- vitest run tests/unit/convex/inquiries-runtime.test.ts tests/unit/inquiries/customer-access-security.test.ts tests/integration/business-account-inquiries.test.ts
npm exec -- playwright test tests/e2e/business-account-inquiries.spec.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-02B.json`.

## 4A-02C — Membership-bound preferences

**Owns only:**

- `src/modules/settings/settings.functions.ts`
- `src/modules/settings/public.ts`
- `src/modules/settings/internal/schema.ts`
- `convex/settings.ts`
- `tests/unit/actions/settings-preferences.test.ts`
- `tests/integration/business-account-preferences.test.ts`

**RED:** `business_preferences_are_scoped_to_membership_and_business`.

Replace single-owner preference lookup with business/member scope. Preserve
personal security/session management in Clerk. Role enforcement and
multi-business isolation are server-owned.

```text
npm exec -- vitest run tests/unit/actions/settings-preferences.test.ts tests/integration/business-account-preferences.test.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-02C.json`.

## 4A-03 — Relationship lifecycle and reconstructable offboarding

**Owns only:**

- `src/modules/business-account/internal/relationship.ts`
- `src/modules/business-account/application.ts`
- `src/modules/business-account/closure.ts`
- `src/modules/business-account/data-export.ts`
- `src/modules/business-account/business-account.functions.ts`
- `src/modules/capability-supply/internal/publication/withdraw.ts`
- `src/modules/security/internal/admin-authority.ts`
- `convex/businessAccount.ts`
- `convex/authz.ts`
- `tests/integration/business-account-lifecycle.test.ts`
- `tests/integration/business-account-export-closure.test.ts`
- `tests/unit/security/admin-authority.test.ts`

**RED:** `closure_waits_for_every_bounded_future_work_withdrawal`.

Use the existing capability-publication withdrawal command in indexed batches
of 50. Persist an offboarding run with cursor, attempted/succeeded/failed refs,
revision and `pending | withdrawing | attention_required | ready_to_close |
closed`. A failed batch resumes from durable progress. Membership access closes
only after routeable operations and pending invitations are withdrawn; retained
history and bounded export remain readable.

```text
npm exec -- vitest run tests/integration/business-account-lifecycle.test.ts tests/integration/business-account-export-closure.test.ts tests/unit/security/admin-authority.test.ts
git diff --check
```

Stop on full-table enumeration, destructive deletion or owner impersonation.
Handoff: `.planning/handoffs/phase-04/4A-03.json`.

## 4A-04 — Business profile and multiple services

**Owns only:**

- `src/modules/business-account/profile-application.ts`
- `src/modules/business/public.ts`
- `src/modules/business/internal/profile.ts`
- `src/modules/catalog/public.ts`
- `src/modules/catalog/internal/schema.ts`
- `src/modules/catalog/owner-profile.ts`
- `src/modules/catalog/owner-services.ts`
- `convex/business.ts`
- `convex/catalog.ts`
- `tests/integration/business-account-profile-services.test.ts`
- `tests/unit/catalog/owner-public-flow.test.ts`

**RED:** `profile_service_revision_conflict_preserves_current_truth`.

Implement revision-checked profile drafts, locations, contacts, hours, photos,
preview/publication and zero-to-many ordered services. Saved/published/review/
conflict states remain distinct and none creates routeability.

```text
npm exec -- vitest run tests/integration/business-account-profile-services.test.ts tests/unit/catalog/owner-public-flow.test.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-04.json`.

## 4A-05 — Support, customer-success and commercial context

**Owns only:**

- `src/modules/business-account/support.ts`
- `src/modules/business-account/customer-success.ts`
- `src/modules/business-account/commercial.ts`
- `src/modules/business-account/business-account.functions.ts`
- `convex/businessAccount.ts`
- `tests/integration/business-account-support-commercial.test.ts`
- `tests/unit/business-account/support-visibility.test.ts`

**RED:** `private_note_never_enters_customer_visible_support` and
`commercial_context_never_manufactures_payment_truth`.

Implement assigned/due onboarding tasks, private notes, bounded support cases
and messages, plus no-charge/manual/provider-managed commercial state. Every
transition is revisioned and attributable.

```text
npm exec -- vitest run tests/integration/business-account-support-commercial.test.ts tests/unit/business-account/support-visibility.test.ts
git diff --check
```

Stop if invoices, settlement or paid state would be inferred. Handoff:
`.planning/handoffs/phase-04/4A-05.json`.

## 4A-06 — Capability onboarding and canonical publication

**Owns only:**

- `src/modules/capability-supply/onboarding-application.ts`
- `src/modules/capability-supply/onboarding-projection.ts`
- `src/modules/capability-supply/internal/convex-schema.ts`
- `src/modules/business-account/authorization.ts`
- `convex/capabilitySupplyOnboarding.ts`
- `tests/unit/capability-supply/onboarding-contract.test.ts`
- `tests/integration/capability-supply-onboarding.test.ts`
- `tests/integration/capability-supply-onboarding-application.test.ts`
- `tests/integration/capability-publication-security.test.ts`

**RED:** `draft_publish_failure_creates_no_partial_routeable_supply`.

Implement resumable, revision-checked zero-to-many operation drafts over the
existing contract/offering/binding/publication graph. Use business membership
authority. Reject raw credentials. Partial failure remains inactive and
inspectable.

```text
npm exec -- vitest run tests/unit/capability-supply/onboarding-contract.test.ts tests/integration/capability-supply-onboarding.test.ts tests/integration/capability-supply-onboarding-application.test.ts tests/integration/capability-publication-security.test.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-06.json`.

## 4A-07A — Credential mode registration and admission

**Owns only:**

- `src/modules/capability-supply/public.ts`
- `src/modules/capability-supply/published-operation.ts`
- `src/modules/capability-supply/internal/binding/write.ts`
- `src/modules/capability-supply/internal/binding/registration.ts`
- `src/modules/capability-supply/internal/publication/draft.ts`
- `src/modules/capability-supply/internal/operation-ledger/commands.ts`
- `tests/unit/capability-supply/binding-helpers.test.ts`
- `tests/integration/capability-supply-credential-mode.test.ts`

**RED:** `credential_mode_substitution_changes_binding_and_admission_identity`.

Persist and reconstruct `none | managed_ref` through binding registration,
publication and every live admission call. Mode substitution changes binding
and admission identity. No caller may select or downgrade it at execution.

```text
npm exec -- vitest run tests/unit/capability-supply/binding-helpers.test.ts tests/integration/capability-supply-credential-mode.test.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-07A.json`.

## 4A-07B — Credential-aware probe and execution runtime

**Owns only:**

- `src/modules/capability-supply/route-transport-runtime.ts`
- `src/modules/capability-supply/internal/transport-adapters.ts`
- `src/modules/capability-supply/internal/readiness-probe.ts`
- `src/modules/capability-supply/internal/graph/read-probe-target.ts`
- `src/modules/capability-supply/internal/graph/probe-digest.ts`
- `convex/capabilitySupplyReadiness.ts`
- `tests/unit/capability-supply/transport-adapters.test.ts`
- `tests/unit/capability-supply/readiness-probe.test.ts`
- `tests/unit/capability-supply/graph-probe-thinness.test.ts`
- `tests/integration/capability-supply-credential-runtime.test.ts`

**RED:** `credential_mode_substitution_changes_probe_identity_and_invalidates_readiness`.

`none` admits, probes and executes with zero resolver calls and no Authorization
header. `managed_ref` fails closed until exact custody resolution. Mode is in
probe target/digest and changing it invalidates prior readiness.

```text
npm exec -- vitest run tests/unit/capability-supply/transport-adapters.test.ts tests/unit/capability-supply/readiness-probe.test.ts tests/unit/capability-supply/graph-probe-thinness.test.ts tests/integration/capability-supply-credential-runtime.test.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-07B.json`.

## 4A-08 — Account, activity and routeable-search projections

**Owns only:**

- `src/modules/business-account/account-summary.ts`
- `src/modules/business-account/activity-projection.ts`
- `src/modules/business-account/portfolio-query.ts`
- `src/modules/registry/operation-projection.ts`
- `src/modules/registry/internal/operation-search-port.ts`
- `src/modules/registry/internal/schema.ts`
- `src/modules/capability-supply/internal/graph/query-graph.ts`
- `src/modules/capability-supply/internal/eligibility/list.ts`
- `convex/businessAccount.ts`
- `convex/registry.ts`
- `tests/integration/business-account-dashboard-query.test.ts`
- `tests/integration/business-account-portfolio-query.test.ts`
- `tests/integration/routeable-operation-search.test.ts`

**RED:** `ten_thousand_unrelated_accounts_or_operations_do_not_change_page_budget`.

Implement removable source-reference projections and exact query budgets from
4A-01. Routeable search scans at most 150 candidates and returns at most 50
with explicit incomplete coverage.

```text
npm exec -- vitest run tests/integration/business-account-dashboard-query.test.ts tests/integration/business-account-portfolio-query.test.ts tests/integration/routeable-operation-search.test.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-08.json`.

## 4A-09 — Owner shell, navigation and dashboard

**Owns only:**

- `src/components/ae/layout/AeOperatorShell.tsx`
- `src/components/ae/layout/AeOperatorSidebar.tsx`
- `src/components/ae/layout/AeOperatorSectionNav.tsx`
- `src/components/ae/layout/AeOperatorCommandMenu.tsx`
- `src/components/ae/business-account/BusinessAccountDashboard.tsx`
- `src/routes/_operator.tsx`
- `src/routes/_operator/owner.index.tsx`
- `src/lib/operator/navigation.ts`
- `tests/unit/business-account/dashboard-ui.test.tsx`
- `tests/unit/operator-navigation.test.ts`

**RED:** `owner_navigation_remains_usable_across_eleven_account_destinations`.

Implement source-driven attention/work dashboard and responsive persistent
account navigation. Remove/hide every unsupported destination.

```text
npm exec -- vitest run tests/unit/business-account/dashboard-ui.test.tsx tests/unit/operator-navigation.test.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-09.json`.

## 4A-10A — Owner profile, team and service surfaces

**Owns only:**

- `src/components/ae/business-account/BusinessProfileEditor.tsx`
- `src/components/ae/business-account/BusinessTeamManager.tsx`
- `src/components/ae/business-account/BusinessServiceManager.tsx`
- `src/routes/_operator/owner.business.tsx`
- `src/routes/_operator/owner.team.tsx`
- `src/routes/_operator/owner.services.tsx`
- `tests/unit/business-account/profile-team-services-ui.test.tsx`
- `tests/e2e/business-account-profile-team-services.spec.ts`

**RED:** `profile_team_and_service_routes_resume_independently_from_source`.

Implement profile, membership and multiple-service views with complete state
matrices, role-aware source commands, keyboard/320px/400% behavior and direct
URL restoration.

```text
npm exec -- vitest run tests/unit/business-account/profile-team-services-ui.test.tsx
npm exec -- playwright test tests/e2e/business-account-profile-team-services.spec.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-10A.json`.

## 4A-10B — Owner work, activity, support and commercial surfaces

**Owns only:**

- `src/components/ae/business-account/BusinessWorkList.tsx`
- `src/components/ae/business-account/BusinessActivityList.tsx`
- `src/components/ae/business-account/BusinessCommercialSummary.tsx`
- `src/components/ae/business-account/BusinessSupportWorkspace.tsx`
- `src/routes/_operator/owner.work.tsx`
- `src/routes/_operator/owner.activity.tsx`
- `src/routes/_operator/owner.commercial.tsx`
- `src/routes/_operator/owner.support.tsx`
- `src/routes/_operator/owner.support.$caseRef.tsx`
- `src/routes/_operator/owner.settings.tsx`
- `tests/unit/business-account/work-support-commercial-ui.test.tsx`
- `tests/e2e/business-account-work-support.spec.ts`

**RED:** `private_notes_payment_claims_and_browser_state_never_enter_owner_readback`.

Implement source-referenced work/activity, customer-visible support, truthful
commercial state and scoped preferences. Private notes never render. No-charge
is complete, not an empty state. Every direct route reloads durably.

```text
npm exec -- vitest run tests/unit/business-account/work-support-commercial-ui.test.tsx
npm exec -- playwright test tests/e2e/business-account-work-support.spec.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-10B.json`.

## 4A-11 — Owner operations and connections surfaces

**Owns only:**

- `src/components/ae/business-account/BusinessConnectionList.tsx`
- `src/components/ae/supply-onboarding/AeCapabilityList.tsx`
- `src/components/ae/supply-onboarding/AeCapabilitySetupForm.tsx`
- `src/components/ae/supply-onboarding/AeCapabilityReadiness.tsx`
- `src/components/ae/supply-onboarding/AeCapabilityBlockers.tsx`
- `src/routes/_operator/owner.capabilities.tsx`
- `src/routes/_operator/owner.capabilities.new.tsx`
- `src/routes/_operator/owner.capabilities.$publicationRef.tsx`
- `src/routes/_operator/owner.connections.tsx`
- `tests/unit/supply-onboarding/capability-list.test.tsx`
- `tests/unit/supply-onboarding/capability-setup.test.tsx`
- `tests/e2e/supply-onboarding.spec.ts`

**RED:** `published_profile_with_failed_readiness_is_not_rendered_as_live`.

Implement zero-to-many operation and connection management after transport and
projection interfaces are frozen. No secret entry, client routeability or raw
contract/provider parsing.

```text
npm exec -- vitest run tests/unit/supply-onboarding/capability-list.test.tsx tests/unit/supply-onboarding/capability-setup.test.tsx
npm exec -- playwright test tests/e2e/supply-onboarding.spec.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-11.json`.

## 4A-12A — Founder portfolio, account overview and onboarding

**Owns only:**

- `src/components/ae/business-account/admin/BusinessPortfolio.tsx`
- `src/components/ae/business-account/admin/BusinessAccountOverview.tsx`
- `src/components/ae/business-account/admin/BusinessOnboardingWorkspace.tsx`
- `src/routes/_operator/admin.businesses.tsx`
- `src/routes/_operator/admin.businesses.$businessId.tsx`
- `src/routes/_operator/admin.businesses.$businessId.onboarding.tsx`
- `src/lib/operator/navigation.ts`
- `tests/unit/business-account/admin-portfolio-overview-ui.test.tsx`
- `tests/e2e/business-account-founder-portfolio.spec.ts`

**RED:** `portfolio_filters_and_onboarding_actions_are_bounded_and_admin_attributable`.

Implement indexed portfolio filters, account overview and onboarding tasks with
explicit admin actor and no owner impersonation.

```text
npm exec -- vitest run tests/unit/business-account/admin-portfolio-overview-ui.test.tsx tests/integration/business-account-portfolio-query.test.ts
npm exec -- playwright test tests/e2e/business-account-founder-portfolio.spec.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-12A.json`.

## 4A-12B — Founder operations, support, commercial and activity

**Owns only:**

- `src/components/ae/business-account/admin/BusinessOperationsInspector.tsx`
- `src/components/ae/business-account/admin/BusinessSupportManager.tsx`
- `src/components/ae/business-account/admin/BusinessCommercialManager.tsx`
- `src/components/ae/business-account/admin/BusinessAccountAudit.tsx`
- `src/routes/_operator/admin.businesses.$businessId.operations.tsx`
- `src/routes/_operator/admin.businesses.$businessId.support.tsx`
- `src/routes/_operator/admin.businesses.$businessId.commercial.tsx`
- `src/routes/_operator/admin.businesses.$businessId.activity.tsx`
- `tests/unit/business-account/admin-operations-support-ui.test.tsx`
- `tests/e2e/business-account-founder-operations.spec.ts`

**RED:** `founder_operations_never_impersonate_or_rewrite_source_truth`.

Implement operation inspection, customer-visible support, private-note
separation, commercial context and source-linked activity. Every mutation names
the actual admin actor and source command.

```text
npm exec -- vitest run tests/unit/business-account/admin-operations-support-ui.test.tsx tests/integration/business-account-support-commercial.test.ts
npm exec -- playwright test tests/e2e/business-account-founder-operations.spec.ts
git diff --check
```

Handoff: `.planning/handoffs/phase-04/4A-12B.json`.

## Parent cut 4A-R — Route generation

After 4A-12B, the parent alone runs the existing route generator, owns only
`src/routeTree.gen.ts`, verifies every route in the 4A IA, then runs focused
route tests and typecheck. Handoff: `.planning/handoffs/phase-04/4A-R.json`.

## Parcel 4A-A — Full Business Account acceptance

**Starts from:** parent-integrated 4A-R.

**Owns only:**

- `tests/e2e/business-account-acceptance.spec.ts`
- `tests/eval/business-account-comprehension.test.ts`
- `tools/evidence/business-account/generate.ts`
- `tools/evidence/business-account/verify.ts`

**RED:** `capability_wizard_alone_cannot_close_phase_4a`.

Run all ten completion scenarios in 04A-BUSINESS-ACCOUNT-MANAGEMENT, plus exact
query budgets, direct-URL cold restoration, membership hostile substitutions,
partial offboarding recovery and accessibility. Generate/verify a labelled
clean-revision sandbox packet. This is the only parcel permitted to claim 4A
complete.

```text
npm exec -- playwright test tests/e2e/business-account-acceptance.spec.ts
npm exec -- vitest run tests/eval/business-account-comprehension.test.ts
npm run typecheck
npm run test:imports
git diff --check
```

Evidence ceiling: source, focused fixtures and labelled local/hosted sandbox.
No adoption, revenue, provider-quality or production claim. Handoff:
`.planning/handoffs/phase-04/4A-A.json`.
