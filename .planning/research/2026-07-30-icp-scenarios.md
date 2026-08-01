# ICP scenario evaluation: the reduced-complexity promise

**Date:** 2026-07-30  
**Purpose:** Inform T8 messaging and the next wayfinder rubric round.  
**Scope:** Six synthetic ICP scenarios across the rider side (the people behind assistants) and the driver side (local businesses deciding whether to list).

> **Simulation, not user research.** These are decision models, not interviews, conversion forecasts, or evidence that these people exist in this exact form. The scenarios are deliberately different in urgency, authority, repeat frequency, and tolerance for unfinished work.

## Claim boundary used in every scenario

### Observed today

The local product and machine surfaces show that AE can:

- accept a natural-language ask and return listed local businesses;
- compare published business facts such as service, area, hours, contact route, and price;
- expose those facts through the human page, `/llms.txt`, `/SKILL.md`, `/api/v1/services`, and service search;
- show a published price where one exists. For example, the local services surface shows Adelaide Dental Clinic at **$95 per visit incl. tax** and Adelaide Emergency Plumbing at **$180 per visit/call-out, quoted before work starts**;
- call one labelled, open sandbox quote endpoint for the dental example. The response is explicitly labelled `provenance: ae_sandbox_provider` and is a time-bounded quote, not independent provider fulfilment;
- let a business claim/review facts including its name, trade, suburb, phone, services, coverage, hours, prices, and customer next step. The claim page says the claim is free and that nothing publishes until the owner reviews it.

The homepage currently frames the reader promise as finding the right service, comparing published prices, and choosing the clearest next step. A toothache smoke journey returned listed dental options with the published $95 price and directed the user to open a business page and send an inquiry when that option is published. A recurring-office-cleaning smoke journey was treated as an unsupported action rather than a booking.

### Not delivered today

AE does **not** currently prove that it can book a real appointment or trade, take payment, dispatch a provider, guarantee a provider response, or fulfil the work. The public assistant setup explicitly says the keyless comparison path cannot confirm, start, book, charge, dispatch, or send anything. Listing and sandbox callability are not the same as independent supply or completed work.

### Aspirational promise (evaluated separately)

The Siri/Jarvis fantasy is: **ask once, and the work is handled**. That means understanding the request, asking only decision-changing questions, comparing options, confirming a choice, booking it, paying if authorised, dispatching or routing it, showing progress, recovering from exceptions, and telling the person what happened. It also means a business can trust an after-hours enquiry to become a captured, actionable lead rather than an unanswered phone call. AE should not imply that this loop exists until each transition has provider-backed evidence.

## Rider-side scenarios

### 1. Busy parent with a child who has a toothache

**Decision frame (inferred):** The job is urgent care discovery while the parent is distracted and worried. Awareness is low-to-medium; the parent already trusts ChatGPT as the place to ask. The constraint is time and emotional load, not price optimisation. The strongest objection is: “Will this actually get my child seen, or will I still have to call every practice?”

#### (a) The moment they meet AE

At 8:30pm the parent asks ChatGPT: **“My child has a toothache in Adelaide. Find a dentist, tell me what it costs, and get us the earliest suitable appointment.”** The parent does not search for AE by name; the assistant has to discover AE and keep the parent from opening ten tabs or making several anxious calls.

#### (b) What the Siri/Jarvis expectation makes them envisage — aspirational

The parent expects one calm exchange: the assistant asks about urgency only if needed, finds a suitable nearby practice that is open or has an after-hours path, explains the likely cost, books the earliest slot, sends the address and confirmation, and tells the parent what to do if the child worsens. “It’s handled” means the parent can return to caring for the child instead of becoming a switchboard operator.

#### (c) What AE can honestly deliver today vs where the gap stings

**Honest today (observed):** AE can surface listed dental practices and their published facts. In the local smoke journey, Adelaide Dental Clinic appeared with **$95 check-up and clean**, Mon–Fri 8:30am–5pm, a published phone number, and a contact-route next step. The labelled dental sandbox can return a time-bounded $95 quote. The answer is useful as a shortlist and price signal.

**Gap against the aspirational expectation:** The parent still has to determine whether the practice can handle a child urgently, contact it, and secure an appointment. A weekday hours label does not establish tonight's availability; the sandbox quote does not book the child; AE does not pay, dispatch, or guarantee a reply. The moment the parent needs care rather than information, “reduced complexity” stops at a hand-off.

#### (d) Winning promise

**Winner: “No calling around / it’s answered.”** Under stress, removing the search-and-call burden matters more than shaving a few dollars; the $95 price is evidence that the answer is concrete, not the core emotional win.

#### (e) Exact headline

> **Child has a toothache? See a local dentist’s published price and the next step.**

This is reader-first and concrete without promising a diagnosis, an appointment, or after-hours care.

---

### 2. Small office manager who books tradies weekly

**Decision frame (inferred):** The job is repeat procurement and coordination: source a cleaner, plumber, electrician, or other local trade, check fit, and arrange the visit. Awareness is practical rather than ideological. Authority is limited by the office’s budget, access rules, and approval process. The strongest objection is: “Will this save me work every week, or only show me another list?”

#### (a) The moment they meet AE

The manager tells an assistant: **“Find a reliable cleaner for our Adelaide office every Friday, compare the hourly price and minimum, and book this week’s visit.”** They may also ask for an electrician or plumber in the same way. They meet AE when the assistant returns a structured local option instead of a search-results page.

#### (b) What the Siri/Jarvis expectation makes them envisage — aspirational

The manager imagines stating the standing requirements once: site access, frequency, window, budget, insurance, and preferred contact. The assistant compares suitable suppliers, checks the recurring slot, books the first visit, records the arrangement, sends reminders, and handles a cancellation by finding a replacement. “It’s handled” means no weekly sourcing ritual and no chasing confirmation.

#### (c) What AE can honestly deliver today vs where the gap stings

**Honest today (observed):** The services surface can expose a published cleaning offering, including **$55/hour with a 3-hour minimum**, plus a service summary and location. AE can show listed businesses and published facts, so the manager can use price and scope as a first filter.

**Gap against the aspirational expectation:** The current answer journey treated “recurring office cleaners ... book one this week” as an unsupported business action and suggested finding a listed business before using an inquiry option. There is no verified recurring schedule, office-access/insurance check, booking, cancellation handling, or repeat relationship. A published hourly price is not a confirmed slot or a commitment from the cleaner. The manager still does the coordination work that creates the real value.

#### (d) Winning promise

**Winner: “No calling around / it’s answered.”** This persona has a recurring coordination tax; a clear shortlist and next step reduce the weekly burden even when price remains a comparison input.

#### (e) Exact headline

> **Need a cleaner every Friday? Get a local price and contact route without calling around.**

The line promises discovery and reduced searching, not a booked recurring contract.

---

### 3. AI-native power user with agents running errands (the Jarvis-expectation persona)

**Decision frame (inferred):** The job is delegated execution across errands, not browsing. Awareness is high; this person already uses agents and evaluates the quality of the hand-off. Their constraint is willingness to supervise, not technical ability. The strongest objection is: “If I still have to open a page, repeat the request, and chase the provider, why did I delegate it?”

#### (a) The moment they meet AE

They tell their assistant: **“Handle finding and arranging an electrician for tomorrow, under my limit. Ask me only if a decision is genuinely needed.”** They encounter AE when the agent finds AE’s machine-readable surfaces or invokes the keyless answer path.

#### (b) What the Siri/Jarvis expectation makes them envisage — aspirational

They expect the assistant to decompose the task, carry constraints across providers, compare trade-offs, ask one focused clarification, obtain explicit approval at the right boundary, book and pay within authority, monitor progress, and recover if a provider declines. The desired outcome is not “a fast answer”; it is **one request, one controlled execution, one result**.

#### (c) What AE can honestly deliver today vs where the gap stings

**Honest today (observed):** A cold host can discover AE via `/llms.txt` and `/SKILL.md`, query the keyless answer turn, or read `/api/v1/services` and its search endpoint. AE can return a small set of listed businesses, compare published facts, and expose the contact or open-sandbox path that is actually present. This is meaningful agent-readable discovery, and price is machine-readable when a business has published one.

**Gap against the aspirational expectation:** Discovery is not delegation. The agent cannot treat a listing or sandbox quote as a booked job, paid transaction, dispatched trade, or fulfilled outcome. The current answer boundary sends the human to the listed business/contact route. Multi-business constraints, durable plans, approval, status, exception recovery, and final outcome are not one completed loop. Any “ask once” copy that implies autonomous fulfilment would overclaim.

#### (d) Winning promise

**Winner: “No calling around / it’s answered.”** This user is specifically buying fewer supervision steps; “instant price” is a useful decision datum, while the core test is whether AE removes coordination rather than adding another interface.

#### (e) Exact headline

> **Ask once. Get the clearest local option and what to do next.**

“Ask once” speaks to the desired interaction while “what to do next” keeps today’s hand-off honest.

## Driver-side scenarios

### 4. Sole-trader plumber: no website, phone-only

**Decision frame (inferred):** The job is not to learn a new protocol; it is to get qualified local demand without building a website or answering every missed call. Authority is concentrated in the owner, who can approve facts quickly but has little spare admin time. The strongest objection is: “Will this make my phone ring with real jobs, or create another profile I have to maintain?”

#### (a) The moment they meet AE

A fellow tradie says customers are asking AI assistants for local plumbers. The owner searches for a way to be listed after missing a late-night burst-pipe call, or sees the claim page and asks: **“Can I put my service, area, hours, price, and phone number where AI assistants will find it without a website?”**

#### (b) What the Siri/Jarvis expectation makes them envisage — aspirational

The owner imagines approving the facts once, then having an assistant qualify the job at 2am, collect the suburb and urgency, send only workable requests to the phone, and eventually schedule or dispatch work. “It’s handled” on the supply side means no missed after-hours enquiry and no low-quality lead chase.

#### (c) What AE can honestly deliver today vs where the gap stings

**Honest today (observed):** The claim flow supports business name, trade, suburb, phone, service area, hours, services, prices or a quote-first note, contact route, and source review. The local Adelaide plumbing entry exposes **Emergency pipe repair**, **Adelaide and nearby suburbs**, **Mon–Sun, 24 hours**, **$180 call-out, quoted before work starts**, and a published phone number. A website is not required to publish those approved facts.

**Gap against the aspirational expectation:** The listing can make the business legible to an assistant, but it is not an after-hours receptionist or lead-routing system. There is no proof that an enquiry is captured, alerted, qualified, scheduled, or dispatched; the plumbing entry has no callable provider endpoint. “Never miss an after-hours enquiry” is therefore an unearned promise today. The owner must also keep facts current and still handle the human request.

#### (d) Winning promise

**Winner: “Be found by AI assistants.”** For a phone-only business with no website, distribution is the immediate unmet need; after-hours capture would be valuable, but AE does not yet provide that operational loop.

#### (e) Exact headline

> **Help AI assistants find your plumbing business, phone number, and published call-out price.**

It states the concrete supply-side change without promising a booked job or guaranteed lead volume.

---

### 5. Dental practice manager with a booking system

**Decision frame (inferred):** The job is to make patient questions and demand arrive through the practice’s existing booking workflow, especially when the front desk is closed. Awareness is medium; the manager understands listings and booking software but not necessarily agent surfaces. Authority includes approval of public facts and routing, not clinical decisions. The strongest objection is: “Will this send patients to a dead end or create an unsafe promise about urgent care?”

#### (a) The moment they meet AE

The manager notices patients asking ChatGPT for a nearby dentist, check-up price, or tooth-pain next step after hours. They consider listing when they learn AE can publish approved services, hours, prices, and contact details and point people to the practice’s chosen next step.

#### (b) What the Siri/Jarvis expectation makes them envisage — aspirational

They imagine an assistant answering common questions after hours, checking the practice’s live booking availability, routing urgent symptoms safely, booking routine appointments into the existing system, and leaving a traceable enquiry for staff. “It’s handled” means fewer missed enquiries without giving an AI permission to invent clinical advice or overbook the diary.

#### (c) What AE can honestly deliver today vs where the gap stings

**Honest today (observed):** The practice can publish a service summary, opening hours, price, phone/site route, and source note. The Adelaide dental service lists **$95 check-up and clean** and exposes a labelled sandbox quote with a time window. Assistants can use these facts to answer a patient’s basic “what is it and what does it cost?” question.

**Gap against the aspirational expectation:** The catalogue does not show an integration with the practice’s booking system. AE cannot create or confirm an appointment, perform urgent clinical triage, capture a durable after-hours enquiry, or guarantee that staff will see and respond to a hand-off. The quote endpoint is labelled sandbox provider evidence, not a production practice booking. Publishing “available after hours” would be misleading unless the practice has explicitly supplied that fact and the next step is real.

#### (d) Winning promise

**Winner: “Never miss an after-hours enquiry.”** The practice already has a booking system; the incremental value is keeping approved answers and a real next step available when reception is closed, not merely adding another directory listing.

#### (e) Exact headline

> **Make your check-up price and next step available when your front desk is closed.**

This is a concrete after-hours information promise, not a claim that AE books or triages patients.

---

### 6. Suburban accountant with a stale website

**Decision frame (inferred):** The job is to stay discoverable for local small-business owners asking AI for BAS, payroll, and tax help. The owner has authority over public facts but low appetite for a website rebuild. The strongest objection is: “Will this give assistants current information, or just copy stale pages and create another place to update?”

#### (a) The moment they meet AE

A client says they asked an assistant for a nearby BAS accountant and the practice did not appear. The accountant checks the old website, sees outdated service language and no current price, and considers claiming a listing to publish the facts they actually want assistants to use.

#### (b) What the Siri/Jarvis expectation makes them envisage — aspirational

They imagine an assistant understanding a prospect’s BAS/payroll situation, filtering for the right expertise, quoting or explaining the consultation, checking capacity, booking a call, and passing a clean brief to the practice. “It’s handled” would mean a current, qualified enquiry arrives without the owner maintaining a complex new system.

#### (c) What AE can honestly deliver today vs where the gap stings

**Honest today (observed):** Claiming gives the owner a reviewable source of business facts and a way to publish current service, place, hours, price/quote-first status, and contact route to assistant-facing surfaces. The Adelaide Accounting entry is discoverable and describes **BAS, payroll, and tax preparation questions**, but it has **no published price and no callable endpoint**.

**Gap against the aspirational expectation:** AE cannot infer a current fee, capacity, eligibility, or appointment slot from a stale site. It cannot book the consultation or turn a prospect’s question into a verified work brief. If the owner does not claim and review the facts, a stale website remains stale; if the owner claims without publishing a price, “instant price” cannot be the offer.

#### (d) Winning promise

**Winner: “Be found by AI assistants.”** The acute driver problem is stale discovery; a current, assistant-readable listing is valuable before price or booking can be made reliable.

#### (e) Exact headline

> **Put your current BAS and payroll services where AI assistants can find them.**

It names the job and the distribution outcome without claiming search ranking, a quote, or a booked consultation.

## Synthesis

### The one promise that wins on each side

#### Rider: **“No calling around / it’s answered.”**

Across the parent, office manager, and AI-native power user, the shared job is **reduced complexity**. They are not primarily shopping for a low number; they are trying to hand an ambiguous local task to an assistant and receive a clear, trustworthy next step. “Instant price” is the proof that AE has something concrete to compare. It should support the promise, not replace it. The safe rider claim today is:

> **Ask for what you need and where. AE finds listed local businesses, compares their published facts and prices, and shows the clearest next step.**

Do not turn “ask once” into “booked” until booking and provider outcome evidence exist.

#### Driver: **“Be found by AI assistants.”**

Across the phone-only plumber, booking-system dental practice, and stale-website accountant, the common job is making approved business facts legible and current at the moment an assistant is choosing local options. Price helps the assistant and customer decide, while after-hours visibility is a strong wedge for practices and emergency trades. The broad driver promise should remain distribution-led:

> **Put your approved services, prices, hours, and contact route where AI assistants can find them.**

Do not promise lead volume, ranking, a guaranteed call, or after-hours capture. Those require observed supply and response evidence.

### Copy system: headline + supporting line

The system keeps the two-sided loop visible without making the human homepage a directory wall: owner-first positioning on `/`, a concrete claim funnel on `/claim`, and a factual hand-off page for each business.

| Surface | Headline | Supporting line |
|---|---|---|
| `/` | **When local customers ask AI, put your business in the answer.** | **Approve your services, prices, hours, and contact route once. AE publishes those facts for assistants to find and helps people reach a clear local next step instead of calling around. It does not book, charge, or dispatch.** |
| `/claim` | **Make your business easy for AI assistants to find.** | **Review the services, prices, hours, areas, and customer contact route you want published. Claiming is free; nothing is booked, charged, or dispatched by the listing.** |
| Business page | **`[Business] — [service] in [area]`** | **`[Published price or “quote before work starts”]. [Hours/service area]. Contact [published route] for a human request; AE does not book, charge, or dispatch.`** |

**Business-page example:**

> **Adelaide Emergency Plumbing — emergency pipe repair in Adelaide**  
> **$180 call-out, quoted before work starts. Mon–Sun, 24 hours, Adelaide and nearby suburbs. Call the published number for a human request; AE does not book, charge, or dispatch.**

The ask-box microcopy on `/` can stay concrete and rider-first: **“What do you need, and where?”** Its result state should keep the same promise: **“Compare the published price, then choose one next step.”**

### Top two Jarvis-break capability gaps (candidate wayfinder tickets)

1. **T10 — Booking endpoints / execution hand-off**
   - **Break:** Today’s flow ends at a listed fact, sandbox quote, or contact instruction. The assistant cannot reliably move from “this option fits” to an explicit provider-backed confirmation, schedule, payment boundary, dispatch, cancellation, and outcome.
   - **Why it matters:** This is the sharpest break for the worried parent, weekly office manager, and Jarvis power user, and it is also what makes a dental practice or plumber distrust “it’s handled.”
   - **Rubric proof needed:** A real or explicitly labelled provider adapter must accept an approved request, return the current price/time/limits, require the right confirmation, expose progress/evidence, and report success or failure without implying fulfilment when it is unknown.

2. **T9 — Plan-first surface with durable hand-off and recovery**
   - **Break:** A natural-language ask can return a few matching rows, but an abstract or composite task is not yet a durable plan with decision-changing questions, comparable options, an approval boundary, a persistent next action, and recovery when a business cannot respond. The office-cleaning smoke journey demonstrates this: a recurring booking ask was unsupported rather than decomposed into a useful plan.
   - **Why it matters:** This is the missing “ask once” layer before execution. It also defines what “never miss an after-hours enquiry” would need to mean: capture the request, state who owns the next step, preserve it, and expose a safe response path rather than merely showing a phone number.
   - **Rubric proof needed:** Given one composite request, AE should show the interpreted constraints, ask only for missing decision-changing facts, compare options with provenance and expiry, make the next action explicit, preserve the thread, and surface an honest `needs_attention` or `outcome_unknown` state instead of silently dropping the work. A dedicated after-hours notification/inbox ticket may follow once T9’s hand-off contract is fixed.

### Message hierarchy for the next rubric round

1. Lead the rider test with **“no calling around / it’s answered”** and measure whether a person can explain the next step without believing a booking occurred.
2. Lead the driver test with **“be found by AI assistants”** and measure whether a no-API owner can claim, approve, and verify the exact public facts in one sitting.
3. Use **price** as evidence: show the amount, unit, tax treatment, quote-first wording, freshness, and provenance. Never let “instant price” imply a guaranteed final bill.
4. Use **after-hours** only as a published-facts benefit until capture, alerting, and provider response are real. “Answer questions at 2am” is supportable; “never miss the enquiry” is aspirational today.
5. Keep the execution boundary in the copy and in the rubric: listing and comparison are live; booking, payment, dispatch, and fulfilment are not yet proven.

## Limits and follow-up

- These are simulated reactions derived from the stated personas and the local product surfaces, not interviews, analytics, or statistically valid ICP research.
- Search coverage, wording quality, provider supply, and response rates need real rider and driver tests. The local deployment includes labelled/sandbox businesses; it does not establish independent provider performance.
- The smoke journeys exercised the local answer stream and services surfaces. The answer stream rendered useful results but ended with a local `answer_turn_persist_failed` event after the visible answer; this is implementation evidence to investigate, not a messaging claim.
- The next round should test whether people understand the reduced-complexity promise while retaining the exact “not booked/paid/dispatched” boundary, then re-score T9 and T10 against those observed journeys.
