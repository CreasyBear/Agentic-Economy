# AE project knowledge index

**Owner:** Founder
**Last reconciled:** 2026-07-25

This is the entry point for what the project knows. It points to authority,
decisions, evidence, and unresolved questions. It does not restate their full
contents.

`PRODUCT.md`, `DESIGN.md` and `AGENTS.md` were removed on 2026-07-25
(`ba263c10`, recoverable at `8dbef716`). Rows below now cite `PROJECT.md`,
`UBIQUITOUS_LANGUAGE.md` or source.

## Product identity and maturity

| Knowledge | State | Authority / evidence |
|---|---|---|
| People should be able to ask their chosen agent for help with real businesses. | TARGET | `PROJECT.md` product promise |
| People and agents may begin with one useful task or prior work, then stop, continue progressively, or ask AE to coordinate the remaining route. | PROPOSED TARGET | [ADR-009](../adr/ADR-009-partial-entry-without-request-ownership.md); [D-006](./PROJECT-RECORDS.md) |
| AE's embedded agent and external agents should use the same registered actions and authoritative work records; their presentation may differ, but business meaning and outcome semantics must remain equivalent. | PROPOSED TARGET | [ADR-010](../adr/ADR-010-one-action-plane-across-human-and-agent-experiences.md); [D-007](./PROJECT-RECORDS.md) |
| Today AE exposes published business information, comparison, qualified inquiry, the exact authenticated Request states proven through intended surfaces, and one callable priced capability against labelled sandbox supply. | CURRENT | `STATE.md`; `src/modules/actions/index.ts`; `src/routes/api.sandbox.$slug.checkup-quote.ts` |
| AE does not currently book, charge, dispatch, or automatically fulfil. | CURRENT BOUNDARY | `src/modules/actions/index.ts` registers no payment, booking or dispatch action. The executable copy gates that also enforced this were removed on 2026-07-25. |
| AE targets registered booking and later high-autonomy consequential operation through exact, revocable authority modes; `full_yolo` is a broad bounded standing mandate, never ambient or unlimited authority. | ACCEPTED TARGET | [ADR-019](../adr/ADR-019-authority-modes-and-consequential-operations-target.md); D-010; `PROJECT.md` |
| Internal workflow machinery is not the public product explanation. | ACCEPTED | [D-003](./PROJECT-RECORDS.md); `UBIQUITOUS_LANGUAGE.md` |

## Calling agents

| Knowledge | State | Authority / evidence |
|---|---|---|
| ChatGPT, Claude, Hermes, and future agents are prospective callers and distribution partners. | ACCEPTED TARGET | `PROJECT.md`; [D-001](./PROJECT-RECORDS.md) |
| Human and external-agent experiences should use the same actions and authoritative work records. | PROPOSED TARGET | [ADR-010](../adr/ADR-010-one-action-plane-across-human-and-agent-experiences.md); [conversational workspace research](../research/2026-07-17-conversational-agentic-workspace-patterns.md) |
| AE has not yet proven that major agents will discover or repeatedly choose it. | UNKNOWN | H-001, H-007, and H-008 |

## Business information and comparison

| Knowledge | State | Authority / evidence |
|---|---|---|
| AE's differentiated source is what businesses can do, for whom, under which conditions, and what next step they support. | ACCEPTED TARGET | `PROJECT.md`; [D-002](./PROJECT-RECORDS.md) |
| Agent-usable supply includes both business information and supported actions with explicit inputs, authority, evidence, failure and recovery behavior. | PROPOSED TARGET | [ADR-009](../adr/ADR-009-partial-entry-without-request-ownership.md); [capability-to-composable-work crosswalk](../research/2026-07-17-capability-to-composable-work-crosswalk.md) |
| The required evidence and decay period for each material business fact are not yet known. | UNKNOWN | Open decision in [PROJECT-RECORDS.md](./PROJECT-RECORDS.md) |
| One canonical representation may serve several calling agents without changing meaning. | HYPOTHESIS | H-006 |
| AE determines eligibility and comparable evidence from registered contracts. It recommends one option only for a supported priority explicitly present in the Request and otherwise leaves options unranked. | ACCEPTED + SOURCE-BACKED TARGET | `src/modules/customer-request/compiler.ts`; `evaluation.ts`; `customer-option-set.ts`; `route-plan-customer-projection.ts` |
| Preference-sensitive comparative judgment beyond a supported explicit objective belongs to the person and calling agent unless later evidence justifies a new source-owned objective. | ACCEPTED TARGET BOUNDARY | [D-002](./PROJECT-RECORDS.md) |

## Supply and GTM

| Knowledge | State | Authority / evidence |
|---|---|---|
| AE should prove depth in one request family before broad supply expansion. | ACCEPTED | D-005 |
| The first request family has not been selected. | OPEN DECISION | [Workflow substitution candidate review](../research/2026-07-17-workflow-substitution-candidate-review.md) |
| Events, strata and fit-out are an evaluation portfolio, not selected markets or current product claims. | ACTIVE EVAL | [Product Foundry program](../research/2026-07-17-product-foundry-primitive-refinery-program.md) |
| Those benefits are sufficient to make businesses maintain AE capability information. | HYPOTHESIS, NOT PROVEN | H-002 |

## Neutrality and economics

| Knowledge | State | Authority / evidence |
|---|---|---|
| Payment must not influence organic admission or comparison. | ACCEPTED | D-004 |
| The paying customer and viable business model remain unresolved. | OPEN DECISION | `PROJECT-RECORDS.md` |
| AE can use global infrastructure without conceding local supply relationships, comparison or coordination. | ACCEPTED TARGET | `PROJECT.md`; D-008 |

## Engineering and interoperability

| Knowledge | State | Authority / evidence |
|---|---|---|
| AE should adopt established tool, authorization, checkout, and payment standards rather than recreate them. | ACCEPTED | D-002 |
| Ordinary HTTPS remains first class; additional agent and commerce standards are adapters. | ACCEPTED TARGET | D-001 and D-002 |
| Assistant-facing registered actions cover registry read, qualified inquiry, storefront draft import/enrich, demand capture, supplied-quote collection, owner notification preferences, and the Customer Request run/confirm/cancel/problem/evidence/repeat-permission set. | CURRENT | `src/modules/actions/index.ts` |
| Automatic discovery, multi-business continuity, and general execution by external agents remain target capabilities. | TARGET, UNPROVEN | `PROJECT.md` |

## How to use this index

- Follow `CURRENT` statements to product authority and executable evidence.
- Follow `ACCEPTED` statements to an ADR or project decision.
- Follow `OBSERVED` statements to a primary-source research record.
- Follow `HYPOTHESIS` statements to a falsifier and evidence owner.
- Follow `UNKNOWN` statements to the research queue.
- If a source changes, update the source register, affected research record,
  this index, and any decision whose revisit trigger fired.
