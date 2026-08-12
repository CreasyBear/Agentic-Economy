> **SUPERSESSION BANNER — 2026-08-09.** This roadmap retains historical phase
> mechanics and implementation evidence, but its earlier category, ICP, wedge,
> and broad-supply framing is superseded. It is not current category authority.
>
> Current authority is [`PROJECT.md`](PROJECT.md),
> [`VISION-conceptual-map.md`](VISION-conceptual-map.md),
> [`wayfinder/MAP.md`](wayfinder/MAP.md), [`D-013`](records/PROJECT-RECORDS.md),
> the [Agent Services Market category thesis](research/2026-08-08-agent-services-market-category-thesis.md),
> and accepted [`ADR-035`](adr/ADR-035-single-key-capability-gateway.md).
> The 2026-08-11 source-remediation outcome is a historical closeout record,
> superseded for current status by the 2026-08-12 post-remediation re-audit in
> `PAPERCUTS.md`.
> The current product is the market and controlled transaction layer for
> supplier-hosted Market Operations. The remediation campaign remains open:
> seven workstreams are focused-verified and the Node 22 post-codegen source
> gate is green, but the payout-period lifecycle lacks a trusted server-owned
> nonzero minimum-payout policy; production manifest validation and hosted
> certification remain blocked. Do not infer from source/local fixtures that
> keyed provider execution, production settlement, or customer value is proven.

**Status:** active; remediation open; seven workstreams focused-verified; Node 22 post-codegen source gate green; payout-period policy, production manifest, and hosted certification blocked  

**Rebaselined:** 2026-08-09  
**Authority:** `PROJECT.md` → accepted ADRs → this roadmap

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
Phase 4 — Business Account and routeable-supply maturity (source complete; hosted proof uncertified)
                         ↓
Phase 5 — Public Offering decision loop (source landed on main)
                         ↓
Phase 6 — Single-Key Capability Gateway (remediation open; seven workstreams focused-verified; payout-period policy blocked; hosted certification blocked)
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

**Authority:** ADR-020

The phase is a falsification test. If provider B requires a new lifecycle
state, host command, semantic schema, renderer branch or payment retry rule,
implementation stops and the abstraction finding returns to the parent.

The test confirmed the seam. Provider B owns its publication, transport,
payment recipient and raw-result adapter. Explicit selection uses the unchanged
paid-operation host and `agentic-paid-operation:v1`; uncertainty never falls
back, and switching providers creates a new invocation, authority, payment and
effect lineage. Evidence remains local/mock only.

## Phase 4 — Business Account and routeable-supply maturity

**Status:** source implementation complete at focused/local evidence boundary; hosted proof uncertified
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

## Phase 5 — Public Offering decision loop

**Status:** source landed on `main`; hosted, provider and customer evidence absent
**Goal:** a public visitor or agent can browse businesses, inspect an Offering,
shortlist exact Offering revisions, compare source-owned facts and understand
trade-offs against stated priorities without login.

This founder-accepted goal supersedes the earlier Phase 5 quote-to-close and
real-customer-operating wording.

The phase was accepted as entirely `inspect_only`. On 2026-07-25 that boundary
was deliberately widened: catalog supply can express a callable, priced
capability and `/api/sandbox/$slug/checkup-quote` serves it against labelled
sandbox supply. Contacting a real business, authorizing, booking, paying,
dispatching and claiming fulfilment remain out of this phase.

**Requirements:**

- `P5-CUSTODY`: one exact committed/integrated Offering predecessor revision and
  tree owns schema, generated edges, native/cutover identity and fail-closed flags.
- `P5-CATALOG`: catalog owns exact historical public-revision eligibility and
  strict `professional_service:v1` / `machine_data:v1` facts.
- `P5-REGISTRY`: public HTTP and registered registry actions expose the same safe
  Offering-v2 semantics and reject hostile/private/legacy projection residue.
- `P5-COMPARE`: comparison resolves at most four exact Offering revisions,
  defaults unranked and orders only by inspectable stated-priority lexicography.
- `P5-HUMAN`: public Astryx routes cover browse, Offering detail, URL shortlist
  and accessible comparison states without inquiry or effect controls.
- `P5-AGENT`: fixed public anonymous `POST
  /api/v1/market-operations/compare` executes only the registered inspect-only
  comparison action, consumes the same semantic object as the actual human
  loader and passes zero-effect vertical/horizontal evals.
- `P5-EVIDENCE`: one authenticated exact-revision hosted readback over labelled
  demonstration data produces a frozen independently verified evidence packet.

**Plans:** 8 plans written; none executed through the plan sequence.

The Offering supply graph and the answer-first decision surfaces landed
directly in source (`664d533e`, `b8567dc7`, and the 2026-07-25 catalog and
registry commits), bypassing the plan-by-plan execution the eight plans
describe. The plans remain the specification of record for the parts still
missing. Against the requirements above:

- `P5-CUSTODY`, `P5-CATALOG`, `P5-REGISTRY` — met in integrated source on
  `main`: offering source/migration/supply, catalog/capability-supply/discovery
  /registry projections, owner offering routes and UCP/offering manifests.
- `P5-COMPARE`, `P5-HUMAN` — partially met. Shortlisting exists in the answer
  surface (`src/components/ae/chat/AeShortlistTerminal.tsx`,
  `shortlist-projection.ts`); the specced URL-shortlist and dedicated
  accessible comparison route do not exist.
- `P5-AGENT` — met in integrated source. Anonymous `POST
  /api/v1/market-operations/compare` invokes the registered inspect-only
  `registry.operations.compare` action.
- `P5-EVIDENCE` — not met. No hosted readback or frozen evidence packet exists.

Historical Phase 4B three-quote and Phase 4C quote-to-close proposals remain
research provenance only. Quote/request/inquiry, close/start, independently
operated supply, real-customer evidence, sales tactics, incentives, liquidity
and retention mechanisms are deferred beyond this phase.

## Phase 6 — Single-Key Capability Gateway

**Status:** remediation campaign open; seven workstreams focused-verified; Node 22 post-codegen source gate green; payout-period lifecycle blocked for lack of a trusted server-owned nonzero minimum-payout policy; production manifest and hosted certification blocked  
**ADR:** [ADR-035](adr/ADR-035-single-key-capability-gateway.md)  
**Plan:** [single-key capability gateway implementation plan](research/2026-08-09-single-key-capability-gateway-implementation-plan.md)
**Historical closeout:** [2026-08-11 goblin source remediation outcome](research/2026-08-11-goblin-source-remediation-plan.md)

The 2026-08-11 closeout is preserved as dated source/local evidence and is
superseded for current status by the 2026-08-12 post-remediation re-audit in
`PAPERCUTS.md`.

**Goal:** give one Clerk-issued AE bearer key access to many admitted Market
Operations while keeping supplier credentials server-side and preserving AE's
authorization, policy, invocation, money, evidence, and recovery boundary.

The canonical protected action is `operation.invoke:v1`; the canonical
customer route is `POST /api/v1/operations/execute`; `/mcp`, CLI, and Answer
are adapters over the same application service. Existing
`operation.execute:v1` remains public/keyless/read-only. Clerk issues and
revokes credentials; AE resolves grants, operation/publication/binding,
provider authority, budget, approval/mandate, transport, and evidence.

**Work sequence:**

- `W0` — freeze the Clerk/AE split, canonical route/action, reused seams,
  no-handroll decisions, and proof ceiling.
- `W1` — generalize the Customer Request Clerk verifier, principal, OAuth,
  and grant contracts into `src/modules/agent-access/` with no compatibility
  alias.
- `W2` — add per-key grant, budget, rate, concurrency, and standing-mandate
  admission through existing money and `@convex-dev/rate-limiter` seams.
- `W3` — expose `operation.invoke:v1` through HTTP and registered MCP with
  shared principal and idempotency identity.
- `W4` — bind exact operation/publication/binding/provider/authority/money/
  evidence identity to existing Action Invocation and transport state.
- `W5` — close provider authority with generation-bound leases and final
  server-only credential checks.
- `W6` — add bounded read/cancel/reconcile, correlation, redaction, and
  durable unknown-outcome recovery.
- `W7` — ship the one-question first-use/settings experience, distinct from
  supplier connection management.
- `W8` — publish HTTP/MCP contracts, make CLI/Answer clients of the service,
  and run the exact hosted positive proof.

**Exit gate:** the same real Clerk-issued key invokes two real operations from
distinct admitted suppliers/connection modes on the exact configured hosted
revision; budget/approval, server-only credentials, durable terminal/recovery
state, exact usage/evidence readback, same-key zero-meter replay,
revoke/withdraw refusal, and one hard-capped live top-up/charge/payout with
zero-movement replay all hold in one strict receipt. CI independently parses
that exact object. Source/local tests, fixtures, mocks, refusals, or generated
manifests cannot satisfy this gate. Until exercised, hosted and live-money
proof remain uncertified.

## Deferred decisions

Independently operated supply, real-customer evidence, additional authority
modes and broader mandate policies,
workflow composition, commercial-provider integration and market mechanisms
remain separate gates. Phase 4 source maturity must not silently claim them.
