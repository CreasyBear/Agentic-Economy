---
phase: 04-market-activation
type: product-and-engineering-plan
status: documentation_authority_accepted_implementation_pending
decision: D-011
accepted: 2026-07-21
---

# Phase 4 mature business experience plan

## Outcome

Phase 4 delivers mature Business Account/customer-management operation under
the accepted six-item customer shell. This plan is organized by source
dependency, not an arbitrary 4A/4B/4C cap.

Documentation reconciliation is complete only when ADR-024, the Business
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

## Natural dependency graph

```mermaid
flowchart TD
  D[\"D-011 reconciled authority\"]
  A[\"WP1 Business context, membership and responsibilities\"]
  R[\"WP2 Relationship, support, commercial and closure owners\"]
  O[\"WP3 Offerings and domain availability contracts\"]
  I[\"WP4 Integrations and readiness contract\"]
  Q[\"WP5 Query projections and attention identity\"]
  S[\"WP6 Customer shell and compatibility routes\"]
  W[\"WP7 Work detail and business Work queue\"]
  M[\"WP8 Inbox, conversation and Work linking\"]
  F[\"WP9 Settings, Team, Help and closure surfaces\"]
  T[\"WP10 Offerings, Availability and Integrations surfaces\"]
  B[\"WP11 Founder/customer-success backstage\"]
  E[\"WP12 Cross-surface acceptance and horizontal proof\"]
  D --> A
  A --> R
  R --> O
  O --> I
  I --> Q
  A --> S
  Q --> S
  Q --> W
  A --> M
  W --> M
  A --> F
  R --> F
  O --> T
  I --> T
  R --> B
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
access and protected Ownership independent of business identity.

**Target behavior:** multiple businesses per person; persistent URL business
context; presets; accepted transfer; immediate revocation; last-owner
protection; server refusal on direct routes/commands.

**Falsifier:** assigning every ordinary responsibility does not create
Ownership; no role/preset substitution can remove the last Owner.

**Evidence ceiling:** source and focused fixtures.

**Stop:** if identity/browser state becomes membership authority or emergency
founder recovery must be invented.

### WP2 — Relationship, support, commercial references and closure

**Depends on:** parent-integrated WP1.

**Source-owned outcome:** relationship, onboarding tasks, private notes,
customer-visible support, truthful commercial references, export and closure.

**Target behavior:** complete lifecycle; private/customer records separated;
no-charge complete; partial offboarding resumes; history survives.

**Falsifier:** commercial labels cannot grant feature access or manufacture
payment truth; closure cannot complete with unresolved withdrawal.

**Evidence ceiling:** source and focused fixtures; no revenue claim.

**Stop:** on deletion, impersonation, fabricated billing or unbounded work.

### WP3 — Offerings and domain-owned availability

**Depends on:** parent-integrated WP2.

**Source-owned outcome:** revisioned services and explicit paid-information,
appointment and dispatch availability contracts.

**Target behavior:** create/order/preview/publish/pause/retire; shared
availability is only disposition/currentness/customer impact.

**Falsifier:** slots, dispatch capacity and paid-operation price cannot enter
the shared availability schema.

**Evidence ceiling:** source, schema and labelled fixtures.

**Stop:** on universal calendar/provider lifecycle or publication-as-availability.

### WP4 — Business-scoped Integrations and readiness

**Depends on:** parent-integrated WP3.

**Source-owned outcome:** Integration summary/detail with many-to-many offering
relations and protected technical disclosure.

**Target behavior:** one-to-many, many-to-one and account-wide Integrations;
source/currentness; no secret readback.

**Falsifier:** changing one offering cannot duplicate/mutate its shared
Integration; stale readiness cannot say Available.

**Evidence ceiling:** source, fixtures and labelled adapter checks.

**Stop:** if raw credential custody or external provider mutation is required.

### WP5 — Bounded summaries, Work references and attention identity

**Depends on:** parent-integrated WP4 and the programme interface-freeze gate.

**Source-owned outcome:** removable Home, Work-list, History and founder
projections with bounded indexes and stable source identity.

**Target behavior:** one summary plus cap-and-one attention, Work and Inbox;
exact detail rehydrates source owners.

**Falsifier:** 10,000 unrelated records do not change page budget; deleting
projections changes no result or authority.

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

### WP7 — Exact Work detail and business Work queue

**Depends on:** WP5 and existing action/domain owners.

**Source-owned outcome:** detail rehydrates exact invocation/result; list
remains references.

**Target behavior:** consequence, authority, attempt, uncertainty, evidence and
safe continuation survive reload across unlike operations.

**Falsifier:** possible release exposes inspect/reconcile only; projection or
transport cannot declare success.

**Evidence ceiling:** source, fixtures and labelled adapters.

**Stop:** if a universal lifecycle replaces domain truth or external effect is
required.

### WP8 — Inbox, Conversation and source-created Work linking

**Depends on:** WP1 and WP7.

**Source-owned outcome:** business-scoped conversations with explicit links to
durable Work identities.

**Target behavior:** bounded Inbox, delivery/read/reply truth, draft-preserving
conflict and uncertain-send recovery.

**Falsifier:** message text cannot create Work; possible delivery cannot expose
blind resend; Work completion does not mark Inbox read.

**Evidence ceiling:** source and inquiry fixtures.

**Stop:** if classifier becomes command truth or conversation state is copied.

### WP9 — Team, settings, Help and lifecycle surfaces

**Depends on:** WP1 and WP2.

**Source-owned outcome:** Team, notifications, commercial/data, support and
closure customer surfaces.

**Target behavior:** section responsibilities, no-charge, private-note
exclusion, resumable export/closure and personal/business separation.

**Falsifier:** Billing cannot act on Work; last Owner cannot be removed; support
cannot rewrite Work; partial closure cannot claim closed.

**Evidence ceiling:** source, component and labelled browser fixtures.

**Stop:** on fake financial truth, deletion or impersonation.

### WP10 — Offerings, Availability and Integrations surfaces

**Depends on:** WP3, WP4 and WP6.

**Source-owned outcome:** accepted views with many-to-many links and domain
panels.

**Target behavior:** canonical Integrations under settings; technical shortcut
same route; visibility and availability separate.

**Falsifier:** four Integration topologies remain coherent and three domains
introduce no shared vertical field.

**Evidence ceiling:** source, component and labelled browser fixtures.

**Stop:** on duplicated Integration ownership, universal availability or
secret readback.

### WP11 — Founder/customer-success backstage

**Depends on:** WP2 and WP5.

**Source-owned outcome:** bounded portfolio/account detail and explicit admin
commands.

**Target behavior:** actual actor recorded; private/customer communication
separate; source facts linked rather than rewritten.

**Falsifier:** founder cannot borrow member authority, manufacture readiness or
convert plan label into access.

**Evidence ceiling:** source and protected fixtures.

**Stop:** on impersonation, secret editing or unbounded cross-account read.

### WP12 — Cross-surface acceptance and horizontal proof

**Depends on:** WP6–WP11.

**Source-owned outcome:** exact-revision acceptance packet across all target
loops and three offering shapes.

**Target behavior:** onboarding, daily operation, recovery, team growth,
Integrations, support and closure; 320px, 400% zoom, keyboard and reduced
motion retain information.

**Falsifier:** capability wizard alone cannot close Business Account; domain
substitution cannot change shared navigation/contracts.

**Evidence ceiling:** source, focused fixtures and labelled sandbox.

**Stop:** on customer/production claim, real provider/payment, unauthorized
deployment or unresolved P0/P1.

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
