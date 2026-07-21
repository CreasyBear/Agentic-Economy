# Agentic Economy — Current Product Roadmap

**Status:** active
**Rebaselined:** 2026-07-21
**Authority:** `PRODUCT.md` → `DESIGN.md` → accepted ADRs → this roadmap

## Roadmap rule

A phase exists only when it turns source-owned capability into a demonstrable
customer outcome. Historical marketplace phases and bootstrap gates are
provenance, not current sequencing authority.

## Phase graph

```text
Phase 1 — Action Invocation foundation (complete)
                         ↓
Phase 2 — One action plane (accepted_narrowed)
                         ↓
Phase 3 — Protocol/kernel → product conversion (complete)
                         ↓
Phase 4 — Business Account and routeable-supply maturity (planning accepted)
                         ↓
Phase 5 — Demand-side quote-to-close and customer operating proof (future)
```

## Phase 1 — Action Invocation foundation

**Status:** complete
**ADR:** ADR-009
**Outcome:** one registered action can be invoked from Request-owned or
standalone lineage with exact authority, attempt, uncertainty, cancellation,
reconciliation and durable continuation semantics.

## Phase 2 — One action plane across human and agent hosts

**Status:** accepted_narrowed
**ADR:** ADR-010
**Outcome:** Request-owned and standalone hosts use the same source transition
and structured semantic projection.

Gate 10 remains `NARROW_OR_REDESIGN`: the measured embedded path did not reduce
human effort. The architecture survives; the payoff hypothesis does not.

## Phase 3A — One reliable paid operation

**Status:** complete at labelled local/mock evidence boundary
**Goal:** safely obtain and explain one BTC/USD result from one named mock
provider for no more than $0.01.

Phase 3A makes payment preparation/submission reconstructable, separates
payment and quote truth, normalizes the operation result and projects one
versioned semantic object through compact human and structured-agent hosts.

Exit requires success, pre-release refusal, possible paid submission,
attributable reconciliation, duplicate delivery and cold restoration to remain
truthful with no unresolved P0/P1 inside the local mock boundary.

## Phase 3B — Second-provider plug-in test

**Status:** complete at labelled local/mock evidence boundary
**Depends on:** Phase 3A
**Goal:** prove that one second labelled mock BTC/USD provider can be selected
before authorization and executed through the existing paid-operation host,
semantics and renderer without automatic fallback or a second product stack.

Add one second provider for the same operation without changing host workflow
or shared semantics. Do not add automatic fallback while provider A is
uncertain; changing providers creates a new authority and charge boundary.

**Plan authority:** `.planning/phases/03b-second-provider-plugin-test/`

The phase is a falsification test. If provider B requires a new lifecycle
state, host command, semantic schema, renderer branch or payment retry rule,
implementation stops and the abstraction finding returns to the parent.

The test confirmed the seam. Provider B owns its publication, transport,
payment recipient and raw-result adapter. Explicit selection uses the unchanged
paid-operation host and `agentic-paid-operation:v1`; uncertainty never falls
back, and switching providers creates a new invocation, authority, payment and
effect lineage. Evidence remains local/mock only.

## Phase 4 — Business Account and routeable-supply maturity

**Status:** planning accepted; source implementation pending
**ADRs:** ADR-024, ADR-025
**Goal:** make the complete Business Account operating loop real in source:
onboard a business and team, establish Commercial and Usage truth, publish one
routeable operation, operate and recover it through human and scoped-agent
surfaces, pause new intake, withdraw/offboard safely and preserve history.

Phase 4 closes at source, focused-fixture and labelled-local evidence. It does
not require independently operated providers or real customers, and it does
not claim demand, customer value, revenue, hosted availability or production
safety.

**Requirements:**

- `P4-ACCOUNT`: account identity, membership, additive responsibility and
  protected Ownership are durable and server-authorized.
- `P4-SUPPLY`: offering, binding, readiness, publication and one reachable
  registered operation form one source-owned routeable-supply chain.
- `P4-COMMERCIAL`: AE account billing, operation payment, Usage, telemetry and
  future payouts remain separate; Commercial and Usage follow ADR-025.
- `P4-OPERATE`: Work, Inbox and safe continuations survive reload, uncertainty
  and reconciliation without transport-derived truth.
- `P4-LIFECYCLE`: pause, withdrawal, offboarding and closure are resumable,
  bounded and history-preserving.
- `P4-SURFACES`: direct human and scoped-agent routes share one semantic account
  projection and re-evaluate membership and command authority server-side.
- `P4-BOUNDS`: growing reads are indexed, paginated or cap-plus-one bounded;
  projections remain removable and rebuildable.
- `P4-EVIDENCE`: exact-candidate source, focused fixtures and labelled-local
  acceptance evidence state their claim ceiling.

**Authority:** `.planning/phases/04-market-activation/`

## Phase 5 — Demand-side quote-to-close and customer operating proof

**Status:** future; not Phase 4 dispatch authority
**Goal:** prove demand-side sourcing, comparison, selection, close/start and
real customer operating outcomes against independently routeable supply.

The historical Phase 4B three-quote and Phase 4C quote-to-close proposals move
here as inputs. They do not become active acceptance until separately planned
and accepted. Sales tactics, incentives, liquidity and retention mechanisms
also remain product research until tied to a concrete customer loop.

## Deferred decisions

Independently operated supply, real-customer evidence, additional authority
modes and broader mandate policies,
workflow composition, commercial-provider integration and market mechanisms
remain separate gates. Phase 4 source maturity must not silently claim them.
