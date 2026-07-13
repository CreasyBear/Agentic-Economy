# Contextual decision journeys: primary-source comparables

**Question.** How do successful consumer discovery products accept incomplete intent, gather context, present options, and help a person decide without turning the experience into form completion?

**Method.** First-party help pages and product announcements were reviewed on 13 July 2026. “Observed” below means the cited owner explicitly documents the behavior. “Inference for AE” is a product conclusion, not a claim about the cited product.

## Executive finding

The shared interaction model is **open entry, progressive structure, contextual results, reversible refinement**:

1. Accept the smallest meaningful seed: a destination, business category, product description, or full natural-language need.
2. Use known context automatically, but make it visible and controllable.
3. Ask for or expose only the next information that materially changes the candidate set or comparison.
4. Render the answer in the UI native to the decision—map and place cards, product cards, ride choices, itinerary—not as a transcript alone.
5. Keep conversation available to refine the same decision state.
6. Preserve the request and its criteria through interruption, changed constraints, unavailable options, and recovery.

For AE, chat should therefore be the **context-building and decision-support surface**, not a decorative wrapper around a form. Generative UI should be a projection of the Request’s current state inside that conversation.

## Observed interaction primitives

### Airbnb: structured search can begin narrow or exploratory

**Observed.** Airbnb accepts a city or region, but also a neighborhood, landmark, street, or address. Dates can be specific or flexible; party composition is separate context. Results combine a list with a map, and the map identifies neighborhoods and points of interest. Users can progressively apply price, accessibility, amenity, booking, and property filters, save options to wishlists, and inspect listing detail. [Airbnb: Search for home listings](https://www.airbnb.com/help/article/252) [Airbnb: Search filters](https://www.airbnb.com/help/article/3740)

**Observed.** Airbnb ranking considers the entered criteria plus quality, popularity, price, location, availability and personalization. It intentionally includes variety, and may show appealing near-matches when too few high-quality exact matches exist. [Airbnb: How search results work](https://www.airbnb.com/help/article/39)

**Observed.** If a host cancels, Airbnb preserves the customer’s underlying trip problem: it offers help finding a similar place using location, amenities, availability, and comparable pricing, or a refund. [Airbnb: Rebooking and refund policy](https://www.airbnb.com/help/article/2868)

**Inference for AE.** A sparse seed is legitimate. A user who says “physio near Subiaco” has supplied useful intent, not failed a form. AE should show an initial result or explain the one missing decision-changing fact, then let the user drill down. Location-aware options should use a map/list composition. Recovery should rerun the preserved Request against equivalent contracts rather than force re-entry.

### Uber: infer safe defaults, compare a small option set, confirm late

**Observed.** Uber begins with “Where to?”, while pickup defaults to current GPS location and can be edited. Recent and saved destinations reduce re-entry. Only after pickup and destination are known does it show available vehicle options; the rider selects one and confirms pickup at request time. After acceptance, the UI shifts to live location and ETA. [Uber: How to request a ride](https://help.uber.com/am/riders/article/een-rit-aanvragen?nodeId=e9862b49-81c6-4c6a-a9d3-3c05bf42e82e)

**Observed.** The price is shown before commitment. Uber explains that the quoted fare can change after material changes such as different pickup/drop-off points, extra stops, or materially longer travel, and provides the final amount in the trip record and receipt. [Uber: How upfront fares work](https://help.uber.com/riders/article/how-do-upfront-fares-work?nodeId=5073140f-3d5f-4046-80da-2db9ed7b11b3)

**Inference for AE.** Do not ask for every possible constraint before exploration. Infer non-authoritative defaults from permissioned context, label them, and let the user correct them. Present a small comparable option set only when the minimum routing facts exist. Separate **explore**, **choose**, and **commit**; immediately before commitment, restate price, provider, important terms, and any changed assumptions.

### Google Maps and Search: category-first entry becomes contextual, generative UI

**Observed.** Google Maps supports a place type alone (for example, hotel or airport), “near” phrasing, and category buttons. Suggestions change with transportation mode. Local results combine relevance, distance and prominence, expose ratings/descriptions, and plot results as pins. [Google Maps: Search nearby and explore](https://support.google.com/maps/answer/4610185?hl=en-uk)

**Observed.** Ask Maps accepts compound real-world questions, answers conversationally, and renders a customized map. It uses current place data, reviews and—with user control—personal context. After a place is chosen, the same surface offers actions such as reservation, save, share and directions. [Google: Ask Maps](https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/)

**Observed.** Google AI Mode accepts a constraint-rich request, searches multiple reservation services, and returns a curated list with real-time availability and direct completion links. For travel, a persistent Canvas combines flights, hotels, Maps photos/reviews and web information; follow-up questions update the plan and explicitly support tradeoffs. [Google: Agentic recommendations and booking](https://blog.google/products-and-platforms/products/search/ai-mode-agentic-personalized/) [Google: Travel planning with Canvas](https://blog.google/products-and-platforms/products/search/agentic-plans-booking-travel-canvas-ai-mode/)

**Observed.** In shopping, AI Mode lets a person describe what they want conversationally instead of first manipulating filters. It renders visual products and details, and natural follow-ups refine the set. Its right-hand product panel updates as the conversation changes. [Google: Conversational visual shopping](https://blog.google/products-and-platforms/products/search/search-ai-updates-september-2025/) [Google: Dynamic shopping panel](https://blog.google/products-and-platforms/products/shopping/google-shopping-ai-mode-virtual-try-on-update/)

**Inference for AE.** Category-only entry is a first-class start mode. The conversation should yield domain-appropriate components generated from registered capability semantics: place cards plus map for spatial decisions; comparable rows/cards for quoted services; availability slots for bookable services. Filter chips are editable expressions of facts already understood—not a mandatory intake questionnaire. Follow-ups mutate one durable Request and refresh only the affected option UI.

### Perplexity: the answer is a persistent, sourced conversation

**Observed.** Perplexity sessions retain the initial question, follow-ups, responses and sources, so a user can refine without restating prior context. Sources remain directly inspectable. [Perplexity: Sessions](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)

**Observed.** Pro Search is documented as asking for details, considering preferences, summarizing findings, and supporting contextual follow-ups. Perplexity explicitly recommends starting broad and refining, and says plain language is sufficient. [Perplexity: Getting started](https://www.perplexity.ai/help-center/en/articles/10354975-getting-started-with-perplexity) [Perplexity: Better answers](https://www.perplexity.ai/help-center/en/articles/13645819-tips-for-getting-better-answers-from-perplexity)

**Observed.** Perplexity shopping responds with a small set of product cards containing decision information, while only compatible merchants receive native checkout; otherwise the customer is referred to the merchant. [Perplexity: Shop Like a Pro](https://hub-prod.perplexity.ai/hub/faq/what-is-shop-like-a-pro)

**Inference for AE.** Conversation history is not the canonical Request, but it is evidence for how the Request evolved. Every factual option claim needs inspectable provenance. Native actions must appear only where the registered business binding supports them; otherwise AE should offer a disclosed handoff rather than simulate platform capability.

## AE interaction contract

### 1. Natural-language Request start

The input accepts four equally valid shapes:

- **Destination/place:** “Fremantle” or “near Perth Airport.”
- **Business/capability type:** “dentist”, “book a cleaner”, “accountants.”
- **Need/context:** “somewhere quiet for dinner with my parents.”
- **Constraint-rich request:** “Find a dog-friendly two-bedroom stay near the beach next weekend under $450.”

The system immediately acknowledges what it understood in customer language and begins useful discovery when the registered contract permits it. It does not show a universal intake form.

### 2. Contextual clarification

Ask **one conversational question at a time** only when the answer changes one of:

- eligible capability contract;
- candidate availability or feasibility;
- meaningful ordering/comparison;
- authority or commitment terms.

When multiple missing facts are independent and easily edited, show them as compact chips or an inline brief beneath the conversational response. Every inferred/defaulted fact is visible, editable and marked as such. Budget is not demanded before exploration unless the capability contract makes it necessary to return any meaningful candidate.

### 3. Search and generative UI

Once the minimum contract facts exist, the assistant narrates the useful finding in one or two sentences and embeds structured UI in the same conversational turn:

- spatial request → map + synchronized place cards;
- comparable quotes → normalized option cards/table with decisive differences;
- bookable availability → date/time choices attached to providers;
- insufficient registered supply → what was searched, what is missing, and a refinement or handoff action.

This UI is derived from the same durable Request/options state exposed through the API. The AI does not invent fields, availability, prices, rankings, or provider abilities outside registered contracts and evidence.

### 4. Comparison and decision support

Default to a small, diverse option set. Explain **why each option fits this Request** and surface the criterion that distinguishes it. Let the person ask natural follow-ups (“closer”, “cheaper but still wheelchair accessible”, “why this one?”), pin/save candidates, and compare selected options without restarting. Clearly distinguish verified facts, provider claims, community reputation, estimates, and unavailable evidence.

### 5. Commitment

Choosing an option is not committing. The final action displays provider identity, exact action, price or price basis, material terms, data to be disclosed, uncertainty, and what happens next. It requires explicit confirmation and respects the caller’s mandate/spend limits.

### 6. Recovery

On timeout, provider failure, changed quote, or lost availability, retain the original Request, later refinements, selected option, and decision criteria. Explain what changed in customer language and offer: retry, refresh equivalent options, relax a named constraint, switch provider, use a disclosed external handoff, or stop. Never return the customer to a blank start.

## What the current prototypes should become

Do not select A, B, or C wholesale. Compose them contextually:

- **A (conversation) is the persistent frame and primary input.**
- **B (editable brief) appears progressively** after AE has inferred or confirmed meaningful facts; it is a compact state inspector, not a form to complete.
- **C (guided choices) appears inline only when a bounded choice is the fastest honest clarification**, such as dates, party size, radius, or a registered capability fork.
- **Generative result components replace all three as the visual focus once options exist**, while the conversation stays available below or alongside them.

The product moment is not “your Request is complete.” It is: **“AE understood enough to show credible choices, and every next interaction makes the decision easier.”**

## Guardrails against form-filling and theatre

- Never expose all possible contract fields before the first useful response.
- Never ask for information solely because a schema has a field.
- Never turn inferred context into a hidden hard constraint.
- Never let chat language claim an option that the structured Request/result cannot support.
- Never present generic cards where the decision is spatial, temporal, or otherwise domain-shaped.
- Never discard context after unsupported supply, failure, or a changed option.
- Never imply that a sandbox provider is real market supply.

