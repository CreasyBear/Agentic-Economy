# Buyer journey protocol

**Status:** last-pass proof of the buyer path. Not the work order.  
**Date:** 2026-09-21 (order corrected the same day)  
**Work order:** [`ux-coverage-protocol.md`](./ux-coverage-protocol.md) — SEE → NAME → REACH → HOLD → SEND, then this file’s AGREE/CARRY.  
**Contracts:** [`buyer-journey-baseline.md`](./buyer-journey-baseline.md)  
**Evidence (not the queue):** [`platform-experience-register.md`](./platform-experience-register.md), eight-part package

FIND-first was still “start with the hardest.” We do not open this file until coverage passes 0–4 hold. The four stages below remain the *proof* that a Tool can be carried. They are not the daily assignment order.

---

## How to use this

Use this file only on coverage passes **AGREE** and **CARRY**. Until then, assign from [`ux-coverage-protocol.md`](./ux-coverage-protocol.md).

When those passes are current:

1. Open the **current stage** (only one is current).
2. Read **arrive / leave**. That pair is the work. Every page in the stage must honour it.
3. Assign the **whole stage** to one lead. Existing EX / JI / W / DS IDs review their invariants; they do not each take a symptom.
4. Write a one-page freeze: arrive, leave, pages, primary action per page, file budget, out of scope.
5. Sluice the freeze (`main` if two surfaces, `deep` if three+). Implement until the stage walk passes.
6. Then the next stage. Do not start it early because a later page also looks bad.
7. Rewalk the full INDEX after the stage, not only the stage pages.

The ordinary task, used to *prove* a stage, not to *pick* work:

> Find an image-generation Tool, understand its price and output, and use it with my existing Agent.

---

## The journey (what you carry)

```text
FIND          arrive: a need
              leave:  one Tool you can explain
                      (contribution, Provider, listed price ≠ Quote, callable?)

ALLOW         arrive: that Tool, plus a named blocker (no Agent, or no credit)
              leave:  same Tool, blocker cleared
                      skip this stage if already ready

USE           arrive: that Tool + an authorised Agent
              leave:  a Call on that Tool (Quote then Call in the Agent)

RECORD        arrive: that callRef
              leave:  you can explain delivery / payment / purchase
                      and recover without a second Call
```

If a page cannot say which of these four it is on, it is not in this campaign.

---

## Stages

### 1. FIND — not current; this is coverage pass AGREE

**Pages (one assignment):** Market entry, results/cards, compare, listing, ask-thread cards.

**Job:** Turn a need into a Tool you dare hand to an Agent.

**Pages must agree:** title, Provider, listed price, callable vs indexed. Same next step: open listing, then “use with your Agent” or “connect an Agent.” Compare ≤4 still there after inspect and refresh. Chat shows the same facts and cannot buy.

**Stage walk (pass all):**

1. Describe “image generation.” Get a shortlist you can explain.
2. Open one card. The listing is that Tool, or an honest unavailable — never a featured lie.
3. Compare two. Refresh. Both still there.
4. You can say what the listed price is **not**, and whether it is callable.

**Out:** Quote, Call, credit, dest-count, Provider publish, no-fit dest, restyle of discover SoT.

**Invariants other IDs already own** (they review the freeze, they do not split the wave): EX-01 truthful inspect; JI-04b chat is not a buyer; x402 indexed ≠ callable.

### 2. ALLOW — only after FIND passes

**Pages:** Agents (first-use and returning), authorize, Credit.

**Job:** Clear one named blocker and return with the same Tool (`resumeTool`).

**Arrive / leave:** Tool + “need Agent” or “need credit” → same Tool, ready to USE.

**Skip** when the Agent and credit already exist. Do not rebuild this stage because FIND is ugly.

### 3. USE — after FIND, and ALLOW if it was needed

**Pages:** listing handoff + the Agent’s Quote/Call (not a human checkout).

**Job:** Existing Agent Quotes, then Calls, that Tool.

**Arrive / leave:** ready Tool + Agent → a `callRef`.

Listing primary action is “continue with your Agent” when one exists. “Connect an Agent first” is only the ALLOW branch.

### 4. RECORD — after USE

**Pages:** Calls list, receipt, help `?callRef=`.

**Job:** Find that Call, read three statuses, recover on it.

**Arrive / leave:** `callRef` → explained and, if needed, remedied.

---

## How we assign

| Assign | To whom |
| --- | --- |
| **The stage** | One lead (one Composer / one PR / one well). They own every page in the stage so the handoff matches. |
| **The freeze** | Lead writes it. Joel signs arrive / leave / out of scope. |
| **Invariants** | Named EX / JI / W / DS reviewer: they may block a freeze that collapses funding ≠ authority, chat-can-buy, or listed-price-as-Quote. They do not receive a private bug queue. |
| **Channel** | Sluice on the **stage**, not the symptom. FIND is `deep` or `main` (Market + listing + compare). ALLOW is `main` if Agents + Credit. A copy-only pass inside a frozen stage may `fast`. |

Do not assign “EX-01 this week, JI-04b next week, W-20 when Credit 500s.” That is how the site stays a pile of pages.

---

## Freeze template (one stage)

```text
Stage:
Arrive carrying:
Leave carrying:
Pages in:
Primary action on each page:
Must agree across pages:
File budget:
Out:
Invariant reviewers (IDs only):
Stage walk (copy from this protocol):
```

Fill this before the first edit. If it does not fit on one page, the stage is too big — you are smuggling ALLOW into FIND.

---

## Done

**Stage done:** the stage walk passes without a reviewer explaining the UI. Keyboard and one compact width on the same walk.

**Journey done:** FIND + (ALLOW if needed) + USE + RECORD, first-use and returning Agent. Interrupted return still holds the Tool or `callRef`.

A single board row flipping FAIL → PASS is not done. A green grammar test is not done.

---

## Refuse

- A queue of FAILs routed to whoever “owns” the symptom.
- Starting ALLOW, USE, RECORD, or dest-count because those pages also look bad.
- Closing FIND by restyling one card.
- Closing USE with only “Connect an Agent first.”
- A new ID series.
- Provider publish in this campaign.
