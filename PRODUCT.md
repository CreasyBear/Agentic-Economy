# Agentic Economy product authority

This document defines both the destination and the evidence required to claim
progress toward it. Read the two states separately:

- **Current evidenced state** describes behavior present in production source
  and confirmed through the relevant local or hosted journey.
- **Target product contract** describes what AE is being engineered to become.
  It is an architectural requirement, not a public feature claim.

Source and readback decide current truth. Closing an issue, persisting a new
object, or passing a narrow sandbox proof does not move a capability into the
current product unless a customer or external agent can reach and use it through
the intended surface.

## Customer promise

**Your agent knows who to call.**

People should not need to understand routing, protocols, capability graphs, or
provider infrastructure. They tell their agent what they need. Agentic Economy
helps that agent find the right real businesses, compare the available ways
forward, and carry the work into action.

They may ask for one useful piece of work or a complete outcome. AE should help
with the task they recognize now, preserve the result, and make the next useful
tasks easier. When it adds value, AE can coordinate those tasks into a complete
route. The customer does not need to surrender the entire project before
receiving value.

## Vision: a local platform on global rails

AE is not being built on the assumption that it must defeat global agent,
hosting, payment, search, or commerce platforms at their own layer. Their scale
does not make local markets understandable or operable.

Global infrastructure can run an agent, expose a tool, move money, or complete
a conventional checkout. It does not automatically know which local businesses
can satisfy a particular need, whether their information is current, which
conditions apply, how unlike offers should be compared, what remains to be
confirmed, or how work involving several businesses should continue when
something changes.

AE may use global infrastructure wherever it is the best rail. It should remain
able to support more than one rail and must not surrender its product meaning to
any one of them. AE's ambition is to own the useful local layer above those
rails:

- the relationship with participating businesses;
- clear, current descriptions of what each business can provide;
- locally meaningful conditions, eligibility, geography, timing and evidence;
- discovery and comparison shaped around a person's actual constraints;
- supported individual tasks and composed work across several providers;
- continuity when a person, their agent, a business or an AE-assisted experience
  hands the work to another participant;
- an honest record of what was attempted, confirmed, completed, contradicted or
  left unresolved.

This is not a retreat into a narrow directory or regional wrapper. A sufficiently
useful local network can become the operating layer through which people and
agents understand available supply and coordinate real work. Global rails may
make that network cheaper and more interoperable; they do not replace the local
knowledge, supply relationships and coordination required to make it valuable.

AE can create value before every business is fully integrated. Participating
businesses can expose structured information and supported actions. Known but
unintegrated businesses can be discovered or contacted with their unknowns made
clear. Open-market candidates can be researched as leads without being presented
as admitted or immediately routeable supply. Repeated demand and coordination
can then inform which businesses and tasks should be onboarded more deeply.

The strategic boundary is therefore:

> Global platforms may run the agent, expose the service, move the money or
> complete a standard checkout. AE helps determine which real businesses can do
> the work, makes the available ways forward understandable, coordinates the
> parts that benefit from coordination, and preserves enough truth for the work
> to continue or recover.

The target customer experience is:

1. **Ask** — say what you need in your own words.
2. **Clarify** — answer only the questions that materially improve the choice.
3. **Choose** — see comparable options, price, timing, and important tradeoffs in
   ordinary language. AE recommends one only when an explicit customer priority
   supports a deterministic, evidence-backed ordering; otherwise the options
   remain unranked for the person and their agent to judge.
4. **Confirm** — approve the exact spend, information sharing, and next action.
5. **Follow** — see progress, respond when needed, and keep the resulting record.

These are recurring movements through the product, not a mandatory funnel. A
person or agent may arrive with constraints, a shortlist, an existing quote, a
prior commitment, one immediate task, or a complete need. They may stop after a
useful result, continue progressively, or ask AE to coordinate what remains.

## Current evidenced state — 2026-07-14

### Customer-reachable now

- published business-supplied pages that people and assistants can read and
  compare;
- public business search and detail operations;
- a qualified-inquiry handoff when a published listing supports it;
- an authenticated external-agent Customer Request API that has completed a
  narrow hosted sandbox journey through request creation, clarification,
  preparation, authority stops, and resume.

`/engine` exposes an authenticated Customer Request workspace, but a complete
human journey through its real production dependencies has not been proven.
The sandbox agent journey does not prove useful real supply or human parity.

### Committed substrate, not yet customer product

- neutral business, contract, offering, binding, publication, eligibility, and
  readiness records;
- natural-language interpretation constrained by registered capability
  contracts;
- multi-capability RoutePlan compilation and durable internal persistence.

Today AE does **not** provide a customer-reachable multi-step RoutePlan decision,
composite approval, composite execution, booking, payment, dispatch, or
real-world fulfilment. A compiled or persisted RoutePlan is not a customer
capability until the same customer-semantic object crosses the HTTP and UI
boundary and can be resumed, chosen, authorized, run, and inspected.

The current public surfaces are not yet one product:

- `/` starts the older Answer Thread and registered-business search journey;
- `/engine` starts the authenticated Customer Request workspace;
- `/api/v1/requests` exposes the authenticated external-agent Request journey;
- `/registry` exposes published business discovery and qualified inquiry.

This split is migration state, not the intended architecture. No new product
semantics should be added to Answer Thread that belong to Customer Request.

## Target product contract

Agentic Economy is powered by neutral machinery for agents working with real
businesses.

An agent may give AE a complete need, one immediate task, or attributable work
already completed elsewhere. AE uses registered business information and
capability bindings to find candidates, gather missing information, test
suitability, prepare comparisons or perform an authorized action. Each useful
result can stand alone or become input to the next task.

For a complete outcome, AE composes viable route graphs and returns a signed
route quote: an inspectable plan with providers, steps, cost, data disclosures,
and failure paths declared before execution. The caller approves that exact
quote. AE then executes it once and records the outcome as a Root Run. These
sentences define the target contract; they are not permission to describe those
operations as currently available.

The marketplace is a projection of the engine's routeable supply. It is not the
engine and it is not the primary product.

## Target task and route lifecycle

The following controls describe the complete route. They are not mandatory
entry steps for every useful task. Read-only discovery or comparison may end
without authority or execution. Work that began elsewhere may enter with
attributable prior state rather than a fabricated AE history.

1. **Request** — an agent submits an intent, network, and constraints.
2. **Quote** — AE returns viable route graphs with declared cost, data use,
   provider bindings, and fallback order. Routes remain unranked unless the
   Request contains an explicit supported objective and current comparable
   evidence produces a unique ordering.
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

For product and onboarding purposes, this means AE must know what information a
business can provide, which questions it can answer, which actions it can
perform, what each requires, what evidence it returns, and how refusal, timeout
or uncertainty is handled. Those declarations are what let agents perform
useful work and compose larger outcomes.

The engine is neutral about entity type and domain. Businesses are the first
source of supply; household, business, procurement, and industry labels do not
belong in kernel contracts.

## Target users and surfaces

- **Calling agents** discover business information, perform supported individual
  tasks, and optionally use signed HTTP or MCP operations to route, authorize,
  execute, inspect, reconcile, and cancel complete work.
- **Principals** inspect and approve exact route quotes and set spend and data
  limits.
- **Capability providers** register and operate endpoint bindings.
- **Network operators** inspect Root Runs, binding health, evidence, and incidents.
- **People** use the product UI to understand the network, inspect plans and runs,
  and manage authority. The UI is a projection of the same contracts agents use.

## Target surface architecture

- `/` becomes the canonical customer surface: it may start with a need, one
  recognizable task, or prior work. Larger outcomes compile into Customer
  Request; partial entry uses the supported task without inventing a Request
  history.
- `/engine` is migration-only and redirects to `/` after the canonical Request
  journey reaches cutover evidence.
- `/registry` is the marketplace projection of registered entities and published
  supply. It supports discovery, individual tasks and the Request journey; it
  does not own customer intent, recommendation, authority, or execution.
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
   its useful consequence: comparable ways forward, a justified recommendation
   when an explicit priority supports one, an upfront boundary, or a recoverable
   failure.
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
9. Current product, committed substrate, and target contract are separate
   maturity states. Never promote a capability between them without executable
   evidence at the intended customer or agent surface.
10. Conversation is an input and presentation adapter. It either invokes a
    supported task or compiles a larger outcome into Customer Request. It must
    not become a second intent, persistence, recommendation, task, or recovery
    domain.
11. Useful tasks are independently valuable. A person or agent may enter with
    prior work, stop after one result, continue progressively, or ask AE to
    coordinate the remaining route.
12. A full route is presented as understandable tasks, decisions and handoffs.
    It is not required upfront, and approval for one task never grants authority
    for another.
13. Business onboarding is judged by the useful information and supported
    actions it makes available to agents, not by registration alone.
14. Global infrastructure is leverage, not the boundary of AE's ambition. Adopt
    suitable hosting, tool, payment and checkout rails without outsourcing
    business meaning, local supply relationships, comparison, coordination or
    continuity to a single provider.

## Banned framing

Do not define AE as a household assistant, lead marketplace, inquiry workflow,
business directory, posting system, or generic API registry. Do not put a seed
vertical into kernel language. Do not claim AE validates physical-world outcomes.
Do not hide an unimplemented operation behind marketing copy.

## Accessibility

Human surfaces target WCAG AA, persistent labels, visible focus, keyboard access,
44px touch targets where practical, non-colour status cues, responsive layouts,
and reduced-motion support.
