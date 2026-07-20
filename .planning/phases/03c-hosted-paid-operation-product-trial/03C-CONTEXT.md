---
phase: 03C
name: hosted-paid-operation-product-trial
status: accepted_for_planning
decision_owner: Founder
accepted: 2026-07-20
depends_on:
  - Phase 1 Action Invocation foundation
  - Phase 2 shared human and agent action plane
  - Phase 3A one reliable paid operation
  - Phase 3B second-provider plug-in test
---

# Phase 3C — Hosted paid-operation product trial context

## Outcome

An authenticated developer or product evaluator can run, understand and safely
recover one hosted-sandbox BTC/USD paid operation for no more than $0.01 through
equivalent human and structured-agent surfaces.

BTC/USD is the trial operation because it is simple to model with mock data and
endpoints, gives an exact understandable result, exercises a small payment
consequence and supports meaningful uncertainty, reconciliation and recovery
states without a larger domain workflow.

## Locked decisions

### D-01 — Evidence target

Phase 3C targets authenticated exact-revision hosted-sandbox reachability,
durable reconstruction, shared human/agent truth and product comprehension.
It does not target real payment, provider fulfilment, production safety or
customer-value proof.

### D-02 — Existing semantic and application seams

Reuse `PaidOperationApplicationService`, `agentic-paid-operation:v1`,
`projectRichPaidOperation`, `projectStructuredPaidOperation` and
`AePaidOperationCard`. Hosted transport and persistence must adapt to these
source-owned seams rather than creating a parallel lifecycle.

### D-03 — Human surface

`/` remains the canonical outcome-first product entry and is not redesigned by
this phase. Phase 3C adds `/actions/paid/new` only as a protected,
evaluator-only Sandbox setup adapter. It may select a labelled mock fixture and
create the trial invocation, but it is not canonical product IA, Options,
provider comparison or a future universal action entry.

`/actions/paid/:invocationRef` is the reusable paid Action Detail projection. It
leads with the task, material consequence, current payment/result truth and safe
next action. Technical identity and evidence remain progressively disclosed.

The surface may be reached from the canonical authenticated product experience,
but chat does not own or reconstruct its state.

### D-04 — Agent surface

Provide one authenticated structured-agent adapter over the same application
service. It returns the semantic object and digest, expected invocation version,
typed refusal/error and only permitted current command.

The evaluator-scoped agent setup/create adapter precedes inspect/command. There
is no generic discovery API or tool marketplace and no caller-constructed
authority, provider material, continuation or reconciliation result.

### D-05 — Trial setup and provider binding

Keep both existing labelled mock providers. Provider identity is material and
visible before authority, but comparison is not a product feature in this
phase. The protected Sandbox setup adapter accepts a closed fixture selector,
and the source owner resolves and durably binds the provider before consequence
review. Provider selection remains outside `AePaidOperationCard`. Switching
provider from a safely terminal record creates a new invocation, authority,
payment identifier and effect lineage. It is absent during uncertainty.

### D-06 — UI system

Use Astryx neutral and the semantic bridge in `src/styles/globals.css`. Shared
paid-operation UI remains query- and provider-agnostic inside the
paid-operation class. BTC, x402 and provider-specific payload fields stay
inside the operation adapter or protected technical detail. This does not prove
booking, inquiry, dispatch, communication, cancellation or other non-paid
Action compatibility. Models do not generate components or executable controls.

### D-07 — Golden path and goblin paths

The forward golden path is fixed and independently testable: use the protected
Sandbox setup to create with a source-bound mock provider, review provider/
charge/shared data, authorize, show “permission recorded; nothing submitted yet,”
execute once, inspect separately stated payment/settlement/result truth, and
reload or cold-restore the same completed invocation without changing meaning.

Every unhappy “goblin path” branches from a named golden transition and must
rejoin through an explicit safe continuation or stop visibly. Goblin paths
cover authentication/admission refusal, authority refusal, source refusal,
duplicate/stale/cross-principal commands, payment possibly submitted,
settlement unknown, invalid result, ambiguous transport, reconciliation,
aggregate/read outage, reload and cold reconstruction. Uncertainty exposes
reconciliation only and never automatic retry, provider switch or fallback.

### D-08 — Claim language

Every surface labels the environment as hosted sandbox and identifies mock
provider provenance. A provider response or payment assertion is not promoted
to independent settlement or fulfilment.

## the agent's Discretion

- Exact protected route names, provided human and agent routes share the same
  source application service and authentication boundary.
- Whether the protected Action detail is embedded in the authenticated root
  workspace or linked as a dedicated detail route.
- Internal file splits and port names that preserve current module ownership.
- Focused fixture identifiers and test harness structure.

## Explicit deferrals

Real credentials/payment, independent settlement, independently operated
providers, public anonymous execution, provider onboarding, provider ranking
or comparison, automatic fallback, composition, broad Activity, standing
mandates and Full autonomy.

## RED and stop conditions

Stop and return to the founder if:

1. durable hosted state cannot reconstruct payment submission and safe
   continuation without transcript, component or process memory;
2. the host needs a second lifecycle or host-owned business rules;
3. human and agent semantics diverge;
4. shared semantics or rendering require BTC/provider branches;
5. uncertain payment becomes retryable or triggers fallback;
6. exact-revision hosted readback cannot bind deployment, actor, fixture and
   continuation truth.
