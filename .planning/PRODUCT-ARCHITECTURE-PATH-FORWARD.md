# Product Architecture Path Forward

**Date:** 2026-06-30
**Status:** next operating plan after `PRODUCT-ARCHITECTURE-INTERROGATION.md`
**Posture:** selective reduction

## Objective

Turn the product architecture interrogation into enforceable repository work.

The architecture can now support public listings, inquiry, owner/admin readbacks,
answer threads, billing, protected-action surfaces, observability, and discovery.
The product path forward is not to expand all of that equally. It is to prove the
core trust loop and classify everything else by surface status.

## Product Spine

```text
query/search
  -> comparable provider listing
  -> trust-aware next action
  -> qualified inquiry
  -> owner response or correction
  -> fresher listing evidence
  -> better search and assistant discovery
```

If a feature does not strengthen one of these steps, it is not core right now.

## Immediate Decisions

| Decision | Posture | Consequence |
| --- | --- | --- |
| Provider listing remains the core object. | Keep | Listing detail, registry cards, answers, and agent JSON must all point to the same safe next step. |
| Qualified inquiry is the first owned conversion. | Keep | No booking, payment, dispatch, or autonomous fulfilment copy. |
| Answer/chat is demand routing, not the product center. | Quarantine as beta until proven | It must retrieve public catalog facts, show provider cards, and route into listing or inquiry. |
| Billing, protected actions, and business-action receipts are consequence rails. | Subordinate | They must not set public product expectations before loop proof. |
| Discovery and agent tools are quiet infrastructure. | Keep bounded | They support safer assistant routing; no protocol theater on human surfaces. |
| Generated graph JSON is not source. | Cut from Git | Keep `GRAPH_REPORT.md`; ignore bulky generated graph files. |

## Surface Status Seed

This is the first pass. The next implementation step should move this into a
dedicated `.planning/SURFACE-STATUS.md` register with one row per mounted route.

| Surface group | Routes / files | Status | Product owner question |
| --- | --- | --- | --- |
| Public core | `/`, `/ask`, `/registry`, `/$slug`, `/$slug/inquiry`, `/claim`, `/claim/success`, `/privacy/remove-business` | Core | Does each path move a person toward a safe first inquiry or owner correction? |
| Public machine-read | `/api/businesses`, `/api/businesses/search`, `/api/businesses/$slug`, `/$slug/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt` | Core support | Do these expose only public facts and refusal boundaries? |
| Quiet agent tools | `/api/agent/tools`, `registry.search`, `registry.detail`, `inquiry.submit` | Core support | Are write actions still limited to qualified inquiry, with read-only registry tools? |
| Developer discovery | `/developers/discovery`, `/api/discovery/schema`, `/api/discovery/examples`, `/api/discovery/fixtures` | Support / internal-beta | Does this help builders read public facts without implying a platform? |
| Answer thread | `/q/$answerId`, `/t/$threadId`, `/api/answer*`, `/api/chat*` | Beta demand router | Does answer shorten time-to-safe-first-inquiry against registry/listing? |
| Owner inquiry | `/owner/inquiries`, `/owner/inquiries/$threadId`, `/owner/status` | Core after deployed proof | Can an owner see, reply, or correct from a real inquiry? |
| Owner protected actions | `/owner/actions*` | Future / beta | Is every action owner-approved and receipt-bound before consequence? |
| Owner billing | `/owner/billing*` | Future commercial rail | Is money hidden until demand and support proof justify it? |
| Owner business actions | `/owner/business-actions*` | Future / proof rail | Is this source/local evidence only unless provider smoke passes? |
| Admin/operator | `/admin/*` | Internal | Does it expose repair queues for trust decay and failed delivery? |
| Provider/webhook APIs | `/api/notification/*`, `/api/billing/webhook`, `/api/business-actions/stripe-webhook`, `/api/observability/funnel` | Internal/provider | Are failures visible without creating false public proof? |
| Auth support | `/sign-in/*`, `/sign-up/*` | Support | Does auth serve owner/admin authority without becoming product copy? |

## Next Work Order

1. Create `.planning/SURFACE-STATUS.md`.
   - One mounted route or action per row.
   - Columns: status, public visibility, user, product job, proof gate, owner.
   - Add a scanner or test that fails when a new route lacks a status row.

2. Create `.planning/LOOP-PROOF.md`.
   - Track the first deployed proof of `listing -> inquiry -> owner delivery -> owner response/correction -> listing freshness`.
   - Separate local/source proof from deployed/provider proof.
   - Include evidence refs, commands, screenshots, owner notes, and failure states.

3. Clean trust language drift.
   - Replace example "verified" language in `DESIGN.md` unless tied to a named standard.
   - Update `AGENTS.md` to acknowledge read-only `registry.search` and `registry.detail` alongside `inquiry.submit`.
   - Keep public human copy free of internal architecture words.

4. Decide answer posture explicitly.
   - Accepted posture: answer/search is a demand router into trusted listings.
   - Required proof: registry tool calls are persisted, provider cards lead, and next step stops at inquiry or listing.
   - Rejection signal: users treat answer as generic chat or answers hide source boundaries.

5. Add product-loop observability.
   - Track query, listing inspect, agent JSON copy, inquiry attempt, inquiry accepted, delivery state, owner read, owner reply, correction, suppression, and freshness/ranking change.
   - Tie Sentry failures to user-visible broken jobs, not generic exceptions.

6. Freeze new rails until the loop gate moves.
   - No new public billing, payment, protected-action, or business-action claims.
   - No broad marketplace language.
   - No new answer features unless they reduce time-to-safe-first-inquiry.

## Proof Gate

The next phase should be judged by this gate, not by route count:

| Proof | Target |
| --- | --- |
| Supply | 10 owner-reviewed or owner-corrected listings in one metro and service category. |
| Demand task | 20 uncoached sessions: "Who should I contact first, what is known, what needs confirmation, and can I send the first inquiry?" |
| Customer success | Median under 3 minutes to a confident first inquiry, with remaining uncertainty explainable. |
| Owner success | At least 5 owners respond, correct, or say the inquiry was worth receiving. |
| Kill signal | Users browse but do not inquire, owners ignore/cannot use inquiries, or AE is not faster/safer than Google/Maps. |

## Immediate Next PR

**Name:** Product Architecture P0 - surface status and loop gate

**Scope:**

- Add `.planning/SURFACE-STATUS.md`.
- Add `.planning/LOOP-PROOF.md`.
- Patch trust-language drift in `DESIGN.md` and `AGENTS.md`.
- Add a lightweight route-status coverage test or script.

**Non-goals:**

- New product surfaces.
- New answer capabilities.
- Billing, payment, protected-action, or business-action expansion.
- Public copy that implies booking, dispatch, payment, or autonomous fulfilment.

