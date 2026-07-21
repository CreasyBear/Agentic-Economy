---
phase: 04-market-activation
type: product-and-engineering-plan
status: documentation_authority_accepted_implementation_pending
decisions: D-011,D-012
accepted: 2026-07-21
source_anchor: 63a451f43edea453d0a1a8d8502504433acf76fb
source_tree: 16fee2f5321d7917f7f0bccd5d59e3d6a018be64
---

# Phase 4 mature business experience plan

## Outcome

Phase 4 delivers the complete Business Account and routeable-supply loop in
source: onboarding, one reachable operation, recovery, pause, withdrawal,
offboarding and retained history under the accepted six-item customer shell.
This plan is organized by source dependency, not an arbitrary 4A/4B/4C cap.

Documentation reconciliation is complete only when ADR-024, ADR-025, the Business
Account contract, context, source map, UI-SPEC, validation strategy, this plan
and both levels of child contracts agree. That completion does not imply source
implementation or product evidence.

## Operating rules

- One parent owns decisions, custody, integration and claims.
- Dependency-ordered writers start from the integrated predecessor.
- Parallel work is read-only audit or independent candidate review only.
- Each package has one source-owned outcome and semantic falsifier.
- UI projections never become command or business truth.
- Focused evals steer the changed boundary.
- No deployment, provider/payment action or hosted claim follows.
- Every package traces a roadmap requirement P4-ACCOUNT through P4-EVIDENCE
  and names its user-observable source outcome.

## Load-bearing maturity versus optional breadth

Phase 4 is complete only when the load-bearing source contracts below work as
one recoverable loop. Candidate extensions may improve the experience later,
but they are not allowed to become hidden completion gates.

| Load-bearing Phase 4 contract | Candidate extension, deliberately deferred |
|---|---|
| Business context, membership, additive responsibilities and protected Ownership | enterprise role catalogues or policy builders |
| Relationship lifecycle, onboarding accountability and bounded support references | a generic notification centre or broad support-ticket product |
| One revisioned seed offering, exact integration binding, readiness, publication and reachable operation | three production-grade vertical availability products or automatic provider selection |
| Commercial account plus closed Usage meters and atomic quota admission | checkout, billing portal, tax, proration, discounting, provider metering or payouts |
| Home attention, Work, Inbox, safe continuations and bounded source rehydration | large analytics, reporting or comprehensive export products |
| Pause, withdrawal, resumable offboarding, closure and retained history | destructive deletion or universal provider lifecycle automation |
| Six-item human shell plus scoped-agent semantic parity | alternate role-specific shells or convenience shortcuts that create new canonical routes |

## Requirement coverage

| Requirement | Owning work packages | Executable proof |
|---|---|---|
| `P4-ACCOUNT` | WP1, WP2.1, WP6, WP9 | membership/principal, relationship and direct-route authority falsifiers |
| `P4-SUPPLY` | WP3, WP4.1, WP4.2, WP10 | seed result owner, four integration topologies, reachable operation and domain-substitution falsifiers |
| `P4-COMMERCIAL` | WP2.2, WP2.3, WP5, WP9 | commercial currentness, usage replay/concurrency and rebuild falsifiers |
| `P4-OPERATE` | WP4.2, WP7.1, WP7.2, WP8 | human/agent ingress, exact Work and reconcile-before-retry falsifiers |
| `P4-LIFECYCLE` | WP2.4, WP9, WP11 | pause, partial withdrawal, resumable closure and retained-history falsifiers |
| `P4-SURFACES` | WP1, WP4.2, WP6-WP12 | shared semantic projection and human/scoped-agent parity evals |
| `P4-BOUNDS` | WP5, WP7.1, WP7.2, WP8, WP11 | cap-and-one, query-budget, dedupe and forbidden-enumeration falsifiers |
| `P4-EVIDENCE` | WP12 | exact-candidate generator/verifier and hostile substitutions |

## Natural dependency graph

```mermaid
flowchart TD
  D[\"D-011 and D-012 reconciled authority\"]
  A[\"WP1 Business context, membership and responsibilities\"]
  R1[\"WP2.1 Relationship and support\"]
  C[\"WP2.2 Commercial owner\"]
  U[\"WP2.3 Usage owner\"]
  L[\"WP2.4 Pause, withdrawal and closure\"]
  O[\"WP3 Offerings and domain availability contracts\"]
  I[\"WP4.1 Integrations, readiness and publication\"]
  G[\"WP4.2 Reachable operation ingress\"]
  Q[\"WP5 Query projections and attention identity\"]
  S[\"WP6 Customer shell and compatibility routes\"]
  W[\"WP7.1 Work detail and human Work queue\"]
  A2[\"WP7.2 Scoped-agent account and Work surface\"]
  M[\"WP8 Inbox, conversation and Work linking\"]
  F[\"WP9 Settings, Team, Help and closure surfaces\"]
  T[\"WP10 Offerings, Availability and Integrations surfaces\"]
  B[\"WP11 Founder/customer-success backstage\"]
  E[\"WP12 Cross-surface acceptance and horizontal proof\"]
  D --> A
  A --> R1
  R1 --> C
  C --> U
  U --> O
  O --> I
  I --> G
  G --> Q
  A --> S
  Q --> S
  G --> W
  Q --> W
  G --> L
  W --> L
  A --> M
  W --> A2
  A2 --> M
  A --> F
  L --> F
  O --> T
  I --> T
  L --> B
  Q --> B
  S --> E
  W --> E
  M --> E
  F --> E
  T --> E
  B --> E
```

## Work packages

### WP1 — Business context, membership and additive responsibility

**Depends on:** reconciled D-011 documentation.

**Source-owned outcome:** memberships, invitations, additive grants, effective
access, protected Ownership and one account principal resolver shared by human
sessions and scoped agent credentials.

**Target behavior:** multiple businesses per person; persistent URL business
context; presets; accepted transfer; immediate revocation; last-owner
protection; server refusal on direct routes/commands; semantically equal
account/access readback across both callers.

**Falsifier:** assigning every ordinary responsibility does not create
Ownership; no role/preset substitution can remove the last Owner; a human and
scoped agent cannot resolve different account authority from the same source.

**Evidence ceiling:** source and focused fixtures.

**Stop:** if identity/browser state becomes membership authority or emergency
founder recovery must be invented.

### WP2 — Relationship, Commercial, Usage and late lifecycle

**Depends on:** parent-integrated WP1.

WP2 is a serial source stream, not one oversized child:

- **WP2.1** owns relationship, onboarding tasks, private notes and
  customer-visible support.
- **WP2.2** owns Commercial arrangement, status, entitlement revision, billing
  contact/period and opaque invoice/payment currentness references.
- **WP2.3** owns closed meters, immutable Usage events, atomic quota
  reserve/settle and rebuildable period summaries.
- **WP2.4** owns pause, bounded withdrawal, export, offboarding and closure only
  after WP4.2 and WP7.1 exist.

**Target behavior:** private/customer records stay separate; `no_charge` is
complete; duplicate/late/corrected Usage is attributable; the last unit cannot
be oversubscribed; partial offboarding resumes; history survives.

**Falsifier:** Commercial labels cannot grant Work authority or manufacture
operation payment truth; `AuthorityUse`, supply observations and telemetry
cannot alter Usage; closure cannot complete with unresolved withdrawal.

**Evidence ceiling:** source and focused fixtures; no revenue claim.

**Stop:** on deletion, impersonation, fabricated billing, public meter input,
provider billing, payout work or unbounded reconstruction.

### WP3 — Offerings and domain-owned availability

**Depends on:** parent-integrated WP2.3.

**Source-owned outcome:** revisioned services, one paid-information seed
operation with its own durable result/reconciliation owner, and a narrow shared
availability projection. Appointment and dispatch remain domain-owned hostile
substitution fixtures.

**Target behavior:** create/order/preview/publish/pause/retire; shared
availability is only disposition/currentness/customer impact; paid-information
result and reconciliation truth survives without Phase 3 evaluator records.

**Falsifier:** slots, dispatch capacity and paid-operation price cannot enter
the shared availability schema.

**Evidence ceiling:** source, schema and labelled fixtures.

**Stop:** on universal calendar/provider lifecycle or publication-as-availability.

### WP4 — Routeable supply and reachable operation

**Depends on:** parent-integrated WP3.

WP4 is a serial source stream:

- **WP4.1** owns Integration summary/detail, many-to-many offering relations,
  exact binding, readiness and publication with protected disclosure.
- **WP4.2** owns one reachable seed operation: materialized supply, registered
  action, human and authenticated-agent adapters, exact authority, current
  attempt, `routeable_operation_start:v1` Usage reservation/settlement and a
  source-created business-affinity Work reference.

**Target behavior:** one-to-many, many-to-one and account-wide Integrations;
source/currentness; no secret readback; approve-each plus the single admitted
one-unit bounded-mandate fixture enter the same Action Invocation host without
Phase 3 evaluator records. Further authority modes and broader mandate policy
remain deferred.

**Falsifier:** changing one offering cannot duplicate/mutate its shared
Integration; stale readiness cannot say Available; registration alone is not
reachability; a substituted business/principal/material input cannot create an
attempt, Usage event or Work reference.

**Evidence ceiling:** source, fixtures and labelled adapter checks.

**Stop:** if raw credential custody, external provider mutation, evaluator-host
reuse or a second control plane is required.

### WP5 — Bounded summaries, Work references and attention identity

**Depends on:** parent-integrated WP2.3, WP4.2 and the programme interface-freeze gate.

**Source-owned outcome:** removable Home, Work-list, Commercial/Usage, History
and founder projections with bounded indexes and stable source identity.

**Target behavior:** one summary plus cap-and-one attention, Work and Inbox;
exact detail rehydrates source owners.

**Falsifier:** 10,000 unrelated Work or Usage records do not change page
budget; deleting projections changes no result, balance, entitlement or
authority; rebuilt summaries equal source history.

**Evidence ceiling:** source and query-budget fixtures.

**Stop:** on N+1 hydration, full-table counts or projection-owned success.

### WP6 — Customer shell, Home and compatibility routes

**Depends on:** WP1 and WP5.

**Source-owned outcome:** membership-resolved shell and redirect boundary.

**Target behavior:** six-item navigation, persistent business, role-aware
Integration shortcut to canonical settings, ranked Home and owner compatibility
redirects.

**Falsifier:** guessed business never enters shell; zero/one/many membership
redirects never use browser state as authority.

**Evidence ceiling:** source, component and labelled browser fixtures.

**Stop:** on unsupported destination, duplicate shell or browser authority.

### WP7 — Exact Work and scoped-agent operating surface

**Depends on:** WP4.2, WP5 and existing action/domain owners.

WP7 is a serial surface stream:

- **WP7.1** owns exact Work rehydration plus the human list/detail surface.
- **WP7.2** owns the scoped-agent account projection, bounded Work reads and
  closed source-issued Work command routes over the same semantics.

**Source-owned outcome:** detail rehydrates exact invocation/result; lists
remain references; human and scoped-agent surfaces agree at one source
revision.

**Target behavior:** account, access, relationship, Commercial/Usage, Work,
consequence, authority, attempt, uncertainty, evidence and safe continuation
survive reload across unlike operations and both caller types.

**Falsifier:** possible release exposes inspect/reconcile only; projection or
transport cannot declare success; cross-account/stale agent credentials cannot
enumerate account or Work truth; human and agent semantic digests may prove
equality only, never authority.

**Evidence ceiling:** source, fixtures and labelled adapters.

**Stop:** if a universal lifecycle replaces domain truth or external effect is
required.

### WP8 — Inbox, Conversation and source-created Work linking

**Depends on:** WP1 and WP7.2.

**Source-owned outcome:** business-scoped conversations with explicit links to
durable Work identities.

**Target behavior:** bounded Inbox, delivery/read/reply truth, draft-preserving
conflict and uncertain-send recovery.

**Falsifier:** message text cannot create Work; possible delivery cannot expose
blind resend; Work completion does not mark Inbox read.

**Evidence ceiling:** source and inquiry fixtures.

**Stop:** if classifier becomes command truth or conversation state is copied.

### WP9 — Team, settings, Help and lifecycle surfaces

**Depends on:** WP1, WP2.4 and WP5.

**Source-owned outcome:** Team, Commercial/Usage, data, support and lifecycle
customer surfaces over shared account semantics.

**Target behavior:** section responsibilities, no-charge, arrangement/status,
entitlement revision, named Usage meter/period/limit/`asOf`/completeness,
opaque currentness references, private-note exclusion, resumable export/
closure and personal/business separation. Personal security stays at
`/settings`; there is no duplicate business-security product.

**Falsifier:** Billing cannot act on Work; last Owner cannot be removed; support
cannot rewrite Work; partial closure cannot claim closed.

**Evidence ceiling:** source, component and labelled browser fixtures.

**Stop:** on fake financial truth, deletion or impersonation.

### WP10 — Offerings, Availability and Integrations surfaces

**Depends on:** WP3, WP4.1 and WP6.

**Source-owned outcome:** accepted views with many-to-many links and domain
panels.

**Target behavior:** canonical Integrations under settings; technical shortcut
same route; visibility and availability separate.

**Falsifier:** four Integration topologies remain coherent and appointment/
dispatch substitutions introduce no shared vertical field.

**Evidence ceiling:** source, component and labelled browser fixtures.

**Stop:** on duplicated Integration ownership, universal availability or
secret readback.

### WP11 — Founder/customer-success backstage

**Depends on:** WP2.4 and WP5.

**Source-owned outcome:** bounded portfolio/account detail and explicit admin
commands.

**Target behavior:** actual actor recorded; private/customer communication
separate; source facts linked rather than rewritten; manual/no-charge changes
are revisioned and provider-managed observations remain reconcile-owned.

**Falsifier:** founder cannot borrow member authority, manufacture readiness or
convert plan label into access.

**Evidence ceiling:** source and protected fixtures.

**Stop:** on impersonation, secret editing or unbounded cross-account read.

### WP12 — Cross-surface acceptance and horizontal proof

**Depends on:** WP2.4 and WP6–WP11.

**Source-owned outcome:** exact-revision acceptance packet across the target
loop plus appointment and dispatch hostile substitutions.

**Target behavior:** onboarding, one routeable operation, unknown/reconcile,
pause, withdrawal/offboarding, daily operation, team growth, Commercial/Usage,
Integrations, support and closure; human/agent semantics agree; 320px, 400%
zoom, keyboard and reduced motion retain information.

**Falsifier:** capability wizard alone cannot close Business Account; domain
substitution cannot change shared navigation/contracts.

**Evidence ceiling:** source, focused fixtures and labelled sandbox.

**Stop:** on customer/production claim, real provider/payment, unauthorized
deployment or unresolved P0/P1.

## First executable loop

The first implementation sequence is deliberately concrete:

1. create or resume one Business Account and resolve one human plus one scoped
   agent through current membership;
2. establish a labelled `manual` Commercial arrangement, one current
   entitlement and a one-unit `routeable_operation_start:v1` limit without
   claiming payment;
3. create one paid-information-shaped offering, labelled local binding,
   readiness record and publication;
4. materialize and register that exact operation, then reach it through thin
   authenticated human and agent adapters;
5. reserve Usage, create one attributable attempt and business-affinity Work
   reference, and settle the Usage event exactly once;
6. force possible release; both surfaces expose inspect/reconcile only, then
   resolve to source-owned truth;
7. pause new intake, prove existing uncertain/completed Work survives, and
   refuse a new operation;
8. withdraw publication, binding and access through an injected partial
   failure, resume from the failed step, close, and reload retained history.

This is a source/fixture/local loop. Appointment and dispatch substitutions
falsify shared-contract leakage without pretending to be available services.

## Completion boundaries

Documentation authority completes when the active Phase 4 authority documents
agree and reviews pass. Implementation completes only after WP1–WP12 source
outcomes and evals pass at an exact revision. Neither proves adoption,
accessibility in use, provider fulfilment or production safety.

## Future market-mechanism research

Demand engineering—sales tactics, supplier/customer incentives, liquidity,
retention and market mechanisms—is a future product-design frontier. It does
not block Business Account implementation. Phase 4 adds no rewards,
commissions, rankings, loyalty, marketplace metrics or growth dashboards.
