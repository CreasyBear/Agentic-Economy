# Walker 3 — Record / help pages

**Date:** 21 September 2026  
**App:** `http://127.0.0.1:3024`  
**Method:** code + browser + interpretation. No implementation.  
**Law:** [platform-experience-audit.md](../../designs/2026-09-21-platform-experience-audit.md) Results/repeat + eight-rule page contract; [buyer-journey-baseline.md](../buyer-journey-baseline.md) Calls + Receipt rows; CONTEXT — delivery ≠ payment ≠ purchase resolution; no fresh Call as retry after dispatch.

## How this walk was done

Isolated Cursor browser, signed out. Public pages (`/support`, `/support?callRef=call_test`, `/status`) were walked end to end. `/activity` and `/calls/$callRef` hit Clerk (`/sign-in?redirect=…`). No purchase, no account mutation, no invented credentials.

Signed-in empty Calls, populated rows, and found-receipt hierarchy are judged from current source plus the same-day local walk already recorded in the audit/register, plus unit tests that render those states. Where this session could not see pixels, the verdict says so.

Watched specifically: empty Calls’ good action stolen by monthly-summary error; receipt leading with IDs vs result.

---

## Group verdict

**Results and repeat — FAIL.** History, receipt and help do not yet agree on one job. The empty Calls action is real. A secondary money-summary failure still becomes the story. The receipt still leads with identity/IDs, not the result. Help can hold a `callRef` in the URL and then throw it away on the next click.

**Account and help — FAIL on continuity, PARTIAL on status.** `/status` can name a degraded system and keep service status separate from a personal Call. Its recovery title still says “Retry”. Help from status or from a receipt sign-in wall does not carry the reference the user already had.

---

## `/activity` — empty

### Job

Find what happened, or start the first Call. Decision: open a receipt, or go find a Tool. Primary action when empty: **Find Tools**.

### Code

- Route/loader: `src/routes/_operator/activity.tsx:40-63` — Calls are required; usage/spend may fail independently and still render the page as `available`.
- Empty + summary always stacked: `src/components/ae/activity/AeActivity.tsx:84-123` — `showEmptyNoCalls` renders `AeEmptyState`, then **unconditionally** mounts `ActivityMonthlySummary`.
- Summary error copy: `src/components/ae/activity/components/ActivityMonthlySummary.tsx:23-42` — “Some summaries are unavailable” + “A$0.00 affected — your account balance is unchanged.”
- Empty copy/action: `AeActivity.tsx:85-88` — title “No Calls yet”; action `Link` to `/market` labelled “Find Tools”.
- Filter bar hidden when empty: `useAeActivity.ts:337-338` — `showFilterBar` only if `pagination.items.length > 0`. Good.

### Visual quotes

From source and the same-day signed-in walk (audit §“Supporting failures become the main story”; register row 10):

> “No Calls yet”  
> “Find a Tool and complete one Call. Its task, outcome, amount, and receipt will appear here.”  
> **Find Tools**

Then, still on the first screen:

> This month  
> “Account-level Call and spend summary for 2026-09.”  
> “Some summaries are unavailable”  
> “Call history is still on this page. A$0.00 affected — your account balance is unchanged.”  
> **Refresh summaries**  
> Calls — · Completed — · Needs attention — · Account spend —

Unit test encodes the collision: `tests/unit/routes/operator-side-surface-recovery.test.tsx:128-148` expects both “No Calls yet” and “Some summaries are unavailable” on the same page.

This session’s browser: `/activity` → `/sign-in?redirect=%2Factivity`. Copy: “After you sign in, you’ll return to where you left off.” Path kept. No Calls chrome shown.

### Interpretation

The empty state is the one honest first-use composition in this group. The page then adds a four-tile month dashboard the baseline forbids (“Must not: Dashboard tiles”) and, when those tiles fail, a financial-impact paragraph. A person with no Calls has no balance event to reassure. Money language on an empty first-use screen is the Credit-page error escaping into history. “Find Tools” is visually a primary button; “Refresh summaries” plus a warning alert steal the same first screen.

### Verdict

**FAIL.** Empty action is PASS in isolation. The page as composed is FAIL: supporting summary failure becomes the story.

### Evidence

Code as cited. Same-day rendered walk in `2026-09-21-platform-experience-audit.md` and register row 10. Unit test asserts the bad pairing. This browser: auth wall only.

### Handoff

When `pagination.items.length === 0`, do not render `ActivityMonthlySummary`. If a summary read fails, keep one local, non-monetary line under the empty state or omit it. Do not mention A$0.00 or account balance on a page with no Calls.

---

## `/activity` — populated

### Job

Which Call to open. Must show Call identity, Agent, Tool. Primary action: open the receipt. Must not be a dashboard.

### Code

- Queues: `AeActivity.tsx:101-116` — “Needs attention” then “Recent Calls”; monthly summary still last.
- Row projection: `useAeActivity.ts:154-172` — `toolLabel`, agent short id (`principalRef.split(':').pop()`), `latencyMs` as `"142ms"`, amount, **state badge**, **purchase badge**, **payment line**, when, `receiptHref` `/calls/{callRef}`.
- Row UI: `ActivityCallQueue.tsx:34-128` — columns Task / Caller Agent / Duration / Amount / Status / Purchase status / When. Item action “Review” or “View receipt”.
- Three facts on the row: `ActivityCallQueue.tsx:74-91` — Status (delivery-ish Call state) + Purchase status + “Payment: Settled|Released|…”.
- Attention split: `useAeActivity.ts:238-244` — purchase `attention` vs routine. Contradictory completed+unknown payment stays open (`projectCallSummaryPurchaseStatus` in `call-receipt-view.ts:187-200`). That part is lawful.
- Filter/export chrome: `ActivityFilterBar.tsx` — status chips, date chips, CSV/JSON. Fine for a returning list; still extra chrome before the rows.

### Visual quotes

From unit render (`tests/unit/components/ae-activity-filters.test.tsx:124-191`; `operator-side-surface-recovery.test.tsx:153-172`):

> Needs attention  
> “Calls whose outcome still needs confirmation.”  
> Task · Caller Agent · Duration · Amount · Status · Purchase status · When  
> `alpha` / `142ms`  
> Completed · Resolved — delivered · Payment: Settled  
> Refused · Resolved — refunded · Payment: Released  
> Open — outcome uncertain  
> **Review** / **View receipt**  
> This month · Calls · Completed · Needs attention · Account spend  
> Exporting 2 records · CSV · JSON

This session: populated list **NOT CHECKED** in the browser (signed out).

### Interpretation

The list is a real Call list, not a vibe feed. Delivery / payment / purchase are present as three labels — that is the CONTEXT rule, on the row. The page still does not *explain* that they can disagree; it just prints three badges. Agent is an opaque short id. Duration in milliseconds is an implementation leftover. The month tiles remain a dashboard sitting under the job. There is no “get help with this Call” from the list.

Primary action per row is correct. The page-level primary is muddied by export and summary.

### Verdict

**FAIL on page contract (dashboard + hierarchy).** Row-level three-status and attention split are the good part. Populated pixels **NOT CHECKED** this session.

### Evidence

Source + unit tests as cited. Browser: auth wall.

### Handoff

Lead with the two queues. Demote or drop “This month” until a buyer asks for a statement. Replace `142ms` with a human duration or hide it. Show an Agent *name* if one exists; do not make the short id the cell. Keep the three status facts; add a one-line key only if they disagree. Do not add a new dest.

---

## `/calls/invalid-ref` and `/calls/call_test` — not-found / refused

Source pattern: tests use `call_test_123` (`tests/unit/operator-shell-chrome.test.tsx:366`). Both paths are the same owner receipt route. Missing Call → `kind: 'refused'`, `code: 'invocation_not_found'`, `retryable: false` (`call-recovery.functions.ts:25-30`, `call-receipt-view.ts:412-423`).

### Job

Understand that this reference has no owner-visible Call, keep the ref, take one safe next step (back to Calls, or help with *this* ref). Must not invent a retry as a new Call.

### Code

- Route: `src/routes/_operator/calls.$callRef.tsx:21-53` — loader `readOwnerCallStatusServer`; catch → `source_unavailable`. Pending title still “Call receipt”.
- Workspace chrome: `CallReceiptWorkspace.tsx:20-32` — h1 always **“Call receipt”**; action **Back to Calls** → `/activity`. Breadcrumb Calls → Call receipt. Description is machine status, not “this Call was not found”.
- Refused body: `CallStatusViews.tsx:124-153`, `178-203` — warning badge, then **`CallReceiptRef` (the ID)**, then playbook, then money facts, then a collapsed Technical record that shows the ID again.
- Not-found labels: `call-receipt-view.ts:99-116`, `412-423` — badge “Receipt not found”; “No owner-visible Call was found for this reference, or the current viewer is not its owner.”; `userNext` from `nextAction` or “Keep this reference and contact the owner or operator.”
- No help link anywhere in `src/components/ae/call-receipt/` (grep: zero `/support`). Baseline Receipt row: *Must show: help with this Call.*
- Unit: `tests/unit/routes/call-status-route.test.tsx:719-731` — opaque not-found stays inside the Calls workspace; heading remains “Call receipt”; “No current execution state is claimed”; Back to Calls.

### Visual quotes

**This browser (both URLs):**

> Sign in  
> “Use email, Google, GitHub, or a passkey. After you sign in, you’ll return to where you left off.”  
> URL: `/sign-in?redirect=%2Fcalls%2Finvalid-ref`  
> URL: `/sign-in?redirect=%2Fcalls%2Fcall_test`

Path survives sign-in. Help from that wall goes to `/support` **without** `callRef` (clicked from `call_test` redirect; landed `http://127.0.0.1:3024/support`, `hasCallTest: false`).

**Signed-in not-found (source + unit, not painted this session):**

> Call receipt  
> “The owner-scoped status read was refused; no current execution state is claimed.”  
> Receipt not found  
> `[copy Call reference]`  
> Diagnostic Playbook  
> “The receipt request was refused”  
> “No owner-visible Call was found for this reference, or the current viewer is not its owner.”  
> Financial impact (money movement copy)  
> Technical record (collapsed)  
> **Back to Calls**

No “This Call was not found.” No “Get help with `call_test`.”

### Interpretation

The error state is built like a receipt that failed to load, not like a missing object. The first thing you see is the title “Call receipt” and the raw id. Not-found and “you are not the owner” are one sentence. Financial-impact chrome appears on a Call that never existed. The one useful human action — help with this ref — is missing. Recovery does *not* offer a new Call (good; `retryable: false`). Back to Calls is the only exit.

### Verdict

**Auth wall: PASS for redirect path, FAIL for Help continuity.**  
**Signed-in not-found: FAIL** (IDs and playbook lead; no help-with-this-Call). Rendered not-found **NOT CHECKED** this session after sign-in.

### Evidence

Browser URLs and Help click as above. Source/tests as cited.

### Handoff

Title the barrier “Call not found” (or “No Call with this reference”). Lead with that sentence and **Back to Calls** / **Get help with this reference** (`/support?callRef=`). Put the copyable id second. Drop financial-impact playbook when there is no Call. Do not add a “try another Call” or a new dest.

---

## `/calls/$callRef` — found receipt (source; not painted this session)

Needed because the watch was “receipt leading with IDs vs result,” and the found path is where that hierarchy lives.

### Job

Obtain the result and understand current status. Decision: accept, cancel, or reconcile *this* Call. Must show delivery / payment / purchase as three facts. Must not retry as a new Call after possible dispatch.

### Code — order of first screen

`CallStatusFoundView` (`CallStatusViews.tsx:96-120`):

1. `CallSummarySection` — badge + “Call summary” + identity facts **first** (`CallSummarySection.tsx:29-36`, `49-85`): Tool at Call, Provider at Call (`"{providerRef} (name not recorded)"`), Agent, **Purpose: “Not recorded for this Call”**, then buyer amount, recorded time, Purchase status, Outcome record.
2. Diagnostic playbook if issue (`CallReceiptPrimitives.tsx:39-74`) — retained reference (ID) in the header, then financial impact.
3. `CallRecoveryPanel` — “Resolve this Call”; refresh/cancel/reconcile stay on `callRef` (`CallRecoveryPanel.tsx:84-88`).
4. **Then** “Current result” / `CallOutputSection` — output is `JSON.stringify(result.output)` (`CallTechnicalRecord.tsx:126-132`).
5. `CallMoneyFacts` — “Money before and after the call” with machine labels (`chargeState`, `refundState`, `lossState`).
6. `CallReuseActions` only if `complete` — “Review Tool”; prompt says “Do not replay ${callRef} as a new Call.” (`CallTechnicalRecord.tsx:135-161`).
7. Collapsed Technical record — more IDs, timeline, `ae status ${callRef}` (`suggested-next-action.ts:173-178`: “Reuse the recorded Call identity before retrying.”).

h1 is always “Call receipt”, never the Tool or the outcome (`CallReceiptWorkspace.tsx:22`).

Unit (`call-status-route.test.tsx:100-148`, `178`): heading “Call receipt”; Purpose “Not recorded for this Call”; output shown as `"temperature": 24`.

### Visual quotes (source / unit)

> Call receipt  
> Call summary  
> “The outcome and buyer-facing money facts for this exact Call.”  
> Tool at Call · Provider at Call · `provider:weather:one (name not recorded)` · Agent (current label) · Purpose: **Not recorded for this Call**  
> Purchase status · Outcome record  
> Resolve this Call  
> Output — `{ "temperature": 24 }`  
> Money before and after the call  
> Use this Tool again — “This receipt will not be reused.”  
> Technical record

### Interpretation

The page is a dossier. The result is below recovery and money. Purpose is structurally blank. Provider is a ref. Purchase status is a presentation label (`projectFoundCallPurchaseStatus`) — baseline already says “resolution often presentation.” Three facts exist but are not a first-screen trio of delivery / payment / purchase; they are buried in summary + money + badges. Safe retry on the same `callRef` is implemented. “Help with this Call” is not. Leading with IDs/identity is the register’s exact unassessed risk, now visible in source.

### Verdict

**FAIL** on hierarchy and help. **PASS** on “no fresh Call after dispatch” in the reuse/recovery copy. Found-state pixels **NOT CHECKED** this session.

### Evidence

Source and unit test as cited.

### Handoff

Lead with: Tool name, result or honest “no result yet”, then the three statuses (delivery / payment / purchase) as three facts, then the one safe action. Purpose: hide if unrecorded. IDs, JSON, timeline, CLI: details. Add **Help with this Call** → `/support?callRef=`. Do not add a second “run again” that looks like retry of the same dispatch.

---

## `/support`

### Job

Find help for the current problem. Distinguish a Call problem from service status and from Provider setup. One next step.

### Code

- Route: `src/routes/support.tsx:9-34` — public; `validateSearch` keeps `callRef`.
- Page: `AeSupportHelpPage.tsx:12-34` — header action **Email support**; body: optional banner, then status rail, agent connection, private support.
- Status rail: `SupportStatusSection.tsx:7-21` — “Continue from the current status”; **Open Calls** (filled) → `/activity`; **Continue Provider setup** → `/owner/operations`; **Review account credit** → `/owner/credit`. Copy talks about “the original Call” even when none is present.
- Agent: `AgentConnectionSection.tsx:11-27` — Review agent setup + CLI `ae doctor`.
- Private: `PrivateSupportSection.tsx:10-32` — email instructions; public GitHub issue.

### Visual quotes (browser, `http://127.0.0.1:3024/support`)

> SUPPORT  
> Help  
> “Keep the request or Call reference shown with the problem. It helps us find the right record without asking you to share private inputs.”  
> **Email support** → `mailto:support@aecon.ai` (no subject)  
> Continue from the current status  
> “The original Call shows its current status and next action. If the result is uncertain, check that Call before trying again.”  
> **Open Calls** · Continue Provider setup · Review account credit  
> Agent connection  
> “Connection and spending permission are separate.”  
> Review agent setup · Advanced connection diagnostics  
> Contact support privately  
> “Do not include credentials, raw inputs or private results.”

Display face terminals on “Help” / “Support” read like extra letters in the screenshot (Iceinvein / `font-display` in `AePageHeader.tsx:19-21`). Accessibility tree has no live Call object because there isn’t one — but the copy pretends there is.

### Interpretation

A person who opened Help from the footer gets a switchboard: email, Calls, Provider onboarding, credit, agent CLI. The filled **Open Calls** in the body competes with filled **Email support** in the header. Provider setup on a buyer help page is the navigation-meaning leak (S3). The page tells you to keep a reference, then does not show one.

### Verdict

**FAIL.** No single job. Buyer/Provider/account mixed. Copy assumes a Call that is not on the page.

### Evidence

Full-page screenshot `audit-support.png`; a11y snapshot; CDP hrefs.

### Handoff

One first step for a generic visit: email, or “check system status”, or “open your Calls” — not all three plus Provider. Move Provider setup off this page or under a clearly labelled Provider branch. Do not say “the original Call” unless a `callRef` is present.

---

## `/support?callRef=call_test`

### Job

Help with **this** Call. Keep the ref. Open that receipt, or email with the ref already filled. Do not start a new Call.

### Code

- Banner: `ReferencedCallBanner.tsx:3-8` — plain div, text `Referenced Call: {callRef}`. Not a link. No role. Not in the a11y tree as a name.
- Email: `useSupportHelpPage.ts:5-8` — `mailto:support@aecon.ai?subject=Help with Call call_test&body=I need help with Call reference: call_test…`
- “Open Calls” still `/activity` (`SupportStatusSection.tsx:15`). Does not go to `/calls/call_test`.
- Clicked **Open Calls** from this page → `/activity` → `/sign-in?redirect=%2Factivity`. **`call_test` dropped.**

### Visual quotes (browser)

> Referenced Call: call_test  
> (same three buttons) **Open Calls** · Continue Provider setup · Review account credit  
> Email href: `mailto:support@aecon.ai?subject=Help%20with%20Call%20call_test&body=I%20need%20help%20with%20Call%20reference%3A%20call_test…`

Banner sits between Email support and “Continue from the current status.” It looks like a chip, not an object you can open. The page still does not show delivery / payment / purchase for that Call.

### Interpretation

Baseline: “Help opens with the same ref.” The URL and the mailto do. The human path does not. The banner is a label, not a door. Open Calls is the visually dominant body action and it throws the ref away at the auth wall. This is the interrupted-journey failure: you arrived with the object, the page acknowledged it, then offered a list that forgot it.

### Verdict

**FAIL.** Ref is displayed and emailed; it is not used as the next destination.

### Evidence

Screenshot `audit-support-callref.png`; CDP (`bodyHasCall: true`, mailto with subject); Open Calls click → `redirect=/activity`.

### Handoff

When `callRef` is present: primary action **Open this Call** → `/calls/{callRef}` (sign-in may wrap it; redirect must keep `/calls/call_test`). Banner should be that link. Hide Provider setup and credit on this state. Keep mailto as the secondary “I still need a person” action.

---

## `/status`

### Job

Is the service down, or is my account/Call the problem? Primary action: refresh, or go to the matching recovery (Calls if Call-safety is degraded, Help otherwise).

### Code

- Route: `src/routes/status.tsx`.
- Title: `statusPageTitle` — “Some systems are degraded.” / “All systems operational.” (`system-status.contracts.ts:121-127`).
- Checks: Website, Tool API, Machine discovery, Release identity, Catalogue freshness (`StatusCheckList.tsx`).
- Recovery only if degraded (`useSystemStatus.ts:21`): if degraded set includes `market` or `release` → “Check existing calls before retrying” / Open Calls; else “Retry after the affected system recovers” / Help (`system-status.contracts.ts:98-118`).
- Market degraded copy: ` -status.functions.ts:67-71` — “New Calls may fail. Check existing Calls before retrying.” Lawful.
- Catalogue degraded today: freshness fail, request ref attached (`-status.functions.ts:51-53`).

### Visual quotes (browser, `http://127.0.0.1:3024/status`)

> Some systems are degraded.  
> “Live checks for the public site and shared agent interfaces. Individual Tool readiness is shown in the catalogue and on each Tool page.”  
> **Refresh status**  
> Website — Public pages are responding. — Operational  
> Tool API — Tool search and new Calls are ready. — Operational  
> Machine discovery — Agents can discover the current AE interfaces. — Operational  
> Release identity — Deployment identity is available. — Operational  
> Catalogue freshness — “The catalogue is stale, absent, or its last refresh failed. Tool listings may be out of date.” — **Degraded**  
> Request reference `b1efa4b5-0b67-4b09-b1b6-aa58b67d1b4b` (copy)  
> Retry after the affected system recovers  
> “Refresh status first. If the problem continues, report it with any request reference shown above.”  
> **Help**  
> “Status checked. 1 of 5 systems needs attention: Catalogue freshness. Last checked Sep 21, 2026, 8:39 AM UTC.”

Help click from the recovery panel: URL became `/support` with **no** request reference (same pattern as the Call ref).

### Interpretation

This is the clearest page in the set. Five checks, one degraded, one recovery. Catalogue vs personal Call is distinguishable. The recovery title **“Retry after the affected system recovers”** still sounds like retrying a Call, while Tool API simultaneously says “new Calls are ready.” A buyer mid-uncertainty should not hear “retry.” Help does not take the request ref the page just told them to report.

### Verdict

**PARTIAL.** Status job works. Recovery wording and Help continuity fail the copy rules and S5.

### Evidence

Screenshot `audit-status.png`; a11y snapshot; Help click → `/support` without the UUID.

### Handoff

Rename recovery for non-Call probes: “Report this status” / “Check again”, not “Retry.” Pass the request ref into `/support` (query already exists for `callRef`; a status ref can be a second param or the email body). Keep “do not repeat an uncertain Call” only when market/release is actually degraded.

---

## Cross-page

| Rule | Observed |
| --- | --- |
| History, receipt, help agree on names/status | No. List uses Task/Status/Purchase/Payment. Receipt uses Call summary + playbook + machine money. Help says “the original Call” and does not show status. |
| Output easy to find | No. Found receipt puts JSON output after recovery. Not-found leads with id. |
| Repeat ≠ recovery | Source PASS on same-`callRef` refresh/reconcile and “Do not replay”. Help/status “retry” language fights that. |
| Details secondary to outcome | FAIL. IDs, purpose-blank, provider refs, month tiles, CLI doctor. |
| Help opens with the same ref | URL/mailto yes. Open Calls, status Help, sign-in Help: no. |
| No fresh Call after dispatch | Recovery/reuse copy respects it. Status “Retry…” and Help “before trying again” do not. |
| S5 context survives | Receipt path survives sign-in. `callRef` and status request ref do not survive Help/Open Calls. |

Display titles on Help/Status (`font-display` ExtraLight) have terminals that screenshot as extra letters. Secondary to the job failures; still a readability risk on the two public pages in this group.

---

## Handoff (smallest corrections, journey order)

1. **Empty Calls:** stop mounting the month summary (and its A$0.00 alert) when there are no Calls. Keep “No Calls yet → Find Tools.”
2. **Receipt first screen:** result (or “not found” / “no result yet”) before IDs. Hide blank Purpose. Three statuses together. **Help with this Call** → `/support?callRef=`.
3. **Help with a ref:** primary **Open this Call**; do not send **Open Calls** and drop the ref. Hide Provider/credit on that state.
4. **Status recovery:** no “Retry” unless market/release is down; carry the request ref into Help.
5. **Populated Calls:** demote month tiles; humanise duration/Agent. Do not add destinations.

A later signed-in pass still owes: real empty pixels, a real populated row click-through, and a real `invocation_not_found` paint after Clerk. Source already shows those states will fail the same contracts.
