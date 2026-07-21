# Phase 4 active implementation contracts

**Status:** Accepted parcel-level dispatch authority; implementation pending
**Decisions:** D-011, D-012
**Accepted:** 2026-07-21
**Mapped source:** `63a451f43edea453d0a1a8d8502504433acf76fb`

This file owns exact parcel paths, falsifiers and focused verification under
the programme admission/custody authority in `04-INSTANCE-CONTRACTS.md`. No
child receives an open-ended Phase 4 prompt.

The parent must first materialize these accepted documents onto a clean source
branch descended from the mapped Phase 3D revision and pin that new exact
revision/tree. This planning branch is not an executable implementation base.

## Dependency order

```text
WP1 → WP2.1 → WP2.2 → WP2.3 → WP3 → WP4.1 → WP4.2 → WP5
       WP1 + WP5 → WP6
       WP4.2 + WP5 → WP7.1 → WP7.2 → WP8
       WP4.2 + WP7.1 → WP2.4
       WP1 + WP2.4 + WP5 → WP9
       WP3 + WP4.1 + WP6 → WP10
       WP2.4 + WP5 → WP11
       WP2.4 + WP6–WP11 → WP12
```

WP1 through WP4.2 are strictly serial because they share schema, account,
Commercial, Usage and supply-ingress files. WP2.4 is a late source parcel.
Every writer starts from its parent-integrated predecessor.
Parallel children are read-only audits only.

## Common child contract

Every dispatch records exact base/tree and content-bound dirty manifest. The
child is not alone, preserves inherited work and stops on custody drift.

Read completely: nearest AGENTS.md, PRODUCT.md, DESIGN.md, ADR-024, ADR-025, the Business
Account contract, UI-SPEC, Phase 4 plan, this contract, every live source named
by the parcel, and generated Convex guidance before an authorized Convex edit.

Always forbidden: unowned paths; planning/product/design authority; generated
route tree; staging, reset, cleanup, broad restore, deployment, provider/payment
action, credentials and external systems; unrelated repairs; treating
navigation, projections, transport or fixtures as business truth.

Before writing, inspect scripts and command effects. One implementation pass
and at most one focused correction are allowed. Contract change, wider
ownership, inherited conflict, external action or repeated falsifier failure
returns to the parent.

Every child returns handoff JSON in its response. The parent alone materializes
`.planning/handoffs/phase-04/WP<n>.json`. Children do not integrate, stage,
commit, publish, deploy or claim Phase completion.

## WP1 — Membership, responsibilities and Ownership

**Depends on:** accepted documentation.

**Owns exactly:** `src/modules/business-account/public.ts`,
`src/modules/business-account/internal/schema.ts`,
`src/modules/business-account/internal/membership.ts`,
`src/modules/business-account/internal/invitations.ts`,
`src/modules/business-account/authorization.ts`,
`src/modules/business/internal/schema.ts`, `convex/businessAccount.ts`,
membership/responsibility fragments in `convex/schema.ts`,
`tests/unit/business-account/contracts.test.ts` and
`tests/integration/business-account-membership.test.ts`.

**RED:** `all_responsibilities_do_not_create_ownership` and
`last_active_owner_cannot_be_removed_by_preset_substitution` and
`human_and_agent_resolve_the_same_account_or_refuse`.

Implement membership, invitation, additive grants, preset expansion, effective
authority, accepted transfer and one AE-owned account principal resolver for
human sessions and scoped agent credentials. Verify multi-business scope,
replay/expiry, custom unions, suspension, last-owner refusal, guessed business,
forged principal and cross-account API key.

**Claim ceiling:** source and fixtures. **Stop:** identity replacement, browser
authority or emergency founder recovery requirement.

## WP2 — Relationship, Commercial, Usage and late lifecycle

**Depends on:** parent-integrated WP1.

Dispatch WP2 as four serial children with no overlapping writer:

- **WP2.1:** relationship, onboarding and customer/private support owners.
- **WP2.2:** new Commercial contracts, schema and Convex adapter. Business
  Account may store only references.
- **WP2.3:** new Usage meter/event/reservation/summary contracts, schema and
  Convex adapter.
- **WP2.4:** pause, withdrawal, export, offboarding and closure, starting only
  after parent-integrated WP4.2 and WP7.1.

**RED:** `commercial_label_cannot_grant_work_or_manufacture_operation_payment`,
`duplicate_usage_once_and_last_unit_once`,
`usage_substitutions_cannot_change_quota` and
`closure_waits_for_every_bounded_withdrawal`.

Implement the ADR-025 separation, closed meter
`routeable_operation_start:v1`, bounded rebuild, lifecycle, tasks, private
notes, customer cases, export and durable withdrawal. Verify privacy,
duplicate/late/correction/conflict, concurrent reservation, restart, retained
history and absence of fake financial truth.

**Claim ceiling:** source and fixtures. **Stop:** deletion, impersonation,
unbounded scan, raw payment/secret custody, provider billing or payouts.

## WP3 — Seed offering and shared availability boundary

**Depends on:** parent-integrated WP2.3.

**Owns exactly:** catalog profile/service modules; business-account profile
application; the paid-information seed operation/domain owner, including its
durable result and reconciliation evidence; only the narrow
shared availability projection under `src/modules/availability/public.ts`;
matching schema/Convex fragments and appointment/dispatch substitution fixtures;
`tests/integration/business-account-profile-services.test.ts` and
`tests/unit/availability/horizontal-contract.test.ts`.

**RED:** `vertical_fields_cannot_enter_shared_availability`.

Implement revisioned services/publication, one seed domain policy and narrow
shared disposition. Verify publish is not availability; stale observation;
appointment and dispatch substitutions do not add slots, zone/capacity or
payment fields to shared contracts.

**Claim ceiling:** source/schema/fixtures. **Stop:** universal calendar,
universal provider lifecycle or external provider action.

## WP4 — Integrations, readiness and reachable operation

**Depends on:** parent-integrated WP3.

Dispatch WP4 as two serial children. **WP4.1** owns
`src/modules/business-account/integrations.ts`; capability onboarding,
binding/readiness/publication and owned internal schema;
`convex/capabilitySupplyOnboarding.ts`,
`convex/capabilitySupplyReadiness.ts`; Integration relation schema fragments;
`tests/integration/business-account-integrations.test.ts` and
`capability-supply-onboarding.test.ts`. **WP4.2** owns the seed registered
action, action registry entry, common account semantic projection, human/agent
server adapters and routes, Usage admission, Action Invocation application
composition and source-created business-affinity Work reference.

**RED:** `integration_offering_relations_are_many_to_many_without_duplicated_ownership`,
`stale_readiness_is_not_available`,
`registration_is_not_reachability` and
`substituted_account_material_creates_no_attempt_usage_or_work`.

Implement business summaries, exact binding/readiness/publication, offering
references and protected diagnostics; then one reachable approve-each path and
the one admitted one-unit bounded-mandate fixture through unchanged Action
Invocation. Verify
human/agent parity, cross-account refusal, replay, exhaustion, material
widening, one attempt/Usage/Work identity and no evaluator-host dependency.

**Claim ceiling:** source and labelled adapters. **Stop:** raw secrets,
external endpoint mutation or provider calls.

## WP5 — Bounded projections and attention

**Depends on:** parent-integrated WP2.3, WP4.2 and the programme interface-freeze gate.

**Owns exactly:** account semantic, account-summary, work-projection,
Commercial/Usage projection, activity-projection, attention and portfolio-query
modules under `src/modules/business-account/`;
projection fragments in `convex/schema.ts`; `convex/businessAccount.ts`; and
dashboard/work/portfolio query integration tests.

**RED:** `ten_thousand_unrelated_records_do_not_change_page_budget` and
`projection_deletion_changes_no_source_truth`.

Implement source-reference summaries, cap-and-one pages, stable attention
identity and incomplete/stale disposition. Verify reconstruction, dedupe, no
N+1 and no projection-owned authority/success.

**Claim ceiling:** source/query fixtures. **Stop:** unbounded read or source
copying.

## WP6 — Shell, Home and compatibility redirects

**Depends on:** WP1 and WP5.

**Owns exactly:** operator shell/sidebar; Business Account dashboard/switcher;
`src/lib/operator/navigation.ts` and `legacy-owner-redirect.ts`; operator
layout, business index/Home and existing owner compatibility route files;
`tests/unit/operator-navigation.test.ts` and
`tests/e2e/business-account-shell.spec.ts`.

**RED:** `guessed_business_never_enters_shell` and
`owner_redirect_never_uses_browser_state_as_authority`.

Implement six-item shell, persistent business, ranked Home, role-aware shortcut
to canonical Integrations and exact redirects. Verify zero/one/many membership,
direct reload, phantom destinations absent and narrow/keyboard behavior.

**Claim ceiling:** source/component/browser fixtures. **Stop:** before route
generation; parent owns generated route tree.

## WP7 — Work and scoped-agent operating surface

**Depends on:** WP4.2 and WP5.

Dispatch serially. **WP7.1** owns exact Work rehydration and the human list/
detail surface. **WP7.2** starts from integrated WP7.1 and owns bounded scoped-
agent account/Work reads plus closed source-issued Work command routes. Neither
adapter owns result, authority or continuation truth.

**WP7.1 owns exactly:** `src/modules/business-account/work.ts`; Business Work
list/detail components and routes; Work UI, detail integration and browser
tests.

**WP7.2 owns exactly:** the scoped-agent account adapter; versioned account,
bounded Work list/detail and closed Work-command routes; agent-surface and
human/agent parity integration tests.

**RED:** `possible_release_exposes_reconcile_only`,
`work_projection_cannot_declare_domain_success`,
`cross_account_agent_cannot_enumerate_work` and
`semantic_digest_is_not_agent_authority`.

Implement list references and exact dispatch to Action Invocation/domain
owners. Verify paid information, appointment and dispatch, reload, stale
generation, refusal, uncertainty and source-issued commands.

**Claim ceiling:** source/fixtures. **Stop:** universal result lifecycle or
real external effect.

## WP8 — Inbox, Conversation and Work links

**Depends on:** WP1 and WP7.2.

**Owns exactly:** inquiry public/functions and `convex/inquiries.ts`; canonical
business Inbox/conversation routes; owner compatibility inquiry routes;
business-account inquiry integration/browser tests.

**RED:** `message_text_alone_never_creates_work` and
`uncertain_delivery_has_no_blind_resend`.

Implement membership-bound cursor Inbox, Conversation and explicit Work
references. Verify isolation, unread/needs-reply, draft conflict, uncertainty
and independent Work/Inbox completion.

**Claim ceiling:** source/inquiry fixtures. **Stop:** copied state or
classifier-owned command.

## WP9 — Team, settings, Help and closure UI

**Depends on:** WP1, WP2.4 and WP5.

**Owns exactly:** Business Team, Settings and Support components; canonical
business settings child routes, Help/case routes and personal settings route;
`tests/e2e/business-account-team-settings-support.spec.ts`.

**RED:** `last_owner_and_private_notes_never_cross_customer_ui` and
`partial_closure_never_says_closed`.

Implement section responsibilities, personal/business separation, Commercial/
Usage currentness, no-charge, support and resumable lifecycle. Verify Billing
has no Work authority, operation payment remains separate, personal security
links to `/settings`, conflicts/restart and no fake financial state.

**Claim ceiling:** source/component/browser fixtures. **Stop:** deletion,
impersonation or external billing.

## WP10 — Offerings, Availability and Integrations UI

**Depends on:** WP3, WP4.1 and WP6.

**Owns exactly:** Business Offering, Availability and Integration list/detail
components; the canonical routes declared by UI-SPEC; unit/browser tests for
those surfaces.

**RED:** `canonical_integration_route_survives_four_topologies` and
`three_domains_add_no_shared_vertical_field`.

Implement visibility/availability separation, domain panels, canonical
settings placement and contextual links. Verify ordinary/technical disclosure,
conflicts, stale/uncertain, narrow, zoom, keyboard and reduced motion.

**Claim ceiling:** source/component/browser fixtures. **Stop:** duplicated
Integration ownership or universal availability.

## WP11 — Founder/customer-success backstage

**Depends on:** WP2.4 and WP5.

**Owns exactly:** `src/components/ae/business-account/admin/**`; founder
Business Account portfolio/detail child routes; admin account UI and browser
tests.

**RED:** `founder_commands_never_impersonate_or_rewrite_source_truth`.

Implement bounded portfolio/account, onboarding, support, Commercial/Usage
references and lifecycle under admin authority. Verify actual actor, privacy,
no source rewrite, partial source failure, isolation and bounded filters.

**Claim ceiling:** source/protected fixtures. **Stop:** impersonation, secret
editing or unbounded cross-account read.

## WP12 — Acceptance and horizontal proof

**Depends on:** parent-integrated WP2.4 and WP6–WP11 plus parent route generation.

**Owns exactly:** `tests/e2e/business-account-acceptance.spec.ts`;
comprehension and horizontal eval tests; business-account evidence generator
and verifier.

**RED:** `capability_wizard_alone_cannot_close_business_account` and
`domain_substitution_cannot_change_shared_contract`.

Implement evaluation/evidence only. Verify the complete onboarding → operation
→ uncertainty/reconcile → pause → withdrawal/offboarding loop, query/Usage
budgets, human/agent parity, hostile membership, attention dedupe, partial
closure, direct reload, two domain substitutions and accessibility contract.

**Claim ceiling:** source, fixtures and labelled sandbox. **Stop:** real
provider/payment, unauthorized deployment, customer claim or unresolved P0/P1.

## Parent-only integration

The parent audits custody, diffs, falsifiers, verification and claim ceilings;
integrates exact paths; alone runs route generation; and commissions one
independent exact-candidate review. Documentation and implementation completion
remain separate.

## Dispatch-normalized exact allowlists and commands

This section supersedes prose/category ownership above. Children receive only
literal paths. WP1→WP2.1→WP2.2→WP2.3→WP3→WP4.1→WP4.2 serialization governs shared
`convex/schema.ts` and `convex/businessAccount.ts`; each later handoff asserts
predecessor table/index families remain unchanged. WP2.1 starts from the
parent-integrated WP1 revision and may extend
`src/modules/business-account/public.ts` only while preserving every WP1
export.

| WP | Literal writable paths |
|---|---|
| WP1 | `src/modules/business-account/public.ts`; `src/modules/business-account/internal/schema.ts`; `src/modules/business-account/internal/membership.ts`; `src/modules/business-account/internal/invitations.ts`; `src/modules/business-account/authorization.ts`; `src/modules/business-account/account-principal.ts`; `src/modules/business/internal/schema.ts`; `src/lib/server/business-account-human-auth.ts`; `src/lib/server/business-account-agent-auth.ts`; `convex/businessAccount.ts`; `convex/schema.ts`; `tests/unit/business-account/contracts.test.ts`; `tests/integration/business-account-membership.test.ts`; `tests/integration/business-account-principal-resolution.test.ts` |
| WP2.1 | `src/modules/business-account/public.ts`; `src/modules/business-account/internal/relationship.ts`; `src/modules/business-account/internal/relationship-schema.ts`; `src/modules/business-account/support.ts`; `src/modules/business-account/business-account.functions.ts`; `convex/businessAccount.ts`; `convex/schema.ts`; `tests/integration/business-account-relationship-support.test.ts` |
| WP2.2 | `src/modules/commercial/public.ts`; `src/modules/commercial/account-commercial.ts`; `src/modules/commercial/entitlement.ts`; `src/modules/commercial/currentness.ts`; `src/modules/commercial/internal/schema.ts`; `src/modules/business-account/commercial.ts`; `convex/commercial.ts`; `convex/schema.ts`; `tests/integration/commercial-account.test.ts` |
| WP2.3 | `src/modules/usage/public.ts`; `src/modules/usage/meter-registry.ts`; `src/modules/usage/usage-ledger.ts`; `src/modules/usage/quota.ts`; `src/modules/usage/internal/schema.ts`; `convex/usage.ts`; `convex/schema.ts`; `tests/integration/usage-ledger-quota.test.ts` |
| WP2.4 | `src/modules/business-account/closure.ts`; `src/modules/business-account/data-export.ts`; `src/modules/business-account/internal/closure-schema.ts`; `src/modules/business-account/business-account.functions.ts`; `convex/businessAccount.ts`; `convex/schema.ts`; `tests/integration/business-account-export-closure.test.ts` |
| WP3 | `src/modules/catalog/owner-profile.ts`; `src/modules/catalog/owner-services.ts`; `src/modules/catalog/internal/schema.ts`; `src/modules/business-account/profile-application.ts`; `src/modules/availability/public.ts`; `src/modules/capability-supply/business-operation.ts`; `src/modules/paid-information-operation/public.ts`; `src/modules/paid-information-operation/result.ts`; `src/modules/paid-information-operation/reconciliation.ts`; `src/modules/paid-information-operation/paid-information-operation.functions.ts`; `src/modules/paid-information-operation/internal/schema.ts`; `convex/paidInformationOperation.ts`; `tests/fixtures/availability/appointment-substitution.ts`; `tests/fixtures/availability/dispatch-substitution.ts`; `convex/catalog.ts`; `convex/schema.ts`; `tests/integration/business-account-profile-services.test.ts`; `tests/integration/paid-information-operation-result.test.ts`; `tests/unit/availability/horizontal-contract.test.ts` |
| WP4.1 | `src/modules/business-account/integrations.ts`; `src/modules/capability-supply/onboarding-contract.ts`; `src/modules/capability-supply/onboarding-application.ts`; `src/modules/capability-supply/onboarding-projection.ts`; `src/modules/capability-supply/internal/convex-schema.ts`; `convex/capabilitySupplyOnboarding.ts`; `convex/capabilitySupplyReadiness.ts`; `convex/schema.ts`; `tests/integration/business-account-integrations.test.ts`; `tests/integration/capability-supply-onboarding.test.ts` |
| WP4.2 | `src/modules/capability-supply/business-operation.actions.ts`; `src/modules/capability-supply/business-operation-ingress.ts`; `src/modules/actions/index.ts`; `src/modules/business-account/account-semantics.ts`; `src/modules/business-account/business-affinity.ts`; `src/modules/business-account/internal/business-affinity-schema.ts`; `src/lib/server/business-account-human-api.ts`; `src/lib/server/business-operation-api.ts`; `src/routes/_operator/businesses.$businessId.offerings.$serviceRef.test.tsx`; `src/routes/api.v1.businesses.$businessId.operations.$operationRef.invocations.ts`; `src/routes/api.v1.businesses.$businessId.operations.$operationRef.invocations.$invocationRef.ts`; `src/routes/api.v1.businesses.$businessId.operations.$operationRef.invocations.$invocationRef.commands.ts`; `convex/businessAccountGateway.ts`; `convex/schema.ts`; `tests/integration/business-operation-ingress.test.ts` |
| WP5 | `src/modules/business-account/account-summary.ts`; `src/modules/business-account/work-projection.ts`; `src/modules/business-account/commercial-usage-projection.ts`; `src/modules/business-account/activity-projection.ts`; `src/modules/business-account/attention.ts`; `src/modules/business-account/portfolio-query.ts`; `src/modules/business-account/internal/projection-schema.ts`; `convex/businessAccount.ts`; `convex/schema.ts`; `tests/integration/business-account-dashboard-query.test.ts`; `tests/integration/business-account-work-query.test.ts`; `tests/integration/business-account-portfolio-query.test.ts` |
| WP6 | `src/components/ae/layout/AeOperatorShell.tsx`; `src/components/ae/layout/AeOperatorSidebar.tsx`; `src/components/ae/business-account/BusinessAccountDashboard.tsx`; `src/components/ae/business-account/BusinessAccountSwitcher.tsx`; `src/lib/operator/navigation.ts`; `src/lib/operator/legacy-owner-redirect.ts`; `src/routes/_operator.tsx`; `src/routes/_operator/businesses.index.tsx`; `src/routes/_operator/businesses.$businessId.index.tsx`; `src/routes/_operator/owner.index.tsx`; `src/routes/_operator/owner.status.tsx`; `tests/unit/operator-navigation.test.ts`; `tests/e2e/business-account-shell.spec.ts` |
| WP7.1 | `src/modules/business-account/work.ts`; `src/components/ae/business-account/BusinessWorkList.tsx`; `src/components/ae/business-account/BusinessWorkDetail.tsx`; `src/routes/_operator/businesses.$businessId.work.tsx`; `src/routes/_operator/businesses.$businessId.work.$workRef.tsx`; `tests/unit/business-account/work-ui.test.tsx`; `tests/integration/business-account-work-detail.test.ts`; `tests/integration/business-account-work-link.test.ts`; `tests/e2e/business-account-work.spec.ts` |
| WP7.2 | `src/lib/server/business-account-agent-api.ts`; `src/routes/api.v1.businesses.$businessId.account.ts`; `src/routes/api.v1.businesses.$businessId.work.ts`; `src/routes/api.v1.businesses.$businessId.work.$workRef.ts`; `src/routes/api.v1.businesses.$businessId.work.$workRef.commands.ts`; `tests/integration/business-account-agent-surface.test.ts`; `tests/integration/business-account-agent-parity.test.ts` |
| WP8 | `src/modules/inquiries/inquiry.functions.ts`; `src/modules/inquiries/public.ts`; `convex/inquiries.ts`; `src/routes/_operator/businesses.$businessId.inbox.tsx`; `src/routes/_operator/businesses.$businessId.inbox.$threadRef.tsx`; `src/routes/_operator/owner.inquiries.tsx`; `src/routes/_operator/owner.inquiries.$threadRef.tsx`; `tests/integration/business-account-inquiries.test.ts`; `tests/integration/business-account-work-link-reconstruction.test.ts`; `tests/e2e/business-account-inquiries.spec.ts` |
| WP9 | `src/components/ae/business-account/BusinessTeamManager.tsx`; `src/components/ae/business-account/BusinessSettings.tsx`; `src/components/ae/business-account/BusinessCommercialUsage.tsx`; `src/components/ae/business-account/BusinessSupportWorkspace.tsx`; `src/routes/_operator/businesses.$businessId.settings.tsx`; `src/routes/_operator/businesses.$businessId.settings.team.tsx`; `src/routes/_operator/businesses.$businessId.settings.plan-data.tsx`; `src/routes/_operator/businesses.$businessId.settings.closure.tsx`; `src/routes/_operator/businesses.$businessId.help.tsx`; `src/routes/_operator/businesses.$businessId.help.$caseRef.tsx`; `src/routes/_operator/settings.tsx`; `tests/integration/business-account-settings-authority.test.ts`; `tests/e2e/business-account-team-settings-support.spec.ts` |
| WP10 | `src/components/ae/business-account/BusinessOfferingManager.tsx`; `src/components/ae/business-account/BusinessAvailabilityPanel.tsx`; `src/components/ae/business-account/BusinessIntegrationList.tsx`; `src/components/ae/business-account/BusinessIntegrationDetail.tsx`; `src/routes/_operator/businesses.$businessId.offerings.tsx`; `src/routes/_operator/businesses.$businessId.offerings.$serviceRef.tsx`; `src/routes/_operator/businesses.$businessId.offerings.$serviceRef.availability.tsx`; `src/routes/_operator/businesses.$businessId.settings.integrations.tsx`; `src/routes/_operator/businesses.$businessId.settings.integrations.$integrationRef.tsx`; `tests/unit/business-account/offerings-integrations-ui.test.tsx`; `tests/e2e/business-account-offerings-integrations.spec.ts` |
| WP11 | `src/modules/business-account/admin.ts`; `src/modules/business-account/admin.functions.ts`; `convex/businessAccountAdmin.ts`; `src/components/ae/business-account/admin/BusinessPortfolio.tsx`; `src/components/ae/business-account/admin/BusinessAccountOverview.tsx`; `src/components/ae/business-account/admin/BusinessOnboardingWorkspace.tsx`; `src/components/ae/business-account/admin/BusinessSupportManager.tsx`; `src/components/ae/business-account/admin/BusinessCommercialManager.tsx`; `src/routes/_operator/admin.businesses.tsx`; `src/routes/_operator/admin.businesses.$businessId.tsx`; `src/routes/_operator/admin.businesses.$businessId.onboarding.tsx`; `src/routes/_operator/admin.businesses.$businessId.support.tsx`; `src/routes/_operator/admin.businesses.$businessId.commercial.tsx`; `tests/integration/business-account-admin-authority.test.ts`; `tests/unit/business-account/admin-account-ui.test.tsx`; `tests/e2e/business-account-founder-operations.spec.ts` |
| WP12 | `tests/e2e/business-account-acceptance.spec.ts`; `tests/eval/business-account-comprehension.test.ts`; `tests/eval/business-account-horizontal-contract.test.ts`; `tests/eval/business-account-agent-parity.test.ts`; `tools/evidence/business-account/generate.ts`; `tools/evidence/business-account/verify.ts` |

WP4.2 owns `business-affinity.ts` and its schema fragment. It creates a stable
Work reference only from the source-created invocation identity. WP7.1
rehydrates that reference; WP7.2 projects it to scoped agents; WP8 may
persist it only. No body
classifier creates Work. Work owns consequence/status/continuation.
Conversation owns read/reply/delivery. Reconstruction proves deleting either
projection changes neither source lifecycle.

A RED already passing blocks implementation pending parent classification.
Every WP runs `git diff --check -- <literal paths>` plus:

| WP | Literal focused command |
|---|---|
| WP1 | `npm exec -- vitest run tests/unit/business-account/contracts.test.ts tests/integration/business-account-membership.test.ts tests/integration/business-account-principal-resolution.test.ts` |
| WP2.1 | `npm exec -- vitest run tests/integration/business-account-relationship-support.test.ts` |
| WP2.2 | `npm exec -- vitest run tests/integration/commercial-account.test.ts` |
| WP2.3 | `npm exec -- vitest run tests/integration/usage-ledger-quota.test.ts` |
| WP2.4 | `npm exec -- vitest run tests/integration/business-account-export-closure.test.ts` |
| WP3 | `npm exec -- vitest run tests/integration/business-account-profile-services.test.ts tests/integration/paid-information-operation-result.test.ts tests/unit/availability/horizontal-contract.test.ts` |
| WP4.1 | `npm exec -- vitest run tests/integration/business-account-integrations.test.ts tests/integration/capability-supply-onboarding.test.ts` |
| WP4.2 | `npm exec -- vitest run tests/integration/business-operation-ingress.test.ts` |
| WP5 | `npm exec -- vitest run tests/integration/business-account-dashboard-query.test.ts tests/integration/business-account-work-query.test.ts tests/integration/business-account-portfolio-query.test.ts` |
| WP6 | `npm exec -- vitest run tests/unit/operator-navigation.test.ts && npm exec -- playwright test tests/e2e/business-account-shell.spec.ts` |
| WP7.1 | `npm exec -- vitest run tests/unit/business-account/work-ui.test.tsx tests/integration/business-account-work-detail.test.ts tests/integration/business-account-work-link.test.ts && npm exec -- playwright test tests/e2e/business-account-work.spec.ts` |
| WP7.2 | `npm exec -- vitest run tests/integration/business-account-agent-surface.test.ts tests/integration/business-account-agent-parity.test.ts` |
| WP8 | `npm exec -- vitest run tests/integration/business-account-inquiries.test.ts tests/integration/business-account-work-link-reconstruction.test.ts && npm exec -- playwright test tests/e2e/business-account-inquiries.spec.ts` |
| WP9 | `npm exec -- vitest run tests/integration/business-account-settings-authority.test.ts && npm exec -- playwright test tests/e2e/business-account-team-settings-support.spec.ts` |
| WP10 | `npm exec -- vitest run tests/unit/business-account/offerings-integrations-ui.test.tsx && npm exec -- playwright test tests/e2e/business-account-offerings-integrations.spec.ts` |
| WP11 | `npm exec -- vitest run tests/integration/business-account-admin-authority.test.ts tests/unit/business-account/admin-account-ui.test.tsx && npm exec -- playwright test tests/e2e/business-account-founder-operations.spec.ts` |
| WP12 | `npm exec -- playwright test tests/e2e/business-account-acceptance.spec.ts && npm exec -- vitest run tests/eval/business-account-comprehension.test.ts tests/eval/business-account-horizontal-contract.test.ts tests/eval/business-account-agent-parity.test.ts && npm exec -- tsx tools/evidence/business-account/generate.ts && npm exec -- tsx tools/evidence/business-account/verify.ts` |

Parent route gate: after each route-bearing parcel, integrate its literal route
paths, generate once, verify IDs/imports/direct reload, then run that parcel's
browser command. Repeat for the next route parcel. No child touches the
generated tree; WP12 starts only after the final route gate.

## Boundary gates

Focused RED/GREEN remains each parcel's implementation loop. After integrating
each affected boundary, the parent runs the applicable architectural gates:

| Boundary | Applies after | Parent command |
|---|---|---|
| Convex schema composition | WP1, WP2.1-WP2.4, WP3, WP4.1, WP4.2, WP5 | `npm run check:convex-codegen` |
| Typed contracts and adapters | WP1-WP5, WP7.1, WP7.2, WP8, WP11 | `npm run typecheck` |
| Action, module and route boundaries | WP3, WP4.2, WP7.2, WP8, WP11 | `npm run test:imports && npm run test:ts-standards` |
| Customer copy and component contracts | WP6-WP10 | `npm run test:copy && npm run test:ui-contract` |
| Integrated exact candidate | WP12 | `npm run check:convex-codegen && npm run typecheck && npm run test:imports && npm run test:ts-standards && npm run test:copy && npm run test:ui-contract` |

A source-linked regression caused by the parcel must pass before downstream
dispatch. A pre-existing broad failure is recorded with its existing owner and
does not replace the parcel's focused loop or authorize unrelated repair.
