# Models for partial workflow entry and composable economic capabilities

**Owner:** Product<br>
**Status:** Active<br>
**Maturity:** Target research<br>
**Question:** Which established models should AE mirror when agents need to enter and leave at different points rather than delegate a complete lifecycle?<br>
**Decision affected:** None<br>
**Evidence cutoff:** 2026-07-17<br>
**Review by:** 2026-08-17<br>
**Supersedes:** None<br>
**Superseded by:** None

## Executive finding

No reviewed model provides AE's complete requirement. The strongest pattern is a
layered combination:

1. independently discoverable, typed operations;
2. independently negotiated commercial capabilities;
3. portable authority and evidence attached to each consequential invocation;
4. durable execution history owned by the system performing the effect;
5. separately declared bundle recipes that compose operations without changing
   their individual meaning.

AE should therefore not expose its internal lifecycle states as the network
product. It should test whether atomic economic operations can compile into the
existing contract, authority, effect, evidence, and recovery machinery. Bundles
would describe compositions of those operations.

This finding does not choose an interface, authorize source changes, or prove
customer demand.

## Observations

### MCP: discoverable atomic invocation

- **OBSERVED:** MCP servers expose tools, resources, and prompts. Tools are
  discovered with `tools/list` and invoked with `tools/call` using a declared
  input schema. MCP hosts can combine tools from multiple servers into one
  registry. [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- **OBSERVED:** MCP focuses on context exchange and does not determine how an AI
  application manages or uses that context. It provides protocol lifecycle and
  progress mechanisms, while experimental Tasks wrap deferred execution and
  later result retrieval. [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- **INFERRED:** MCP is a suitable distribution adapter for AE operations, but
  MCP tool invocation alone does not define economic authority, idempotency,
  evidence, or recovery semantics.

### UCP: negotiated modular commercial capabilities

- **OBSERVED:** UCP decomposes commerce into separately declared capabilities
  and extensions. A business publishes supported capabilities so a platform can
  discover and configure compatible interactions. Capabilities can be bound to
  REST, MCP, or A2A transports.
  [UCP repository](https://github.com/Universal-Commerce-Protocol/ucp)
- **OBSERVED:** UCP's capability set includes separately specified operations
  such as checkout and order management rather than requiring every merchant to
  expose one universal end-to-end operation.
  [UCP overview](https://ucp.dev/latest/specification/overview/)
- **INFERRED:** This is the closest structural model for AE's network surface:
  businesses declare which economic capabilities they support, while bundles
  remain optional compositions. UCP's current retail vocabulary is not a
  wedge-neutral domain model for services.

### Arazzo: bundle recipe, not runtime ownership

- **OBSERVED:** Arazzo describes sequences of OpenAPI or AsyncAPI operations and
  their dependencies to deliver an outcome. Workflows declare inputs, steps,
  success criteria, outputs, and success or failure actions.
  [Arazzo Specification](https://spec.openapis.org/arazzo/latest.html)
- **OBSERVED:** Arazzo supports step dependencies, asynchronous join points,
  retries, and transfers to another step or workflow on failure.
  [Arazzo Specification](https://spec.openapis.org/arazzo/latest.html)
- **INFERRED:** Arazzo is a strong analogue for an AE bundle manifest: a
  machine-readable recipe over independently usable operations. It is a
  description format, not the durable economic executor or evidence authority.

### Temporal: durable composition and runtime-owned history

- **OBSERVED:** Temporal Workflow Executions record an ordered Event History and
  reconstruct state through deterministic replay. External interactions occur
  through Activities whose results are recorded and reused on replay.
  [Temporal Workflow documentation](https://docs.temporal.io/workflows)
- **OBSERVED:** A running Temporal Workflow may expose Queries, Signals, and
  Updates. Clients still address a Workflow Execution using its Workflow ID;
  message handlers operate on that execution's state.
  [Temporal message passing](https://docs.temporal.io/develop/typescript/workflows/message-passing)
- **INFERRED:** Temporal validates AE's durable history, idempotency, resume, and
  recovery posture. It also demonstrates the limitation already present in AE:
  rich mid-workflow interaction is not the same as accepting portable state from
  work initiated elsewhere.

### AP2: authority lineage for consequential action

- **OBSERVED:** AP2 defines protocol artifacts and flows for interoperable
  agent-driven payments, with canonical schemas and mandate-oriented samples
  separated from the agent framework used in demonstrations.
  [AP2 repository](https://github.com/google-agentic-commerce/AP2)
- **INFERRED:** AE should mirror the principle that a consequential invocation
  carries verifiable authority bound to the intended commercial object. AP2 is
  payment-specific and does not provide general workflow state or service
  recovery.

### x402 and Agentic Market: paid atomic resources and packaged recipes

- **OBSERVED:** x402 lets a resource server declare payment requirements,
  verify a payment payload, and provide the requested resource after successful
  payment. [x402 client/server model](https://docs.x402.org/core-concepts/client-server)
- **OBSERVED:** Agentic Market packages independently priced API services into
  bundles declaring parallel calls, optional calls, fallbacks, estimated cost,
  and a final synthesis.
  [Agentic Market research bundle](https://agentic.market/bundles/market-research)
- **INFERRED:** This is a useful commercial pattern for paid atomic results and
  productized compositions. It does not address physical-world authority,
  provider commitment, delayed evidence, or uncertain external effects.

## Comparative model

| Model | What AE should borrow | What it does not solve |
|---|---|---|
| MCP | Dynamic discovery and typed invocation | Economic semantics and durable recovery |
| UCP | Independently declared, versioned capabilities and extensions | Wedge-neutral services and multi-business evidence |
| Arazzo | Bundle inputs, steps, dependencies, branches, and outputs | Runtime custody and authoritative execution history |
| Temporal | Durable history, replay, messaging, and recovery | Portable state across independent economic systems |
| AP2 | Authority bound to the consequential commercial object | Non-payment capability and outcome semantics |
| x402 / Agentic Market | Pay-per-result operations and sellable recipes | Long-running real-world coordination |

## Inferences

- **INFERRED:** AE needs two interfaces over the same neutral machinery:
  capability invocation for partial entry, and bundle orchestration for a larger
  delegated outcome.
- **INFERRED:** A safe invocation needs more than a tool schema. It needs a
  portable envelope containing contract and operation identity, attributable
  facts, provider scope, authority, attempt identity, expected evidence, and
  uncertainty or recovery posture.
- **INFERRED:** Bundles should reference versioned independent operations. A
  bundle must not create a second authority, execution, evidence, or recovery
  implementation.
- **INFERRED:** AE should mirror UCP's capability/extension separation and
  Arazzo's workflow description while preserving AE's stricter authority and
  evidence contracts.

## Unknowns

- **UNKNOWN:** Whether provider identity and an external proposal can be admitted
  safely without AE having generated the candidate and quote lineage.
- **UNKNOWN:** Which result references can be portable across providers without
  claiming that AE verified an external physical outcome.
- **UNKNOWN:** Whether providers will implement atomic qualification, quote,
  commitment, inspection, or recovery operations, or require AE-hosted adapters.
- **UNKNOWN:** Whether calling agents prefer several atomic calls or a
  decision-ready bundle enough to support distinct pricing.

## Hypotheses and falsifiers

| ID | Hypothesis | Baseline | Measurement | Falsifier | Owner | Review by |
|---|---|---|---|---|---|---|
| PE-001 | A supplied-candidate qualification envelope compiles into existing contracts without a kernel edit. | Current Request chooses candidates. | New concepts and duplicated rules required by an eval-only compiler. | It requires new authority, evidence, or recovery semantics rather than a new seam. | Engineering | 2026-08-17 |
| PE-002 | Quote collection can be invoked independently while reusing current preparation and quote evidence. | Quote preparation is Request-owned. | Existing machinery reused and caller-supplied scope remains attributable. | Candidate scope or quote lineage can only be made safe by reconstructing the full Request. | Product + Engineering | 2026-08-17 |
| PE-003 | An external commitment can be inspected safely through a portable reference and provider evidence contract. | Inspection requires AE Request/run lineage. | Attributable status, unknown, and recovery outputs without invented truth. | Provider evidence cannot be authenticated or reconciled without AE owning commitment creation. | Product + Supply | 2026-08-17 |

## Decision impact

Continue with eval-only portable invocation envelopes. Do not choose an external
interface or change the kernel until PE-001 through PE-003 establish whether the
work is an interface seam, an adapter concern, or a genuine missing primitive.

No ADR or product-authority update is warranted yet.

## Current-versus-target check

- **Current evidenced behavior:** Independent public catalog discovery and
  qualified human inquiry; authenticated Request operations within AE-owned
  lineage.
- **Target behavior informed by this research:** Independently discoverable
  economic operations and optional bundle recipes over the same neutral trust
  machinery.
- **Claims this research does not authorize:** Standalone qualification, quote,
  commitment, inspection, recovery, payment, booking, or fulfilment.
