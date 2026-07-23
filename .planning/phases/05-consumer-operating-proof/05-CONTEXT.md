# Phase 05: Consumer decision support - Context

**Gathered:** 2026-07-23
**Status:** Ready for research and planning

<domain>
## Phase Boundary

Phase 5 makes AE useful for choosing without yet acting. A public visitor or
agent can browse businesses, inspect an Offering in its business context,
shortlist exact Offering revisions, compare relevant facts and understand the
trade-offs against stated priorities.

The phase is entirely `inspect_only`. It does not contact a business, request a
quote, invoke an endpoint, create a Customer Request, authorize a consequence,
book, pay, dispatch or claim fulfilment. Historical “three quotes” and
quote-to-close material is research provenance, not current acceptance.

</domain>

<decisions>
## Implementation Decisions

### Product loop and entry
- **D-01:** The canonical first-session loop is **Tell AE what you need → reflect the understood outcome and stated constraints → ask at most one decisive clarification with “I’m flexible” → retrieve registered supply → answer or name the exact insufficiency → inspect evidence or refine**. **Browse businesses → inspect an option → shortlist exact Offering revisions → compare** remains the transparent fallback and power-user path.
- **D-02:** Ask is the primary cold-start product surface. The public catalogue remains a first-class browse and evidence surface, but a fresh visitor must not need to understand AE vocabulary, identify providers, build a shortlist, or configure comparison controls before receiving value. Ask and browse converge on the same source-owned Offering and comparison facts.
- **D-03:** Browsing, detail, shortlisting and comparison require no account. Authentication must not sit between discovery and comparison.
- **D-04:** Public transient comparison is required for closure. Signed-in saving is secondary and must not block Phase 5. If saving is included, it preserves a historical selection and reports newer revisions rather than silently rewriting history.
- **D-18:** The primary cold-start golden query is the founder-normalized form of the [Perth website-developer request](https://www.reddit.com/r/perth/comments/1v413sm/website_developers_in_perth/): **“I run a small startup in Perth and need a simple website. I would prefer someone local or an affordable freelancer. Who should I consider, and roughly what should I expect to pay?”** AE must identify the decisive brochure/inquiry-only versus transactional/ecommerce distinction, offer **I’m not sure**, preserve the stated local and affordability preferences, and distinguish provider-published prices from observed ranges, community anecdotes, AE estimates, and unavailable price evidence.

### Comparison identity and meaning
- **D-05:** Compare Offerings, not businesses. Business identity and concrete provenance/currentness facts remain visible as context.
- **D-06:** A selected item binds at least `businessId`, `offeringRef`, `offeringRevision` and `projectionObservedAt`; comparison never copies a second mutable version of Offering truth.
- **D-07:** There is no universal score, generic reputation grade or implicit “trust” number. Show who supplied a fact, when it was observed, whether it is current/partial/stale, whether an access path is declared or observed, and whether AE supports a named action.
- **D-08:** Use a common versioned comparison envelope plus bounded versioned category fact profiles. Missing material is explicit as unknown, not supplied, stale or not comparable. Do not create a universal property bag or broad industry ontology.
- **D-09:** Default output is unranked. Ordering or recommendation is allowed only when the customer stated a priority, the relevant facts are genuinely comparable, the rule is inspectable, and missing/stale data cannot improve an Offering's position.

### Human and agent surfaces
- **D-10:** Human and agent surfaces derive from one Offering-based comparison semantic contract. Phase 5 must reconcile the legacy service-shaped registry action output before claiming parity.
- **D-11:** Access-path facts may remain visible, but Phase 5 comparison actions are limited to view Offering, add/remove shortlist item, compare and change priorities. It must not initiate inquiry, endpoint invocation or another external effect.
- **D-12:** Comparison must remain query-, provider- and category-agnostic at the shared envelope. Category-specific renderers or fact profiles cannot become a second workflow or control plane.
- **D-17:** Human comparison is answer-first GenUI: the primary customer presentation adapts registered composition to the question, category, and device while source-owned posture, decisive differences, and every material caveat precede a native **See full comparison** disclosure. The model-neutral adapter may select only registered density/emphasis IDs bound to the semantic digest. It cannot supply truth, order, actions, controls, disclosure state, accessibility semantics, or code; absence, failure, or model switching retains the complete deterministic surface.

### Evidence and closure
- **D-13:** Closure requires durable source, public human routes, equivalent structured agent actions and exact-revision hosted readback using clearly labelled demo data.
- **D-14:** Acceptance spans two materially unlike categories: one professional-service Offering with potentially unknown price/timing/scope, and one machine/data Offering with technical interface facts.
- **D-15:** Evidence covers current, partial, stale, unknown and changed-revision material; an unranked result; a defensible priority-based ordering; refresh/share behavior; and proof that no comparison path causes an external effect.
- **D-16:** This evidence proves a hosted comparison capability over labelled data. It does not prove real demand, customer value, supplier quality, independent fulfilment, willingness to pay, retention, revenue or production safety.
- **D-19:** A zero-instruction first-session eval begins from a blank public session and covers the golden query plus no registered supply, no current match, one plausible option, insufficient comparable evidence, constraints too narrow, usable comparison and unsupported category. Passing means the evaluator reaches an honest grounded posture without learning **Offering**, revision, shortlist or priority terminology. This is bounded comprehension evidence, not market demand or customer-value proof.

### Agent discretion
- Exact shortlist capacity, URL encoding, responsive comparison layout and the initial two category-profile field sets may be chosen during planning, provided they remain bounded, accessible and faithful to the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and interface authority
- `PRODUCT.md` — product destination, `inspect_only`, Offering/supply meaning, evidence and recommendation rules.
- `DESIGN.md` — Businesses and Options IA, comparison language, progressive disclosure and accessibility contract.
- `AGENTS.md` — source ownership, vertical/horizontal evals, evidence classes and dirty-tree custody.

### Phase and architecture authority
- `.planning/ROADMAP.md` — phase ordering; its old quote-to-close Phase 5 wording is superseded by this founder-accepted context and must be reconciled before dispatch.
- `.planning/PROJECT.md` — project maturity boundary; its Phase 5 quote-to-close wording must be reconciled before dispatch.
- `.planning/adr/ADR-026-one-business-supply-graph.md` — current Offering, access-path and AE-support separation. Treat as WIP until its source lane is committed and integrated.
- `.planning/phases/04-market-activation/04-CLOSURE-COUNCIL.md` at commit `32f5b9861ebbdb4882cbc40bcff7155823c99edd` — accepted Phase 4 closure, evidence ceiling and remaining frontier; not present on the current shared checkout.

### Source contracts to reconcile
- `src/modules/catalog/internal/offering-supply.ts` — Offering identity, revision and safe supply projection currently present as inherited WIP.
- `src/modules/registry/internal/offering-api-projection.ts` — Offering-based public API projection currently present as inherited WIP.
- `src/modules/registry/registry.actions.ts` — legacy service-shaped agent action projection that must not remain the comparison source.
- `src/modules/customer-request/` — existing comparison machinery is architectural evidence only; Phase 5 must not require or mutate Customer Request for transient comparison.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Public registry list/search/detail routes and `registry.list`, `registry.search`, `registry.detail` actions already establish read-only human/agent discovery counterparts.
- The Offering WIP supplies stable `offeringRef`/revision identity, business ownership, public facts, access paths, support posture, freshness and projection disposition.
- Existing answer artifacts include provider cards and a comparison table, but they are consumers to reconcile, not a second canonical comparison model.

### Established Patterns
- Module-owned source with removable projections; routes and components remain thin.
- Public facts distinguish business claims, observed facts and AE-supported action truth.
- Bounded cursor reads, exact revision checks, explicit stale/partial/unknown states and human/agent semantic parity.
- Astryx neutral components and semantic tokens are the only public visual system.

### Integration Points
- Catalogue/registry list and detail become the read source for shortlist and comparison.
- A new comparison owner may preserve selection and projection semantics, but must reference Offering source rather than copy it or depend on the execution control plane.
- Public Businesses/detail routes, shared comparison UI and registered read-only agent actions consume the same comparison semantics.
- Capability supply and Action Invocation are read-only context and stay outside the Phase 5 write blast radius.

</code_context>

<specifics>
## Specific Ideas

- The desired experience combines public browsing and concrete Offering detail with the answer-first behavior people now expect from AI search: direct grounded answer, decisive differences, unavoidable caveats, then complete side-by-side evidence on demand.
- The first falsification pair is a professional service and a GraphQL/data-style machine Offering.
- A comparison should say “not ranked” when the facts or priorities do not justify ordering.

</specifics>

<deferred>
## Deferred Ideas

- Required signed-in saved-comparison lifecycle, deletion and cross-device history.
- Inquiry, quote request, tender, negotiation, booking, endpoint invocation, payment, dispatch and fulfilment.
- Customer Request and RoutePlan composition.
- Reviews, reputation, universal trust/scoring, sponsored placement and marketplace guarantees.
- Broad category ontology, crawling, endpoint verification and live-price guarantees.
- Independent business/customer evidence, willingness to pay, retention and market-liquidity mechanisms.

</deferred>

---

*Phase: 05-consumer-decision-support*
*Context gathered: 2026-07-23*
