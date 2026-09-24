---
status: proposed
date: 2026-09-20
title: "ADR 0003: Jev for effortless capability-market journeys"
replaces: "Withdrawn ADR 0002 and the superseded verification-centred ADR 0003 draft"
decision_owner: "Joel Chan"
---

# ADR 0003: Jev for effortless capability-market journeys

## Status and product premise

**Product lens confirmed by Joel; technical design proposed, not implementation-approved.**
This document replaces the previous draft in full. No choice from its old A/B/C
alternatives is pending. Full CEO and engineering reviews remain incomplete.

AE is the market through which agents discover and buy capabilities during work,
and through which Providers reach those agents across harnesses. The immediate
entry is managed x402 purchasing with AUD funding. The future includes specialised
data, professional contributions, machine services and agent-native businesses.
AE does not own the buyer's larger plan or harness.

The six journeys in [PRODUCT.md](../../PRODUCT.md#core-market-journeys) define the
value sought. Verification is a minor supporting application, not the purpose of
Jev or the centre of this architecture. Commercial integrity remains required;
its importance does not make it the principal customer benefit.

## Implementation authority

This ADR remains a proposed design input: D01–D06 are resolved in their owning assignments, and no proposal here independently approves a public/storage contract, financial consequence or hosted activation. The alpha launch register retains its release and exposure controls.

## Assessment and proposed direction

**Jev is a strong candidate for the market's semantic decisions, not a complete
market engine.** Its value is turning language and context into typed choices
and comparable dimensions that existing code can use. The same programming
model can help both sides of the market without installing a general agent loop.

Start with buyer matching, then Provider discoverability. Preserve a clear path
to unmet-demand matching and learning from repeated use. Purchase preparation
uses Jev selectively; exact execution needs no model. This sequence is a
recommendation, not a claim that all six journeys need Jev or are implemented.

The [literature review](../../research/JEV-LITERATURE-REVIEW-2026-09-20.md)
contains sources, limitations and current implementation observations.

**Experiment update, 20 September:** the [experiment programme](../../research/jev-experiment-programme.md)
now includes live Bazaar ranking, frozen semantic decisions and a paired
fixture-backed agent loop. Ranking improved the first result on two of eight
queries. Adding an advisory Jev choice to the tested small-candidate agent loop
did not reduce turns or demonstrate better choices and increased inference cost.
Do not read the pattern-fit assessments below as approval for an extra model
call on every purchase. Prefer tested discovery assistance; investigate replacing
existing work or precomputing supply metadata. Hosted purchase benefit remains
unproved, and this ADR remains proposed.

## Journey-by-journey assessment

### 1. Describe naturally, find the right capability

**Experience:** the agent describes the contribution it needs, not an endpoint
name, taxonomy or exact phrase from a listing.

**Fit: strong.** Jev can classify the need into available search routes and judge
request-to-Tool suitability. Preserve the original request: classification is
an aid to retrieval, not a lossy replacement for what the buyer asked.

**Practical approach:** reuse existing retrieval; compare direct reranking with
a richer shortlist pass. A short catalogue can be assessed directly when request
size permits. Introduce hierarchical routing only if catalogue coverage and
scale demonstrate the need. A wrong first category must not exclude every
suitable Provider.

**Measure:** suitable-candidate recall, useful top-three results, successful
selection, reformulations and total time to a usable contribution. A perfect
reranker cannot rescue a Tool missing from its candidate pool.

**Source pattern:** [skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion)
and [hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification).
The former is a particularly close analogy: narrow an index, inspect richer
candidate detail, and allow no recommendation.

### 2. Compare services, reach a useful choice

**Experience:** the agent sees a small set of meaningful alternatives and can
change preferences without starting discovery again.

**Fit: strong.** Separate semantic suitability into useful dimensions, such as
task fit, requested output fit and domain specificity. Combine those judgments
with actual price and observed latency in code; do not ask Jev to estimate facts
already available as structured data.

**Practical approach:** assess independent dimensions together. Reuse them when
only preference weights change. Reassess if the request, Tool version or meaning
of the rubric changes. Distinguish "none fit" from "several are good": distributed
Choice probability across several suitable Tools is not necessarily a reason to
interrupt the user. Reasons can be rendered from labelled dimensions and source
facts; Jev does not generate free-form explanations.

**Measure:** appropriate selection, decision turns, preference-change latency,
and subsequent switching because of a poor match. Do not optimise one universal
Provider quality score.

**Source pattern:** [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring).
Applying it to AE comparison is a design inference, not a published AE benchmark.

### 3. Choose, buy, continue working

**Experience:** the agent moves from capability choice to a usable result with
minimal integration work through search -> Quote -> Call.

**Fit: selective.** Jev can select a known action or enum-valued argument and
identify which declared information is present. It does not invent arbitrary
request bodies, write integration code or perform the service.

**Practical approach:** retain literal inputs from the caller or parser; use
typed questions only where meaning is ambiguous. A generative model remains
appropriate for open-ended language or synthesis when the existing caller needs
it. Clear structured requests bypass extra inference. Existing Quote, Call and
continuation contracts do the actual purchasing work.

**Measure:** first valid Quote rate, avoidable input errors, extra turns, and
time until the calling agent can consume the result. Ranking alone does not
establish this journey.

**Source pattern:** [function calling](https://docs.typesafe.ai/cookbooks/function_calling)
and [pre-parsed value selection](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook).

### 4. Expose a capability, reach relevant buyers

**Experience:** a Provider connects its existing service and becomes discoverable
for the right needs without learning agent-search optimisation.

**Fit: strong pattern fit; AE benefit unmeasured.** Jev can suggest capability
categories and source-backed attributes, identify ambiguity, and flag likely
duplicate records for review. It cannot create an endpoint or prove ownership.

**Practical approach:** augment the current source-preview and publishing flow;
keep Provider review where suggestions change published meaning. Prefer useful
metadata from actual documentation over keyword stuffing or fabricated promises.
Run stable catalogue interpretation at publication/update time, not on every
buyer search. Buyer-relative suitability still belongs to the request.

**Measure:** time to a discoverable Tool, Provider correction burden, coverage of
representative buyer needs, and qualified selection/Calls after publication.
A prettier listing or higher similarity score is not distribution success.

**Source pattern:** [entity alignment](https://docs.typesafe.ai/cookbooks/entity_alignment),
value selection and classification. These support suggestions, not silent
merging of different Providers or Tool versions.

### 5. Find nothing today, connect with supply later

**Experience:** a failed search is not necessarily a dead end; newly available
capabilities can match the same need under different wording.

**Fit: promising extension.** Reuse request-to-Tool matching in the opposite
direction: a new or changed Tool is compared with relevant retained requests.

**Practical approach:** begin with the existing private market-request/status
path. Retrieve plausible request candidates before semantic assessment; avoid
an all-requests × all-Tools scan. Background matching, notifications and
Provider-facing aggregated demand are separate implementation decisions, not
features already authorised or shipped by this ADR.

**Measure:** genuinely useful later matches, accepted recommendations, time to
match, and eventual purchases—not the number of alerts generated.

**Source support:** transfer of the retrieval/selection pattern. There is no
published AE demand-matching benchmark.

### 6. Repeated use makes the market better

**Experience:** recurring needs find better-suited Providers, and supply decisions
respond to what buyers actually need.

**Fit: promising later layer, dependent on usable outcomes.** Jev can turn request
and feedback language into consistent semantic features. A separate evaluated
ranking or predictive policy must establish whether those features improve
subsequent choices. Calling Jev repeatedly does not train it on AE outcomes.

**Practical approach:** start with transparent dimensions and observed behaviour.
Only add learned allocation when repeat use supplies meaningful labels and a
consumer. Account for exposure bias, new Providers, changing Tool versions and
differences between purchase, delivery and usefulness. Do not call a paid Call
a satisfied customer.

**Measure:** repeat-selection usefulness, lower reformulation/switching, better
matches for new Providers, and incremental demand. Use held-out time periods
and request/Provider slices; distinguish learning from popularity reinforcement.

**Source pattern:** [feature discovery](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery).
This supplies a programming pattern, not proof of an AE network effect.

## Alternatives and tradeoffs

| Approach | What it buys | Main limitation | Assessment |
| --- | --- | --- | --- |
| Existing retrieval plus caller judgment | Fewest moving parts; useful baseline | May leave vocabulary mismatch and catalogue inspection to the agent | Retain as control and fallback |
| Specialised retrieval/reranking | Focused solution for finding and ordering supply | Does not directly cover Provider metadata, argument selection or demand interpretation | Credible competitor for the search job |
| Jev judgments composed in existing modules | One typed model interface across several semantic jobs; reusable dimensions | Per-journey question design, evaluation, latency and vendor dependence | Recommended candidate for the journey programme |
| General LLM procurement agent | Flexible conversation, synthesis and planning | Duplicates caller/harness responsibilities and adds control-flow complexity | Do not introduce; retain existing generative surfaces where needed |

Do not choose Jev for search simply because it supports more jobs. Compare
search quality, interaction cost and latency against the simpler alternatives.
Conversely, do not assess its market-wide usefulness only as a reranker.

## Proposed architecture and ownership

```text
Provider source -> preview/publish -> catalogue
                       |                 |
                 Jev suggestions        |
                                         v
agent need -> retrieval -> Jev suitability dimensions -> compact choices
                                  |                          |
                         preference recombination           v
                                                     Quote -> Call -> result

retained unmet need + new supply -> reuse matching
comparable use/outcomes -> later evaluated ranking improvements
```

Reuse the installed TypeSafe SDK, existing catalogue/search and comparison
modules, Provider publishing flow and private market-request actions. No new
service, database, universal decision object or public purchase verb is assumed.

- Catalogue owner controls candidate coverage, metadata and Tool identity.
- Search/comparison owner controls suitability questions and ranking policy.
- Provider workflow owner controls suggestions and publication acceptance.
- Market-demand owner controls retained requests and later matching.
- Existing authority/Quote/Call owners control purchases.
- Jev supplies assessments; it owns none of these lifecycles.

Cache or reuse only when the relevant request, Tool/source version and rubric
are unchanged, and within the appropriate data-access scope. Exact price and
availability remain separately refreshed facts. Batching independent questions
can reduce round trips; dependent richer-detail assessment requires another pass.

## Contracts for an initial matching slice

**Requires:** the actual service request, supplied candidate identities and
relevant descriptions/contracts; explicit known constraints; permission for
the inference data destination.

**Ensures:** returns only supplied candidates, useful comparison dimensions or
no recommendation. It preserves literal identities and supports the existing
purchase path without another mandatory orientation step.

**Invariant:** ranking does not change the Tool, price, authority or Call.
A low fit score is not proof that no suitable supply exists outside the retrieved
pool. Changing a preference cannot silently change the underlying facts.

**On violation:** reject malformed assessments and retain baseline search.
Differentiate absent supply, ambiguity and inference failure. Apply a total
request deadline; no frontier-model retry cascade on every search.

These are proposed design contracts, not a claim that current code satisfies all
of them. Public response/schema changes require their own implementation scope.

## Evaluation that measures the magic

Use existing test fixtures and scripts, with representative public or synthetic
catalogue inputs before private data. Start with three complete scenes:

1. A buyer describes a need in unfamiliar vocabulary, receives relevant choices,
   adjusts a preference and reaches a valid Quote.
2. A Provider connects a sparsely described service, reviews suggestions, and
   appears for appropriate buyer requests without appearing for misleading ones.
3. A private unmet request later finds newly added relevant supply through status.

For scene 1 compare baseline, one-pass Jev, and a richer-shortlist variant on the
same candidate coverage. Use several acceptable answers and genuine no-match
cases. Run through existing CLI/MCP/HTTP caller paths, not only direct model calls.
Measure total agent turns, tokens, p50/p95 elapsed time and usable results.
Do not claim vendor inference latency as end-to-end purchase latency.

For scene 2 compare discoverability and Provider effort before/after enrichment.
For scene 3 measure relevance and usefulness of later matches. The learning
journey follows only when meaningful longitudinal outcomes exist.

Include inference outage, reordered candidates, sparse descriptions and changed
Tool versions in ordinary tests. Set numerical budgets before selecting a winner;
no universal confidence threshold or performance improvement is asserted here.
This assessment did not run paid Jev calls or an AE-specific model benchmark.

## Simplicity analysis

SIMPLICITY: Jev composed into existing market journeys
  Strands: retrieval, semantic judgment, preference policy, publication, execution.
  Complected: avoided if model transport and answer types do not own those policies.
  Easy score: medium — SDK exists, but useful questions and evaluations need work.
  Simple score: high conditional on preserving existing ownership boundaries.
  Verdict: evaluate per journey; share transport, not a universal decision policy.
  Alternative: baseline retrieval/caller judgment or a specialised reranker.

Concrete added cost is model requests, question/version maintenance and
journey-specific evaluation. The benefit sought is less vocabulary translation,
catalogue reading and Provider setup effort. Keep each model step only if that
benefit exceeds its latency and maintenance cost. Do not add a platform to make
six small consumers appear architecturally uniform.

## Supporting controls, not the product thesis

Existing money, authority, privacy and recovery requirements remain in force.
Targeted delivery checks may be useful later, but no delivery-verification work
is prerequisite to the matching and discoverability improvements proposed here.
This ADR introduces no autonomous remedy or universal output audit.

## Preventing the framing error from recurring

The earlier error came from treating existing reranking/adjudication hooks and
risk controls as the product definition. Future reviews must trace each proposal
to a journey, the friction removed and an observable customer/Provider outcome.
Read PRODUCT first; use current source for implementation claims and strategic
documents for ambition. Do not inherit product priorities from retired execution
registers, compaction anchors or memory.

The corresponding direction is recorded in PRODUCT and AGENTS. ADR 0002 remains
withdrawn; its old operating protocol/register are historical, not execution
authority. No historical instructions can override the current product charter.

## Review status and next decision

- Product framing: confirmed by Joel's journey-first direction.
- Technical recommendation: proposed above; no runtime adoption authorised here.
- CEO review: incomplete; resume with these journeys and tradeoffs.
- Engineering review: pending full review of a selected implementation slice.
- Live Jev benchmark, hosted acceptance and production proof: not performed.
- Next practical technical decision: select the first buyer-matching experiment,
  with candidate coverage, full-agent success and total interaction cost measured
  together. Delivery verification is not an alternative scope competing for it.
