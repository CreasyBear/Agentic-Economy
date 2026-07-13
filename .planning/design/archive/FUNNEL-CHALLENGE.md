# Funnel Challenge

**Status:** decision-ready design challenge · **Scope:** customer-side discovery → inquiry → response evaluation  
**Authority:** applies locked `D1–D2`, `IA-1`, `CH-1–CH-9`, `AX-1–AX-7`, `DS-13`; informed by `LAW-1–LAW-9` in the design studies.  
**Boundary:** AE may research, structure, compare, and submit a user-authorized request. It does **not** book, charge, confirm availability, confirm price, or promise a business response. The business confirms.

## Decision

Choose **Shape D — staged hybrid: instant decision aid → bounded shortlist → optional multi-business inquiry**.

The founder's hypothesis is directionally right about the destination and wrong about the default sequence. A first-time visitor should not have to trust AE through seven consecutive transitions before receiving value. AE must produce a useful, inspectable shortlist before requesting identity or speak-for-me authority, then make one contextual offer: **“Want AE to send this brief to these businesses?”** The user can compare, leave, call, or continue without losing the value already earned.

This preserves `/` as the composer-first request front door (`LAW-1`, locked D1), creates a durable thread early (`LAW-2`), and keeps proposal, permission, execution, and external response separate (`AX-1`, `AX-6`). It also creates an honest first wedge: help a user identify plausible local businesses and, only after value is visible, ask selected businesses the same well-formed question.

## 1. Abandonment map

### Severity scale

| Severity | Meaning |
|---|---|
| **Critical** | A majority of cold first-visit users may reject the transition unless substantial value is already visible. |
| **High** | The transition asks for meaningful work, trust, or delay; a strong competing default exists. |
| **Medium** | Friction is noticeable but recoverable through clarity, defaults, or persistence. |
| **Low** | Mostly interaction cost; little trust or authority is transferred. |

These are directional product-risk estimates, not measured conversion rates. Instrument each transition before treating the labels as facts.

| Transition | User must grant | Competing default behavior | Estimated dropout | Named design lever | Contract for the lever |
|---|---|---|---|---|---|
| **Arrive → ask** | 5–20 seconds of attention; enough intent to describe a need | Search Google/Maps; call a known business; ask a friend; leave | **High** | **Zero-preamble composer** | Put the composer first, with concrete example asks and a low-commitment “Browse businesses” alternative. Explain the mode inside/adjacent to the field; no marketing gate (`LAW-1`, `IA-3`). Do not require sign-in or contact details (`LAW-1`, anti-pattern 14). |
| **Ask → shortlist** | A little patience; permission to interpret the query; possibly one missing constraint such as suburb or timing | Open Maps results immediately; simplify the query; abandon if chat feels slow | **Medium–High** | **Progressive shortlist preview** | Create `/t/:threadId` immediately (`LAW-2`); show the interpreted need as editable `asked / understood / assumed` facts (`CH-5`); stream candidate rows as they become supportable instead of showing a spinner. Ask at most one blocking clarification before showing provisional value. |
| **Shortlist → comparison** | More attention; willingness to inspect evidence and trade-offs | Open several tabs; pick the first/highest-rated result; call directly | **Medium** | **Decision-ready comparison slice** | Default to 3–5 candidates and 3–5 need-relevant dimensions, not an exhaustive matrix. Separate known facts, unknowns, and “business will quote”; expose sources/limits one level deeper (`LAW-7`, `CH-2`). Let the user correct criteria without restarting (`CH-5`). |
| **Comparison → inquiry consent** | Intent to act; contact details/PII; authority for AE to speak in a narrowly defined way | Call/email one business; use its form; postpone; do nothing | **Critical** | **Value-before-permission handoff** | Offer inquiry only after the free shortlist/comparison is usable. Pre-fill an editable brief from already supplied facts. Name selected recipients, exact fields, maximum recipient count, expected next step, and what AE will not do (`AX-1`, `AX-3`, `LAW-5`). “Not now” preserves the thread and shortlist (`AX-4`). |
| **Consent → send** | Final consequence-bearing authority; confidence the payload and recipients are correct | Back out to avoid spam/misrepresentation; send one message manually | **High** | **Named-send readback** | Use a dedicated review state: recipient-by-recipient selection, request payload, PII scope, timing, and boundary copy. CTA: “Send this inquiry to 3 businesses,” never “Continue.” Lock while pending, prevent duplicates, and produce a durable receipt (`AX-2`, `AX-3`, `AX-5`, `LAW-5`, `LAW-6`). |
| **Send → multi-day wait** | Patience; belief that anything is happening; permission for a return notification | Call businesses immediately; submit elsewhere; forget AE | **High** | **Expected-response contract** | Receipt shows who was contacted, delivery state per recipient, when the user should expect an update, how notifications work, and how to withdraw while pending. “Sent” means submitted/delivered only; it never means read, accepted, available, quoted, or confirmed (`LAW-4`, Airbnb request-authority branch). |
| **Responses → evaluation** | Renewed attention; willingness to compare asynchronous, incomplete, differently formatted replies | Accept the first reply; negotiate directly; ignore late responses | **Medium–High** | **Partial-results decision board** | Notify on the first actionable response, not only when all businesses reply. Render each recipient independently: awaiting reply / clarification requested / responded / declined / delivery problem / status unknown. Normalize comparable fields but preserve the original response and mark unknowns (`LAW-3`, `LAW-4`). |
| **Evaluation → return visit** | Memory of AE; trust in the link/channel; another session of attention | Reply from email/SMS; call the business; never return to AE | **High** | **One-tap private return** | Every notification deep-links to `/i/:threadId?k=` with a concise reason to return (“1 of 3 businesses replied”). The durable record opens on the new response, preserves prior comparison and receipt, and presents one primary next action (`IA-1`, `LAW-2`, `LAW-6`, `CH-8`, `CH-9`). |

### Compounding-risk conclusion

The hypothesis behaves like a serial funnel: even moderate losses multiply. If eight transitions each retained an optimistic 80%, end-to-end retention would be $0.8^8 \approx 17\%$. This is illustrative, not a forecast. The design response is not merely to polish every step; it is to **remove required transitions from the critical path**:

- shortlist and comparison are one progressive result, not two mandatory screens;
- inquiry is an optional branch after free value, not the price of seeing results;
- account creation is absent from the first-visit path;
- return-channel consent is collected with the send permission, not as a separate onboarding stage;
- incomplete responses remain useful instead of blocking on an all-businesses barrier.

## 2. Why Google Maps stops where it stops

Stopping at discovery is not product cowardice. It is a rational boundary that avoids becoming the accountable coordinator between a user's intent and a business's operations.

| Problem avoided by stopping at handoff | Why the handoff is defensible | AE inherits it by crossing the line? | Honest mitigation—not elimination |
|---|---|---:|---|
| **Consent scope** | A click/call transfers the user into the business's own context. Maps does not need authority to compose claims, choose recipients, or share contact details. | **Yes, fully** | Progressive consent; no PII for search/comparison; exact recipient + exact field readback; symmetric refusal; editable brief; pending withdrawal where supported (`AX-1–AX-5`). Consent remains per send, not a blanket “agent mode.” |
| **Misrepresentation / speak-for-me risk** | The user speaks directly, so ambiguity and negotiation are not falsely attributed to an intermediary. | **Yes, fully** | Separate provenance for `asked / understood / assumed / found / authorized` (`CH-5`). Quote the user's request, identify AE as the transmitting service, avoid embellishment, and show the exact outbound payload before send. |
| **Liability and reliance** | Rankings and listings can be framed as discovery; arranging a service invites reliance on price, availability, suitability, safety, and fulfilment. | **Yes, materially** | Do not claim recommendation certainty, booking, availability, or outcome. Label evidence and limits; say “business will quote/confirm.” Keep safety/licensing facts inspectable and dated. Boundary copy sits beside the action and receipt (`AX-7`, `LAW-4`). This reduces confusion; it does not erase legal obligations. |
| **Expectation ownership** | Once a platform sends a request, users expect delivery, replies, escalation, and support. Handoff avoids owning an asynchronous service level. | **Yes, fully** | Per-recipient delivery/readback states, expected-response wording, partial results, delivery recovery, and explicit “no response yet” truth. Never promise a response deadline unless the business has supplied one (`LAW-3`, `CH-9`). |
| **Data freshness** | Business details, service area, capacity, pricing, and opening hours change faster than broad discovery indexes can guarantee. | **Yes, and comparison amplifies it** | Timestamp source facts; distinguish listed facts from business-confirmed replies; render unknown/stale rather than infer; ask businesses to confirm consequence-bearing facts. Never convert a listing claim into an inquiry outcome (`LAW-4`). |
| **Operational heterogeneity** | Every business uses different channels, forms, response habits, and schemas. A link/call tolerates this naturally. | **Yes, fully** | Start with a bounded set of channels and categories; expose delivery posture before selection; normalize inbound replies into a comparison while retaining original text. Do not imply equal reachability where supply is uneven. |
| **Spam and recipient burden** | Maps supplies intent without blasting businesses. Fan-out can generate low-quality or duplicate demand. | **Yes, uniquely** | Hard recipient cap, explicit user-selected recipients, one idempotent inquiry per recipient, quality gates on required facts, deduplication, withdrawal, and transparent sender identity. “Ask all” is never an unbounded broadcast. |
| **Disputes over what happened** | Direct contact leaves responsibility and records with user/business channels. | **Yes, fully** | Durable proposal, permission decision, send receipt, delivery attempts, response items, and timestamps (`LAW-6`, `AX-5`). A receipt proves what AE attempted and observed; it does not prove fulfilment. |

**Verdict:** AE should cross the handoff boundary because coordinating inquiry and evaluation is the differentiated value. But crossing it means AE inherits consent, expectation, freshness, delivery, and recordkeeping duties. These are permanent product responsibilities, not onboarding copy problems.

## 3. Trust cliff analysis

### The cliff

A cold visitor can reasonably ask: “Why would I give an unknown site my phone/email and let it contact local businesses as me?” Brand claims, an AI animation, or a promise to “handle everything” do not answer that question. Asking for PII or authority before demonstrating judgment makes the user pay trust before receiving value.

### Free and instant value floor

Before any PII, sign-in, notification permission, or external-send consent, AE must deliver:

| Free value | Minimum visible proof | Why it earns the next ask |
|---|---|---|
| **Interpreted-need readback** | Editable service, suburb/service area, timing, must-haves, and explicit assumptions | Proves AE understood the request and lets the user correct it (`CH-5`). |
| **Useful candidate set** | 3–5 plausible businesses when data supports them; otherwise an honest named mismatch and relax action | Proves AE can improve on an empty chat experience; zero results teach rather than bluff (`LAW-8`, `DS-13`). |
| **Decision-relevant comparison** | Need-specific dimensions; source/date/unknown posture; “business will quote” where appropriate | Proves judgment without borrowing certainty from a later business reply (`LAW-4`, `LAW-7`). |
| **Portable brief** | A concise, editable summary the user can copy even if they never authorize AE | Gives the user an exit with retained value. It also proves the future outbound message will be bounded. |
| **Clear next options** | Call/open site; adjust shortlist; save/copy; or ask selected businesses | Makes inquiry an earned convenience, not a coerced gate. |

“Instant” means the first supported candidate or useful clarification appears as work progresses; it does not justify fake results or a fabricated comparison. A simple lookup starts immediately and exposes named work phases only as needed (`CH-4`).

### Minimum-consent path

1. **Ask anonymously:** request text plus non-identifying constraints. No account wall.
2. **Receive value:** interpreted need, provisional candidates, and comparison under a durable thread (`LAW-2`).
3. **Choose the branch:** user selects specific businesses and chooses “Ask these businesses.” Calling/linking out remains available.
4. **Review a bounded brief:** exact message, recipient list, fields, purpose, expected response path, and boundary statement (`LAW-5`, `AX-1`).
5. **Add only necessary contact data:** collect the minimum reply channel required by selected recipients. Explain field-by-field recipients and purpose. Do not request an address unless the service genuinely needs it now.
6. **Choose notification channel:** default to the contact channel already necessary for the inquiry; offer a private-link copy. Do not demand unrelated marketing consent.
7. **Explicit named send:** one consequence-specific action; no bundled terms or blanket future authority (`AX-3`, `AX-4`).
8. **Receive pending lock + receipt:** duplicate send prevented, recipient states visible, withdrawal/recovery shown where available (`AX-2`, `AX-5`, `LAW-6`).

**Authority envelope:** one brief, one named recipient set, one send event, declared fields, declared purpose. Any materially changed payload, added recipient, or later negotiation requires a new proposal and permission. AE may organize incoming responses without new authority; it may not accept, book, or commit on the user's behalf.

## 4. Alternative funnel shapes and scorecard

### Scoring

1 = structurally poor; 3 = workable with material risk; 5 = strongest fit. “Supply readiness” rewards shapes that still work when business response coverage is uneven. “Boundary honesty” rewards visible separation of discovery, request, delivery, and business confirmation.

| Shape | Funnel | Time to first value | Consent staging | Return-visit mechanics | Business-side supply readiness | Boundary honesty | Total /25 |
|---|---|---:|---:|---:|---:|---:|---:|
| **A. Full journey upfront** | Ask → clarify → shortlist → compare → PII/authorize → fan-out → wait → evaluate | 2 | 2 | 3 | 2 | 3 | **12** |
| **B. Instant shortlist, agent offer after value** | Ask → provisional shortlist/comparison → “Want me to ask these 3?” → review/send → partial replies | 5 | 5 | 4 | 4 | 5 | **23** |
| **C. Inquiry-as-product** | Structured brief first → PII/authorize → fan-out; comparison only after replies | 3 | 3 | 4 | 3 | 4 | **17** |
| **D. Staged hybrid (recommended)** | Ask or lightweight structured fields → progressive shortlist + editable brief → compare/copy/call **or** selected fan-out → partial evaluation | 5 | 5 | 5 | 4 | 5 | **24** |

### Shape analysis

#### A. Full journey upfront — reject as default

- **Strength:** coherent end-to-end story; maximizes exposure to AE's coordination value.
- **Failure:** users cannot tell whether AE is useful until after several attention and trust payments. It serializes every abandonment point and makes weak business response coverage look like product failure.
- **Use only when:** a returning user explicitly asks AE to repeat a known workflow and has an established authority pattern. Even then, the outbound payload still receives explicit readback; proposal and execution never collapse (`AX-6`).

#### B. Instant shortlist, agent offer after value — strong baseline

- **Strength:** fastest proof and cleanest trust progression. The inquiry offer is contextual: “Want AE to send this brief to these 3 businesses?”
- **Failure:** can still overinvest in a polished comparison whose key facts only businesses can confirm. Must display unknowns and source dates.
- **Use:** default interaction model for first-visit discovery.

#### C. Inquiry-as-product — retain as a direct mode, not the homepage default

- **Strength:** excellent for users who already know what they need; the portable structured brief is valuable; fan-out is easy to explain.
- **Failure:** form-first interaction resembles lead generation and asks for trust before demonstrating candidate quality. It also hides supply unevenness until after send.
- **Use:** explicit “Get comparable replies” mode for high-intent/returning users, or category-specific entry links—not the universal front door.

#### D. Staged hybrid — recommend

- **Strength:** combines B's value-before-authority with C's structured brief. It lets decisive users move quickly while preserving browsing/calling/copying as legitimate exits. The thread remains one durable object from query through receipt and replies (`LAW-2`, `LAW-9`).
- **Failure:** risks mode confusion if chat, fields, shortlist, and inquiry appear as four products.
- **Control:** one document spine and one evolving object: ask → interpreted constraints → candidates → comparison → optional proposal → permission → receipt → response. Structure changes by item type, not by launching parallel mini-apps (locked D2, `LAW-9`).

### Recommended shape contract

```text
/ composer
  → /t/:threadId created immediately
  → interpreted need + provisional shortlist
  → bounded comparison + editable portable brief
  → user chooses:
      [call/open/copy] terminal success without AE authority
      [adjust] continue discovery
      [ask selected businesses] proposal
          → exact scope + minimum PII + explicit permission
          → pending lock
          → receipt + per-recipient delivery states
          → private-link return + partial response evaluation
```

The inquiry branch is a **branch after success**, not the only definition of success. That is the primary defense against abandonment.

## 5. The dead-air problem

### Principle

A successful send creates a waiting product, not a completed product. The wait must be represented as a durable, inspectable state with an expectation and a recovery action (`LAW-3`, `LAW-4`, `CH-9`). Never use celebratory “all done” copy for a request awaiting external action.

### Notification-channel contract

| Channel | Role | Default rule | Message contract |
|---|---|---|---|
| **Email** | Primary asynchronous return channel | Default when email was already required/shared for the inquiry | Sender identity, thread purpose, exact new event, recipient/business name, count status (“1 of 3 replied”), safe private deep link, and boundary-honest next step. No reply claim if only delivery state changed. |
| **SMS** | Optional high-urgency alert | Offer only when phone is already needed and the user separately chooses SMS; never bundle with marketing consent | Extremely short event + private link. Avoid sensitive brief content in the message preview. |
| **Browser notification** | Optional convenience for an active/returning user | Ask only after value or send, never on landing | Event-specific alert; clicking opens the relevant item. Denial does not impair the inquiry. |
| **Private link copy** | User-controlled fallback | Always available on receipt | Copy/share `/i/:threadId?k=`; explain that possession grants access and the link should be kept private. Do not expose the key in public analytics, sitemap, canonical metadata, or page title (`IA-1`). |

Use the least additional consent: if email is already the legitimate response channel, email is the default operational notification. Marketing consent is separate and absent from this flow.

### Private-link return contract

`/i/:threadId?k=` is the canonical private record for externally observable inquiry state (`IA-1`). On return it must:

1. validate the key without revealing whether another thread exists;
2. open at the newest meaningful response, not the top of a long transcript (`CH-8`);
3. show inquiry identity, selected businesses, sent payload, receipt ID/timestamp, and current per-recipient states (`LAW-6`);
4. distinguish a business reply from AE's normalized summary; original reply remains inspectable (`CH-2`);
5. show link-sharing/privacy posture and a safe loss/recovery path;
6. present exactly one primary next action for the current state (`CH-9`).

### Expectation-setting copy matrix

| State | Required copy pattern | Primary action |
|---|---|---|
| **Pending send** | “Sending your inquiry to {N} selected businesses. Keep this page open; we’ll lock the request to prevent duplicates.” | None while locked; show progress/recovery (`AX-5`). |
| **Sent, no replies** | “Sent to {N} businesses. They have not replied yet. Businesses confirm price, timing, availability, and whether they can take the work.” | “Review sent inquiry” or “Withdraw pending requests” where supported. |
| **Some delivery failures** | “Sent to 2 of 3 businesses. We could not deliver to {business}; this does not affect the other requests.” | “Choose another business” or retry where the operation is safely idempotent. |
| **First partial response** | “1 of 3 businesses replied. You can review it now; the others are still awaiting reply.” | “Review response.” |
| **Clarification requested** | “{Business} needs one detail before it can respond. Nothing has been booked or confirmed.” | “Review and reply” through a newly scoped proposal if AE transmits it. |
| **No response by expectation window** | “No response yet. AE cannot guarantee a reply.” | “Call/open business,” “choose alternatives,” or withdraw. Do not silently reset the clock. |
| **All settled** | “Responses are ready to compare” or “No further responses are expected,” according to actual recipient states. | “Compare responses.” |
| **Status unknown** | “AE cannot currently read the latest delivery state. Your receipt is preserved; this is not evidence the request failed.” | “Check again” (`LAW-4`). |

### Partial-results rendering contract

Do not hold the experience until every business replies. Render an independent row/item per recipient:

| Field | Requirement |
|---|---|
| **Recipient identity** | Business name and the exact selected destination/channel posture. |
| **Current state** | `preparing` · `sending` · `sent` · `delivery_retrying` · `delivery_failed` · `awaiting_reply` · `clarification_requested` · `responded` · `declined` · `business_unavailable` · `withdrawn` · `status_unknown`. Text-first, never color alone (`DS-7`; delivery branches sharpened under `CH-1`). |
| **Last observed at** | Timestamp with honest source/readback boundary. |
| **Known result** | Quote/timing/availability fields only when supplied by the business; otherwise “not provided.” |
| **Original response** | Inspectable verbatim payload with source/channel and timestamp. |
| **AE normalization** | Separate derived comparison fields, visibly marked as organized by AE; no invented totals or commitments. |
| **Next transition** | What is expected next and from whom. |
| **Primary recovery** | One state-specific action (`CH-9`). |

The comparison view updates monotonically: a late response adds a linked response item and refreshes the derived comparison; it never rewrites the original send receipt (`LAW-6`). The first actionable response triggers return value. “Wait for all” remains an optional user choice, never the default gate.

## 6. Design and measurement guardrails

### Non-negotiable UI language

- “Ask selected businesses,” “Send inquiry,” “Awaiting business reply,” “Business replied.”
- Never “Book,” “Confirm,” “Order,” “secured,” “matched” when only candidates were found, or “done” when a reply is pending.
- “Sent” means the recorded send/delivery state only. It never advances itself to “confirmed” (`LAW-4`).
- No payments, wallet, credits, custody, or settlement surface.

### Funnel instrumentation needed to replace estimates

| Event | Decision it informs | Privacy constraint |
|---|---|---|
| Composer focused → submitted | Whether arrive→ask fails on framing/examples | Do not log raw request text into general analytics. |
| First useful candidate rendered | Actual time-to-first-value | Record latency and result posture, not sensitive content. |
| Comparison engaged / brief copied / business link opened | Whether free value succeeds even without inquiry | Treat link-out/copy as legitimate success, not “dropout.” |
| Inquiry offer shown → opened → refused/accepted | Trust-cliff location | Refusal reason optional; no dark-pattern re-prompt. |
| PII step started/completed | Field-level friction | Never put PII in event names/properties. |
| Send review → confirmed/cancelled/failed | Whether consequence readback earns authority | Preserve exact permission in the durable record, not analytics. |
| First delivery and first reply latency | Expectation-window copy and channel timing | Aggregate by category/channel; suppress small cohorts. |
| Notification delivered/opened → private return | Return mechanics effectiveness | Keep private-link key out of telemetry. |
| First response → comparison/action | Whether normalization helps decisions | Do not equate business contact outside AE with failure. |

### Success definition

The funnel succeeds when the user reaches a better-supported next decision, not only when AE sends an inquiry. Track three explicit success branches:

1. **Discovery success:** shortlist/comparison helped the user call, visit, copy, or choose.
2. **Coordination success:** a bounded, authorized inquiry was sent with a durable receipt.
3. **Evaluation success:** one or more business responses were returned and made easier to compare without overstating them.

This prevents the product from coercing users into authority transfer merely to improve a send-rate metric.
