# Buyer-spine stabilisation plan

Status: queue · Date: 2026-09-21 · Owner: Joel · Method: one bounded change per subagent, narrow verify, commit per change. Evidence classes: LIVE (observed on local stack today), SOURCE (file:line), DOC-CLAIM.

## 0. Baseline landed today

| hash | subject | what it proves |
|---|---|---|
| `7a4261113` | docs baseline | Documentation baseline landed. |
| `6454a06cc` | tools baseline | Tools baseline landed. |
| `e2a6dc613` | domain baseline | Domain baseline landed. |
| `ca8a1f4b5` | ui baseline | UI baseline landed. |
| `ac5107dfa` | market: Compare in URL | MKT-01 cleared LIVE. |
| `e48e6d139` | typecheck red cleared | Typecheck errors fell from 11 to 0. |
| `10bf9ab02` | market: Compare carried across navigations | FR-05 landed. |
| `9ea8c6337` | tools: dev:sign-in-url | A one-time signed-in URL can be printed locally. |
| `e9242e5d5` | market: found_upstream detail fallback | An upstream Market row can reach Tool detail. |
| `0131df4ba` | root: signed-in Convex client | CRD-03/C-01 crash cleared LIVE: `/owner/credit` H1 Credit, `/owner/team` H1 Team. |
| `e59b5af26` | market: detail degrades in place | Whole-page collapse cleared LIVE. |

`npm run typecheck` = 0 errors. Known pre-existing red: `tests/unit/market/directory-index-discovery.test.tsx › preserves all source-ranked entries…` because two landmarks are named “Popular Tools”.

Local stack: `npm run dev:local` on Node 22, with Convex on 3210 and Vite on `127.0.0.1:3024`. `npm run -s dev:sign-in-url` prints a one-time signed-in URL. Local Convex now has `AE_CHAT_PROXY_SECRET` and `AE_SITE_URL` mirrored by hand. The launcher gap remains in §7. The directory index scan completed mid-session with 15,141 rows.

## 1. Platform in concert: themes and decisions

### T1 Two catalogues shown as one Market

**EVIDENCE**
- MKT-02: “no indexed-vs-callable marker”.
- LST-02: “Market DOM contained zero `operation:v1:` strings”.
- ASK-01/ASK-02: “no verified tool is available here that can turn product photos into lifestyle images” while Market visibly listed image Tools.
- AGT-05: “All admitted Tools” is granted before any Tool is shown or chosen.

**DECISION:** Every Tool surface derives one callable state from the index join `toolRef` presence: `Callable by Agents` vs `Listed, not yet callable`. Market cards and the detail header show it; Ask states which catalogue it searched and, when no callable Tool fits, says how many listed-not-callable Tools Market has for the need and links to that Market search. Investigation task first (discovery seam), then card marker, then Ask copy.

### T2 Dead destinations

**EVIDENCE**
- LST-01/EX-01: “45/45 generic Market hrefs equally unavailable” LIVE before the fixes.
- DETAIL-JOB: “No working public detail existed”.
- DetailUpstreamFallback follow-up: admission returned `source_unavailable` from `prepareX402DirectoryResourceServer`; the cause was previously swallowed at `x402-directory.functions.ts:14-15`.

**DECISION:** FIXED for the row (found_upstream) and the collapse (inline readiness). Remaining: read the now-logged degrade cause on the dev server and fix the readiness probe's local failure; then re-roast detail with a resolving Tool.

### T3 The shareable view must survive navigation

**EVIDENCE**
- MKT-03: “switching image-generation results to Providers changed the URL from `query=image+generation&view=tools&compare=…` to `view=providers&compare=…`”; compared refs hydrate only from the current result pool at `AeX402Directory.tsx:124-133`.
- MKT-06: “mobile comparison tray is flow content after all results”.
- ACT-03: “Agent-scoped Calls become an invisible constraint”.
- GATE-01: “exact work survives redirect and refresh”. PASS.

**DECISION:** FIXED for Compare in URL and carried across navigations. Remaining: tabs are views of the same search (carry `query` on tab change); the Market route loader resolves `compare` refs server-side so the tray hydrates independently of results; Activity always renders the Agent scope chip with a clear action; mobile tray docks near the results header.

### T4 One vocabulary, everywhere

| concept | seen, verbatim | page | canonical replacement |
|---|---|---|---|
| Tool | “Task” | Calls | Tool |
| Agent | “Caller Agent” | Calls | Agent |
| Purchase resolution | “Purchase status” | Calls | Purchase resolution |
| Grant decision | “Connect agent” | Agents | Approve access |
| Grant review | “Connect Roast Authorization Probe” | Agents | Review access for Roast Authorization Probe |
| Direct key | “Legacy credential” | Agents | Direct key |
| Agent count | “1 agents” | Agents | 1 Agent |
| Grant duration | “Stays signed in until in 7 days” | Agents | for 7 days after approval |
| Money | “AUD 1.000000” | Agents | A$1.00 |
| Credit | “Available Balance”, “Open Balance” | Credit, Overview | Credit; Available, Reserved, Total |
| Human thread action | “call”, “binding Quote” | Ask | compare and give to an Agent |
| Listed price | “TOTAL PRICE” | Ask | listed price |
| Credit use | “Uses your AE balance” | Ask | remove from the human thread |
| Support | “Help” | Support | Call |
| Provider destination | “Provider workspace” | Credit sign-in gate | Credit |
| Receipt access | “owner-scoped status read” | Receipt | We couldn’t open this Call for this workspace |

**DECISION:** apply replacements page by page inside each page's wave; no global find-replace.

### T5 One pattern per repeated thing

**EVIDENCE**
- PatternInventory §1: seven Tool card or row components use six different field orders.
- PatternInventory §3: 18 status vocabularies exist beside canonical `status-presentation.ts`.
- PatternInventory §4: 30 `<AeEmptyState>` renders coexist with 38 bespoke matching branches.
- PatternInventory §5: all nine page components use a shared header pattern.
- PatternInventory §6: navigation is defined by three systems.

**DECISION:** converge as pages are touched, not big-bang: Tool summaries take `directory-card.view-model.ts` as the single projection with `provider → title → callable state → listed price → one action`; status labels map to `status-presentation.ts` and bespoke sets are deleted when their page is in a wave.

### T6 Focus visibility

**EVIDENCE**
- KB-01: the detail escape action had `outline-style:none` and `box-shadow:none`.
- ASK-FOCUS: Send had “no painted focus change”.
- FOCUS-01: Email support had “no ring”.
- CRD-05: Try again was the 12th Tab stop and had no distinct outline.
- RCP-04: primaries had “no visible outline/ring”.
- AGT keyboard check: visible ring PASS on `/agent-access`.

**DECISION:** one fix in Tier-1 `src/components/ui/button.tsx` (and link-styled buttons via `buttonVariants`): a visible `focus-visible` ring; then each page's keyboard check re-runs.

### T7 Connection, grant and Credit stay distinct

**EVIDENCE**
- AGT-01: “+ Connect New Agent” and “Start the connection” compete.
- AGT-02: a grant decision is labelled “Connect agent”.
- AGT-03: the row hides per-Call, daily and Tool scope.
- AGT-05: “All admitted Tools” is granted unseen.
- CRD-01: the Credit gate promises “your Provider workspace”.
- C-05: “Authority / Work within limits / spending permission” and “Available Balance / Open Balance” fracture the model.

**DECISION:** one start on Agents (`Create Agent`; OAuth connect is a path inside it, not a peer CTA); a grant is approved, never "connected"; Tool scope is chosen before a key is issued; Credit page never mentions authority; sign-in gate classifies `/owner/credit`, `/activity`, `/calls/*` as buyer destinations by name.

### T8 Chrome and IA

**EVIDENCE:** RoastChromeInConcert measured a repeated Market · Agents · Calls · My tools quartet, `/market` beside `/owner/market` and `/owner` Overview, two mobile navigation models, and an unmarked Supply mode.

**DECISION:** PARKED by decision (`ia-rationalisation-protocol.md:3-8`) until the seven spine pages pass. No chrome tasks belong in §3.

### T9 Local stack truth

**EVIDENCE**
- EnvGaps §1: the index is unavailable until an active generation reaches sticky `terminalObserved`; the launcher starts an asynchronous scan.
- EnvGaps §2: anonymous chat requires matching 32+ character `AE_CHAT_PROXY_SECRET` values on web and Convex, then a non-empty Convex `OPENROUTER_API_KEY`.
- EnvGaps §3: `AE_SITE_URL` accepts loopback but seeds only a discovery, pricing and Quote fixture.
- LocalChatEnv: chat returned 503 until `AE_CHAT_PROXY_SECRET` was mirrored; `dev-seed-fixture.ts:142` requires HTTPS while `devSeedFixtures` accepts loopback.

**DECISION:** launcher mirrors `AE_CHAT_PROXY_SECRET` (and `OPENROUTER_API_KEY` when present) onto Convex exactly as it does `AE_SOURCE_WRITE_SECRET`; dev-seed accepts the loopback origin it documents; launcher prints index scan state.

## 2. Page cards

### Market `/market`

**Job:** Turn a need into an inspectable, comparable Tool shortlist.

**Verdict today:** FAIL LIVE. **Laws failing:** L4, L5, L6, L7.

| ID | severity | what | evidence fragment, verbatim | anchor | status |
|---|---|---|---|---|---|
| MKT-01 | P0 | Compare previously threw before selection. | “MKT-01 is cleared” | UNANCHORED | FIXED today |
| MKT-02 | P1 | Cards do not show callable state. | “no indexed-vs-callable marker” | `DirectoryToolCard.tsx:39-61` | OPEN |
| MKT-03 | P0 | Tabs drop query and compared Tools depend on current results. | “returning to Tools produced the 15,138-Tool catalogue and no tray” | `AeX402Directory.tsx:124-133,230-234` | OPEN |
| MKT-04 | P0 | Unrelated partial matches are presented as a fit. | “`zzqx plumbing quantum` returned ‘17 matching Tools’” | UNANCHORED | OPEN |
| MKT-05 | P1 | Providers view could not load. | “Provider catalogue temporarily unavailable” | `AeX402Directory.tsx:329-335` | OPEN |
| MKT-06 | P1 | Mobile comparison tray is buried. | “document position ~6845px on a 7366px page” | `AeX402Directory.tsx:188-193,336` | OPEN |
| MKT-07 | P2 | Generic hero competes with the shortlist job. | “Tools for what’s next.” | UNANCHORED | OPEN |
| MKT-08 | P2 | Comparison price overwhelms the decision. | “seven atomic-unit/address strings” | UNANCHORED | OPEN |

**Language:** “Tools for what’s next.” → “Find the right Tool.”; “Explore capabilities.” → “Compare Tools.”; “Used recently by other agents” → “Recent Agent Calls”; “Keep a few possibilities close” → “Keep a Tool shortlist”.

**Acceptance walk**
1. Search an exact need and see Provider, callable state, listed price and one action on every Tool card.
2. Select two Tools, switch Tools and Providers, use Back and refresh, and retain query, view and both selections.
3. Open the comparison tray near the results header on 390px mobile and inspect both Tools without scrolling to page end.
4. Search `zzqx plumbing quantum` and receive an honest no-fit with a useful next action.

**Reference pattern:** Stripe Marketplace and Apple App Store keep identity, purpose and one action together, then return to preserved search context.

### Tool detail `/tools/$providerHost/$slug`

**Job:** Decide whether to give this Tool to an existing Agent or leave.

**Verdict today:** FAIL LIVE. The pre-fix roast found 45/45 unavailable; row fallback and inline degradation landed, but a resolving Tool is not yet proven. **Laws failing:** L1, L2, L3, L4, L5, L6, L7.

| ID | severity | what | evidence fragment, verbatim | anchor | status |
|---|---|---|---|---|---|
| LST-01/EX-01 | P0 | Market rows opened generic unavailable pages. | “45/45 generic Market hrefs equally unavailable” | `DirectoryToolCard.tsx:42`; `tools.$providerHost.$slug.tsx:18-19` | FIXED today |
| DETAIL-JOB | P0 | A resolving detail still needs proof. | “No working public detail existed” | `AeDirectoryToolCanonicalPage.tsx:17-35` | OPEN |
| LST-02 | P1 | Detail lacks a copyable Tool reference. | “Market DOM contained zero `operation:v1:` strings” | `directory-card.view-model.ts:42-55`; `DirectoryToolCard.tsx:47-52` | OPEN |
| NF-01 | P1 | Unknown Tool collapses into transient outage copy. | “it does not use the implemented unknown-listing copy” | `AeDirectoryToolCanonicalPage.tsx:64-74` | OPEN |
| KB-01 | P2 | Escape action has no visible keyboard focus. | “outline-style:none and box-shadow:none” | UNANCHORED | OPEN |

**Language:** “NOTICE” → remove; “Tool details are unavailable” → “This Tool is unavailable”; “AE cannot verify the current directory entry right now.” → “We can’t verify this listing. Try another Tool.”; missing Tool → “This Tool is unknown or no longer listed”.

**Acceptance walk**
1. Open a Market Tool and see identity, Provider, callable state, readiness, prerequisites and listed price.
2. Copy its `operation:v1:` reference and confirm it remains the same after refresh.
3. Give the Tool to an existing Agent or leave through one clear action while Back preserves Market context.
4. Open an unknown slug and see a distinct unknown-or-no-longer-listed state.

**Reference pattern:** npm leads with package identity and one copyable install reference; Stripe stages install, permissions and confirmation.

### Ask `/t/$threadId`

**Job:** Identify Tool candidates to keep. The human thread cannot buy.

**Verdict today:** FAIL LIVE after signed-in retry. First visible answer token was 25.9s. **Laws failing:** L1, L2, L3, L4, L6, L8, L9.

| ID | severity | what | evidence fragment, verbatim | anchor | status |
|---|---|---|---|---|---|
| ASK-AVAIL | P0 | Anonymous chat depends on manually mirrored Convex env. | “Chat is unavailable right now. Your message was not added.” | `src/routes/api.chat.anonymous.ts:149-165` | OPEN |
| BLOCKED-ENTRY/ASK-05 | P0/P1 | Market exposes no Ask entry. | “no Ask control or `/t/new` href” | UNANCHORED | OPEN |
| ASK-01/ASK-02/EX-04/JI-04b | P0 | False no-fit and execution language contradict Market. | “no verified tool is available here that can turn product photos into lifestyle images” | `ChatTranscript.tsx:103-110`; `ToolCard.tsx:139-199`; `chat-ia.ts:5-7` | OPEN |
| ASK-HANDOFF/ASK-03 | P0/P1 | Recommendations cannot be given to an Agent. | “No recommendation links to Agent, `/agent-access`, or Spending policy” | `ToolCard.tsx:55-85` | OPEN |
| ASK-04 | P1 | Off-purpose requests are accepted. | “tax prompt produced a full poem” | UNANCHORED | OPEN |
| ASK-URL | P1 | Anonymous success would remain unshareable. | “messages live only in React state” | `useChatSession.ts:161-203,237-240` | OPEN |
| ASK-06 | P2 | Search traces overwhelm the decision. | “Seven repetitive, mostly irrelevant card groups” | `ChatTranscript.tsx:103-111` | OPEN |
| ASK-07 | P2 | Recommendation cards omit readiness. | “Readiness silently absent” | `ToolCard.tsx:69-71` | OPEN |
| ASK-08 | P2 | Mobile composer disappears after the answer. | “composer/Send were offscreen after response” | `ChatLayout.tsx:14-27` | OPEN |
| ASK-FOCUS | P2 | Send has no painted keyboard focus. | “no painted focus change” | UNANCHORED | OPEN |

**Language:** “Name a job. Compare, inspect, then call.” → “Name a job. Compare Tools, then give one to an Agent.”; “Inspect before a call” → “Inspect for your Agent”; “Find a weather API my agent can call” → “Find a weather Tool for my Agent”; remove “binding Quote”, “TOTAL PRICE” and “Uses your AE balance”.

**Acceptance walk**
1. Enter Ask beside Market search and state a need without guessing a URL.
2. Receive a timely shortlist with Provider, callable state, readiness and listed price from the catalogue Ask names.
3. See no Call result, buying control or Credit-use promise in the human transcript.
4. Give one candidate to an Agent, refresh the thread, and retain the answer and URL.
5. Ask an off-purpose question and receive a concise Tool-discovery boundary, not generated content.

**Reference pattern:** Perplexity exposes question entry on the primary surface; shopping cards hand off to the merchant rather than buying in-thread.

### Agents `/agent-access` + `/authorize`

**Job:** Create an Agent and decide which Tools it may Call under which Spending policy.

**Verdict today:** FAIL LIVE. **Laws failing:** L1, L2, L4, L5, L6, L7, L8, L9.

| ID | severity | what | evidence fragment, verbatim | anchor | status |
|---|---|---|---|---|---|
| AGT-01 | P1 | First use presents two starts. | “‘+ Connect New Agent’ and ‘Start the connection’ compete” | `HomeEmptyInstallPanel.tsx:15-24` | OPEN |
| AGT-02 | P1 | Grant approval is labelled connection. | “CTA is ‘Connect agent’ vs ‘Decline’” | `AeAgentAccessAuthorizeForm.tsx:44-109`; `useAgentConsentDecision.ts:217-222` | OPEN |
| AGT-03 | P1 | Returning row hides policy detail and repeats starts. | “‘+ Connect New Agent’ and ‘Connect another Agent’” | `AeAgentOperatorConsole.tsx:123-140`; `HomeAddAnotherAgent.tsx:13-17`; `AeAgentDirectoryTable.tsx:85-119` | OPEN |
| AGT-04 | P0 | Back or refresh can destroy an unrecoverable key reveal. | “This secret will never be shown again” | `useAeAgentAccessHome.ts:70-71,346-352`; `AeKeyRevealDialog.tsx:141-153` | OPEN |
| AGT-05 | P0 | A key is issued before Tool scope is chosen. | “All admitted Tools” | `AeConnectAgentWizardDialog.tsx:68-105` | OPEN |
| AGT-06 | P2 | Grammar and money precision erode trust. | “‘1 agents’, ‘Stays signed in until in 7 days,’ AUD 1.000000” | `ConsentRequestFacts.tsx:20-25`; `AeAgentDirectoryTable.tsx:85-91` | OPEN |

**Language:** “+ Connect New Agent” → “Create Agent”; “Connect Roast Authorization Probe” → “Review access for Roast Authorization Probe”; “Connect agent” → “Approve access”; “until in 7 days” → “for 7 days after approval”; “Legacy credential” → “Direct key”; “1 agents” → “1 Agent”; “AUD 1.000000” → “A$1.00”.

**Acceptance walk**
1. Start once at Create Agent and choose OAuth or Direct key inside that flow.
2. Name the Agent, choose environment, Tool scope and Spending policy before approval or key issue.
3. Review an OAuth grant with Approve access and Decline, never connection language.
4. Navigate Back and refresh during draft and one-time reveal without losing recoverable work or the unrecoverable key.
5. Return to one Agent row that exposes Tool scope and per-Call, daily and monthly limits.

**Reference pattern:** GitHub PAT stages name, expiry, resource scope, permissions and generation, then gives an explicit secure-save terminal.

### Credit `/owner/credit`

**Job:** Decide whether to add Credit.

**Verdict today:** Reachable LIVE after the provider fix; H1 is Credit. Full re-roast remains required. **Laws failing as graded before the fix:** L1, L2, L3, L4, L5, L6, L7, L8, L9.

| ID | severity | what | evidence fragment, verbatim | anchor | status |
|---|---|---|---|---|---|
| CRD-03/C-01 | P0 | Credit route crashed before its UI mounted. | “Could not find Convex client!” | `AeOwnerCreditPage.tsx:8`; `useOwnerCredit.ts:40-44` | FIXED today |
| CRD-02 | P1 | Reserved and total Credit are unavailable. | “AccountFundingBalance exposes only `balance`” | `src/modules/money/internal/account-funding-http.ts:72-82`; `AeOwnerCredit.tsx:155-213` | OPEN |
| CRD-01 | P1 | Sign-in classifies Credit as Provider work. | “return to your Provider workspace” | `src/components/ae/auth/sign-in/sign-in.contracts.ts:24-35` | OPEN |
| CRD-04 | P1 | Error copy falsely implies a Call occurred. | “check system status before repeating a Call” | `src/components/ae/layout/AeRouteStates.tsx:287-317` | OPEN |
| CRD-05 | P2 | Error hierarchy duplicates its title and delays recovery. | “‘Couldn’t load this page’ twice” | UNANCHORED | OPEN |

**Language:** “Couldn’t load this page” twice → “Credit couldn’t load” once; “check system status before repeating a Call” → “Retry. If Credit still cannot load, check system status.”; “return to your Provider workspace” → “return to Credit”. Keep “Each Agent’s spending limit remains separate.”

**Acceptance walk**
1. Open Credit signed in and see Available, Reserved and Total in AUD before any funding action.
2. Choose an amount and review amount, fee, GST and total before Stripe.
3. Confirm the page never claims Credit grants Agent authority.
4. Exercise loading, empty, error and retry states with one heading and one route-neutral recovery action.
5. Complete the FULL page roast, including refresh and Back from the handoff.

**Reference pattern:** OpenAI Platform leads with Available, Reserved and Total; Stripe preserves the order summary and Back state.

### Calls `/activity`

**Job:** Find the intended Call and open its receipt.

**Verdict today:** FAIL LIVE; no populated rows were available. **Laws failing:** L3, L4, L5, L7, L8, L9.

| ID | severity | what | evidence fragment, verbatim | anchor | status |
|---|---|---|---|---|---|
| ACT-03 | P0 | Agent filter is invisible, including zero-result and invalid states. | “`?agent=agent_missing` showed the unscoped empty page” | `AeActivity.tsx:65-99`; `useAeActivity.ts:337-340`; `_operator/activity.tsx:33-62` | OPEN |
| ACT-01 | P1 | A monthly dashboard follows the empty Call list. | “empty state is followed by ‘This month’” | `AeActivity.tsx:118-123`; `ActivityMonthlySummary.tsx:7-50` | OPEN |
| ACT-02B | P1 | Designed row order hides Call identity and canonical nouns. | “Task (Tool), Caller Agent, Duration, Amount, Status, Purchase status + Payment, When” | `ActivityCallQueue.tsx:32-128`; `useAeActivity.ts:154-172` | OPEN |
| ACT-04 | P2 | Connection target is below the hit-area law. | “‘Connection online’ is 20×20px” | UNANCHORED | OPEN |

**Language:** “Task” → “Tool”; “Caller Agent” → “Agent”; “Purchase status” → “Purchase resolution”; filtered “No Calls yet” → “No Calls for this Agent”; remove “This month” and “Some summaries are unavailable”.

**Acceptance walk**
1. Open Calls cold and see one list job with no monthly summary or dashboard tiles.
2. Apply an Agent filter and always see its removable scope chip, including zero-result and invalid states.
3. Read each row as Call identity, Agent, Tool, status, amount and time using canonical labels.
4. Open the intended receipt, use Back, and retain the Agent scope.

**Reference pattern:** Stripe Payments keeps filters visible and removable and leads rows with identifying decision facts.

### Receipt `/calls/$callRef` + `/support?callRef=`

**Job:** Accept, cancel or reconcile the same Call.

**Verdict today:** FAIL LIVE. Support passed direct reference retention but is unreachable from the receipt. **Laws failing:** L1, L2, L4, L5, L7, L9; L8 PARTIAL.

| ID | severity | what | evidence fragment, verbatim | anchor | status |
|---|---|---|---|---|---|
| RCP-01 | P0 | Decision trio and responsible actor are not first. | “Tool/Provider/Agent/Purpose precede buyer amount/purchase status/outcome” | `CallSummarySection.tsx:21-37,49-84`; `call-receipt-view.ts:137-151` | OPEN |
| RCP-02 | P0 | Receipt has no same-Call help action. | “No accept or Help action” | `CallRecoveryPanel.tsx:40-64,133-181,186-256`; help UNANCHORED | OPEN |
| RCP-03 | P1 | Malformed, absent and unauthorized refs share one state. | “Malformed, absent and unauthorized share 200/copy” | `calls.$callRef.tsx:21-26` | OPEN |
| RCP-04 | P2 | Primary actions lack a visible ring. | “no visible outline/ring” | UNANCHORED | OPEN |
| SUP-01 | P0 | Support has no on-page form. | “zero fields, labels, placeholders, or submit control” | `src/components/ae/support/help/AeSupportHelpPage.tsx:16-31` | OPEN |
| SUP-02 | P0 | Blank or malformed ref is acknowledged and cannot be removed. | “callRef= renders ‘Referenced Call:’” | `src/components/ae/support/help/useSupportHelpPage.ts:5-7` | OPEN |
| GATE-01 | P1 | Redirect survives, but buyer destinations are unnamed. | “both generic ‘return to where you left off.’” | UNANCHORED | OPEN |
| FOCUS-01 | P1 | Email support has no visible keyboard ring. | “computed outline-style is none” | `AeSupportHelpPage.tsx:22` | OPEN |

**Language:** “owner-scoped status read” → “We couldn’t open this Call for this workspace”; “owner or operator” → “Email support about this Call”; move “Purpose: Not recorded” below the decision trio; “Advanced evidence reconciliation” → “Provider evidence (advanced)”; “Help” → “Call”; blank banner → “No Call linked”.

**Acceptance walk**
1. Open a receipt and see Delivery, Payment, Purchase resolution and Who acts next before identity and money detail.
2. Take only an applicable same-Call action; never create a replacement after possible dispatch.
3. Choose Get help with this Call and arrive at `/support?callRef=` with the exact reference retained.
4. Remove or correct the reference; see No Call linked for blank input and a distinct malformed state for malformed input.
5. Refresh and use Back without losing the Call reference.

**Reference pattern:** Stripe leads with amount and status, puts the timeline later, and carries the payment ID into Help.

## 3. Execution queue (atomic tasks)

Each row is one bounded subagent change unless marked read-only. Every change gets narrow verification and its own commit.

### W1 Unblockers

| ID and roast IDs | files | change | verify | done-when |
|---|---|---|---|---|
| W1-01 · KB-01, ASK-FOCUS, FOCUS-01, CRD-05, RCP-04 | `src/components/ui/button.tsx` | Add one unmistakable `focus-visible` ring to `buttonVariants`, including link-styled buttons. | Keyboard walk: Tab to detail escape, Ask Send, Credit retry, receipt action and Email support. | Every target paints the same visible ring; Agents retains its visible ring. |
| W1-02 · NONE, baseline red | `src/components/ae/market/DirectoryIndexDiscovery.tsx:14,55` | Give the two “Popular Tools” landmarks distinct accessible names. Fix the accessibility defect, not the test. | `npm test -- tests/unit/market/directory-index-discovery.test.tsx` | The named test passes and both landmarks are distinguishable. |
| W1-03 · DETAIL-JOB, read-only | `x402-directory.functions.ts:14-15` and the now-logged detail degrade cause | Read the dev-server degrade log and anchor the readiness probe's local failure. Do not edit. | Walk: open one `found_upstream` Tool detail and capture the logged cause. | Report contains the exact error, `file:line`, failing assumption and the smallest repair boundary. |
| W1-04 · MKT-02, LST-02, ASK-01/ASK-02, AGT-05, read-only | `src/modules/market/x402-directory-index.server.ts:118-126`; Ask search seam UNANCHORED | Map where Ask searches, where Market reads, and where `toolRef` can join listed rows to callable Tools. Do not edit. | Trace the same image-generation need through both pipelines with `file:line` anchors. | Report names both catalogues, their join point and the exact producer of callable state. |

### W2 Market

| ID and roast IDs | files | change | verify | done-when |
|---|---|---|---|---|
| W2-01 · MKT-03 | `AeX402Directory.tsx:230-234` | Carry `query` when changing Tools, Collections, Providers and Saved views. | Walk: search `image generation`, change every tab, then Back. | URL and search input retain the query throughout. |
| W2-02 · MKT-03 | `src/routes/market.tsx:24-31`; `AeX402Directory.tsx:124-133` | Resolve `compare` Tool refs in the loader, independent of the current result pool. | Deep-link to a query whose results exclude one compared ref, then refresh. | Tray hydrates every valid compared Tool without relying on visible results. |
| W2-03 · MKT-02, T1 | `directory-card.view-model.ts:42-55`; `DirectoryToolCard.tsx:39-61` | Derive and render `Callable by Agents` or `Listed, not yet callable` from `toolRef`. Keep Provider, title, state, listed price, one action. | Walk image results and inspect one card of each state. | Every Tool card states callable status without claiming a Quote. |
| W2-04 · LST-02 | `AeDirectoryToolCanonicalPage.tsx:39-58`; `directory-card.view-model.ts:42-55` | Show a copyable `operation:v1:` reference on callable Tool detail. | Open, copy and refresh one callable Tool. | Copied reference is complete, stable and absent for listed-only Tools. |
| W2-05 · MKT-04, read-only | rerank seam UNANCHORED | Locate the whole-need relevance and threshold decision. Do not edit. | Trace `zzqx plumbing quantum` from query to “17 matching Tools”. | Report anchors candidate generation, rerank and no-fit threshold. |
| W2-06 · MKT-04 | files named by W2-05 | Enforce whole-need relevance before claiming a match; preserve honest partial discovery as a next action. | Walk: search `zzqx plumbing quantum`. | Page shows an honest no-fit and a useful next action, not “17 matching Tools”. |
| W2-07 · MKT-06 | `AeX402Directory.tsx:188-193,336` | Dock the mobile comparison tray near the results header. | 390px walk: select two Tools and open Compare without page-end scrolling. | Tray remains visible near the shortlist and does not cover card actions. |
| W2-08 · MKT-05 | `AeX402Directory.tsx:329-335` | Keep the query and give Providers a single retryable in-place failure state. | Walk: switch to Providers during failure, retry, then return to Tools. | Search context survives and Provider failure never replaces the Market job. |
| W2-09 · MKT-07, MKT-08 | Market hero and comparison price cells, anchors UNANCHORED | Apply the approved Market copy and collapse atomic price internals behind decision-level listed price. | Walk desktop and 390px Market plus comparison. | The shortlist is focal and each comparison price is readable at a glance. |

### W3 Ask

| ID and roast IDs | files | change | verify | done-when |
|---|---|---|---|---|
| W3-01 · ASK-01/ASK-02/EX-04/JI-04b | `ChatTranscript.tsx:103-110`; `ToolCard.tsx:139-199` | Reject `execute` projections from the human transcript. Remove Call result, returned output and purchase actions. | Feed an `execute` projection to the thread renderer. | Human transcript renders no executable or purchase projection. |
| W3-02 · ASK-01/ASK-02 | `src/lib/public/chat-ia.ts:5-7,87-94` | Replace Call and purchase copy with Tool comparison and Agent handoff copy. | Walk empty Ask and one recommendation answer. | No “call”, “binding Quote”, “TOTAL PRICE” or “Uses your AE balance” invitation remains. |
| W3-03 · ASK-HANDOFF/ASK-03 | `ToolCard.tsx:55-85` | Add `Use this with your Agent` to choice rows, preserving safe Inspect. | Select a recommendation and follow the handoff. | The chosen Tool reaches Agent setup with its identity intact. |
| W3-04 · BLOCKED-ENTRY/ASK-05 | Market search entry surface, UNANCHORED | Add an Ask entry beside Market search, not another primary navigation destination. | Walk from `/market` to `/t/new` without guessing a URL. | Ask is discoverable in one action beside search. |
| W3-05 · ASK-06 | `ChatTranscript.tsx:103-111` | Collapse working and search traces behind one quiet disclosure. | Run a query that emits repeated search projections. | One compact trace remains; Tool choices lead the answer. |
| W3-06 · ASK-07, T1 | `ToolCard.tsx:69-71` plus seam from W1-04 | Show callable state and readiness; name the searched catalogue and link listed-only no-fit to the same Market search. | Ask for image generation with callable and listed-only results present. | Answer distinguishes catalogues and does not claim listed-only Tools are callable. |
| W3-07 · ASK-04, read-only | Ask purpose guard UNANCHORED | Trace why an off-purpose tax prompt generated a poem and where first-token time reached 25.9s. Do not edit. | Repeat the image need and tax prompt with timing. | Report anchors the purpose decision and latency segments. |
| W3-08 · ASK-04 | files named by W3-07 | Apply the narrow Tool-discovery guard without adding a parallel policy system. | Ask the tax prompt, then a valid Tool need. | Tax prompt gets a concise boundary; valid discovery still works. |
| W3-09 · ASK-08 | `ChatLayout.tsx:14-27` | Keep composer and Send reachable after a long answer on mobile. | 390×844 walk after a multi-card answer. | Composer is visible or reachable without traversing the full transcript. |
| W3-10 · ASK-URL | `useChatSession.ts:161-203,237-240` | Give successful anonymous threads a stable URL and reload behavior, without claiming account persistence. | Submit anonymously, copy URL, reload. | The same successful thread returns at its URL with truthful scope copy. |

### W4 Agents

| ID and roast IDs | files | change | verify | done-when |
|---|---|---|---|---|
| W4-01 · AGT-01, AGT-03 | `HomeEmptyInstallPanel.tsx:15-24`; `HomeAddAnotherAgent.tsx:13-17`; `AeAgentOperatorConsole.tsx:123-140` | Make Create Agent the only start. Put OAuth and Direct key inside it. | Walk first-use and returning states. | Each state has one start and no peer connect CTA. |
| W4-02 · AGT-02 | `AeAgentAccessAuthorizeForm.tsx:44-109`; `useAgentConsentDecision.ts:217-222` | Rename grant review and approval. Use Review access, Approve access and Decline. | Open a coded authorization request. | Connection language is absent from the grant decision. |
| W4-03 · AGT-05 | `AeConnectAgentWizardDialog.tsx:68-105` | Require Tool scope before a Direct key is issued. | Create an Agent without choosing Tool scope, then choose a subset. | Issue is blocked until scope is explicit; row shows that scope. |
| W4-04 · AGT-04 | `useAeAgentAccessHome.ts:70-71,346-352`; `AeKeyRevealDialog.tsx:141-153` | Persist creation draft and guard Back, refresh and close during one-time reveal. | Exercise Back and refresh before and after key issue. | Draft survives; an issued unrecoverable key cannot be silently lost. |
| W4-05 · AGT-03 | `AeAgentDirectoryTable.tsx:85-119` | Show Tool scope and per-Call, daily and monthly Spending policy without Credit controls. | Inspect a returning Agent row. | Connection, grant and Credit remain distinct. |
| W4-06 · AGT-06 | `ConsentRequestFacts.tsx:20-25`; `AeAgentDirectoryTable.tsx:85-91` | Use `A$1.00`, `1 Agent`, `for 7 days after approval` and `Direct key`. | Walk request facts and one-Agent directory. | Grammar and money precision match the approved language. |

### W5 Credit

| ID and roast IDs | files | change | verify | done-when |
|---|---|---|---|---|
| W5-01 · CRD-02, read-only | `src/modules/money/internal/account-funding-http.ts:72-82` | Determine the authoritative Reserved Credit source and invariant before changing the UI. Do not edit. | Trace Available, Reserved and Total from storage to response. | Report anchors the source and proves `Total = Available + Reserved` or names the actual invariant. |
| W5-02 · CRD-02 | files named by W5-01; `AeOwnerCredit.tsx:155-213` | Render Available, Reserved and Total in AUD before the funding action. | Open Credit with non-zero reserved funds. | Three values reconcile to the authoritative invariant. |
| W5-03 · CRD-04, CRD-05 | `src/components/ae/layout/AeRouteStates.tsx:287-317` | Replace Call-specific failure text with one route-neutral heading and recovery action. | Force Credit load failure and Tab to retry. | “Credit couldn’t load” appears once and retry copy mentions no Call. |
| W5-04 · CRD-01, GATE-01 | `src/components/ae/auth/sign-in/sign-in.contracts.ts:24-35` | Classify `/owner/credit`, `/activity` and `/calls/*` as named buyer destinations. | Open each signed out, sign in and refresh the gate. | Copy names Credit or the same Call and redirect remains exact. |
| W5-05 · CRD-01 to CRD-05 | Credit page | Run the FULL roast that was unreachable before the provider fix. | Repeat the Credit laws, invalid amount, mobile, keyboard, refresh and Back checks. | VERDICT PASS with no P0 and L1/L5/L7 PASS. |

### W6 Calls

| ID and roast IDs | files | change | verify | done-when |
|---|---|---|---|---|
| W6-01 · ACT-01 | `AeActivity.tsx:118-123`; `ActivityMonthlySummary.tsx` | Remove the monthly summary and its tiles from Calls; delete the obsolete component when no caller remains. | Walk empty and populated Calls. | Calls contains only filtering, queue, empty state and receipt path. |
| W6-02 · ACT-03 | `AeActivity.tsx:65-99`; `useAeActivity.ts:337-340`; `_operator/activity.tsx:33-62` | Always render the Agent scope chip and clear action, including invalid and zero-result filters. | Open `?agent=agent_missing`, clear it, Back and refresh. | Scope is visible and removable in every state. |
| W6-03 · ACT-02B | `ActivityCallQueue.tsx:32-128`; `useAeActivity.ts:154-172` | Lead rows with Call identity, Agent and Tool; use Purchase resolution and canonical status presentation. | Open a populated queue and one receipt. | Row order and labels match the receipt-finding job. |
| W6-04 · ACT-03 | Calls empty-state copy | Use `No Calls for this Agent` whenever Agent scope is active. | Open a valid Agent with zero Calls. | Empty copy states the active scope and clear action. |
| W6-05 · ACT-04 | connection target, UNANCHORED | Increase the interactive hit area to at least 44×44 without enlarging the status glyph. | Measure at 390px. | Interactive box is at least 44×44. |

### W7 Receipt and Support

| ID and roast IDs | files | change | verify | done-when |
|---|---|---|---|---|
| W7-01 · RCP-01 | `CallSummarySection.tsx:21-37,49-84`; `call-receipt-view.ts:137-151` | Put Delivery, Payment, Purchase resolution and Who acts next first. Move identity and purpose below. | Open a populated and unavailable receipt. | The decision trio and responsible actor are visible within two seconds. |
| W7-02 · RCP-02 | `CallRecoveryPanel.tsx:40-64,133-181,186-256`; help UNANCHORED | Add only applicable same-Call actions and `Get help with this Call` to `/support?callRef=<ref>`. Never start a replacement. | Follow help from a receipt and inspect the URL. | Exact Call reference arrives at Support; no action creates a new Call. |
| W7-03 · RCP-03 | `calls.$callRef.tsx:21-26` | Give malformed refs a distinct state; keep absent and unauthorized refs non-enumerating. | Open malformed, absent and unauthorized refs. | Malformed is distinct; the other two do not disclose existence. |
| W7-04 · SUP-02 | `useSupportHelpPage.ts:5-7`; `AeSupportHelpPage.tsx:16-31` | Trim and validate the ref, make it removable, and show `No Call linked` when absent. Keep mailto; add no form. | Open valid, blank and script-like refs; remove the valid ref. | Mail subject/body contain only a valid retained ref and the banner can be cleared. |
| W7-05 · RCP-01, RCP-02 | receipt status sets; `status-presentation.ts:3-57` | Route receipt labels through canonical status presentation and delete the page's bespoke labels. | Walk complete, refused and uncertain receipts. | Same status means the same words on Calls and receipt. |

### W8 Local stack

| ID and roast IDs | files | change | verify | done-when |
|---|---|---|---|---|
| W8-01 · ASK-AVAIL | local launcher secret mirroring seam from EnvGaps §2 | Mirror `AE_CHAT_PROXY_SECRET` and, when present, `OPENROUTER_API_KEY` to Convex exactly like `AE_SOURCE_WRITE_SECRET`. | Start from a clean local deployment and submit Ask anonymously. | No manual Convex env copy is needed and chat does not return 503. |
| W8-02 · USE prerequisite | `dev-seed-fixture.ts:142`; `devSeedFixtures` loopback acceptance | Make dev seed accept the documented loopback `AE_SITE_URL` for its discovery, pricing and Quote fixture. | Seed with `http://127.0.0.1:3024`. | Documented loopback seeds successfully without pretending it is callable. |
| W8-03 · MKT-02, DETAIL-JOB | `local-dev.ts:631-653` | Print index generation, scan state and terminal row count during launcher startup. | Run `npm run dev:local` with incomplete, running and complete index states. | Startup output distinguishes all three and reports the completed row count. |

## 4. Re-roast and journey proof

After each wave, re-run that page's roast brief with the same laws, rubric and output shape on the live stack. A page is done only when VERDICT PASS has no P0 and L1, L5 and L7 are PASS.

After all seven pages pass, run one journey walker through FIND → ALLOW → USE → RECORD. Grade transitions, context carried, the same nouns, and Back/forward behavior. Then run AGREE/CARRY under `buyer-journey-protocol.md`. Only then unpark IA-01..04.

## 5. Prerequisites for the USE stage locally

EnvGaps §3 says the Package 5 fixture needs a credential-free HTTPS origin in `AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN` and a valid `AE_PACKAGE5_FIXTURE_X402_PAY_TO`. `AE_SITE_URL` on loopback seeds only a discovery, pricing and Quote fixture. USE cannot be proven locally until the public HTTPS fixture and pay-to value exist.

## 6. Not doing

- A new support form.
- New destinations such as Saved, My tools or Rankings.
- Chrome or IA moves.
- A big-bang component rewrite.
- A global find-replace of vocabulary.
- Fabricating index coverage for upstream rows.

## 7. Open questions for Joel

1. Should Ask search only callable Tools, or search both catalogues and state the split as proposed in T1?
2. After the spine passes, does `/owner` Overview survive the parked IA rationalisation?
3. Should Support ever gain an on-page form, or remain a reference-aware mailto surface?
4. May the human thread show a clearly non-binding Quote, or only listed price before Agent handoff?
