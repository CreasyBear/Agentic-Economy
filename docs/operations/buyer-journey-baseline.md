# Buyer journey baseline

**Status:** the check. Pass or fail. No grades.  
**Date:** 2026-09-21  
**How we work / assign:** [`buyer-journey-protocol.md`](./buyer-journey-protocol.md)  
**Board:** [`platform-experience-register.md`](./platform-experience-register.md)  
**Who this is for:** someone walking the buyer path to see if base functionality holds.  
**Not this file:** dest-count campaigns, visual harvest, Provider publish, Jev matching.

The buyer workflow is the product. Everything else waits.

```text
need → describe → shortlist → inspect → compare → existing Agent Quotes → Call
  → result or pending → recover on that Call → record → agent continues
```

That is [PRODUCT.md](../../PRODUCT.md) “The decision and purchase chain.” A page that does not advance this chain, recover it, or tell the truth about why it cannot, is slop.

---

## Frameworks (use these; do not invent a tenth)

| Layer | Rule | Author |
| --- | --- | --- |
| Job | One job statement per page. Circumstance → progress → outcome → anxiety. | Christensen JTBD |
| Journey | One chain. Incomplete is a fail, not a caveat. | PRODUCT.md chain; Bitner service blueprint (frontstage only) |
| Site | Five questions on every consequential view. One dialect. | [DESIGN.md](../../DESIGN.md) “What the interface must make legible” |
| Page | One primary action. Don’t make me think. | Krug; Nielsen visibility / consistency / recovery |
| Group | Same objects, same words, same next step across the cluster. | Polar Bear consistency; Wodtke one noun per dest |
| Compare / cart | Selection survives inspect. Listed price is not commit price. | Baymard; OpenRouter `/models` Compare as a real control |
| Commit | Human never checkouts a Tool. Agent Quotes, then Calls. | PRODUCT.md; ideal thesis |

Cut from the check: CHARTER / PARTIAL / SEEN / OPEN / DOCS. Those grades turned archaeology into a substitute for a contract.

---

## Site requirements

A surface is in the product only if all of these hold.

1. **One chain.** The page names where you are on need → Call → record, or it is not a buyer page.
2. **One job.** If you cannot say the job in one sentence, the page has no job.
3. **One primary action** that names the consequence (open listing, connect this Agent, get help with this Call). Not “Continue”, not “OK”.
4. **DESIGN.md five questions** answered on listings, quotes-adjacent views, and receipts: which Tool; who Customer / Agent / Provider / Seller; what authority and money; what is observed vs claimed; what happens next.
5. **Same words everywhere.** Tool, Quote, Call, Provider, credit, Spending policy. No “Trips”, no “Keys”, no “checkout”.
6. **Truthful empty / error.** No-fit ≠ nothing exists. Unavailable ≠ browse later. Listed price ≠ Quote.
7. **Back keeps work.** Query, compare set, `resumeTool`, `callRef` survive inspect, refresh, and login.

Fail any one: the site is not cohesive. Matching tokens is not cohesion.

---

## Group requirements

Three buyer groups. Provider supply is out of this file.

### Market group — find

Pages: `/market`, `/tools/…`, `/t/…`

- Ask a **need**, do not only search a name.
- Card and listing agree: contribution, Provider, listed price, callable vs indexed.
- Compare is ≤4, same attributes, **still there after inspect**.
- Opening a card never dumps you on an unavailable page dressed as a Tool (EX-01).
- Chat can discover. Chat cannot buy.

### Authority group — allow

Pages: `/agent-access`, `/agent-access/authorize`, `/owner/credit`

- Connect ≠ grant. Credit ≠ permission.
- Grant names Agent, limits, Tools.
- Top-up names credit, fee, GST, total **before** Stripe.
- Resume selected Tool (`resumeTool`) after connect.

### Record group — explain

Pages: `/activity`, `/calls/$callRef`, `/support?callRef=`

- List by Call, not by vibe.
- Receipt shows delivery / payment / purchase as **three facts**.
- Recovery stays on that `callRef`. Next action is never a fresh Call after possible dispatch.
- Help opens with the same ref.

---

## Page requirements (buyer spine only)

Each row is a contract. **Now** is the live fail. Fix the fail; do not add a dest.

| Page | Job | Decision | Primary action | Must show | Must not | Done when | Now |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Market** `/market` | J-B01, J-B02 | Which Tools enter inspect / compare | Open a listing | Need ask; shortlist; listed price; Provider | Quote; Call; modality dests | Shortlist or honest no-fit | Compare dies on inspect. Indexed rows speak like Tools. No human no-fit. |
| **Listing** `/tools/…` | J-B02, J-B03 | Use this with my Agent, or leave | Continue with your Agent **or** Connect an Agent | Title, Provider, listed price ≠ Quote, readiness, unmet prerequisite | Reserve; Top up as commit | Actor can take this Tool into an existing Agent | Next action is copy-ref + “Connect an Agent first”. No Quote. Walk unpaid. |
| **Ask** `/t/…` | J-B01 | Which candidates to keep | Use this with your Agent | Same card facts as Market | Quote / Call tools for the human session | Shared thread cannot buy | Interactive-chat principal can purchase (EX-04 / JI-04b). |
| **Agents** `/agent-access` | J-B05 | Who may spend what | Connect or tighten grant | Agent, policy, limits, Tools | Credit as the grant | Actor can say “this Agent may spend this much on these Tools” | Works as a dest; easy to confuse with funding. |
| **Credit** `/owner/credit` | J-B06 | Add funds? | Add funds (quote first) | Available **and** reserved | Spending policy as a funding line | Actor refuses “I topped up, so it can buy” | Reserved hidden. |
| **Calls** `/activity` | J-B07 | Which Call to open | Open receipt | Call identity, Agent, Tool | Dashboard tiles | Actor finds the Call they mean | Exists. Easy to treat Overview as this page. |
| **Receipt** `/calls/$callRef` | J-B07, J-B08 | Cancel, reconcile, or accept | The one safe next action | Three statuses; who acts; help with this Call | Retry as a new Call | Leave and return to the same Call | Help `?callRef=` works; purpose often blank; resolution often presentation. |

Provider pages are a later group. Do not let them into this check.

---

## How to run the check

Give the person only the task. Do not name dests.

1. Describe a need and get three candidates you can explain.
2. Open one. Say whether it can be called, and what the listed price is **not**.
3. Compare two. Refresh. The two are still there.
4. Hand that Tool to an Agent that already exists. The Agent Quotes, then Calls.
5. Open the Call. Read delivery, payment, purchase. Get help without losing the ref.

If step 1–5 cannot be walked, dest-count and leftover-maps are the wrong work.

---

## What this file parks

[`ia-rationalisation-protocol.md`](./ia-rationalisation-protocol.md) (Market · Agents · Calls + supply mode) stays written. It is chrome. It runs after these seven pages pass the table above.

The eight-part package stays evidence. It is not the daily check. Screen specs that describe “what source puts on screen” are archaeology. This file is the contract those specs should have been.
