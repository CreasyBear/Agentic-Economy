# Package 4: operation evidence, reconstruction and analytics

**Status:** research baseline for Package 4 discussion
**Prepared:** 2026-09-01
**Revised:** 2026-09-02
**Product authority:** [`PRODUCT.md`](../PRODUCT.md)
**Language authority:** [`CONTEXT.md`](../CONTEXT.md)
**Source policy:** primary specifications, official documentation and publisher
references. This note is research, not product authority.

**Sequencing note:** the managed x402 Call in `START_LINE.md` is the active
Package 4 release path. The external intake sequence later in this note begins
only after that native evidence spine works.

## Decision in one sentence

Do not invent an Agentic Economy telemetry protocol. Accept execution,
cost-and-usage, payment and invoice evidence in the standards that already own
those facts; preserve the source artifacts; then build the smaller thing only
Agentic Economy can own: a traceable reconstruction that links many machine
events to the parties, charges, documents and business allocations around one
Operation purchase.

The practical standards stack is:

```text
OpenTelemetry / W3C Trace Context       execution and correlation
CloudEvents                             event transport outside OTLP
FOCUS                                   normalized cost-and-usage view
x402 / Nevermined                       payment and monetization observations
UBL / Peppol PINT                       invoice and credit-note documents
W3C PROV vocabulary                     provenance meaning
OCEL 2.x                                object-centric analytics interchange
ISO 21378 / AICPA ADS / XBRL GL         accounting-audit export reference
                    │
                    ▼
Agentic Economy reconstruction
  observed machine use ↔ service ↔ commercial parties ↔ cost ↔ document ↔ payment
```

The standards do not agree on a universal purchase identifier. That is not a
defect Agentic Economy can solve by declaring another global schema. The useful
product is the evidence graph and its reconstruction quality: which records
were linked deterministically, which were inferred, which remain unresolved,
and which source supports every displayed fact.

## Scope and product boundary

This note addresses three Package 4 questions:

1. How can Agentic Economy record machine use that occurred in its own runtime
   or elsewhere?
2. How can it reconstruct the commercial context around that use without
   turning a trace, invoice or payment into a false claim about the whole
   purchase?
3. Which metrics can be calculated from the resulting evidence for operations,
   spend, reconstruction quality and market intelligence?

It does not define legal conclusions, approval controls, a general-ledger
replacement or a universal agent runtime. In Observe mode, a source trace is
an observation of execution. It is not automatically a canonical Operation,
Commitment, Mandate, sale, delivery finding or accounting classification.

For an Agentic Economy-controlled Call, the Invocation is already the durable
correlation identity and its owning modules produce stronger first-party facts.
The agent-facing projection should join those facts by stable reference instead
of exporting internal records for the caller to reconstruct. It returns a
compact current state and lets authorised callers drill into source evidence
only when needed.

## Source authority and adoption decision

| Standard or source | What it actually owns | Package 4 treatment | Reason |
| --- | --- | --- | --- |
| [CloudEvents 1.0.2](https://github.com/cloudevents/spec/tree/ce@stable) | A transport-neutral event envelope. `source` plus `id` identifies duplicates; `type`, `time`, `subject`, `dataschema` and content type describe the occurrence and payload. | **Adopt directly for non-OTLP event ingress and egress.** Use a maintained SDK and preserve the original `data`; do not wrap every OTLP span in a second CloudEvent. | It solves event identity, versioning and transport interoperability without pretending to define domain facts. The core specification explicitly permits duplicate delivery with the same `source` and `id`. |
| [W3C Trace Context](https://www.w3.org/TR/trace-context/) | Vendor-neutral propagation of `traceparent` and optional `tracestate` across distributed calls. | **Adopt directly.** Preserve trace ID, parent span ID, flags and tracestate where supplied. | Trace continuity is a strong correlation clue across harness, gateway and Provider. It is not a business identity or purchase identifier. |
| [OpenTelemetry](https://opentelemetry.io/docs/specs/otel/) and the [GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai) | Traces, spans, logs and metrics for logical operations, model calls, agent invocation and tool execution. | **Adopt directly at the instrumentation boundary; pin the semantic-convention version.** Accept OTLP rather than designing an AE telemetry SDK. | The base metrics model is stable and translates existing formats; the GenAI and agent conventions remain under development, so a versioned adapter must isolate field churn from AE's stored evidence. |
| [FOCUS 1.4](https://focus.finops.org/docs/specification/v1-4/) | Cross-provider cost, usage, billing-account, invoice-detail, service, SKU, allocation and currency dimensions. | **Adopt as the canonical analytical cost-and-usage projection and native import/export profile, not as the operational source of truth.** | FOCUS already defines the language needed for billed, effective, contracted and list cost, consumed quantity, invoice reconciliation, allocations and multi-currency billing. It does not model an agent decision, service delivery or payment evidence. |
| [x402 v2](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) and [signed offer/receipt extension](https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md) | Resource payment requirements, chosen payment payload, authorization, facilitator verification/settlement and optional signed server offers and receipts. | **Adopt directly through the official packages already installed. Preserve and verify the wire artifacts.** | The fields are high-quality payment correlation evidence. Core settlement proves a payment outcome; the optional signed receipt is the x402 artifact that expressly claims successful payment and service delivery. Neither identifies the legal Seller by itself. |
| [Nevermined payments and observability](https://nevermined.ai/docs/development-guide/observability) | Agent request IDs, plan/credit entitlement, request status, tokens, provider cost, credits redeemed, revenue and margin within Nevermined's paid-access model. | **Adapt as a source connector. Do not copy its plan/credit model into the Package 4 core.** | Nevermined is useful evidence for its own mediated requests and batches. It does not reconstruct the buyer's cross-provider invoices, card payments or accounting evidence. |
| [OASIS UBL 2.4](https://docs.oasis-open.org/ubl/UBL-2.4.html) and [Peppol PINT A-NZ](https://docs.peppol.eu/poac/aunz/pint-aunz/) | Structured invoices, credit notes, parties, payees, supporting documents, references, quantities, prices, totals and tax breakdowns. | **Adopt directly at the document boundary.** Validate the source document against its declared profile and map selected facts into reconstruction; retain the original document. | UBL already separates Accounting Supplier, Accounting Customer and Payee, and has object, project, order, line and supporting-document references. PINT A-NZ is the Australian first profile without making the core Australia-specific. |
| [W3C PROV-DM](https://www.w3.org/TR/prov-dm/) | General provenance concepts: entity, activity, agent, usage, generation, derivation, attribution, association and delegation. | **Adapt the relation vocabulary; reject full PROV/RDF as the runtime storage model.** | PROV gives precise names for source-to-fact and actor-to-activity relations. Full semantic-web serialization would add machinery without improving the first reconstruction loop. |
| [OpenLineage](https://openlineage.io/docs/spec/) | Run, Job and input/output Dataset lineage for data-processing systems, with extensible facets. | **Accept as an adapter when a customer already emits it; reject it as the universal Operation model.** | Its Job/Run/Dataset model is excellent for data pipelines but distorts model calls, APIs, MCP tools, paid resources and human-delivered Operations. |
| [OCEL 2.0](https://www.ocel-standard.org/2.0/ocel20_specification.pdf) and [OCEL 2.1 formats](https://www.ocel-standard.org/specification/overview/) | Object-centric event logs in which one event can relate, with qualified roles, to many changing objects. JSON, XML, SQLite and newer CSV/Parquet interchange formats are defined. | **Adopt as an analytics and process-mining projection; do not make it the transactional database contract.** | The model fits reconstruction unusually well: one service-use event can relate to an agent, Provider, invoice line, payment and project without forcing one artificial "case". The runtime still needs source fidelity, exact money and domain invariants that OCEL does not define. |
| [ISO 21378:2019](https://www.iso.org/standard/70823.html), [AICPA Procure-to-Pay ADS](https://www.aicpa-cima.com/resources/download/procure-to-pay-subledger-standard-audit-data-standards) and [XBRL GL](https://www.xbrl.org/the-standard/what/global-ledger/) | Common accounting extraction fields, procure-to-pay audit datasets and detailed transactional ledger interchange. | **Use as export coverage and audit-readiness references. Do not implement any as the Package 4 event store.** | These standards begin at accounting records and ledgers. They are valuable for proving that identifiers, invoices, postings and source detail can be exported, but they do not describe the machine operation that created the cost. |

### Why this is not a single-standard problem

CloudEvents and OpenTelemetry describe occurrences. FOCUS describes provider
billing and usage. UBL describes a business document. x402 describes a payment
conversation. W3C PROV and OCEL describe relationships among evidence. None can
truthfully absorb the others.

The source architecture should therefore be **polyglot at ingress and stable at
reconstruction**. This is consistent with *Designing Data-Intensive
Applications*, which treats event streams, change-data capture and event
sourcing as ways of preserving change and deriving read models rather than as a
reason to force every system into one write model ([O'Reilly, Chapter 11](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/)).
*Observability Engineering, 2nd Edition* similarly argues for context-rich,
high-cardinality structured events from which metrics, logs and traces can be
derived ([O'Reilly, Chapters 5–6](https://www.oreilly.com/library/view/observability-engineering-2nd/9781098179915/ch05.html)). The lesson for AE is to retain rich source evidence and create
separate projections, not to pre-aggregate away the joins Package 4 exists to
make.

## Recommended source architecture

Package 4 needs four layers. Only the third layer contains new product meaning.

```text
1. Standard source artifacts
   OTLP · CloudEvents · FOCUS · x402 · Nevermined · UBL/PINT · payments
                            │
                            ▼
2. Immutable evidence intake
   source identity · schema/version · occurrence time · ingest time
   original artifact or durable locator · digest · parser version
                            │
                            ▼
3. AE reconstruction
   normalized observations + qualified evidence links + unresolved gaps
                            │
                 ┌──────────┼──────────┐
                 ▼          ▼          ▼
4. Projections   timeline   metrics    FOCUS / OCEL / accounting export
```

### 1. Keep source artifacts intact

The import record should preserve the source's own identifier, schema/version,
occurrence time and raw material or immutable locator. CloudEvents already
defines duplicate identity as `source + id`; OTLP supplies trace and span
identity; x402 supplies payment and transaction identifiers; Nevermined supplies
request identifiers; UBL/PINT supplies document and line identifiers.

An AE-generated ID is useful for storage, but it must not replace those source
identifiers. The source artifact's digest, validation result and parser version
make later reprocessing explainable. The original source remains unchanged when
a parser improves or a human corrects a normalized fact.

### 2. Store observations, not reconstructed history masquerading as fact

An imported trace can support claims such as "this tool call occurred at this
time", "this Provider/model was reported", "these units were reported" and
"the caller observed this outcome". It cannot support a Market intent,
Resolution, Commitment or Mandate AE did not witness.

Each normalized fact therefore needs at least:

- the exact source artifact and source field from which it came;
- whether the fact was source-reported, AE-observed, mechanically derived or
  human-supplied;
- the adapter and schema version that produced it; and
- a replacement/supersession link rather than mutation of its source.

W3C PROV's `wasDerivedFrom`, `wasAttributedTo`, `wasAssociatedWith`, `used` and
`wasGeneratedBy` are adequate relation meanings. AE does not need to implement
PROV-O, RDF storage or a general knowledge graph to benefit from them.

### 3. Make reconstruction an evidence-linking domain

The reconstruction layer relates existing objects rather than cloning them into
one mega-record. A service-use event can be linked to zero, one or many cost
rows. A cost row can be linked to an invoice detail; an invoice can cover many
service-use events; one payment can settle one or many invoices; a project or
client allocation can apply at any of those levels.

OCEL demonstrates why a single `case_id` is insufficient. Its object-centric
model lets one event relate to multiple typed objects with role qualifiers, and
lets object attributes change over time ([OCEL overview](https://www.ocel-standard.org/)). AE should use that structure for analytics interchange and process mining while keeping its operational links strongly typed in source.

Every link should preserve its match basis:

- **source reference:** the same identifier appears in both records;
- **signed binding:** a verified artifact binds the records;
- **exact deterministic match:** a declared combination of fields uniquely
  identifies the counterpart;
- **inferred candidate:** timing, amount, party or usage evidence suggests a
  match but does not establish it;
- **human resolution:** a reviewer accepts or rejects a candidate, preserving
  the prior evidence and decision.

This small vocabulary is AE domain meaning, not a replacement for the imported
standards. It is also the basis of reconstruction-quality analytics.

### 4. Build projections, not duplicate systems of record

The same evidence can produce:

- an operation timeline for engineering and finance;
- a FOCUS-compatible cost-and-usage dataset;
- an OCEL object-centric event log for process and conformance analysis;
- a finance exception queue;
- a draft accounting handoff; and
- aggregate market-intelligence views.

These are rebuildable read models. Package 4 does not need to event-source the
entire existing application. Ben Stopford's *Designing Event-Driven Systems*
describes immutable event logs as a comprehensive record from which views can
be rederived ([O'Reilly, Chapter 7](https://www.oreilly.com/library/view/designing-event-driven-systems/9781492038252/ch07.html)); AE should apply that principle narrowly to imported evidence and its reconstruction decisions.

For managed Calls, add an agent decision projection beside the human Logs,
Usage and Spend projections. It contains the exact Operation and Invocation
references, present state, exact AUD facts, Agent Principal budget use,
material unknowns and safe continuations. It is not another event store or a
Call mega-record.

Outcome accretion follows the same evidence rules. AE-observed delivery,
latency, price, settlement and recovery remain distinct from optional
buyer-reported use. Account-scoped aggregates expose their comparison scope,
population, sample size, window, freshness and provenance. They may inform a
later Resolution, but never become an opaque Provider score or a claim about an
uncalled candidate.

## Minimum field set by source

### Event identity and correlation

Use the standards' identifiers as supplied:

| Concern | Standard fields | AE use |
| --- | --- | --- |
| Event identity and deduplication | CloudEvents `specversion`, `source`, `id`, `type`, `time`, `subject`, `dataschema`, `datacontenttype` | Ingest identity, replay suppression, routing and schema selection. CloudEvents requires `source + id` uniqueness for distinct events ([core specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#required-attributes)). |
| Distributed call correlation | W3C `traceparent` (`trace-id`, parent ID, flags) and `tracestate`; OTLP trace/span/parent IDs and span links | Reconnect an operation across harness, proxy and Provider. Treat trace IDs as correlation evidence only. |
| Timing | event occurrence time, span start/end, log observed time, import time | Keep all clocks. Do not replace an unknown occurrence time with import time without labelling it. |
| Source fidelity | raw artifact or locator, media type, schema URI/version, digest, adapter/parser version | Re-parse, prove origin and explain changes in normalized output. |

### Execution and agent telemetry

OpenTelemetry's current GenAI conventions define logical spans for model calls,
agent invocation and tool execution. The tool span is named
`execute_tool {gen_ai.tool.name}`; agent traces use `invoke_agent`, while model
calls carry operation, Provider, requested/response model and usage attributes
([GenAI spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md), [agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md)).

The useful normalized fields are:

- logical operation name and span kind;
- trace, span, parent and span-link identifiers;
- start, end, duration and status/error type;
- Agent ID/name/version and workflow or conversation ID when supplied;
- Provider name, server address, requested model, response model and provider
  response ID;
- tool name, type and tool-call ID;
- input, output, cache-read, cache-creation and reasoning token counts;
- finish reasons, time to first chunk and output type when supplied; and
- source request/response byte counts or item counts when a non-GenAI service
  supplies them.

Do not require prompt, tool arguments, tool results or response content for
Package 4. The GenAI conventions mark several content fields as potentially
sensitive and make their capture optional. Usage, identifiers, timing, status
and digests are enough for the initial commercial reconstruction.

### Cost and usage

FOCUS 1.4 is now broad enough to cover the primary cost projection. Its Cost
and Usage dataset includes billing and charge periods, consumed quantity and
unit, pricing quantity and unit, list/contracted/effective/billed cost,
pricing/billing currencies, billing accounts and subaccounts, invoice and
invoice-detail IDs, service Provider, host Provider, service/SKU/resource
identifiers, allocation method and tags ([FOCUS column library](https://focus.finops.org/docs/specification/v1-4/columns/)).

Package 4 should preserve at least:

- charge period and billing period;
- billing Account and subaccount identifiers;
- Service Provider, host Provider, service, service category/subcategory, SKU
  and resource identifiers;
- consumed quantity/unit and pricing quantity/unit;
- list, contracted, effective and billed cost without collapsing them;
- pricing, billing and payment currencies where available;
- invoice ID, invoice-detail ID and invoice issuer;
- charge category/class/frequency and correction references; and
- allocation method, allocated object and source tags.

The configured reporting currency is a projection. An Australian deployment
can default it to AUD and preserve the conversion source, rate and effective
time without making AUD part of the core data model.

### x402 evidence

The x402 v2 `PaymentRequired` object supplies resource URL/description, accepted
scheme, CAIP-2 network, amount in atomic units, asset, `payTo` and timeout. The
chosen `PaymentPayload` adds the payer authorization and nonce; the settlement
response adds success, transaction, network and payer ([x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md#5-types)).

When present, preserve the signed offer and signed receipt as independent
artifacts, including their digests, signer binding, schema version and
verification result. The optional receipt contains network, resource URL,
payer, issue time and optional transaction hash. The extension explicitly says
the signed receipt confirms payment and service delivery; this is stronger than
the core settlement response, and should remain visibly different from it
([offer and receipt specification](https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md#5-receipt)).

The current repository already does the correct low-level work. It pins the
official x402 packages in [`package.json`](../package.json), verifies EIP-712 or
JWS offers and receipts in
[`x402-offer-receipt.ts`](../src/modules/capability-supply/internal/x402-offer-receipt.ts),
and validates digest-bound settlement observations in
[`x402-payment-reconciliation-evidence.ts`](../src/modules/action-invocation/x402-payment-reconciliation-evidence.ts).
Package 4 should expose those artifacts through the reconstruction boundary,
not reimplement their wire schemas or cryptography.

### Nevermined evidence

Nevermined's observability surface tracks request time, caller/session, agent,
operation, request status, response time, token usage, Provider cost, credits
redeemed, credit revenue and margin; batch requests share one request ID across
multiple downstream model calls ([observability guide](https://nevermined.ai/docs/development-guide/observability)). Its payment plans support fixed, dynamic, time-based and pay-as-you-go consumption ([payment plans](https://nevermined.ai/docs/api-reference/typescript/payment-plans)).

A Nevermined adapter should therefore preserve:

- request/batch ID, Agent ID, plan ID and order/subscription reference;
- caller/account/session identity as reported by Nevermined;
- endpoint, method, start/end, status and failure;
- Provider/model and token or other usage quantities;
- credits charged, cost basis, price per credit, revenue and margin; and
- payment or settlement references returned by Nevermined.

Those are source observations. "Credit" remains Nevermined's consumption unit,
not a universal AE money unit, and Nevermined's agent/plan identity should not
replace AE's Operation, Provider, Seller or Account roles.

### Invoice and audit evidence

UBL 2.4 already represents invoices, self-billed invoices, credit notes,
statements and remittance advice, and separates Customer Accounting Party,
Supplier Accounting Party and Payee. Its tax information aligns to the OASIS
Indirect Tax Reference Model ([UBL 2.4](https://docs.oasis-open.org/ubl/UBL-2.4.html)). PINT A-NZ is a jurisdictional profile of that global model, not a competing core. Its syntax includes invoice and project references, Accounting Supplier, Accounting Customer, Payee, supporting documents, line quantities and amounts, tax breakdowns and totals ([PINT A-NZ syntax](https://docs.peppol.eu/poac/aunz/pint-aunz/trn-invoice/syntax/)).

Package 4 should accept structured UBL/PINT documents when available and map:

- document/profile identifiers, invoice number, issue/due/tax-point dates;
- Seller, buyer, Payee and tax-representative identifiers as separately stated;
- invoice, tax-accounting and payment currencies;
- order, project, contract, invoice-object and preceding-document references;
- line identifier, item/SKU, period, quantity/unit, unit price, net amount;
- document and line allowances/charges;
- tax category/rate/taxable amount/tax amount; and
- totals, amount paid/due, payment means and supporting-document references.

For Australia, use the PINT A-NZ profile and its validators; its jurisdictional
rules require Australian Seller and buyer ABNs in the applicable cases
([PINT A-NZ rules](https://docs.peppol.eu/poac/aunz/pint-aunz/trn-invoice/rule/PINT-jurisdiction-aligned-rules/)). Keep that validation result as evidence rather than making ABN or GST fields universal.

ISO 21378 defines common accounting data elements for extracting general
ledger, accounts receivable, sales, accounts payable, purchase, inventory and
fixed-asset audit data. AICPA's Procure-to-Pay ADS defines uniform file, field
and validation requirements. XBRL GL preserves detailed transactional data and
drill-down when ledgers are aggregated. These are strong tests for eventual
finance exports; they are not suitable execution-event schemas.

## Metrics that fall out of the evidence

The metrics layer should calculate views from normalized observations and
evidence links. It should not write aggregate counters as the only record. This
preserves the ability to answer questions not anticipated in the first UI.

### Operation analytics

| Metric | Derivation | Required evidence |
| --- | --- | --- |
| Observed operations | Count distinct logical operation/span identities after source replay suppression | Stable source identity; trace/span or source operation ID |
| Throughput and concurrency | Operations by interval; overlaps of start/end intervals | Start/end timestamps |
| Completion and failure rate | Terminal success/failure counts divided by terminal operations; unknown remains outside either numerator | Span/status evidence with source-defined terminal meaning |
| Latency distribution | p50/p95/p99 of end minus start, grouped by Provider, service, Operation, Agent or model | Start/end and dimensions |
| Retry density | Physical attempts per logical operation; percentage with more than one attempt | Logical operation ID plus attempt/span links |
| Usage intensity | Tokens, calls, bytes, records, seconds or domain-specific consumed units per operation | OTel usage or Provider usage rows |
| Model/tool mix | Share by `gen_ai.operation.name`, Provider, requested/response model, tool name/type | OTel GenAI attributes |
| Failure-adjusted unit cost | Attributed effective cost divided by successful terminal operations or delivered output units | Operation outcome plus cost attribution |
| Time to first chunk | Distribution by Provider/model/service | OTel field when supplied |

### Spend analytics

| Metric | Derivation | Required evidence |
| --- | --- | --- |
| Spend by dimension | Sum billed or effective cost by Account, subaccount, Agent, project/client, Provider, service, SKU, model or Operation | FOCUS cost rows plus allocations |
| Cost basis bridge | List → contracted → effective → billed cost, preserving corrections | FOCUS cost measures and charge class/category |
| Unit price and variance | Effective cost / consumed quantity; compare across Provider, model, period or contract | Cost, quantity and unit |
| Cost per successful Operation | Attributed effective cost / successful operations | Reconstructed operation-cost links |
| Unallocated spend | Cost with no business allocation / total cost | Cost rows and allocation links |
| Invoice coverage | Cost linked to invoice detail / total observed cost | FOCUS invoice IDs or deterministic document links |
| Invoice reconciliation delta | Sum linked billed cost minus invoice document total, by currency | Cost rows and structured invoice totals |
| Payment coverage and lag | Invoiced amount linked to payment; payment time minus issue/due date | Invoice and payment evidence |
| Currency exposure | Cost by source/pricing/billing/payment/reporting currency and conversion source | Original amounts plus declared conversions |
| Spend anomaly | Deviation from a historical baseline by Account/service/Agent/project | Sufficient time-series depth; label model/version |

FOCUS itself lists invoice verification, multi-currency reconciliation, unit
economics, marketplace-vendor analysis, allocation and cost-by-service as
supported use cases ([FOCUS 1.4 use-case library](https://focus.finops.org/docs/specification/v1-4/columns/)). *Cloud FinOps* treats allocation as the basis for identifying who spent what, attributing anomalies and producing meaningful unit economics ([O'Reilly, Allocation: No Dollar Left Behind](https://www.oreilly.com/library/view/cloud-finops/9781492054610/ch08.html)).

### Reconstruction-quality analytics

These metrics are part of the product, because they tell a buyer whether the
register is becoming more explainable rather than merely larger.

| Metric | Derivation |
| --- | --- |
| Source identity coverage | Operations with stable source identifier / observed operations |
| Trace continuity | Operations with a valid upstream/downstream trace or source-reference link / observed operations |
| Actor attribution | Operations linked to an Account and acting Agent / observed operations |
| Service attribution | Operations linked to Provider and service/Operation candidate / observed operations |
| Usage coverage | Operations with a supported quantity and unit / observed operations |
| Cost coverage | Operations assigned all or part of a cost row / observed operations |
| Document coverage | Attributed cost linked to an invoice/receipt/credit note / attributed cost |
| Payment coverage | Documented payable amount linked to settlement evidence / documented payable amount |
| Deterministic-match rate | Links established by source reference, signed binding or exact unique match / all accepted links |
| Inference rate | Candidate or accepted inferred links / all links |
| Human-touch rate | Reconstructions requiring a human accept, reject or correction / reconstructed purchases |
| Reconciliation delta | Difference between linked usage cost, document totals and payment amounts, separately by currency |
| Time to explainable record | Last required evidence or resolution time minus first observed operation time |
| Replay suppression | Duplicate source deliveries rejected / total deliveries |
| Source freshness | Ingest time minus source occurrence time by adapter |

Do not compress these into one opaque "confidence score". Finance and operators
need to know whether a record is missing an Agent, amount, document or payment,
and whether a match is signed, deterministic, inferred or human-resolved.

### Market intelligence

Observed buyer data can support useful demand-side intelligence without
promoting outside services into the canonical market:

- spend, invocation and usage share by Provider, service category and Operation
  candidate;
- Provider concentration and single-source dependency;
- repeat use, switching frequency and substitution paths by bounded service;
- price dispersion and effective unit cost for comparable units;
- failure-adjusted cost and latency by Provider/service;
- demand growth by service category, project/client or Agent cohort;
- recurring unresolved service identities as candidates for market admission;
- invoice/payment friction by Provider and rail; and
- outcome-evidence coverage, repeat purchase and recovery where those facts are
  actually reported.

Market intelligence must retain its population and evidence basis. A low error
rate in one instrumented buyer is not a universal Provider quality claim; a
wallet recipient is not a Seller; and observed outside supply is not a
canonical Operation until admission and publication.

## What Package 4 can reuse from source today

The repository already contains useful primitives:

- official x402 core, EVM and extension packages are pinned in
  [`package.json`](../package.json);
- signed offer and receipt verification already uses those packages rather than
  bespoke cryptography;
- x402 reconciliation evidence already preserves payment identifier, challenge
  digest, endpoint, network, asset, payment-recipient address, exact amount,
  Invocation/attempt,
  resolution, observation time and a content digest;
- the common audit tables already establish `eventId`, actor, source system,
  observation time, correlation ID, evidence references, payload hash and
  idempotency key in
  [`src/modules/observability/internal/schema.ts`](../src/modules/observability/internal/schema.ts);
  and
- the dependency graph already includes OpenTelemetry packages transitively and
  pins an OTLP trace exporter, although no first-party Package 4 OTLP intake is
  implemented.

Reuse the exact-money, canonical-digest, evidence-reference, idempotency and
uncertain-outcome patterns. Do **not** store observed external acquisitions in
the existing controlled Invocation, Charge or audit-event tables merely because
some fields overlap. Those tables carry semantics about AE-controlled actions
that an outside trace does not establish.

## Later evidence-adapter sequence

This sequence does not use Package 4A–4H numbering because those identifiers now
belong to the managed-Call implementation roadmap. Begin it only after the
native x402 Call, money, evidence and projection contracts are stable.

### E1 — Standard operation intake

Build one ingestion boundary with two first-class forms:

1. native OTLP traces/logs for instrumented harnesses and services; and
2. CloudEvents JSON for vendor webhooks, exports and adapters that are not OTLP.

The proof is replay-safe ingestion of one logical operation with source,
trace/span, Agent, service, timing, outcome and usage fields, while retaining
the untouched source artifact. Do not build a custom tracing SDK or Collector.

### E2 — Cost and document intake

Accept one FOCUS cost-and-usage dataset and one UBL/PINT invoice profile. Add
x402 and Nevermined as protocol adapters whose native identifiers and signed
artifacts are preserved. The proof is that one invoice may cover many operation
events and one operation may carry its own x402 settlement without either path
being special-cased into a different commercial model.

### E3 — Reconstruction

Link operations, cost rows, documents, payments, parties and business
allocations. Start with source-reference, signed and exact deterministic rules;
emit candidates for everything else. The proof is an explainable match basis,
visible unresolved gaps and reversible human resolution.

### E4 — Analytics projections

Project the linked evidence into:

- an operation and spend timeline;
- the operation, spend and reconstruction-quality metrics above;
- a FOCUS-compatible cost-and-usage view; and
- an OCEL export for process-mining and later reconstruction analysis.

Do not begin with dashboards. Begin with metrics that can be recalculated from
source evidence and whose denominator is explicit.

## Explicit non-builds

Package 4 should not create:

- a proprietary trace propagation header or new distributed tracing protocol;
- an AE-specific clone of OTLP, CloudEvents, FOCUS, UBL or x402;
- one flat universal event that discards native source structure;
- full PROV-O/RDF or OpenLineage as the operational database;
- a new accounting taxonomy, chart of accounts or general ledger;
- a global currency or tax schema coupled to Australia;
- an opaque reconstruction confidence score;
- prompt, chain-of-thought or full result capture as a prerequisite; or
- event sourcing for Packages 1–3 simply because Package 4 preserves imported
  events.

## Highest-leverage conclusion

The source-level wedge is not "better logging". It is **commercially meaningful
joining across standards that were designed separately**.

OpenTelemetry can show that a machine used a service. FOCUS can show that a
Provider charged for measured usage. x402 or Nevermined can show a payment or
credit event. UBL/PINT can show what a Seller invoiced and which Payee it named.
None can, alone, show that these records describe the same bounded acquisition
for the same buyer work.

Package 4 should own that join and the quality of its evidence. Everything else
should remain native, versioned and replaceable at the integration boundary.

## Primary bibliography

- Cloud Native Computing Foundation, [CloudEvents Specification 1.0.2](https://github.com/cloudevents/spec/tree/ce@stable).
- W3C, [Trace Context](https://www.w3.org/TR/trace-context/), Recommendation.
- OpenTelemetry, [Specification](https://opentelemetry.io/docs/specs/otel/) and [Generative AI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai).
- FinOps Foundation, [FOCUS Specification 1.4](https://focus.finops.org/docs/specification/v1-4/).
- x402 Foundation, [x402 Protocol Specification v2](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) and [Offer and Receipt Extension](https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md).
- Nevermined, [Observability & Monitoring](https://nevermined.ai/docs/development-guide/observability) and [Payment Plans](https://nevermined.ai/docs/api-reference/typescript/payment-plans).
- W3C, [PROV-DM: The PROV Data Model](https://www.w3.org/TR/prov-dm/), Recommendation.
- OpenLineage, [Core Specification](https://openlineage.io/docs/spec/).
- Berti et al., [OCEL 2.0 Specification](https://www.ocel-standard.org/2.0/ocel20_specification.pdf), RWTH Aachen University, 2023.
- OASIS, [Universal Business Language 2.4](https://docs.oasis-open.org/ubl/UBL-2.4.html), OASIS Standard, 2024.
- OpenPeppol, [PINT A-NZ Billing](https://docs.peppol.eu/poac/aunz/pint-aunz/).
- ISO, [ISO 21378:2019 Audit data collection](https://www.iso.org/standard/70823.html), confirmed 2025.
- AICPA & CIMA, [Procure-to-Pay Audit Data Standard](https://www.aicpa-cima.com/resources/download/procure-to-pay-subledger-standard-audit-data-standards).
- XBRL International, [XBRL Global Ledger](https://www.xbrl.org/the-standard/what/global-ledger/).
- Martin Kleppmann, [*Designing Data-Intensive Applications*](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/), O'Reilly Media, 2017.
- Charity Majors, Liz Fong-Jones, George Miranda and Austin Parker, [*Observability Engineering, 2nd Edition*](https://www.oreilly.com/library/view/observability-engineering-2nd/9781098179915/), O'Reilly Media.
- J. R. Storment and Mike Fuller, [*Cloud FinOps*](https://www.oreilly.com/library/view/cloud-finops/9781492054610/), O'Reilly Media, 2019.
- Ben Stopford, [*Designing Event-Driven Systems*](https://www.oreilly.com/library/view/designing-event-driven-systems/9781492038252/), O'Reilly Media, 2018.
