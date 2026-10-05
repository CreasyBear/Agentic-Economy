# Jev experiments: from capability gap to usable contribution

**2026-09-20 · experimental, not a production integration decision**

Outcome: an agent acquires a suitable contribution on its first attempt and
continues working without a human finding the service or repairing its use.
Provider counterpart: a capability reaches relevant buyers despite different
wording. Successful ranking is a leading indicator, not the product outcome.

**Completed:** search/ranking trial (unavailable historical reference: `output/jev-bazaar-eval-2026-09-20/REPORT.md`)
and comparison, preparation and Provider-matching trial (unavailable historical reference: `output/jev-journeys-2026-09-20-v2/REPORT.md`).
The second trial found equal held-out quality between Jev and the existing
general-model adapter, lower observed inference latency/cost, and a shared
failure on an underspecified buyer request. The subsequent
paired agent-loop trial (unavailable historical reference: `output/jev-agent-loop-2026-09-20/REPORT.md`) found no
turn reduction or demonstrated service-choice benefit from adding a Jev hint.
Its extra inference increased cost. No end-to-end purchase benefit is established.
**Decision:** favour work replacement or precomputation; reject an additive hint
for the tested small-candidate loop.

## What to test

| Journey | Context supplied → judgment | Behaviour changed → customer benefit | Product measure |
| --- | --- | --- | --- |
| Find | Need + retrieved public descriptions → relevance | Reorder candidates → find suitable supply on the first request | Suitable result in first three; reformulations; retrieval misses |
| Compare | Need + candidate constraints → suitable choice / no match / uncertain | Recommend a compatible alternative or ask for missing information → fewer wrong-service selections | Switching caused by mismatch; decision turns |
| Prepare purchase | Request + declared enum/source values → intended argument | Suggest exact declared value or leave unset → fewer input corrections | First valid Quote; correction turns; time to first usable Call result |
| Reach buyers | Provider description + independent buyer phrasing → relevant / incompatible / unknown | Improve discovery suggestions → qualified exposure without keyword optimisation | Relevant-request recall and irrelevant exposure, then selection/Calls |
| Find supply later | Consented retained need + new supply → relevance | Potential match notification → recover previously unsatisfied demand | Later hypothesis: useful matches, unwanted notifications |
| Repeat use | Same contribution need + attributed past outcomes → contextual preference | Potentially adjust shortlist → fewer repeat failures | Later hypothesis: repeat usable contributions, exploration and Provider exposure |

The last two are hypotheses, not implemented capabilities or permission to retain
requests, send notifications, or build a recommendation system.

## Three separate verdicts

1. **Capability:** correct choices on frozen cases; false selections, missed
   opportunities, abstentions and unavailable responses reported separately.
2. **Product fit:** compare the *whole journey* with existing behaviour. Measure
   success, elapsed time and total harness/model spend, including fallbacks.
3. **Authority:** even a correct semantic answer grants no purchase permission.
   Prices, supported execution, credentials, policy and transaction integrity
   stay in existing code. No experiment invokes a Tool or makes a purchase.

## Contracts before integration

**Requires:** a specific requested contribution; versioned public metadata;
bounded candidate options; a declared meaning for each judgment. Source-value
selection requires candidate coverage. Do not transmit credentials, wallet
information, private customer records or unnecessary raw Provider metadata.

**Ensures:** ranking retains identities; comparison selects only supplied
candidates; preparation selects only declared values and copies literals from
their source; Provider suggestions never invent capabilities. Suggestions remain
distinguishable from verified facts and published Provider statements.

**Invariant:** semantic fit is separate from authority, execution support and
delivery. Provider instructions are untrusted data. A missing candidate cannot
be rescued by reranking; a missing field cannot be invented by selection.

**On violation:** invalid fixtures stop before paid inference. Transport failure,
timeout or malformed output is `unavailable`, not `no_match`. `uncertain` means
insufficient/ambiguous evidence, while `no_match` means the supplied options are
incompatible—not that no suitable service exists anywhere. Preserve current
search on inference failure; return preparation to the caller, never execute a
guessed request. Existing validation still runs after any suggestion.

## Reproducible trials

Use Node 22/npm 11.5.1 and existing dependencies only.

```sh
# Existing real-search ranking trial: capture, label before inference, run.
node --import tsx tools/dev/eval-jev-bazaar.ts capture OUTPUT_DIR
node --import tsx tools/dev/eval-jev-bazaar.ts run OUTPUT_DIR LABELS_JSON

# Cross-journey trial: freeze source evidence, cases, labels and code fingerprint.
node --import tsx tools/dev/eval-jev-journeys.ts freeze NEW_DIR SNAPSHOT_JSON
node --import tsx tools/dev/eval-jev-journeys.ts run NEW_DIR dev
node --import tsx tools/dev/eval-jev-journeys.ts run NEW_DIR holdout

npm test -- tests/eval/jev-journeys.test.ts tests/eval/jev-bazaar-metrics.test.ts
```

`freeze` makes no model calls. `run` makes paid inference calls using existing
credentials. Exclusive output creation prevents accidental reruns; partial rows
survive interruption and must not be presented as a completed suite.
The initial cross-journey labels are pinned to the existing September 20 capture
by SHA-256. A different capture is rejected until its cases are re-labelled.

The 24-case suite uses real Bazaar metadata with authored requests: 12 development
and 12 request-held-out cases across comparison, enum preparation and Provider
matching. Sparse metadata and injection variants are explicitly synthetic.
Labels are authored before inference and excluded from model state. They are
assistant labels, not independent customer ground truth; Providers and capability
families overlap across splits. This is a smoke evaluation, not generalisation proof.

Compare identical questions/context through Jev and AE's existing Gemini adapter,
plus literal enum matching/bag-of-words rules. The adapter is a general-model
decision baseline, **not the customer's complete agent/harness**. Jev has 1.5s;
the adapter gets 10s to expose quality separately from speed. Report common-1.5s
availability too; do not call those different timeout budgets a fair latency SLA.
Record actual raw provider usage, never the gateway's synthetic AUD estimate.

No prompt tuning after holdout. Code changes require a new frozen suite; cases
already evaluated are then development evidence. Add new independent holdouts
before claiming an improvement. Compare errors before averages; do not drop
timeouts from accuracy or count repeats as independent examples.

## Promotion and remaining experiments

- **Use now:** existing deterministic rules for exact enum values, prices and
  authority. Evaluate the existing advisory Bazaar reranker with its original
  ordering fallback; current evidence supports a limited trial, not broad rollout.
- **Investigate next:** replacing an existing standalone comparison decision,
  larger-candidate reduction and Provider metadata/demand matching outside the
  interactive loop. Standard enum synonyms should use code. Promote only if
  held-out quality improves over the
  strongest relevant baseline, without increased harmful selections, and total
  journey cost/latency improves. A tie favours existing code.
- **Do not use here:** an additive hint in the tested small-candidate agent loop;
  guessed free-form payloads, cryptographic calculation,
  permission decisions, invented supply, Provider ownership, proof of delivery,
  automatic price/financial-record changes, or replacing the customer's planner.

Before any broader rollout: replay equivalent needs through existing HTTP/MCP
and hosted agent surfaces, then measure retrieval → selection → validated Quote preparation.
Run controlled end-to-end Calls only under separately approved credentials and
spending limits. Keep retrieval absence, judgment error, input error, service
failure and transaction failure as separate causes. Do not equate an offline
enum success with a valid Quote or a paid contribution.

### Paired agent-loop trial

`eval-jev-agent-loop.ts` uses the installed AI SDK agent loop, AE's configured
OpenRouter model/gateway, and the existing chat's four-step budget. It compares
unchanged candidate lists with/without an advisory Jev selection. Both arms get
the same descriptions, request-input schemas, instructions and read-only
validator. Arm order alternates across cases and two repetitions.

```sh
node --import tsx tools/dev/eval-jev-agent-loop.ts freeze NEW_DIR SNAPSHOT_JSON
node --import tsx tools/dev/eval-jev-agent-loop.ts run NEW_DIR
```

**Requires:** frozen public evidence, predeclared compatible choices and literal
input expectations. **Ensures:** measure total agent steps, read/preparation
attempts, corrections, total latency and raw inference cost—not Jev latency alone.
**Invariant:** a Jev hint never removes candidates or bypasses the same validator.
**On violation:** invalid preparation can be corrected within the four-step
budget; unavailable inference remains recorded; no automatic paid trial rerun.

This is a live-model, fixture-backed loop: reads and preparation are simulated;
it does not run Convex chat persistence, HTTP/MCP transports, account authority,
Quotes or Calls. The existing JSON-schema validator checks the declared request
object. Separate expected-value checks detect a wrong Tool or invented input
even if the schema accepts it. A passing preparation is not a successful Quote.
Cases observed in earlier decision tests are regression evidence, not a fresh
blind holdout. No production benefit is inferred from fixture-backed success.

## Why this amount of structure

**Keep:** three narrow runners (search ordering, typed decisions, agent loop),
one shared case file and behavioural tests. Added cost: explicit fixture formats,
fingerprints and the existing model adapters. Bought:
identical inputs, pre-inference labels, incremental evidence and comparable errors
across three actual uses. The agent-loop runner earns its separate file because
its unit of comparison is a multi-step workflow, not a single judgment; it reuses
question construction and decision decoding rather than adding another client.
Case changes normally touch one file.
**Reject:** a new evaluation service, dependency, plugin framework, dashboard or
production semantic layer. Existing SDK, adapters and Vitest cover this stage.
The new union prevents a service failure becoming a semantic no-match; ordinary
strings remain appropriate for dataset IDs—branding them adds no useful guarantee.

## Assessment coverage and limits

| Requirement | Evidence / boundary |
| --- | --- |
| Actual product and future journeys | PRODUCT's six journeys; current search, comparison and chat source; future matching/allocation remain hypotheses |
| Current Jev use and programming model | Primary implementations and live TypeSafe docs; literature review and source-pattern links below |
| Discovery, comparison, preparation, Provider matching | Live Bazaar ranking; 24-case frozen decision suite; 32 paired agent runs plus four clarification diagnostics |
| Alternatives and product fit | Original Bazaar order, deterministic challengers, existing Gemini adapter and configured DeepSeek agent; additive hint rejected; full hosted purchases unmeasured |
| Hard cases and failure behaviour | Order reversal, no fit, sparse/misleading metadata, ambiguous requests; mocked timeout/service/invalid-response tests; no unsupported security guarantee |
| Reproducibility and holdout | Frozen labels/state, exact requests, model/usage records, exclusive artifacts; request-held-out decision pass; observed agent cases labelled regression evidence |
| Authority and integration contracts | Requires/Ensures/Invariant/On violation above; no financial/permission mutation; semantic no-match, uncertainty and infrastructure failure remain distinct |
| Usable recommendation | Use/investigate/don't-use map; benefits, costs and failures in three linked reports; no dependency, service, schema, public API or production rollout added by the experiments |

The assessment and initial experiment framework are complete. The remaining
items are **promotion conditions**, not evidence already obtained: independent
labels and unseen Providers, large-catalogue recall, HTTP/MCP and hosted agent
journeys, and authorised paid Calls measuring time to a usable contribution.
Do not convert these unmeasured outcomes into claims about customer success.

## Source patterns, not borrowed performance claims

[Jev Search](https://github.com/superagents-lab/jev-search): understand, retrieve,
rank. [JevRouter](https://github.com/BillionsBobby/JevRouter): choose capabilities
while code enforces availability and permissions.
[jev-mode](https://github.com/ddfeyes/jev-mode): move repeated semantic judgments
out of the main agent context; synthetic savings require local remeasurement.
[jlink](https://github.com/keltokhy/jlink): semantic matching after candidate
retrieval. [TypeSafe function calling](https://docs.typesafe.ai/cookbooks/function_calling):
select known arguments; [use-case map](https://docs.typesafe.ai/concepts/use-case-map):
code owns control flow. These establish implementable patterns, not AE revenue,
customer completion rates or production adoption.
