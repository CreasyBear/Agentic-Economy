# Buyer experience baseline: page checklist

**Reset with Joel, 21 September 2026.** This replaces the broad technical-priority register as the immediate UX worklist. Authority: [PRODUCT.md](../../PRODUCT.md). Requirements and critique: [buyer experience baseline](../designs/2026-09-21-platform-experience-audit.md). How we work: [ux-coverage-protocol.md](./ux-coverage-protocol.md) — **by pass, every page, then rewalk**. Journey proof (last): [buyer-journey-protocol.md](./buyer-journey-protocol.md). This file is evidence of what was seen. It is not the work queue. Site/group/page law: [buyer-journey-baseline.md](./buyer-journey-baseline.md).

The question is: **Can the customer understand this page, do its job, and reach the next useful destination?** Start with the buyer journey. Do not score backend sophistication, catalogue size or test counts as UX completion.

**PASS** = demonstrated for the stated state; **FAIL** = observed violation or explicit heuristic judgment with evidence; **NOT CHECKED** = no usable rendered evidence. These are page acceptance judgments, not production incident severities. Each row also inherits site rules S1–S7 and the eight page rules in the baseline. No composite score.

## Site and page-group checks

| Level | Required result | Current judgment | Correction |
| --- | --- | --- | --- |
| Site purpose | Visitors understand what they can do and where to start | PARTIAL: visible search and capability proposition; raw API metadata undermines the customer-facing presentation | Make the same outcome-first language run from hero through cards, detail and result. |
| Site navigation | Buyer destinations have stable, distinct meanings | FAIL, design judgment: My tools denotes Provider inventory while Saved is a buyer concept | Make Provider context explicit; preserve existing paths while reviewing label/placement. |
| Discover/decide group | Need → candidates → understandable detail → choice | FAIL in local walk: featured Suede card opens unavailable detail | Restore the ordinary inspection path; apply the card/detail contracts below. |
| Set up/use group | One missing prerequisite at a time, then return to choice | FAIL, hierarchy judgment: Agents first-use presents two apparent start points; complete return not demonstrated | One first-use path; clear success and selected-Tool continuation. |
| Results/repeat group | Find result and repeat without reconstructing work | PARTIAL: Calls empty state works; populated result/repeat path not checked | Keep the good empty action; demonstrate populated list → result → repeat. |
| Account/help group | Supporting tasks are clear and locally recoverable | FAIL in local walk: Credit does not load; generic Call warning unrelated to this visit | Restore loading and use task-specific error copy. |
| Provider group | Clear separate entrance, consistent list/add/detail journey | PARTIAL from prior walk/source; not the first buyer UX assignment | Apply the same page contracts after the buyer path. |

## Buyer pages — review in this order

| Page / state | Job and mandatory content | Primary action → successful next state | Current assessment / smallest correction |
| --- | --- | --- | --- |
| **1. Market entry** `/market` | Start finding a capability. Clear proposition, prominent need search, useful examples; browsing is optional. | Search → results for that need | PASS for visible search/entry; PARTIAL for hierarchy. Large promotion, duplicate search entrance and multiple browsing layers dilute focus. Keep search dominant and secondary paths recognisable. |
| **2. Results / collection cards** Market views | Decide which Tool deserves inspection. Consistent capability title, concise outcome, Provider, useful price basis; appropriate filters and empty state. | Open Tool → detail with search retained | FAIL, observed content/hierarchy: truncated source prose, raw output keys, payment-option counts and uneven card/action positions. Standardise the existing card projection; make opening an item explicit; Save/Compare secondary. |
| **3. Compare** existing dialog | Choose between shortlisted Tools. Same meaningful attributes/units, clear missing facts, readable side-by-side differences. | Inspect chosen Tool → selected detail | NOT CHECKED rendered this pass. Source shows a seven-row table and long preliminary-facts preamble. Simplify the explanation and validate whether the rows answer the actual choice; do not invent quality or exact prices. |
| **4. Tool detail** existing Tool routes | Decide whether and how to use one Tool. Contribution, inputs/output, Provider, price basis, relevant limits, one state-appropriate continuation, Back to results. | Continue with existing Agent or connect only if needed → same selected Tool ready to use | FAIL in local walk: Suede card leads to an unavailable notice. Normal detail not rendered. First restore inspection; then make the decision summary and action the first layer, technical contract secondary. |
| **5. Saved** Market Saved view | Resume a shortlist. Recognisable saved items, remove/open, meaningful empty action. | Open saved Tool → current detail | NOT CHECKED. Verify save → navigate away → return → open; agree persistence expectations. No new standalone Saved route needed by default. |
| **6. Agents: first use** `/agent-access` | Connect the app the buyer already uses. App choice, ordered steps, current progress, connection check, completion and task return. | Complete the shown connection procedure → connected state → selected Tool/Market | FAIL, rendered hierarchy: Connect New Agent and the expanded Codex instructions read as competing starts. Make their relationship explicit or use one entry. Keep alternate apps secondary and accessible. |
| **7. Agents: returning** same route | See existing Agents and manage access. Name, app, connection/access state, relevant spending controls. | Manage an existing Agent or connect another → updated list | NOT CHECKED with connected data. Do not show first-use installation as the main content for an established account. |
| **8. Access review** `/agent-access/authorize` | Understand and accept/decline a specific request. Who, which account, requested access/limits, consequence. | Approve/decline → explicit outcome and return | NOT CHECKED. Keep request facts together; label the consequence; do not force this screen into already-authorised routine use. |
| **9. Credit** `/owner/credit` | Know available credit and add it when needed. Balance, amount, applicable fees/total, status and return; history secondary. | Add credit through existing flow → confirmed state → original task | FAIL in local walk: page-level load error, repeated error text and irrelevant “before repeating a Call” warning. Restore the basic read; use one local error explanation. Normal funding state not checked. |
| **10. Calls: empty/list** `/activity` | Find what happened or start first use. Empty action OR identifiable rows with Tool, time, outcome and amount. | Find Tools when empty; open Call when populated → appropriate destination | PASS for “No Calls yet → Find Tools.” FAIL, relevance judgment: a secondary summary error introduces account-impact caveats into first use. Keep summary failure local and secondary. Populated rows not checked. |
| **11. Call result** `/calls/$callRef` | Obtain the result and understand current status. Tool, result/status, amount, date; valid next action; receipt/help secondary. | View/use output, or supported recovery → useful outcome | NOT CHECKED with a populated Call. The page must lead with the result; raw IDs, technical history and financial explanation must not displace it. |
| **12. Chat discovery** existing chat routes | Describe a need and reach a Tool choice. Need, relevant candidates, useful clarification and selected-Tool continuation. | Open/choose Tool → same detail/use journey | NOT CHECKED this pass. It must converge on the same journey; a second vocabulary or ambiguous “I can do it” promise fails the contract. |

## Supporting pages — same contract, second pass

| Page/group | Mandatory job/content/action | Acceptance check |
| --- | --- | --- |
| Sign-in and onboarding | Establish only the identity/workspace information needed now; say why; preserve intended destination | Back retains edits; errors retain input; completion returns to the intended task. Prior source inspection found workspace-name overwrite on Back → Continue: fix within the existing hook. |
| Settings / team / workspace | Make personal vs workspace scope explicit; group related controls; clear save/cancel/return | Users can predict whose setting changes and see the saved result without losing their previous task. |
| Help / status | Find help relevant to the current problem; distinguish service status from personal account problems | A blocked user reaches a usable support or recovery path without pasting secrets or reconstructing the whole journey. |
| Provider entry / workspace | Make “manage Tools you provide” explicit; show next setup action or owned Tool inventory | Buyer does not mistake it for saved/connected Tools; Provider can find add, edit and status. |
| Add Tool / Provider detail | Ordered source → describe → review → publish; then public listing/status and maintenance | Required fields have a real purpose/save contract; edits survive Back; success links to a meaningful destination. Existing ABN/save and recovery defects remain in the Provider annex. |
| Provider earnings | Understand earnings/payout state and reach hosted payout controls | One clear summary and action; complete vs partial history explicit; no custom payment setup. |

## Minimum page review card

Use this inside an implementation task, not another standalone register:

```text
Page / state:
User's job:
Arrives from, carrying:
Must see to decide:
Primary action and what happens:
Success destination:
Back / cancel / interrupted return:
Loading / empty / error behaviour:
Move or remove:
Observed result: PASS / FAIL / NOT CHECKED + evidence
```

## Concrete first assignment

**Stage FIND** in [buyer-journey-protocol.md](./buyer-journey-protocol.md). One lead, one freeze, Market + cards + compare + listing (+ chat cards) together. Task used to prove the stage: **“Find an image-generation Tool, understand its price and output, and use it with my existing Agent.”** Do not farm each FAIL to a different owner.

Then repeat with an existing Agent and with a interrupted return. A page is accepted when the user can complete its job without a reviewer explaining the UI. Keyboard/compact checks cover the same task. Backend tests still protect behaviour, but do not close these page requirements.

## Evidence and retained technical work

Fresh local inspection: Market, Suede image Tool detail, Agents first-use, Calls empty, Credit error, 21 September 2026. No purchase, connection, funding or account mutation. Normal unavailable pages and populated states are explicitly unassessed. No new automated tests were run for this document correction.

Earlier technical evidence remains in [buyer](../improvements/2026-09-21/platform-experience/buyer.md), [Provider](../improvements/2026-09-21/platform-experience/provider.md) and [structure](../improvements/2026-09-21/platform-experience/structure.md) annexes. Their prior EX-01–EX-12 cross-journey index is superseded as the immediate UX worklist. Existing JI/W/DS owners retain already-owned implementation work; this reset establishes the simple experience bar first.
