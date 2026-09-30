# G1 reference — Find a suitable capability

Scope: PC-01, 02, 05, 10, 22, 23, 35, 36. This is a **reference study**, not a source diagnosis or product decision. AE observations below come from the [papercut register](../2026-09-26-papercut-register.md); Mercator's [documented contract](../../../research/MERCATOR-DOCS-CAPABILITY-MAP-2026-09-27.md) and [free-path benchmark](../../../research/MERCATOR-AECON-BENCHMARK-2026-09-27.md) are already captured locally. Mercator's docs describe search → describe; its observed free search also returned irrelevant people-search candidates for an impossible need. Neither fact proves paid-task performance. [Official Mercator search documentation](https://mercator.sh/docs#search-services).

## Behaviour: Relevant choice when suitability ranking is unavailable (PC-02, PC-36)

| Product | How it behaves | Official source URL |
|---|---|---|
| Algolia | Word-removal fallback is **configurable**, not inevitable: `removeWordsIfNoResults=none` is the default; `allOptional` can match any subset, increasing recall at the expense of precision. Typo tolerance has separate strict/min modes. These are lexical controls, **not** proof of semantic suitability. | [Word removal](https://www.algolia.com/doc/api-reference/api-parameters/removeWordsIfNoResults), [typo controls](https://www.algolia.com/doc/guides/managing-results/optimize-search-results/typo-tolerance/in-depth/configuring-typo-tolerance) |
| GitHub Search | Default order is best match; a timed-out search may return partial matches **and** `incomplete_results: true`. A returned row is not a guarantee the search was complete. | [REST search: ranking and incomplete results](https://docs.github.com/en/rest/search/search) |
| npm | Website search uses title, description, README and keywords, default keyword-match sorting and alternative sorts; deprecated packages are excluded. Its documented website policy is not a natural-language endpoint-fit guarantee. | [Searching and choosing packages](https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/) |
| Smithery | Search supports full-text/semantic `q` with a bounded `topK` rerank window (10–500), plus verification and deployment filters; the API does not document a guarantee that each returned server fits the intended task. | [List all servers](https://smithery.ai/docs/api-reference/servers/list-all-servers) |

Familiar pattern: keep eligibility constraints separate from relevance; bound candidate/reranking work; distinguish complete, partial and unavailable ranking rather than silently treating a broad fallback as verified fit. **No cited product supplies a universal numerical suitability cutoff or proves that a failed semantic ranker should always mean zero results.** The AE register reports degraded irrelevant results, phrasing-sensitive false no-match on an admitted x402 Tool, and an uncalled alternate search implementation; those are different risks, not proof of a common cause ([PC-02, PC-36](../2026-09-26-papercut-register.md)).

AE reason to differ: Tool selection can lead to an AUD Quote, authorised x402 Call and external effects; returning an adjacent action as suitable is riskier than returning an irrelevant document. **Question for Joel:** in ranker outage, offer clearly labelled lexical candidates only if a deterministic suitability/eligibility check passes; return an honest no-match; or declare search unavailable with retry? Distinguish “no eligible supply” from “could not assess suitability,” and do not invent a confidence score.

## Behaviour: An answer and a useful next action when search has no suitable result (PC-01, PC-02; G6 PC-39/41 boundary)

| Product | How it behaves | Official source URL |
|---|---|---|
| Algolia | Explicitly renders “No results for [query]”, gives hints to adjust the query and offers **ClearRefinements** when filters may be responsible. Its guide distinguishes empty query, zero hits and errors. | [Conditional display / no results](https://www.algolia.com/doc/guides/building-search-ui/going-further/conditional-display/react) |
| GitHub Search | API reports `total_count` and `items`; invalid query/access yields validation failure, whereas a timeout can produce `incomplete_results: true`. A zero count, invalid query and incomplete search are distinguishable machine states. | [REST search](https://docs.github.com/en/rest/search/search) |
| MCP official registry | Name-substring search is intentionally simple; the docs direct advanced search/filtering to a subregistry. Search has an independent detail route rather than pretending search alone establishes callability. | [Official Registry API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md) |
| Mercator | Documentation exposes search and a separate service description with endpoint schema. Its free benchmark showed five *irrelevant* people-search candidates for an impossible mediator need, so this reference is **not** evidence that mature no-match behaviour is already solved. | [Search services](https://mercator.sh/docs#search-services), [describe service](https://mercator.sh/docs#describe-a-service) |

Familiar pattern: make the outcome explicit and preserve the need; offer a concrete next action such as remove a specific restrictive filter, reformulate a need or inspect a genuinely eligible candidate. An error/retry is not a no-match. The register says chat once stopped or completed without a final answer (PC-01); preview proof shows an answer on a real admitted Tool but a phrasing-sensitive no-match remains (PC-02). A chat answer must express the same result/uncertainty as the structured search; an empty card list with no answer is not an acceptable success ([register](../2026-09-26-papercut-register.md#pc-01-preview-proof--27-september-2026)).

AE reason to differ: “Save this unmet need” crosses into authenticated retained-demand storage (G6), unlike Algolia's ephemeral clear-filters action. **Question for Joel:** should no-match offer only broaden/retry, an authenticated save-demand action, or both, and which can anonymous web/chat/CLI users actually complete?

## Behaviour: Compact Agent discovery followed by deliberate inspection (PC-05, PC-10)

| Product | How it behaves | Official source URL |
|---|---|---|
| Smithery | Search lists server summaries with `pageSize` default 10/max 100 and a `fields` selector; `GET /servers/{qualifiedName}` separately returns connections, tool schemas and security detail. | [Search/list](https://smithery.ai/docs/api-reference/servers/list-all-servers), [get server](https://smithery.ai/docs/api-reference/servers/get-a-server) |
| MCP official registry | Cursor-paginated list (`limit`, opaque `nextCursor`) and a server-version detail endpoint; official search is a simple name-substring filter. | [Generic API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/generic-registry-api.md), [official extension](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md) |
| Stripe | List APIs return paginated `data`/`has_more`; related objects default to IDs and require explicit `expand[]` when detail is needed. Deep expansions on large lists can be slower. | [Pagination](https://docs.stripe.com/api/pagination), [expanding responses](https://docs.stripe.com/api/expanding_objects) |
| Algolia | `attributesToRetrieve` limits returned hit fields and explicitly reduces payload/transfer; `objectID` remains. | [attributesToRetrieve](https://www.algolia.com/doc/api-reference/api-parameters/attributesToRetrieve) |
| npm | `npm search` defaults to 20 results; `npm view <package> <field>` retrieves individual metadata fields separately after discovery. | [npm search](https://docs.npmjs.com/cli/v11/commands/npm-search), [npm view](https://docs.npmjs.com/cli/v11/commands/npm-view) |

Familiar pattern: one bounded, decision-useful list (identity, fit cue, decisive readiness/price, next action), then inspect/describe an exact ID for schema and full evidence. Avoid duplicate list projections and raw metadata by default. The register measured MCP `weather` at **39,416 bytes**, of which **37,777** were secondary `groups`, an impossible-filter response at **11,574 bytes**, HTTP `limit:5` at **15,319–25,620 bytes**, and an external registry five-row response at **108,128 bytes**. These are raw bytes, **not** measured Agent tokens ([PC-05, PC-10](../2026-09-26-papercut-register.md)). No reference above specifies an Agent byte budget; avoid inventing one. AE reason to differ: keep the Quote/Call-critical eligibility, currency and effect facts in the short view even when generic registries can omit them. **Question for Joel:** which facts must survive the compact shape on every transport, and what measured byte/token target is justified by actual Agent tasks?

## Behaviour: Freshness is visible where a choice is made (PC-22)

| Product | How it behaves | Official source URL |
|---|---|---|
| npm | Its public website docs warn that newly published packages may take **up to two weeks** to appear in search, and deprecated packages are excluded. This is an explicit discoverability caveat, not a live per-row freshness stamp. | [Searching packages](https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/) |
| MCP official registry | Offers `updated_since` RFC3339 incremental reads, includes deleted versions during that sync, and exposes `publishedAt`/status in registry metadata; downstream sync can distinguish update/removal from mere absence. | [Official Registry API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md), [generic metadata example](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/generic-registry-api.md) |
| Algolia | Indexing writes are asynchronous tasks with IDs/status; a successful write is not evidence a subsequent search already sees the update. | [Check task status](https://www.algolia.com/doc/libraries/sdk/methods/search/get-task) |
| GitHub Search | `incomplete_results` discloses a **search timeout**, not stale indexed data; these two failure modes must not be conflated. | [Search timeouts](https://docs.github.com/en/rest/search/search#timeouts-and-incomplete-results) |

Familiar pattern: publish/update and discoverability are separate states; expose a useful timestamp/status at the affected choice, not only on a distant status page. The register reports Market last refreshed five days earlier while `/status` said degraded, and canonical search reported `freshness.state: absent`; it does **not** establish that both projections share one index ([PC-22](../2026-09-26-papercut-register.md)). AE reason to differ: cached or externally sourced metadata must not imply that a Tool is currently callable or that its price is a current AUD Quote. **Question for Joel:** should stale supply be shown with a freshness warning and live Quote/eligibility recheck, excluded from purchasable choices, or make discovery explicitly unavailable? Which source timestamp and threshold carry that claim?

## Behaviour: Query bounds fail locally and precisely (PC-23)

| Product | How it behaves | Official source URL |
|---|---|---|
| GitHub Search | Non-qualifier text over 256 characters or over five Boolean operators returns “Validation failed”; qualifiers/operators are treated separately from the text-length count. | [Limitations on query length](https://docs.github.com/en/rest/search/search#limitations-on-query-length) |
| Algolia | Documents a 512-character query bound and handles search errors separately from no-results in its UI guidance. The numerical bound belongs to Algolia, **not** AE. | [Query bound](https://support.algolia.com/hc/en-us/articles/5098029701265-Is-there-a-query-size-limit), [error UI](https://www.algolia.com/doc/guides/building-search-ui/going-further/conditional-display/react#handling-errors) |
| Smithery | Search parameters have published numeric bounds (`pageSize` 1–100, `topK` 10–500); 400 and 422 have separate documented error responses. Its docs do **not** state a `q` maximum, so it is not a precedent for one. | [List servers schema](https://smithery.ai/docs/api-reference/servers/list-all-servers) |

Familiar pattern: explicit, coherent limits at input/API boundaries, a field-specific validation message, and preservation of the entered query for correction—not a generic whole-page failure or a fabricated no-match. AE's reported Market maximum is 200 versus HTTP/CLI 256, and a 201-character URL query showed “The market view didn’t load” ([PC-23](../2026-09-26-papercut-register.md)). AE reason to differ: none inherent in AUD or x402; platform URL/transport limits may justify a **documented** difference, not an unexplained one. **Question for Joel:** one common 200/256 limit across entry points or a clearly explained transport-specific bound?

## Behaviour: Changing a category refines rather than erases the query (PC-35)

| Product | How it behaves | Official source URL |
|---|---|---|
| Algolia | Query and facets are independent UI search state; no-results guidance reads `indexUiState.query` while **ClearRefinements** resets filters. Filter controls narrow the current result set. | [No-results and refinements](https://www.algolia.com/doc/guides/building-search-ui/going-further/conditional-display/react), [filtering](https://www.algolia.com/doc/guides/managing-results/refine-results/filtering) |
| GitHub Issues | Search bar combines terms and qualifiers; filters/sort automatically update a shareable URL. GitHub provides an explicit **Clear current search query, filters, and sorts** action rather than treating an ordinary filter selection as that action. | [Filtering and sharing](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests) |
| OpenRouter | Models API exposes `q` for free-text name/slug and separate category, provider, modality and price filters; this is an API contract, **not** evidence about browser-field persistence. | [List models and properties](https://openrouter.ai/docs/api/api-reference/models/get-models) |
| Smithery | `q` and deployment/verification filters are separate list parameters; changing a filter need not erase `q` in an API request. Browser behaviour is not documented here. | [List servers](https://smithery.ai/docs/api-reference/servers/list-all-servers) |

Familiar pattern: refine a current query with independent filters; only an explicit clear/reset discards the query. The register observed category changes wiping searched text on mobile ([PC-35](../2026-09-26-papercut-register.md)). AE reason to differ: none. Decide separately whether a category change resets **pagination** to page one; that does not require clearing the query.

## Anti-patterns mature products avoid

- Broadening until *something* appears without disclosing weaker match criteria: Algolia defaults word-removal to `none` and documents precision trade-offs; GitHub discloses incomplete searches ([Algolia](https://www.algolia.com/doc/api-reference/api-parameters/removeWordsIfNoResults), [GitHub](https://docs.github.com/en/rest/search/search#timeouts-and-incomplete-results)).
- Making zero matches, invalid input, ranker outage and stale-index uncertainty one generic empty/failure state ([Algolia states](https://www.algolia.com/doc/guides/building-search-ui/going-further/conditional-display/react), [GitHub validation/incomplete states](https://docs.github.com/en/rest/search/search)).
- Expanding every candidate into full metadata in a search response when consumers can inspect a selected ID ([Stripe](https://docs.stripe.com/api/expanding_objects), [Smithery](https://smithery.ai/docs/api-reference/servers/get-a-server), [Algolia fields](https://www.algolia.com/doc/api-reference/api-parameters/attributesToRetrieve)).
- Assuming publication or successful indexing request guarantees immediate search visibility ([npm](https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/), [Algolia tasks](https://www.algolia.com/doc/libraries/sdk/methods/search/get-task)).
- Copying one product's thresholds or relevance weights blindly into a priced, side-effecting Tool market; its docs describe its own corpus and constraints, not AE's suitability standard ([Algolia lexical fallback](https://www.algolia.com/doc/api-reference/api-parameters/removeWordsIfNoResults), [npm website ranking](https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/)).

## Questions the references raise for AE

1. Ranker down: labelled deterministic fallback, honest no-match, or unavailable/retry? What evidence distinguishes an eligible lexical candidate from the wrong action, and how is uncertainty represented across chat/HTTP/MCP/CLI?
2. A no-match with restrictive filters: broaden this query, ask a clarifying question, record unmet demand, or offer multiple explicitly distinguished actions? G6 owns storage, authentication and notification semantics; G1 owns truthful detection and conveyance.
3. Which concise fields are non-negotiable for Quote/Call decisions, and what measured bytes/tokens and completion-rate targets justify compact search versus a richer describe? The external metadata registry (PC-10) is distinct from canonical Tool discovery.
4. Which freshness clock (ingestion, external-source observation, eligibility or last verified availability) informs a buyer; how old is too old; does ranking-unavailable differ from supply-stale?
5. Can Market, chat, HTTP, MCP and CLI adopt one input-bound/error contract without sacrificing a transport-specific constraint? Who owns the duplicate uncalled search policy (PC-36) after the census confirms its reachability?

**Boundaries:** G1 search truth feeds G2's suitability, callability and price disclosure; G6 owns retained demand after an honest no-match; G7 owns example/API documentation of limits and response fields; G8 owns freshness and ranker operation while G1 presents their consequences. References do not settle these ownership or product choices.
