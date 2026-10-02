# Mercator competitive benchmark: live free path

**Date:** 27 September 2026

**Question:** What product, functional and performance standard does Mercator set for AEcon's two-sided Tool market?

**Evidence:** Live public HTTP calls and public site inspection for Mercator; live public HTTP calls to the existing local AEcon server; Mercator's published documentation for paid behavior. No paid job or Provider purchase was made.

## Method

Four identical English needs were sent twice to each search interface with `limit=5`. Mercator used `GET https://mercator.sh/v1/services/search?query=...&limit=5`; AEcon used `POST http://127.0.0.1:3024/api/v1/market-tools/search` with `{ "query": "...", "limit": 5 }`. Calls were sequential. Latency is client-observed elapsed time, including network and server work. Response size is raw JSON bytes. Candidate fit below is a human assessment of the returned descriptions; Provider results were not purchased or validated.

| Need | Mercator's first result | AEcon's first result | What the sample establishes |
| --- | --- | --- | --- |
| `retrieve latest NVIDIA SEC 10-Q filing` | Exa page contents, which needs a URL; an exact EDGAR filing endpoint ranked second | EDGAR company lookup, which resolves company identity but does not retrieve the filing | Mercator offered a directly suitable paid endpoint within two choices, but its top choice added a step. AEcon's sampled first choice did not fulfil the stated need. |
| `get tomorrow weather forecast for Paris France` | Weather endpoint with daily forecasts | Current conditions endpoint | Mercator's first choice could address tomorrow; AEcon's sampled first choice addressed current weather. |
| `extract line items from a scanned invoice PDF` | Invoice PDF/image extraction with line items | OCR text extraction | Mercator's first choice matched the requested structured result; AEcon's would leave line-item extraction to the Agent. |
| `find a licensed French-speaking mediator for a live virtual employment interview` | People search | People search | Neither returned a suitable service or a clean no-match in the sampled response. Mercator's other results included reading time, French books and a Denver rental-license check. |

All 16 search requests returned HTTP 200. Mercator returned five candidates for every need, including the unmet need. AEcon returned `degraded` with three to five candidates for every need; its response reported suitability ranking unavailable and supply-projection freshness `absent`. These are observations of the sampled interfaces and inventories, not a controlled ranking-model comparison.

| Interface | Eight search calls: median elapsed | Range | Median response | Largest response |
| --- | ---: | ---: | ---: | ---: |
| Mercator hosted REST | 8.72 s | 5.15–12.58 s | 14.5 KB | 68.2 KB, unmet need |
| AEcon local HTTP | 0.44 s | 0.11–0.84 s | 20.1 KB | 25.6 KB, unmet need |

The latency figures are **not a fair speed ranking**: Mercator was remote and AEcon was loopback, with different inventory, freshness and ranking states. The eight-call samples do show the response time and context cost actually encountered on these public paths. Neither sample supports a p95, throughput or availability claim.

Individual observations, in request order (`elapsed milliseconds / response bytes`):

| Need | Mercator runs | AEcon runs |
| --- | --- | --- |
| SEC filing | `6602 / 18201`, `12575 / 17742` | `713 / 20533`, `133 / 20533` |
| Tomorrow weather | `6269 / 7430`, `11545 / 7430` | `763 / 15319`, `174 / 15319` |
| Scanned invoice | `6260 / 11160`, `11521 / 11160` | `718 / 19635`, `118 / 19635` |
| Unmet service | `10835 / 68233`, `5150 / 68233` | `836 / 25620`, `112 / 25620` |

## Functional probes

- Mercator's `GET /v1/services/{serviceId}` returned the SEC Provider's endpoint schema, x402 payment offer, network, recipient and price. The complete service response was 63.4 KB and took 2.81 s. AEcon's description of its sampled EDGAR candidate was 2.4 KB and took 0.55 s, but described a different capability.
- Mercator's free `POST /v1/quote` returned a live, advisory quote for the exact SEC filing endpoint at **USD 0.003**, with a roughly one-minute validity window; elapsed time was 5.29 s. A two-node independent filing plan returned a **USD 0.006** total and a single parallel stage in 1.55 s. This verifies multi-node *quoting*, not multi-node execution or delivery.
- [Mercator's public site](https://mercator.sh/) leads with an outcome-oriented Agent prompt and [use cases](https://mercator.sh/use-cases) spanning research, company data, people search, travel and finance. Its site claims 30,167 tools; this benchmark did not verify the count, unique callability or quality of that inventory.
- [Mercator's docs](https://mercator.sh/docs) specify a paid durable job, spending limits, same-key retries, cached result reads, refund treatment and payer-bound reviews. Those are **documented contracts here**, not behaviors exercised in this benchmark. The docs say service owners request discovery by email with a URL, docs/OpenAPI URL, protocol and capability description; Provider distribution or earnings could not be measured from the public interface.

### Travel-search use case probe

The [travel-search page](https://mercator.sh/use-cases/travel-search) linked by Joel describes comparing cash fares, award inventory and flight conditions for two business-class seats from San Francisco to Tokyo. It asks an Agent to check each leg's cabin, taxes, restrictions and freshness. Its **$0.021 example call subtotal is illustrative single-call pricing**, explicitly not a live Quote or completed itinerary. The page names possible Providers; it does not establish that two seats are available or that all sources can be purchased successfully for this trip.

On 27 September, one free public search per query was sent to Mercator's hosted endpoint and AEcon's local endpoint with `limit=5`. The long example was made date-explicit as November **2026**; it still lacks exact outbound and return dates. Candidate fit is assessed from descriptions only. Mercator's full-query ordering changed across two manual requests, so ranks below are the recorded run, not a stability claim.

| Need | Mercator's observed first five | AEcon's observed result | What it establishes |
| --- | --- | --- | --- |
| Two business-class SFO–Tokyo seats, 7–10-day November 2026 round trip; compare cash, points, taxes, rules and conditions | Two cached Seats.aero award endpoints led; flight search appeared fourth. One run also showed an unrelated Google Reviews candidate. | `degraded`: Business Identity, Weather Current, Timezone Converter, Bitrefill, Verify. | Mercator exposed parts of the task but not a complete itinerary. AEcon's first five offered no relevant flight or award contribution. |
| Cash business-class round-trip fares for two | Flight search first; an endpoint describing live itineraries, fares and schedules second. | `noMatch`. | Mercator had plausible cash-fare sources. AEcon's canonical search did not surface supply for this narrower need; catalogue coverage versus admission and ranking remain unresolved. |
| Two business-class award seats | Cached Seats.aero search first, with other award-search endpoints in the next three. | `noMatch`. | Mercator had plausible award-inventory sources. AEcon did not surface one. No live seat count was checked. |
| Delays, airport disruptions and weather | Airport TAF and METAR first and second; disruption-risk endpoint fifth. | `degraded`: weather and unrelated blockchain Tools; no flight-condition Tool in the first five. A narrower `airport disruption` search returned `noMatch`. | Mercator exposed condition sources; neither service established a trip-specific risk assessment. |

All eight recorded requests returned parseable search responses; AEcon's four responses were HTTP 200. Mercator's four calls took 6.38–8.23 seconds and returned 6.3–23.1 KB; AEcon's local calls took 0.23–0.74 seconds and returned 21.1–26.1 KB. Different network paths, inventories and AEcon's degraded ranking prevent a speed conclusion. No service was called, no fare or award availability was observed, and no travel Quote was requested. The important next test is a completed, time-stamped itinerary comparison with verified seats, leg-by-leg cabin, taxes, cancellation rules and total task cost—not a count of matching search cards.

### Published task-performance claim

[Tempo's announcement](https://tempo.xyz/developers/blog/introducing-mercator) reports paired agent tasks with and without Mercator. For GPT-5.6 Luna at high effort it reports a mean increase from 66.8% to 70.3% across four selected suites, with 159 matched task pairs at each plotted point. The [public site](https://mercator.sh/) displays full-model-matrix gains of 2.63 percentage points on WideSearch, 1.83 on FreshQA, 1.07 on GAIA and 0.57 on DeepSynth. These are Tempo's results, not independently reproduced here. The relevant standard for AEcon is a paired *completed-task* evaluation against the same agent and model, including total cost and elapsed time; API search latency alone cannot establish that benefit.

## Product standard for AEcon

Mercator demonstrates that natural-language discovery, short selection, live pricing and priced multi-Tool work belong in the serious competitive baseline. The relevant buyer outcome is a usable contribution with clear price and few Agent turns; the Provider outcome is demand reaching a suitable service. Joel clarified the ownership boundary on 27 September: the Customer's harness composes independent AE Calls, while AE owns execution and recovery for any quoted bundle it offers. The existing Tool, Quote and Call boundaries remain the starting point; a multi-node Mercator Quote does not by itself require AE to own every customer workflow.

The sample also exposes weaknesses to beat: irrelevant top choices, an unmet need presented as five candidates, and large agent-facing responses. AEcon should benchmark *task fit and honest no-match*, not merely whether search returns rows. A repeatable competitive run should use the same task set and hosted network conditions, score top-choice and top-three fitness before price, then measure turns, total elapsed time, cost, outcome quality and recovery after a failed or uncertain Call. Provider reach should be measured by whether a published Tool appears for a relevant need and receives an eligible buyer, not catalogue size.

This first pass establishes a real search and quote baseline. Paid job completion, refunds, authorization, Provider conversion, repeat selection and fair hosted performance remain unmeasured; no conclusion about those outcomes is drawn from documentation alone.
