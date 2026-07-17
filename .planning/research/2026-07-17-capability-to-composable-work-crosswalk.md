# From business capabilities to composable customer work

**Owner:** Product and Engineering
**Status:** Active
**Maturity:** Target research
**Question:** Does the product vision—agents using business information and capabilities to complete individual tasks or compose full routes—align with ADR-009, PRODUCT.md and DESIGN.md?
**Decision affected:** Proposed D-006 and ADR-009
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

## Product frame

A person trying to travel does not perform one indivisible “travel workflow.”
They state constraints, find transport and accommodation, check locations and
times, compare options, obtain current prices, make selections, authorize
bookings, inspect confirmations and respond to changes.

Procurement, events and supplier management use different nouns but repeat the
same human work: state constraints, find candidates, gather information, test
suitability, compare, decide, authorize, communicate, observe and repair.

AE's role is to ensure that onboarded businesses expose sufficiently current
information and sufficiently precise capabilities for agents to perform those
tasks safely. An agent may use one task, combine several itself, use an AE
bundle, or ask AE to coordinate the complete route.

This is a target product frame. It does not make booking, payment, dispatch or
fulfilment currently available.

## Authority crosswalk

| Product idea | ADR-009 | PRODUCT.md before reconciliation | DESIGN.md before reconciliation | Required treatment |
|---|---|---|---|---|
| Start with one recognizable task | Aligned: partial entry is explicit | Missing: target begins with a natural-language Request and route graph | Missing: recommendation is the universal primary object | Make a current task and its result the primary product unit |
| Arrive with prior work | Aligned: shortlist, quote and external commitment are admissible claims | Missing from target entry contract | Missing from interaction model | Allow constraints, candidates, quotes and prior references as attributable entry state |
| Business onboarding supplies agent-usable facts and actions | Aligned through exact contracts, evidence and provider scope | Partially aligned through capability bindings | Partially aligned through Businesses and route docket | State the supply promise in ordinary language, while retaining contract-level controls backstage |
| Continue progressively | Aligned: stop, resume or coordinate remaining route | Implied by Follow, but lifecycle reads as mandatory end-to-end | Progressive disclosure applies to recommendation details, not the work itself | Show completed, current, next, optional and blocked work |
| Compose a full route | Aligned: bundle coordinates tasks without another lifecycle | Strongly aligned with RoutePlan, but positioned as the default response | Route docket exists, but leads from one recommendation | Present the route as an optional composition of understandable tasks |
| Preserve authority per consequential step | Explicit | Strongly aligned | Strongly aligned | Preserve; never let route presentation imply blanket approval |
| Keep the kernel wedge-neutral | Explicit | Strongly aligned | Neutral public language aligned | Preserve domain nouns in business contracts and adapters, not kernel contracts |
| Avoid premature universal schema | Explicit | Not contradicted | Not addressed | Keep this as an engineering constraint, not a public object |

## Product-to-supply mapping

The customer-facing task and the business-side capability are related but not
identical.

“Compare these hotels” may require business facts about location, amenities,
price conditions and cancellation; a current-availability query; and a
comparison objective supplied by the person. “Obtain quotes from these
suppliers” may require a structured requirement, disclosure permission,
supplier quote capability, deadlines and comparable quote evidence.

AE should therefore onboard supply by asking:

1. What information can this business provide?
2. Which questions can it answer, with what freshness?
3. Which actions can it perform?
4. What inputs and authority does each action require?
5. What evidence shows the result?
6. What happens after refusal, timeout, contradiction or uncertainty?

Those answers remain business- and capability-specific. The neutral machinery
preserves attribution, authority, attempts, evidence and recovery without
embedding hotel, venue, supplier or procurement nouns.

## Resulting product model

The smallest customer promise is:

> AE helps your agent complete a specific piece of work with real businesses.

The progressive promise is:

> Each completed task can unlock the next useful task, and AE can coordinate
> the remaining route when that is valuable.

The platform promise is:

> Businesses describe what agents can reliably learn and ask them to do; AE
> makes those capabilities discoverable, comparable, governable and
> composable.

The full route is not abandoned. It is reached through accumulated context,
evidence and trust rather than required as the first interaction.

## Remaining product questions

- Which first task removes enough human work to be commercially valuable?
- Which business facts must be current, and who can attest to them?
- Which actions will businesses expose directly versus handle through an
  AE-mediated human workflow?
- When should AE offer the next task, and when would that become unwanted
  project management?
- Which accumulated task results are sufficient to propose a complete route
  without asking the customer to repeat themselves?
- How should an agent explain a route that contains optional, human-owned or
  currently unsupported tasks?

These are eval questions. They do not justify new schemas or public claims.
