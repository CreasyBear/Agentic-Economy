# Phase 4 programme-level dispatch authority

**Status:** Accepted
**Decisions:** D-011, D-012
**Accepted:** 2026-07-21
**Implementation:** Pending
**Mapped source:** `63a451f43edea453d0a1a8d8502504433acf76fb`
(`16fee2f5321d7917f7f0bccd5d59e3d6a018be64`)

This file owns programme sequencing, custody requirements, evidence ceilings,
handoff requirements and dispatch admission for WP1–WP12.
`04A-INSTANCE-CONTRACTS.md` owns exact writable paths, falsifiers and focused
verification for each admitted parcel.

The former 4A → 4B → 4C chain is historical provenance only. It has no current
dispatch authority and may not admit, sequence or close work.

## Dependency graph

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

WP1 → WP2.1 → WP2.2 → WP2.3 → WP3 → WP4.1 → WP4.2 is a
mandatory writer sequence because these parcels touch shared schema, account,
Commercial, Usage and routeable-supply boundaries. WP2.4 is deliberately late:
closure cannot withdraw supply or Work that does not yet exist. Each writer
starts from the parent-integrated predecessor. Parallel review is read-only.

## Parent preflight and custody

This documentation branch is not the executable Phase 4 base. Before the first
writer, the parent creates a clean integration branch descended from the mapped
Phase 3D source, applies the accepted planning commits without absorbing the
shared dirty overlay, and records the resulting exact revision/tree. No child
starts from the older Phase 3B planning base or from this unrelated planning
branch.

Before every dispatch the parent:

1. records exact integrated base revision/tree;
2. generates/verifies a whole-overlay content-bound custody manifest;
3. treats inherited dirty paths as protected unless assigned;
4. confirms isolated worktree or exclusive sequential writer;
5. inspects runtimes, scripts and command effects without installation/control
   plane access;
6. verifies every artifact/handoff is writable or parent-materialized;
7. names ownership, forbidden paths, RED, verification, evidence and stops;
8. reserves integration destination and candidate preservation.

Custody is rechecked before dispatch/evidence/write/handoff. Drift stops writes.
No child cleans, resets, restores or overwrites another owner's work. Git
object/index/ref writes count as mutation and are forbidden to read-only review.

## Required child prompt

Every child is told:

> You own one admitted WP parcel, not programme integration. You are not alone.
> Preserve inherited/sibling work. Read required authority/live owners. Work
> only in exact paths. Run semantic RED, make one smallest source transition,
> run focused success/adverse/reconstruction checks and return the handoff. Do
> not stage, commit, merge, deploy, contact providers/payments, use credentials,
> edit generated output, broaden scope or claim completion. Stop on custody
> drift, collision, contract contradiction, missing authority, external effect,
> evidence breach or a second failed correction.

Every child reads nearest `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, ADR-024,
ADR-025,
Business Account contract, UI-SPEC, Phase 4 plan, this programme contract,
`04A-INSTANCE-CONTRACTS.md`, parcel-named source owners and Convex guidance
before an authorized Convex edit.

## Programme admission table

| WP | Admitted source-owned outcome | Dependencies | Programme falsifier |
|---|---|---|---|
| WP1 | membership, additive responsibilities, Ownership and common account resolution | accepted docs | all permissions do not create Ownership; human/agent meaning agrees |
| WP2.1 | relationship, onboarding and support | WP1 | private/customer truth remains separate |
| WP2.2 | Commercial arrangement, entitlement and currentness references | WP2.1 | labels create no operation-payment/access/Work authority |
| WP2.3 | Usage events, quota reserve/settle and rebuildable summaries | WP2.2 | duplicate once; concurrent last unit once; substitution cannot meter |
| WP2.4 | pause, withdrawal, offboarding, export and closure | WP4.2, WP7.1 | new intake stops; accepted Work/history survives; closure waits |
| WP3 | one seed Offering, paid-information result owner and narrow availability projection | WP2.3 | no evaluator result reuse or vertical shared availability field |
| WP4.1 | Integrations/readiness/publication and offering relations | WP3 | stale unavailable; no duplicated ownership |
| WP4.2 | reachable registered operation and business-affinity ingress | WP4.1 | substituted account/material creates no attempt/Usage/Work |
| WP5 | bounded removable summaries/attention | WP2.3, WP4.2 plus interface freeze | 10k unrelated Work/Usage records do not alter budget |
| WP6 | shell, Home and redirects | WP1, WP5 | guessed business/browser state grants nothing |
| WP7.1 | human Work queue and exact detail | WP5 | projection/transport cannot declare success |
| WP7.2 | scoped-agent account and Work surface | WP7.1 | cross-account/stale credentials cannot enumerate or command |
| WP8 | Inbox, Conversation and Work links | WP1, WP7.2 | message text cannot create Work |
| WP9 | Team, Commercial/Usage, Help and lifecycle UI | WP1, WP2.4, WP5 | Billing has no Work authority; last Owner/private notes/closure safe |
| WP10 | Offerings, Availability and Integrations UI | WP3, WP4.1, WP6 | four topologies/two hostile substitutions remain coherent |
| WP11 | founder/customer-success backstage | WP2.4, WP5 | no impersonation or Commercial/Usage/source rewrite |
| WP12 | acceptance and horizontal proof | WP2.4, WP6–WP11 | full operating loop and substitutions pass |

Admission requires exact predecessors parent-integrated. A child check never
satisfies another WP or closes the programme.

## Global forbidden scope

Unless literally parcel-owned, every repository path is forbidden, including
planning/product/design/AGENTS authority, package/lockfiles, generated Convex
output, route tree and inherited dirty paths.

Always forbidden: staging, commit, push, deployment, provider/payment action,
credentials, package installation, broad restore/cleanup, permanent deletion,
unrelated repairs and evidence promotion. The parent alone owns route
generation, integration, commits, contract acceptance, external mutations and
completion claims.

## Correction budget and stops

One implementation pass and at most one focused correction. Custody drift,
tool/environment failure, external-state absence and missing authority stop the
parcel without consuming correction.

Stop if ownership must widen; a contract/other WP must change; uncertainty
would be retried or relabelled; the falsifier cannot decide; credentials,
provider/payment/deployment/control-plane access is needed; inherited work
would be overwritten; or source/fixtures are asked to prove customer, hosted,
accessibility-in-use or production claims.

## Handoff schema

Return complete JSON for parent materialization at
`.planning/handoffs/phase-04/WP<n>.json`:

```text
parcel
base revision/tree and integration destination
candidate identity
inherited/final custody manifests
owned/changed/forbidden paths
RED command/result and intended failure
focused success/refusal/replay/reconstruction results
observable behavior and query budgets
evidence plane, claim ceiling and non-claims
unresolved finding/earliest blocker
exact next safe action
```

The artifact remains a child-authored candidate until parent integration.

## Interface-freeze gate before WP5

| Producer | Frozen export | Required identity/state | Contract gate |
|---|---|---|---|
| WP1 | `src/modules/business-account/public.ts` | business/member IDs, grant revision, responsibilities, Ownership | `tests/unit/business-account/contracts.test.ts` |
| WP2.1 | `src/modules/business-account/public.ts` | relationship revision/state and support refs/continuations | `tests/integration/business-account-relationship-support.test.ts` |
| WP2.2 | `src/modules/commercial/public.ts` | account/revision/arrangement/status/entitlement/currentness | `tests/integration/commercial-account.test.ts` |
| WP2.3 | `src/modules/usage/public.ts` | closed meter/event/reservation/period summary/currentness | `tests/integration/usage-ledger-quota.test.ts` |
| WP3 | `src/modules/availability/public.ts`; `src/modules/paid-information-operation/public.ts` | service revision, narrow availability and operation-owned result/reconciliation truth | `tests/unit/availability/horizontal-contract.test.ts`; `tests/integration/paid-information-operation-result.test.ts` |
| WP4.1 | `src/modules/business-account/integrations.ts` | integration revision/state, offering refs, observed/valid-until and continuation | `tests/integration/business-account-integrations.test.ts` |
| WP4.2 | account semantic and operation-ingress contracts | account principal, operation material, attempt, Usage and Work identity | `tests/integration/business-operation-ingress.test.ts` |
WP5 is inadmissible until the parent records all integrated revisions and these
contract commands pass. WP5 consumes but cannot change these interfaces.

## Parent audit and completion

The parent audits identity, ownership, diff semantics, forbidden absence,
RED/GREEN/adverse evidence, budgets and claims; integrates exact paths; and
alone runs route generation.

For every route-bearing parcel, the parent integrates its declared route files,
generates the route tree once, verifies IDs/imports/direct reload and only then
runs that parcel's browser command. No child owns or regenerates the route
tree. WP12 begins after the final route gate.

WP12 starts only after that gate. One independent exact-candidate review
follows. Documentation authority, source implementation, hosted release and
customer evidence remain distinct.

## Historical provenance

Earlier 4A/4B/4C parcels remain available only through Git history and prior
planning records. Executable-looking obsolete prompts are intentionally absent
from current dispatch authority.
