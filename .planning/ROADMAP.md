# Agentic Economy — Current Product Roadmap

**Status:** active
**Rebaselined:** 2026-07-20
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
Phase 3 — Protocol/kernel → product conversion (verification repair)
                         ↓
Future exposure decision
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

## Phase 3C — Hosted paid-operation product trial

**Status:** verification_required — post-closeout repair in progress
**Depends on:** Phase 3A and Phase 3B
**Goal:** let an authenticated developer or product evaluator run, understand
and safely recover one hosted-sandbox BTC/USD paid operation through equivalent
human and structured-agent surfaces.

Phase 3C extends the existing Action Invocation, paid-operation application
service, `agentic-paid-operation:v1` semantics and query-agnostic renderer. It
adds production-shaped durable read and command ports, a protected hosted
sandbox human surface, an equivalent structured-agent surface and
exact-revision hosted readback.

The two existing mock providers remain labelled sandbox fixtures.
`/actions/paid/new` is protected evaluator-only Sandbox setup, not canonical
product IA or comparison. `/` remains canonical and
`/actions/paid/:invocationRef` is reusable paid Action Detail. Setup selects a
closed fixture key; the source owner resolves and binds the provider before
authority. Switching from safely terminal truth creates a new consequence
identity. No ranking or automatic fallback is added.

**Plan authority:** `.planning/phases/03c-hosted-paid-operation-product-trial/`

Seven sequential waves cover boundary REDs; bounded durable composition;
source-owned creation, labelled-mock custody/effect and reconciliation;
authenticated human/agent adapters; paid-operation UI/browser contracts; independent
comprehension; and a separately authorized exact-revision hosted readback.
`03C-AGENT-RUNBOOK.md` owns executor, custody and handoff constraints.

The UI/eval contract separates one ordered forward golden path from named
unhappy “goblin paths.” Each goblin branches at a specific transition and must
either rejoin through one safe continuation or stop visibly.

Generality is limited to query/provider variation inside the paid-operation
class. Closure classifies and retires trial residue; it does not promote Phase
3C behavior to generic Action or permanent DESIGN authority without a second
validated use.

The phase stops if hosted persistence requires a second lifecycle, human and
agent surfaces diverge, shared semantics or rendering acquire BTC/provider
branches, uncertainty becomes retryable, or a hosted readback cannot
reconstruct the safe continuation from durable source-owned records.

The hosted run retained useful source facts: two golden mock effects, one
response-lost effect, revoked temporary credentials, and a disabled g5 policy.
Its live collector refused before final admission, however, and the packet was
rebuilt later. The retained packet therefore proves local integrity only. A
fresh repair must persist immutable payment proposal facts, make agent commands
source-issued, close stale/relationless recovery, remove the hidden rich human
projection, bind an immutable deployment URL, and retain post-disable state in
a v2 packet before the hosted class can be reconsidered. Human comprehension
remains `NOT_RUN`; automated comprehension is adjunct evidence only.

## Deferred decisions

Independently operated supply, real payment and settlement, real-customer
evidence, broader authority modes, provider onboarding, comparison and workflow
composition remain separate gates after the Phase 3C hosted sandbox trial.
