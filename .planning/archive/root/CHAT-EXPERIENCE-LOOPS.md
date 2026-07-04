# Chat Experience Loops

**Date:** 2026-07-03
**Status:** operating spec
**Posture:** follow-the-nose product improvement, made explicit

## Stance

AE chat is not a general chat product.

It is a guided discovery loop that gets a person from a messy service need to a
confident, safe first inquiry.

If the chat does not shorten time to a trustworthy provider choice, it is
decorative. Cut it, hide it, or subordinate it to provider listings.

## Current Problem

The backend has enough structure: sessions, frozen answer turns, tool-call
evidence, work logs, provider snapshots, and safe context reconstruction.

The user experience does not yet cash that out. It still feels like:

```text
ask box -> answer blob
```

It should feel like:

```text
need -> clarify -> search -> compare -> decide -> qualified inquiry -> owner follow-up
```

The missing product feeling is not raw model thinking. It is visible progress,
visible evidence, visible memory, and visible next action.

## North Star

A customer can complete this job in under 3 minutes:

> "Who should I contact first, what is known, what needs confirmation, and can I
> send a safe first inquiry?"

The chat succeeds only if the person can answer those questions without
reverse-engineering AE's internals.

## Hard Rules

1. Provider cards before prose.
2. Visible work state before final answer.
3. Every recommendation names the evidence surface it used.
4. Every follow-up says what prior context it is using.
5. Every turn ends with a bounded next action.
6. "Message them" resolves to qualified inquiry only.
7. Booking, payment, dispatch, live availability, and job acceptance are never
   implied.
8. Private inquiry messages and owner replies never enter public answer context.
9. The answer thread remembers public discovery context, not private handoff
   content.
10. If chat cannot move toward provider choice or inquiry, it should say what is
    missing and stop.

## Primary Loops

### 1. Need Loop

```text
user need
  -> service type
  -> location/service area
  -> urgency/constraint
  -> searchable request
```

Goal: turn vague demand into a usable registry query without making the user
fill a form.

Good:

```text
"Emergency plumber near Parramatta"
```

Needs one more question:

```text
"I need help today"
```

### 2. Search Loop

```text
search request
  -> registry.search
  -> registry.detail for promising providers
  -> comparable provider set
```

Goal: prove AE is reading listings, not hallucinating.

The UI should show:

```text
Reading your request
Searching listed businesses
Reading published service details
Checking fit
Preparing your options
```

These steps come from persisted `workLog`, not model chain-of-thought.

### 3. Confidence Loop

```text
provider set
  -> why each fits
  -> what is published
  -> what needs confirmation
  -> best next action
```

Goal: make the trust boundary feel useful, not legalistic.

Every provider card should answer:

```text
What do they do?
Where do they serve?
What did AE use as evidence?
What is still uncertain?
What can I safely do next?
```

### 4. Refinement Loop

```text
follow-up
  -> classify intent
  -> use prior providers or search again
  -> show context used
```

Examples:

```text
"Only ones that handle burst pipes"
  -> filter_known
  -> "Using 3 providers from your last answer"

"Compare the first and third"
  -> compare_known
  -> "Comparing Demo Plumbing and Northside Plumbing from this thread"

"Find more in Blacktown"
  -> refine_search
  -> new registry search
```

Goal: make the session feel coherent without dumping raw transcript back into
the model.

### 5. Decision Loop

```text
shortlist
  -> recommended first contact
  -> reason
  -> fallback option
  -> safe next step
```

AE should be willing to help choose, but only from published facts:

```text
"Contact Demo Plumbing first because it publishes emergency plumbing, covers
Parramatta, and has an inquiry path. Confirm timing and price with the owner."
```

### 6. Inquiry Loop

```text
selected provider
  -> resolve listing/service/capability
  -> check inquiry support
  -> check unsafe action intent
  -> collect contact/body if missing
  -> submit qualified inquiry
  -> receipt and delivery state
```

The chat should make the boundary visible:

```text
AE can send a qualified inquiry for owner review.
AE cannot book, charge, dispatch, or confirm availability.
```

### 7. Owner Loop

```text
inquiry received
  -> owner reads
  -> owner replies or closes
  -> correction/freshness signal
  -> better future discovery
```

Goal: connect customer demand to owner action and listing freshness. This is the
loop that makes AE compound.

## Journey Map

### State 0: Empty Chat

The screen should make one job obvious:

```text
Ask for a local service and location.
```

Do not lead with generic AI capability.

### State 1: Clarifying

If service or place is missing, ask one crisp question. Do not search badly just
to look active.

### State 2: Searching

Show the work rail immediately. It should feel like AE is moving through a real
process.

### State 3: Results

Provider cards are the hero. The prose explains the cards; it does not replace
them.

### State 4: Follow-Up

Show a small context line:

```text
Using 3 providers from your last answer.
```

Then filter, compare, or search again.

### State 5: Selection

When the user asks which one to contact, AE should answer directly:

```text
Start with X.
Reason: ...
Backup: ...
Confirm: ...
```

### State 6: Handoff

When the user says "message them", AE should switch from answer mode to handoff
mode:

```text
Provider resolved
Inquiry path available
Boundary checked
Contact detail needed
```

### State 7: Receipt

After submission:

```text
Inquiry recorded
Delivery state
Owner review pending
What happens next
```

No fake ETA. No implied booking.

## Visible Process Rail

The rail is not a debug log. It is the user's trust interface.

Minimum rows:

```text
Reading request
Searching listings
Reading details
Checking fit
Preparing answer
```

Action rows:

```text
Resolving provider
Checking inquiry path
Checking safe-action boundary
Sending inquiry
Recording receipt
```

Each row can expand into:

```text
query used
tools called
providers read
results kept
boundary applied
```

Do not show raw model chain-of-thought.

## What The Model Gets

For answer turns, pass bounded derived context:

```text
current query
search context
follow-up intent
prior providers
prior allowed slugs
prior constraints
tool result summaries
```

Do not pass:

```text
private inquiry messages
customer contact
owner replies
raw owner inbox context
full unbounded transcript
```

## Implementation Cuts

### Cut 1: Make Thinking Visible

Use existing `workLog` to render a default-expanded compact process rail for the
active turn and a collapsed rail for prior turns.

Acceptance:

- Streaming turn shows at least three live states before completion.
- Completed turn keeps the persisted rail.
- The rail uses user-safe summaries only.

### Cut 2: Provider-First Answer

Reframe answer rendering so provider cards/table lead and prose follows.

Acceptance:

- First results viewport contains provider choices, not just paragraph text.
- Each provider card shows service area, fit reason, uncertainty, and next step.
- Empty result state asks a useful next question or suggests changing location.

### Cut 3: Follow-Up Context Line

Make multi-turn memory visible.

Acceptance:

- Filter/compare turns show "Using N providers from your last answer."
- New-search turns show "Searching again for ..."
- Pronoun/index resolution shows resolved provider names before action.

### Cut 4: Chat-To-Inquiry Handoff

Add the explicit "message them" journey.

Acceptance:

- User can select a provider from prior results.
- AE resolves provider to business/service/capability.
- Unsafe booking/payment/dispatch requests are refused or reframed.
- Qualified inquiry creates a private inquiry thread.
- Answer turn stores only a redacted receipt.

### Cut 5: Loop Observability

Measure the real loop, not generic chat activity.

Events:

```text
answer_query_started
answer_clarification_requested
answer_registry_searched
answer_provider_card_viewed
answer_follow_up_submitted
answer_provider_selected
inquiry_attempted
inquiry_submitted
owner_inquiry_read
owner_inquiry_replied
listing_corrected
```

Acceptance:

- We can reconstruct one user journey from query to inquiry receipt.
- We can count drop-off at clarify, results, provider select, and inquiry.

## Quality Bar

Run 20 uncoached sessions.

Prompt:

```text
Find who I should contact first for urgent plumbing help near Parramatta.
Tell me what is known, what needs confirmation, and send the first inquiry if it
makes sense.
```

Pass:

- Median under 3 minutes to confident first inquiry.
- User can explain why the suggested provider was chosen.
- User can explain what AE did not confirm.
- No one thinks AE booked, charged, dispatched, or guaranteed availability.

Fail:

- User treats the screen as generic chat.
- User ignores provider cards.
- User cannot tell what evidence AE used.
- User expects booking/payment/dispatch.
- Owner receives unusable inquiry text.

## Next Build Order

1. Cut 1: visible process rail from `workLog`.
2. Cut 3: follow-up context line.
3. Cut 2: provider-first answer layout.
4. Cut 4: chat-to-inquiry handoff.
5. Cut 5: loop observability.

That order is deliberate. First make the current intelligence visible. Then make
memory visible. Then make the answer surface useful. Then add the handoff.

## Non-Negotiable Product Shape

AE should feel like:

```text
a calm buying assistant with receipts
```

Not:

```text
a chatbot with local-business search bolted on
```

