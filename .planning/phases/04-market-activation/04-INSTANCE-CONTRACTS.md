# Phase 4 programme-level dispatch authority

**Status:** Accepted
**Decision:** D-011
**Accepted:** 2026-07-21
**Implementation:** Pending

This file owns programme sequencing, custody requirements, evidence ceilings,
handoff requirements and dispatch admission for WP1–WP12.
`04A-INSTANCE-CONTRACTS.md` owns exact writable paths, falsifiers and focused
verification for each admitted parcel.

The former 4A → 4B → 4C chain is historical provenance only. It has no current
dispatch authority and may not admit, sequence or close work.

## Dependency graph

```text
WP1 ─┬─→ WP5 ─┬─→ WP6 ───────────────┐
WP2 ─┤        ├─→ WP7 → WP8 ─────────┤
WP3 ─┤        └─→ WP11 ──────────────┤
WP4 ─┘                               ├─→ WP12
WP1 + WP2 → WP9 ─────────────────────┤
WP3 + WP4 + WP6 → WP10 ──────────────┘
```

WP1 → WP2 → WP3 → WP4 is a mandatory writer sequence because these parcels
touch shared schema and Business Account boundaries. Each starts from the
parent-integrated predecessor. Parallel review is read-only.

## Parent preflight and custody

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
Business Account contract, UI-SPEC, Phase 4 plan, this programme contract,
`04A-INSTANCE-CONTRACTS.md`, parcel-named source owners and Convex guidance
before an authorized Convex edit.

## Programme admission table

| WP | Admitted source-owned outcome | Dependencies | Programme falsifier |
|---|---|---|---|
| WP1 | membership, additive responsibilities and Ownership | accepted docs | all permissions do not create Ownership |
| WP2 | relationship, support, commercial and closure | WP1 | labels create no payment/access; closure waits |
| WP3 | Offerings and three availability contracts | WP2 | no vertical shared availability field |
| WP4 | Integrations/readiness and offering relations | WP3 | stale unavailable; no duplicated ownership |
| WP5 | bounded removable summaries/attention | WP4 plus interface freeze | 10k unrelated records do not alter budget |
| WP6 | shell, Home and redirects | WP1, WP5 | guessed business/browser state grants nothing |
| WP7 | Work queue and exact detail | WP5 | projection/transport cannot declare success |
| WP8 | Inbox, Conversation and Work links | WP1, WP7 | message text cannot create Work |
| WP9 | Team, settings, Help and closure UI | WP1, WP2 | last Owner/private notes/closure safe |
| WP10 | Offerings, Availability and Integrations UI | WP3, WP4, WP6 | four topologies/three domains remain coherent |
| WP11 | founder/customer-success backstage | WP2, WP5 | no impersonation or source rewrite |
| WP12 | acceptance and horizontal proof | WP6–WP11 | wizard cannot close Account; substitution safe |

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
| WP2 | `src/modules/business-account/public.ts` | relationship revision/state and support/commercial/closure refs/continuations | `tests/integration/business-account-lifecycle.test.ts` |
| WP3 | `src/modules/availability/public.ts` | service revision and narrow availability/currentness/action link | `tests/unit/availability/horizontal-contract.test.ts` |
| WP4 | `src/modules/business-account/integrations.ts` | integration revision/state, offering refs, observed/valid-until and continuation | `tests/integration/business-account-integrations.test.ts` |

WP5 is inadmissible until the parent records all integrated revisions and these
contract commands pass. WP5 consumes but cannot change these interfaces.

## Parent audit and completion

The parent audits identity, ownership, diff semantics, forbidden absence,
RED/GREEN/adverse evidence, budgets and claims; integrates exact paths; and
alone runs route generation.

The route gate is: integrate WP6–WP11; enumerate declared route files; generate
the route tree once; verify IDs/imports and direct reload; then admit WP12. No
child owns or regenerates the route tree.

WP12 starts only after that gate. One independent exact-candidate review
follows. Documentation authority, source implementation, hosted release and
customer evidence remain distinct.

## Historical provenance

Earlier 4A/4B/4C parcels remain available only through Git history and prior
planning records. Executable-looking obsolete prompts are intentionally absent
from current dispatch authority.
