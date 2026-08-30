# Product authority

**Status:** active product charter  
**Last rebuilt:** 2026-08-24

## Category

Agentic Economy is a marketplace where agents working for people and companies
find, compare, and buy services from businesses and other agents.

It is a cross-harness market for **last-mile agent services**: outside
contributions an agent acquires when its current model, context, tools, data,
permissions, or physical reach cannot complete the next step in its work.

## Customer and job

The consuming customer is an agent acting for a person or organization within
delegated preferences, authority, and budget.

The job is:

> I cannot complete my next step with the capabilities already available to me.
> Find a suitable outside service, let me choose within my constraints, acquire
> one bounded contribution, and return something I can use immediately.

The supplier may be a software company, platform, specialist, data owner,
machine operator, human expert, or another agent. Its internal process may be
complex. The returned contribution only needs to be bounded and consumable by
the calling agent.

## Active product

The implemented product is an **Operation market**.

An Operation is the exact callable contribution offered by one supplier. It
defines the input contract, provider, access requirements, price, material
terms, effects, readiness, and evidence available to the caller.

One invocation is one use of an Operation. The result is the information,
artifact, judgement, computation, access, or external action that allows the
agent to continue its own project.

## Golden journey

1. The agent encounters a capability boundary during work it already owns.
2. It describes the missing contribution and searches the market.
3. Agentic Economy returns viable canonical Operations.
4. The agent compares suppliers and inspects exact inputs, total price,
   readiness, data use, and effects.
5. The agent or its principal selects within delegated constraints.
6. An eligible keyless Operation runs immediately, or the caller connects once
   for authenticated or consequential work.
7. Agentic Economy returns literal output or a durable receipt and supports
   status and recovery when the effect is uncertain.
8. The agent consumes the contribution and continues in its own harness.
9. Repeat gaps create repeat demand, switching, and supplier learning.

## Product surfaces

- The website catalogue exposes searchable canonical Operations.
- Thin chat translates natural-language needs into the five bounded market
  tools: search, detail, compare, inspect-plan, and eligible keyless execute.
- API, MCP, and CLI expose the same canonical market to software agents.
- A connected buyer may retain one bounded failed-search phrase as a private
  market-gap signal and later re-evaluate it against current canonical
  Operations. This is market demand memory, not project memory, a tender, or a
  supplier message; the signal is never callable supply.
- The authenticated invocation plane owns controlled calls, idempotency,
  payment, receipts, status, cancellation, and reconciliation.
- Supplier surfaces publish and maintain callable Operations.
- The external registry discovers possible supply at metadata authority only.
  Registry entries are not executable and are not canonical Operations.

## Ownership boundary

The consuming agent or harness owns:

- the larger project and user relationship;
- planning, reasoning, memory, and context management;
- deciding when an outside capability is needed;
- incorporating the returned contribution;
- downstream success of the project.

Agentic Economy owns:

- discovery of available outside services;
- comparable Operation contracts and current market facts;
- selection support and pre-call inspection;
- bounded caller authority and safe execution;
- payment and provider settlement where applicable;
- invocation identity, receipts, observation, and recovery;
- signals about allocation, completion, repeat use, and supplier earnings.

## Non-goals

Agentic Economy is not:

- a general agent, harness, or orchestration engine;
- a project, task, planning, or memory system;
- a tender board or human procurement workflow;
- a content-generation pipeline;
- a general workflow or execution-inspection platform;
- a speculative abstraction layer above the Operation market;
- a directory that treats imported metadata as callable truth.

Do not recreate product spines from historical compatibility identifiers. If an
identifier still exists in source but the capability is absent from this
charter, treat it as migration residue unless current behavior demonstrably
depends on it.

## Strategic thesis

Connectors remain best for predictable, frequent, preselected capabilities. The
open market matters for needs that are unexpected, specialised, fragmented,
regional, temporary, newly created, or too infrequent for every harness to
integrate in advance.

The defensible behavior is allocation:

1. Agents look to Agentic Economy when they encounter an unfamiliar gap.
2. Useful suppliers are available.
3. The selected contribution can be acquired immediately.
4. Subsequent comparable demand continues to flow through the market.

Catalogue size, protocol ownership, and payment mechanics are enabling
infrastructure. They are not evidence that a market exists.

## Evidence required

The product is working only when real behavior demonstrates that:

- agents encounter valuable gaps their installed capabilities cannot close;
- they describe those gaps precisely enough to find useful supply;
- multiple credible Operations exist where comparison matters;
- a call returns something the agent can use immediately;
- delegated authority is sufficient for agents to choose and spend;
- similar gaps produce repeat calls or supplier switching;
- suppliers receive incremental demand and respond to it;
- the second use still passes through Agentic Economy;
- the loop works across more than one agent or harness.

The immediate product pressure is not to add more platform machinery. It is to
prove one narrow category in which an agent discovers an unfamiliar supplier,
acquires a useful contribution, continues its work, and returns to the market.

## Interpretation rules

- This file defines the active product.
- Current source and tests define what is implemented.
- Research may propose alternatives but does not change the product until this
  charter is deliberately updated.
- Git history records previous systems and migrations; it is not current
  product context.
