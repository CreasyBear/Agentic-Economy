# AE project knowledge index

**Owner:** Founder
**Last reconciled:** 2026-08-08

This is the entry point for what the project knows. It points to authority,
decisions, evidence, and unresolved questions. It does not restate their full
contents.

`PRODUCT.md`, `DESIGN.md` and `AGENTS.md` were removed on 2026-07-25
(`ba263c10`, recoverable at `8dbef716`). Rows below now cite `PROJECT.md`,
`UBIQUITOUS_LANGUAGE.md` or source.

## Current category authority — 2026-08-08

The current category sentence, Principal/delegated-agent model, supplier-hosted
Operation boundary, closed V1 policy, and proof ceiling come from
[`PROJECT.md`](../PROJECT.md), [`VISION-conceptual-map.md`](../VISION-conceptual-map.md),
[`wayfinder/MAP.md`](../wayfinder/MAP.md), and the
[Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md).
Historical local-business, Australian-SMB, BAS, and human-service framing remains
provenance only and cannot make the current category or wedge.

## Product identity and maturity

| Knowledge | State | Authority / evidence |
|---|---|---|
| The person-facing demand application is a subordinate proving ground: a Principal's agent can discover viable supplier-hosted Operations, decide within granted authority, and carry approved work through evidence and recovery. | SUBORDINATE TARGET | `PROJECT.md` product boundary |
| Agentic Economy is the market and controlled transaction layer where authorized agents discover, buy and invoke admitted third-party Market Operations, and suppliers are paid after contract-valid delivery. | FOUNDER-CONFIRMED DESTINATION; NARROW/UNPROVEN | [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md); `PROJECT.md`; `VISION-conceptual-map.md`; `UBIQUITOUS_LANGUAGE.md` |
| The Principal is the human or organization that owns authority and budget; the agent is its delegated shopper and distribution interface, never the Principal. | ACCEPTED TARGET | [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md); `PROJECT.md` |
| Developers and suppliers host implementations wherever they choose. AE admits versioned callable Operations and owns the market, invocation identity, authority/policy, evidence, Qualified Use metering and reconciliation boundary. | ACCEPTED TARGET | `PROJECT.md`; [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md) |
| V1 is closed to one contract family and curated suppliers; wider category scope opens only under published policy after the first family proves its controls and repeat independent demand. | ACCEPTED LAUNCH POLICY | [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md) |
| Current source/local evidence includes published Offering/business projections, comparison and inquiry paths, Customer Request states, curated discovery for 20 heterogeneous Operations, and bounded keyless invocation/evidence; this is not hosted, provider, customer, or production-settlement proof. | CURRENT — SOURCE/LOCAL ONLY | `STATE.md`; `src/modules/actions/index.ts`; `src/modules/capability-supply/`; `src/modules/capability-execution/` |
| Current registered actions do not establish booking, charging, dispatch, or automatic fulfilment. | CURRENT IMPLEMENTATION BOUNDARY | `src/modules/actions/index.ts`; `STATE.md` |
| Registered consequential operations and later high-autonomy authority modes remain a subordinate application target; exact revocable authority is never ambient or unlimited. | SUBORDINATE ACCEPTED TARGET | [ADR-019](../adr/ADR-019-authority-modes-and-consequential-operations-target.md); D-010; `PROJECT.md` |
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
| The competitive unit is an admitted, versioned Market Operation with typed input/result, effect and data-use policy, price, readiness, validated usage, evidence and settlement lineage; Supplier is the portfolio rollup. | ACCEPTED TARGET | `PROJECT.md`; [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md) |
| Agent-usable supply is a callable Operation contract with explicit inputs, authority, evidence, failure and recovery behavior; OpenAPI, MCP and x402 are adapters, not the semantic contract. | ACCEPTED TARGET | [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md); [ADR-009](../adr/ADR-009-partial-entry-without-request-ownership.md) |
| The required evidence, freshness and decay policy for each material Operation claim are not yet known. | UNKNOWN | Open decision in [PROJECT-RECORDS.md](./PROJECT-RECORDS.md); category thesis proof boundary |
| One canonical Operation representation may serve several calling agents without changing meaning. | HYPOTHESIS | H-006 |
| AE determines eligibility and comparable evidence from admitted contracts. It may recommend only for a supported objective explicitly present in the Request; otherwise options remain unranked for the Principal and calling agent. | ACCEPTED + SOURCE-BACKED TARGET | `src/modules/customer-request/compiler.ts`; `evaluation.ts`; `customer-option-set.ts`; `route-plan-customer-projection.ts`; D-002 |
| Preference-sensitive comparative judgment beyond a supported explicit objective belongs to the Principal and calling agent unless later evidence justifies a new source-owned objective. | ACCEPTED TARGET BOUNDARY | [D-002](./PROJECT-RECORDS.md) |

## Supply and GTM

| Knowledge | State | Authority / evidence |
|---|---|---|
| V1 should prove depth in one closed Market Operation family before broad supply expansion; later opening requires published policy and repeat independent demand. | ACCEPTED | D-005; D-013; [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md) |
| The named V1 candidate is public-document structured extraction with field-level provenance; the candidate is not yet proven in the market. | OPEN PROOF FRONTIER | [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md) |
| Events, strata and fit-out are a historical evaluation portfolio, not selected markets, ICP, wedge, or current product claims. | HISTORICAL EVAL | [Product Foundry program](../../eval/product-foundry/README.md) |
| The earlier hypothesis that businesses would maintain capability information for agent referrals is superseded/historical and does not define supply economics. | SUPERSEDED / HISTORICAL | H-002; D-013 proof boundary |

## Neutrality and economics

| Knowledge | State | Authority / evidence |
|---|---|---|
| Payment must not influence organic admission or comparison. | ACCEPTED | D-004 |
| The paying customer and viable business model remain unresolved. | OPEN DECISION | `PROJECT-RECORDS.md` |
| AE may use global infrastructure and distribution rails, but suppliers host implementations and AE retains the market/controlled-transaction boundary; this does not imply local supply relationships or coordination are the category. | ACCEPTED TARGET | `PROJECT.md`; D-013; [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md) |

## Engineering and interoperability

| Knowledge | State | Authority / evidence |
|---|---|---|
| AE should adopt established tool, authorization, checkout, and payment standards rather than recreate them. | ACCEPTED | D-002 |
| Ordinary HTTPS remains first class; additional agent and commerce standards are adapters. | ACCEPTED TARGET | D-001 and D-002 |
| Assistant-facing registered actions cover registry read, qualified inquiry, storefront draft import/enrich, demand capture, supplied-quote collection, owner notification preferences, and the Customer Request run/confirm/cancel/problem/evidence/repeat-permission set. | CURRENT | `src/modules/actions/index.ts` |
| Non-2xx HTTP failures use RFC 9457 Problem Details with google.rpc.Code-aligned `kind` (with explicit HTTP/repository extensions) and stable machine `code`; CLI failures consume and project the same contract. | CURRENT | [RFC 9457 error-handling closeout](../research/2026-08-07-error-handling-blast-radius.md); `src/lib/errors.ts`; `src/lib/server/problem.ts`; `tools/ae/lib/output.ts` |
| Automatic discovery, multi-supplier continuity, and general execution by external agents remain target capabilities; they are not proof of retained market demand. | TARGET, UNPROVEN | `PROJECT.md`; [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md) |

## How to use this index

- Follow `CURRENT` statements to product authority and executable evidence.
- Follow `ACCEPTED` statements to an ADR or project decision.
- Follow `OBSERVED` statements to a primary-source research record.
- Follow `HYPOTHESIS` statements to a falsifier and evidence owner.
- Follow `UNKNOWN` statements to the research queue.
- If a source changes, update the source register, affected research record,
  this index, and any decision whose revisit trigger fired.
