# Agentic Economy product authority

## Customer promise

**Your agent knows who to call.**

People should not need to understand routing, protocols, capability graphs, or
provider infrastructure. They tell their agent what they need. Agentic Economy
helps that agent find the right real businesses, compare the available ways
forward, and carry the work into action.

The customer experience is:

1. **Ask** — say what you need in your own words.
2. **Clarify** — answer only the questions that materially improve the choice.
3. **Choose** — see a recommendation, alternatives, price, timing, and important
   tradeoffs in ordinary language.
4. **Confirm** — approve the exact spend, information sharing, and next action.
5. **Follow** — see progress, respond when needed, and keep the resulting record.

## Product architecture

Agentic Economy is powered by a neutral routing engine for agents.

An agent gives AE a natural-language request and constraints. AE finds registered
capability bindings, composes viable route graphs, and returns a signed route
quote: an inspectable plan with providers, steps, cost, data disclosures, and
failure paths declared before execution. The caller approves that exact quote.
AE then executes it once and records the outcome as a Root Run.

The marketplace is a projection of the engine's routeable supply. It is not the
engine and it is not the primary product.

## Core lifecycle

1. **Request** — an agent submits an intent, network, and constraints.
2. **Quote** — AE returns ranked route graphs with declared cost, data use,
   provider bindings, and fallback order.
3. **Approve** — the principal grants bounded authority tied to the exact quote
   digest, spend, expiry, recipients, purposes, and allowed data.
4. **Run** — AE executes the approved graph with idempotency and least authority.
5. **Inspect** — the caller reads the Root Run, leaf attempts, evidence, failures,
   cancellations, and reconciliation state.
6. **Report** — callers publish outcome evidence or incidents. AE records it and
   uses the resulting network state in later routing. AE does not adjudicate the
   quality of a real-world outcome.

## Supply model

An entity can expose a capability through its own endpoint, an onboarded adapter,
or an AE-hosted implementation. Every routeable capability is a registered
binding between an entity, a contract, an operation, an endpoint, and evidence of
admission and conformance. A page without a registered capability is discoverable
inventory, not routeable supply.

The engine is neutral about entity type and domain. Businesses are the first
source of supply; household, business, procurement, and industry labels do not
belong in kernel contracts.

## Users and surfaces

- **Calling agents** use signed HTTP or MCP operations: route, authorize,
  execute, inspect, reconcile, and cancel.
- **Principals** inspect and approve exact route quotes and set spend and data
  limits.
- **Capability providers** register and operate endpoint bindings.
- **Network operators** inspect Root Runs, binding health, evidence, and incidents.
- **People** use the product UI to understand the network, inspect plans and runs,
  and manage authority. The UI is a projection of the same contracts agents use.

## Surface architecture

- `/` explains the customer promise and starts with a need, not an engine.
- `/engine` is the ask workspace. The route request is a secondary technical
  disclosure for agents and builders.
- `/registry` is the marketplace projection of registered entities and published
  supply.
- `/developers/discovery` and machine-readable discovery files expose the agent
  integration contract.
- `/admin/runs` is the protected Root Run and evidence surface.
- Provider and incident controls remain protected operational surfaces.

## Brand

**Promise:** Your agent knows who to call.

**Position:** People already ask AI for advice. AE gives their agent a way to
work with real businesses when the answer needs to become action.

**Voice:** direct, technical when precision matters, and readable by a person who
does not write software. Name the object and the action. Do not sell aspiration as
current capability.

## Product rules

1. The graph is the differentiator and stays backstage. Customer surfaces show
   its useful consequence: a better recommendation, a clear alternative, an
   upfront boundary, or a recoverable failure.
2. Quote before authority. No execution without approval bound to an immutable
   quote digest.
3. Data is authority. Disclosure is bounded by field, recipient, purpose, and
   step just as spend is bounded by amount and currency.
4. Signed calls and idempotency are defaults, not premium features.
5. Reputation is evidence, not a verdict. Incidents and reported outcomes affect
   routing state; AE does not promise external fulfilment.
6. Human and machine surfaces describe the same lifecycle and operations.
7. Registration is necessary, never sufficient. Routeable supply requires an
   admitted, conformant capability binding.
8. Public copy leads with the customer's need. Protocol vocabulary belongs in a
   disclosure, builder surface, machine contract, or diagnostic view.

## Banned framing

Do not define AE as a household assistant, lead marketplace, inquiry workflow,
business directory, posting system, or generic API registry. Do not put a seed
vertical into kernel language. Do not claim AE validates physical-world outcomes.
Do not hide an unimplemented operation behind marketing copy.

## Accessibility

Human surfaces target WCAG AA, persistent labels, visible focus, keyboard access,
44px touch targets where practical, non-colour status cues, responsive layouts,
and reduced-motion support.
