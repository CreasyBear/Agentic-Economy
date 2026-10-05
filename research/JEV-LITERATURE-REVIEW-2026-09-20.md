# Jev for Agentic Economy: literature and implementation review

**Reviewed:** 20 September 2026. **Purpose:** establish evidence for a fresh ADR,
not validate the withdrawn ADR 0002. **Status:** research complete for the sources
listed below. Subsequent [local experiments](jev-experiment-programme.md) now
measure search ordering and selected semantic decisions. Those limited results
do not establish commercial acceptance, purchase completion or production value.

## Executive finding

AE is a two-sided market for capabilities bought by agents during work. Its
future is not merely safer API consumption: businesses, specialists, data owners,
machine operators and agents can expose contributions to buyers across harnesses.
Jev's principal opportunity is semantic matching across that market: interpreting
needs, organising supply, comparing suitability and recognising unmet demand.
Delivery verification is a supporting application, not the organising thesis.

Jev supplies semantic judgments that ordinary code can compose. The literature
supports the patterns below; their AE application is a design inference, not a
claim that this vendor is indispensable or that the complete market already exists.

The strongest immediate evidence is for retrieval followed by reranking. A
second, richer verification pass is a credible alternative when near-identical
descriptions cause selection errors. Neither repairs a retriever that omitted the
right Tool. The design must separate candidate coverage, preference among
candidates, evidence of fit, and permission to purchase.

The next architecture decision must start from these product journeys, not the
two existing integration points. The earlier discovery-plus-verification
recommendation is withdrawn. See the fully rewritten, journey-first
[ADR 0003](../docs/adr/0003-jev-market-journey-intelligence.md) for the current
assessment, priorities, alternatives and six journey-specific success measures.

## Product and future-vision reset — 20 September

Re-read the [active product charter](../PRODUCT.md),
[agent operating contract](../docs/designs/agent-operating-contract.md),
[whitepaper](../AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md),
[manifesto](../docs/strategy/agentic-economy-manifesto.md),
[September pitch](https://github.com/CreasyBear/Agentic-Economy/blob/7524cb6c8a73cd54478c37d69c0dc7034c0577c9/docs/strategy/pitch-kit-2026-09.md), and
[future horizontals](../docs/strategy/aecon-horizontals-and-responsibility-architecture.md).
The charter controls the current product; the strategic documents explain the
ambition, not shipped functionality or verified legal claims.

The entry product is one AUD-funded account through which an agent can acquire
an x402 service. The larger product is a cross-harness market: an agent discovers
a missing contribution during work, finds a suitable Provider, buys the
contribution and continues. On the other side, a Provider exposes a capability
once and reaches demand it could not economically onboard customer by customer.
The market matters especially for specialised, local, contingent and infrequent
needs that do not justify advance integration.

### Core journeys and Jev's candidate contribution

| Journey | Customer or Provider outcome | Candidate use of Jev | Practical scope |
| --- | --- | --- | --- |
| Express a missing capability | An agent describes what its next step needs without knowing the supplier's vocabulary | Classify intent and domain; select explicit categories, known constraints and search routes | Existing agent or thin-chat entry; Jev selects known values, not arbitrary prose or a new project plan |
| Find and compare suitable Tools | Agent finds an appropriate contribution, not merely a keyword match | Query-to-Tool fit, richer shortlist selection, separate suitability dimensions and no-match detection | First evaluation priority; assess retrieval coverage as well as reranking |
| Prepare and buy | Agent moves from a selected capability to usable input, Quote, Call and returned result | Select declared enum arguments or identify ambiguity where useful | Optional assistance; arbitrary input construction stays with caller/parser/generative model, and money/authority stay in code |
| Publish and maintain supply | Provider makes its capability legible and discoverable across harnesses | Suggest categories and source-backed attributes; identify confusing descriptions or likely duplicate catalogue records | Second evaluation priority; preserve Provider, Tool and version identity; no inferred ownership or silent merging |
| Find supply after an unsuccessful search | Buyer can revisit a need when suitable supply appears | Match a retained need to new Tools despite different wording; classify recurring demand themes | Current private market-request path is a concrete foothold; Provider-facing demand intelligence is a later product decision |
| Improve repeat choice and supply investment | Buyers find better fits; Providers see which capabilities are worth supplying | Turn comparable requests and permitted outcomes into semantic features; evaluate whether they predict useful selections | Future market learning, not a universal reputation score or payment-equals-quality assumption |
| Recover and continue | Agent or operator understands a failed purchase and follows the permitted recovery path | Classify failure/support narratives; targeted result checks where useful | Supporting journey; existing state machine owns safe continuation and remedy |

Customer funding/delegation and exact commercial execution are core journeys too,
but they do not need a semantic model to perform balance arithmetic, enforce
authority or bind a Quote. Being central to the product does not make every step
a Jev use case.

For example, an advisory agent preparing a dossier may need literature, a company
record and a specialist assessment from different Providers. Its harness owns
the dossier and work plan. AE can supply each missing contribution; Jev can help
match each request to the appropriate capability. Continuous maintenance and
physical-service examples in the future-horizontals memo extend this same
procurement pattern; they are not current release promises.

### Additional literature for the broader journeys

- [S17 Use-case map](https://docs.typesafe.ai/concepts/use-case-map): the vendor
  describes intent routing, marketplace catalogue interpretation, retrieval and
  semantic features for demand forecasting. This is an application map, not
  measured AE performance.
- [S18 Function calling](https://docs.typesafe.ai/cookbooks/function_calling):
  function selection and closed-set arguments across ten functions and fourteen
  commands. Free text, numbers and dates are not generated. Relevant to known
  actions and enum inputs, not replacing AE's entire agent interface.
- [S19 Entity alignment](https://docs.typesafe.ai/cookbooks/entity_alignment):
  candidate-pair judgments with an explicit review outcome, illustrated on 450
  beer-catalogue pairs. Relevant to catalogue maintenance; similarity must not
  merge distinct Tool versions or commercial parties.
- [S20 Feature-discovery source](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery):
  the retrieved page exposes code in which a generative model proposes questions,
  Jev produces semantic features, and a separate predictive model is evaluated
  against labels with development/test separation. No performance result is
  asserted here. This suggests a future market-learning pattern; Jev does not
  learn AE outcomes merely because it processes more Calls.

The existing source provides specific seams rather than a blank platform:
[Tool search reranking](../src/modules/registry/tool-reranker.ts),
[comparison facts](../src/modules/capability-supply/internal/tool-detail-compare.ts),
[Provider source publishing](../src/modules/capability-supply/supply-funnel.functions.ts),
and [private market requests](../src/modules/market-demand/market-demand.actions.ts).
These establish local source paths, not production acceptance. The market-request
contract retains a short query and checks current search results; it is not yet
Provider demand analytics or an autonomous market-making service.

**Architecture implication:** evaluate buyer matching first and supplier
legibility next, retaining a path to unmet-demand matching and later allocation
learning. Reuse the existing SDK and domain seams. Do not require a general
semantic platform, new orchestration layer or delivery-verification programme
before improving the market's primary journeys. “Bounded evidence” remains a
data-governance constraint, not the product's purpose or Jev's primary value.

## Method and evidence quality

Used the installed **Agent Reach** skill: Exa via `mcporter` for discovery, Jina
Reader for official documentation, and GitHub CLI for source and benchmark files.
Used the **TypeSafe** skill to select the documentation index, relevant primitives,
SDK, limitations and nearest cookbooks. Used **simplicity-razor** to assess the
coupling introduced by the candidate architecture below.

Searches included `TypeSafe Jev system one reranking verification evaluation production experience`,
`"Jev" "rerank" "RESULTS.md"`, GitHub `jev typesafe`, and indexed X discussions.
The official documentation index was the main inclusion map, not search ranking.
Included primary technical documentation, executable examples, maintainer source
and an independently authored benchmark with source. Excluded SEO summaries and
curated project lists as technical proof. No systematic claim of exhaustive
coverage is made.

Agent Reach's doctor reported no configured authenticated X backend and no
connected Reddit browser backend. Indexed X search returned no results for the
chosen query. Bilibili search found introductory videos, but these were not used
to substantiate technical conclusions. Exa and GitHub succeeded despite doctor's
configuration-only warnings. PyPI's benchmark page returned a client challenge;
the linked GitHub repository was read directly instead. Agent Reach v1.5.0 was
current at the update check. No login, installation or upgrade was performed.

Evidence grades used here:

- **Contract:** documented API/SDK behaviour, cross-checked in source where relevant.
- **Vendor experiment:** useful runnable pattern, not independent validation.
- **Independent report:** another author's measurements, not reproduced by this review.
- **Local observation:** current AE source or tests, not hosted behaviour.
- **Proposal:** an AE design inference requiring a decision and evaluation.

## What the sources actually establish

| Source | Evidence and limits | Consequence for AE |
| --- | --- | --- |
| [S1 Building guide](https://docs.typesafe.ai/concepts/how-to-build-with-system-one) | Code owns execution; narrowly defined questions consume relevant state. Independent questions can be evaluated together. Architectural guidance, not an AE benchmark. | Decompose judgments and keep their policy consumers explicit. No general-purpose autonomous procurement loop. |
| [S2 API](https://docs.typesafe.ai/api) and [state](https://docs.typesafe.ai/concepts/state) | Choice selects a supplied option; Noul estimates yes; Score uses an ordered rubric. Question identifiers do not carry meaning into inference. | Include the complete question in instructions. Use stable candidate identifiers and validate returned membership. |
| [S3 Confidence](https://docs.typesafe.ai/confidence) | Choice/Score confidence summarises the probability distribution; Noul has no separate confidence. Thresholds need domain evaluation. | Do not treat 0.95 confidence as a 95% guarantee of purchase correctness, or reuse thresholds between primitive types. |
| [S4 Reranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe) | Forty CLERC queries, 3,565 passages, BM25 top-30. Vendor reports top-1 5% → 18%, top-10 38% → 62%. One Noul per query/passage pair; 1,200 calls. | Evidence for two-stage retrieval, not for the old claim that the canonical recipe is always batched Noul plus Choice. Strong shortlist coverage in the experiment limits generalisation. |
| [S5 Skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion) | Two requests: wide Choice ranking, then richer top-three evidence plus per-candidate fit checks. On 488 synthetic requests, wrong loads 16.8% → 7.3%; needless loads 9.8% → 4.0%. Uses Jev 1.12 and one agent model. Some correct baseline decisions become wrong. | Closest published analogy to Tool selection. Test progressive disclosure and explicit abstention, including whether downstream agents actually improve. |
| [S6 Hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification) | Beam width three recovers four of four labelled examples versus greedy two of four. Paths use length-normalised edge probabilities. Four examples, not a catalogue-scale benchmark. | Hierarchical retrieval is an experimental candidate, not an accepted 16,000-Tool latency/accuracy promise. A path score is not calibrated end-to-end correctness. |
| [S7 Extraction cascade](https://docs.typesafe.ai/cookbooks/sde_cascade) | Cheap extraction, per-field verification against source, expensive-model escalation. Any failing field can trigger escalation. Internal 100-prompt experiment; walkthrough deliberately fixes one fabricated output. | Verify observable fields against promised evidence. A generic whole-payload failure verdict lacks the information this method needs. |
| [S8 Citation verification](https://docs.typesafe.ai/cookbooks/citation_check) | Exact quote matching before semantic assessment against context. Eight examples, four deliberately corrupted, Jev 1.12. | Perform deterministic validation first. Verification requires an independent source; the Provider's own assertion cannot prove itself. |
| [S9 Pre-parsed extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook) | Code finds candidate spans; Choice selects one or none; code copies and normalises it. Three worked examples. | Useful for proposed catalogue enrichment or document interpretation. Jev does not generate missing schemas, prices, tax facts or arbitrary parameters. |
| [S10 Guardrails](https://docs.typesafe.ai/cookbooks/llm_guardrails) and [jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13) | The guardrail cookbook demonstrates hazard-specific signals and policy thresholds on 15 examples with Jev 1.12. The newer model-limitations page explicitly warns that adversarial state can move answers. | A detection signal is feasible; an anti-exfiltration guarantee is unsupported. Retain deterministic permissions and data-destination restrictions. |
| [S11 Models](https://docs.typesafe.ai/models) | Current version is `jev-1.13.0`; moving aliases, text input, 64k total and 32k state-plus-longest-question budgets. Published limits may change dynamically. | Pin the model and preserve the resolved version. Bound request size and concurrency; do not base capacity planning on a permanent rate-limit assumption. |
| [S12 SDK source](https://github.com/typesafe-ai/typesafe-sdk-js/blob/66880ccded6cb642dc1809620c2b108c33730214/src/client.ts) | Each retry executes a separately timed attempt; backoff also takes time. Parsed responses are cast to the generic return type. AE has SDK 0.6.0 installed. | A 1,500ms attempt timeout is not a 1,500ms operation deadline. Add application-boundary answer validation and caller cancellation; type inference is not runtime validation. |
| [S13 Independent reranking report](https://github.com/hev/reranker/blob/1eb47266270b32b2a3667f9fb89646378ca9c9d6/RESULTS.md) | Jev 1.13.0 evaluated on SciFact, NFCorpus and FiQA; same BM25 shortlist for competitors. Reports competitive quality, variable tails and imperfect calibration. Not independently rerun here. | Evaluate batch, pairwise and specialised-reranker alternatives instead of assuming Jev dominates every quality/latency tradeoff. |
| [S14 Independent implementation](https://github.com/hev/reranker/blob/1eb47266270b32b2a3667f9fb89646378ca9c9d6/hev_rerank/rerank.py) | One Noul per document in shared state; chunking, stable ranking, optional threshold. Defaults include long timeout/retry allowances. Mapping fallback can send every metadata field when recognised text keys are absent. | Useful algorithm reference, unsuitable for blind copy into AE's request path. Use explicit field allowlists, measured deadlines and installed SDK. |
| [S15 Pydantic integration](https://pydantic.dev/docs/ai/models/typesafe/) | Demonstrates explicit abstention, closed-set output mapping and fallback. Framework-level confidence may transform a boolean probability into a margin. | Preserve primitive and adapter provenance. Similar field names across adapters do not establish equivalent uncertainty semantics. No reason to add a Python runtime to AE. |
| [S16 Vendor launch/evaluation methodology](https://typesafe.ai/blog/introducing-system-one-models-and-jev) | Workflow benchmarks compare to reference probabilities from stronger models; vendor discusses workload selection and bias. | Agreement with a model ensemble is not labelled evidence of Tool suitability, delivery or correct financial remedy. |

### Independent results worth carrying into the design

S13 reports batch-Noul nDCG@10 of 0.768/0.358/0.376 on SciFact/NFCorpus/FiQA,
versus BM25 0.667/0.310/0.234. Voyage rerank-3 reaches 0.402 on FiQA. Batch p95
is 1,758ms/1,716ms/785ms; pairwise latency figures measure individual requests,
not the wall time of completing a full shortlist. Its SciFact calibration slice
reports 76% labelled relevance among pair-Noul scores at least 0.9. Repeated
requests and reversed candidate order also show numerical variation.

These are author-reported measurements in retrieval datasets. Labels may omit
some relevant documents; no AE traffic, Australian deployment latency or money
movement is measured. They justify comparison and calibration, not importing a
threshold or ranking the vendors conclusively. The repository exposes wrapper,
prompt and result tables; this review did not establish an independently
reproducible complete benchmark harness/data archive.

### Important corrections to previous assumptions

1. **No single canonical ranking recipe.** Pairwise Noul, batched Noul, Choice
   shortlist selection and graded Score address different objectives. Compare
   them on the same AE examples. A Choice can prefer the least-bad unsuitable Tool.
2. **Parallel questions are not dependent reasoning.** They do not consume each
   other's answers. A second request is needed when the first selects richer
   evidence or new options. Batching saves round trips but may enlarge state and
   worsen tail latency. [S1, S2, S5, S13; fan-out](https://docs.typesafe.ai/patterns/fan-out)
3. **Probability, intensity and permission differ.** Use Noul for a binary
   condition, Score for degree on a defined rubric, Choice for alternatives.
   None grants spending authority. [S2, S3; Score](https://docs.typesafe.ai/primitives/score)
4. **Verification depends on evidence availability.** Empty results may be valid;
   an error string may be data; a plausible fabricated result may contain no
   suspicious tokens. Source-grounded field checks are a better testable pattern
   where the Tool's contract makes those fields verifiable. [S7, S8]
5. **Model failure and service failure differ.** A model timeout is not evidence
   that a Provider failed. A model's adverse judgment is not payment evidence.
   This distinction follows from AE's commercial boundary, not a vendor claim.
6. **Data handling is an integration property.** The [legal index](https://docs.typesafe.ai/legal)
   points to agreements and enterprise zero-retention arrangements. That is not
   proof that AE's current account or an intermediary has those arrangements.
   Provider, retention, destination and permitted fields need explicit review.

## Fit to AE: hypotheses, not inherited rollout waves

| User problem | Candidate Jev pattern | Evidence needed before choosing it |
| --- | --- | --- |
| Agent sees keyword-adjacent Tools | Retrieve, then per-candidate Noul or graded Score; richer shortlist verification if needed | Candidate recall, useful top-k, false recommendations, extra agent turns and total latency against existing retrieval |
| Catalogue metadata is incomplete/noisy | Select known category or source span; mark unknown explicitly | Correct source-backed suggestions and review burden; no invented capability or admission fact |
| A schema-valid result violates a bounded promise | Deterministic checks plus per-field semantic verification against request, contract and independent evidence | False rejection, missed failure, unassessable rate, adversarial resilience and per-Tool-family labels |
| Operator triage is repetitive | Classification over existing reasons and queues | Routing accuracy and human correction burden; no automatic financial action |
| Broad catalogue retrieval misses suitable Tools | Improved retrieval, potentially hierarchical beam candidate generation | Recall gain versus simpler retrieval changes, taxonomy maintenance cost, end-to-end latency |
| Buyer needs semantic policy checks | Supplemental hazard signals over permitted inputs | Security evaluation and escalation policy; never replacement of hard authority checks |

The first row has the closest quantitative support. The other rows are credible
research candidates, not automatically included features. No literature located
in this review demonstrates production autonomous x402 remedy adjudication.

## Current AE evidence to retain, without inheriting the design

Inspected current source on shared `main`; several files are uncommitted work.
No runtime source was changed by this review.

- [Reranker](../src/modules/registry/tool-reranker.ts) sees at most 20 candidates
  from an already retrieved page. It returns the original order for unusable
  model results. This is a useful baseline, not global semantic search.
- [Search action](../src/modules/registry/tools.actions.ts) sends source filters
  to retrieval and performs additional projection after reranking. A redesign
  must explicitly establish what is eligible before model assessment.
- [Jev client](../src/modules/decision-engine/jev-client.ts) uses a moving alias,
  a 1,500ms attempt timeout and one retry. Its cost estimate formats the vendor
  token rate as AUD without an explicit currency conversion.
- [Gateway](../src/modules/decision-engine/decision-gateway.ts) falls through
  model, secondary LLM and deterministic tiers. A shared response shape does not
  make these judgments or confidence values interchangeable.
- Output adjudication (unavailable historical reference: `src/modules/capability-execution/call-worker/output-adjudication.ts`)
  sends identifiers and received payload, but not the accepted input, output
  expectations or independent source. It can invalidate output after a generic
  failure/fault classification. The source-grounded verification literature does
  not validate this information boundary.
- [Managed x402 execution](../src/modules/capability-execution/call-worker/brokeredX402.ts)
  settles recorded settled payments and separately records paid-but-invalid
  delivery. Thus the retired ADR's universal settlement prevention is unsupported.
- [Receipt view](../src/modules/capability-execution/call-receipt-view.ts) derives
  a Jev certificate with fixed 0.95 confidence from refunded status. Refund status
  alone cannot establish model provenance.

The preceding review ran five focused suites: 25 tests passed and two skipped.
That was plumbing evidence, not live Jev calibration or a full managed purchase
proof. No new live inference, paid Tool Call, deployment or financial experiment
was conducted for this literature review.

## Comparative evaluation design

This is a proposed experiment specification, not a claim of measured AE quality.
Use existing Vitest fixtures and developer scripts before adopting new tooling.

1. Freeze representative public/synthetic Tool descriptions and labelled requests.
   Include synonyms, lookalikes, explicit network/data-use requirements, several
   acceptable Tools, absent capabilities, sparse metadata and injected text.
   Split tuning from held-out evaluation by request family and Provider where
   possible, so near-duplicates do not manufacture apparent generalisation.
2. Compare identical candidate pools: current retrieval order; pairwise Noul;
   batched Noul; graded Score; and shortlist-plus-richer-evidence verification.
   Evaluate a specialised reranker only if adding that service is approved.
3. Measure retrieval recall separately from ranking. Measure ranking both
   conditionally on a relevant candidate being retrieved and end to end. Report
   no-match precision/coverage, useful top-k and downstream agent task success,
   not just agreement with another model.
4. Record raw judgments, resolved model, prompt/criteria version, input digest,
   candidate/evidence versions, latency including retries, and actual usage.
   Use a fixed evaluation set for repetition/order tests. Report confidence
   intervals and slices, not a single flattering average.
5. Derive action thresholds from labelled outcomes and the cost of errors. Plot
   error against automation coverage. Do not copy 0.70/0.75/0.85 or assume a
   probability calibration curve transfers across tools, versions or providers.
6. Evaluate Provider discoverability and later unmet-demand matching separately:
   measure publication effort, metadata corrections, appropriate buyer-query
   coverage and useful later matches. Longitudinal learning requires repeat-use
   labels; it is not demonstrated by a search benchmark. Delivery verification
   would require its own experiment only if separately prioritised; it is not
   a gate for these market-journey improvements.
7. Verify transport failures independently: timeout, overload, malformed answer,
   missing question, invalid candidate, cancellation and deployment rollback.
   A failed inference must have the consumer's explicit failure behaviour.
8. Before commercial use, run a real authorised sandbox journey via AE's existing
   agent interfaces. Verify output evidence, payment evidence and remedy records
   separately. Offline passing counts cannot close that gate.

Minimum sample size, numerical acceptance limits and latency/cost budgets remain
open decisions. They must follow the intended error tolerance and available
labels, rather than arbitrary round numbers presented as guarantees.

## Simplicity analysis applied

**Strands:** candidate retrieval; inference transport; semantic judgment;
preference policy; Provider publication; commercial execution.

The convenient generic gateway braids fallback availability with semantic truth
when it returns interchangeable-looking scores from different tiers. This is
easy to call but hides which matching capability the consumer actually received.
Prefer the existing SDK for transport and journey-specific assessment results,
with preference and publication policy outside the model. Reuse suitability
dimensions when only preferences change; keep retrieval coverage separate from
ranking. The benefit must be reduced buyer/Provider effort, not merely a shared
gateway interface. The full simplicity assessment is in ADR 0003.

No new decision service, vector database, workflow engine, Python framework,
universal score, taxonomy or commercial object is justified by this review alone.
Those additions require a measured consumer benefit. This is a provisional
architecture recommendation, not an accepted change to current code.

## Remaining evidence gaps

- No AE-labelled evaluation establishes the winning primitive, request shape,
  threshold or second-pass benefit.
- No local inference latency/cost measurement establishes an Australian-region
  service budget or intermediary parity.
- No measured effect on Provider activation, later supply matching or useful
  repeat purchases; these need journey-specific observations.
- Public examples are early, often vendor-authored and sometimes cached on older
  models. No production reliability claim follows from their runnable code.

The old ADR is withdrawn. These gaps are inputs to the fresh design, not reasons
to retain its assumptions.
