# Platform friction register

**Status:** wave 2 register  
**Date:** 2026-09-21  
**Authority:** [`platform-design-package.md`](./platform-design-package.md) part 6; [`platform-job-map.md`](./platform-job-map.md); [`platform-journey-blueprint.md`](./platform-journey-blueprint.md); [`platform-nav-route-map.md`](./platform-nav-route-map.md); [`platform-experience-register.md`](./platform-experience-register.md) EX-01–EX-04; [`2026-09-21-platform-experience-audit.md`](../designs/2026-09-21-platform-experience-audit.md); [PRODUCT.md](../../PRODUCT.md); [CONTEXT.md](../../CONTEXT.md).

This register costs **hostility** — friction that interrupts a core task, misleads a decision, or forces avoidable work. It does not implement fixes. It does not invent conversion percentages or interview quotes. No hosted/production proof is claimed.

**EX-01–EX-04 already exist.** This file reuses them as owners and evidence. It does **not** mint FR-01 as a copy of EX-01.

---

## Product rules applied

- Optimise for **confident completion**, not minimum clicks.
- Keep **deliberate friction** around Quote/Call, publish, spending limits, and payout.
- Remove friction from **exploration and routine work**.
- Nielsen: visibility of system status; consistency; user control; error prevention; recovery.

Funding ≠ authority ≠ purchase ≠ delivery ≠ purchase resolution. Directory import ≠ callable Tool. After possible dispatch, a Suggested next action must not offer a fresh Call as retry ([CONTEXT.md](../../CONTEXT.md) § Suggested next action).

---

## How to read a row

| Column | Meaning |
| --- | --- |
| **ID** | `FR-nn`. Cross-link `EX-*` when the finding is the same. |
| **Hostility** | Framework source or AE-specific collapse. |
| **Journey/job** | PRODUCT.md journey + job from the job map. |
| **Dest** | Stable dest from the nav map (path is evidence). |
| **Current evidence** | **S** source · **T** test · **L** local walk 21 Sep · **D** charter/design. None is hosted proof. |
| **Design response** | Minimum reuse-first change. Not an implementation assignment. |
| **Cost if unfixed** | What the person cannot complete or will decide wrongly. No rates. |
| **Grade** | Same scale as the design package: `CHARTER` / `IMPLEMENTED` / `PARTIAL` / `SEEN` / `OPEN` / `DOCS`. Here the grade is the **hostility’s current product state**, not a quality score. |
| **Existing owner** | Do not open a second campaign. |

**P1** interrupts or misleads a core task. **P2** is avoidable work or ambiguity.

---

## Hostility source coverage

| Framework / AE source | AE evidence? | Rows |
| --- | --- | --- |
| 1. Forced registration before users can assess value | **None.** Public `/market` (`audience: 'always'`), public Tool routes, and anonymous `/t/new` chat (`convex/chatAnonymous.ts`, 12-message cap) let a guest browse and describe a need. Sign-in is reserved for Agents, Calls, Credit, and supply. | — |
| 2. Surprise fees or restrictions | **Yes.** Directory “Provider-listed price” is not a Quote. Top-up fee itself is disclosed before checkout (retain). | FR-07 |
| 3. Repeated data entry | **Yes.** ABN typed then dropped; chat purchase must be redone on a real Agent; `resumeTool` keeps the Tool ref, not prepared inputs. | FR-02, FR-03, FR-12 |
| 4. Losing work after an error or login | **Yes.** Compare tray is component state and is stripped from the URL; ABN does not survive save. Market Back and several handoffs are strengths (below). | FR-02, FR-05 |
| 5. Comparing options from memory | **Yes.** Compare tray exists, then evaporates on inspect/refresh. | FR-05 |
| 6. Unexplained disabled buttons | **Yes.** Compare controls disable without a reason. Funding “Choose an amount…” and auto-recharge blocks *do* explain themselves (retain). | FR-06 |
| 7. Generic errors | **Yes** at catch-alls. Many RFC 9457 `problem()` details and Call recovery copy are specific (retain). | FR-01, FR-09 |
| 8. Difficult cancellation or support access | **Partial.** Call cancel is on the receipt. `/support` exists (footer). Receipt does not hand off to `/support?callRef=`. Market-gap withdraw is API-only. | FR-10, FR-11 |
| 9. Premature provider onboarding demands | **Yes.** ABN/tax-invoice copy and payouts “Action Required” before a first Tool. Payouts can be skipped. | FR-02, FR-13 |
| Funding confused with authority | **Yes** as dest mix. Copy on Credit and Agents often separates the two (retain). Monthly spend ceiling lives on Credit. | FR-08 |
| Chat constructing a synthetic purchasing principal | **Yes** (`EX-04`). | FR-03 |
| Fresh Call offered as retry after possible dispatch | **None as a hostile CTA.** `CallRecoveryPanel` stays on the same Call; chat caps `tool.call` at one execute (`MAX_CHAT_EXECUTE_CALLS = 1`); receipt “Use this Tool again” is a *separate* later purchase and says not to replay the Call. | — |
| Directory import presented as callable Tool | **Yes.** | FR-04 |
| ABN required in wizard but omitted on save | **Yes** (`EX-02`). | FR-02 |
| Tool card → detail unavailable | **Yes** (`EX-01`). | FR-01 |

---

## Findings

| ID | Hostility | Journey/job | Dest | Current evidence (S/T/L/D) | Design response | Cost if unfixed | Grade | Existing owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **FR-01** · P1 · same as **[EX-01](./platform-experience-register.md)** | Generic errors / broken inspect | J1–J3 · J-B01, J-B02 | `RES-TOOL` · `/tools/…` | **L:** market card for `agent402.tools/v1-images-generations` opened “Tool details are unavailable”. **S:** `AeDirectoryToolCanonicalPage.tsx` distinguishes `not_found` vs `unavailable` and returns to market. Cause and breadth **VERIFY**. | Reproduce the lookup; keep the unavailable distinction; reuse the existing route/loader. Do not invent commercial facts. | Buyer cannot inspect or compare the Tool they just chose. Journey 2–3 stops at the first card. | `SEEN` + `PARTIAL` | Buyer / JI — EX-01 |
| **FR-02** · P1 · same as **[EX-02](./platform-experience-register.md)** | Repeated data entry · Premature provider onboarding | J4 · J-P01 | `DEST-PROVIDER-SUPPLY` · `/owner/operations` | **L:** activation asks ABN and promises tax-verification / invoice compliance. **S:** `provider-identity-validation.ts` requires a checksum-valid ABN; `useSupplierOnboardingWizard.ts` sends it; `useProviderWorkspaceInventory.ts` `onSaveProfile` persists only name/website. | Align field, save, and copy. Persist a justified ABN or stop asking. Checksum ≠ ATO registration. | Provider types a legally flavoured fact that vanishes; later tax/invoice work starts from blank; non-AU supply is silently out of scope. | `GAP` (`PARTIAL` wizard, save contract incomplete) | W-30 — EX-02 |
| **FR-03** · P1 · same as **[EX-04](./platform-experience-register.md)** | Chat synthetic purchasing principal · Repeated data entry | J2–J3 · J-B03, J-A01 | `RES-ASK-THREAD` · `/t/*` | **S:** `convex/chatTools.ts` builds `applicationRef: 'interactive-chat'` from the human context and exposes `tool.quote` / `tool.call` on that principal. JI register forbids a chat-specific purchasing Agent. Parent did not execute the path (**VERIFY**). | Keep chat as discovery/compare; continue through the existing authorised Agent. Preserve selected Tool and prepared inputs. Do not mint a grant. | Buyer believes chat bought (or can buy) when it invented a principal; the real Agent path is repeated or blocked. | `GAP` / `VERIFY` | JI-04b — EX-04 |
| **FR-04** · P1 | Directory import presented as callable Tool | J1, J3, J4 · J-B01, J-P01 | `DEST-PUBLIC-MARKET` · `RES-TOOL` | **S:** directory cards and the canonical page use Tool language; summary state says “Checking whether this Tool is ready to call…”. Cards link `/tools/$providerHost/$slug`. **L:** 15,152 indexed entries on `/market`; card → unavailable detail (FR-01). **D:** PRODUCT x402 clarification allows *browse* before admission; imported metadata is not executable supply. | Keep Provider-listed price and inspectable directory. State callable vs indexed on the card and detail. Next action already has “inspectable but not currently callable” (`suggested-next-action.ts`) — use it on directory cards, not only admitted inspectors. | Buyer treats an indexed endpoint as a purchasable Tool; Quote/Call fails or is never offered; Provider “publish” looks already done. | `PARTIAL` | JI / market — PRODUCT x402 clarification |
| **FR-05** · P2 | Comparing from memory · Losing work | J2 · J-B02 | `DEST-PUBLIC-MARKET` | **S:** `AeX402Directory` holds comparison in React state (max 4). Legacy `?compare=` is hydrated then **stripped** from the URL. Opening `RES-TOOL` unmounts the tray. Saved Tools use `localStorage` (survive). Market Back preserves filters/scroll when `fromMarket` is tagged (`market-return-context.ts`). | Persist the compare set in validated search (or equivalent shareable view) across inspect and refresh. Keep the 4-item cap. Do not put secrets in the URL. | Comparison is rebuilt from memory after every inspect. Journey 2’s “without reconstructing earlier screens” fails. | `PARTIAL` | JI-04b · DS market compare |
| **FR-06** · P2 | Unexplained disabled buttons | J2 · J-B02 | `DEST-PUBLIC-MARKET` | **S:** tray “Compare Tools” is `disabled={comparison.length < 2}` with no `title` / `aria-describedby`. Card Compare is disabled at 4 items with no reason. Contrast: funding button label is “Choose an amount to continue”; auto-recharge disable is paired with a mandate alert. `disabledReason` in `status-presentation.ts` is not wired to these controls. | Name the rule on the control (“Select two Tools”, “Comparison is full (4)”). | Buyer cannot tell whether Compare is broken, gated, or waiting. Extra clicks and abandoned compare. | `PARTIAL` | DS-32 interaction language |
| **FR-07** · P2 | Surprise fees or restrictions | J2–J3 · J-B02, J-B03, J-B06 | `RES-TOOL` · `DEST-BUYER-CREDIT` | **S:** cards/detail label “Provider-listed price” / “Provider price per Call” (`directory-card.view-model.ts`). Quote is a later AUD, authority-bound packet. **S:** top-up preview lists Credit added, Platform fee, GST, Total payable **before** Stripe (`AeCreditTopUpPanel.tsx`) — retain. **D:** listed price is not an accepted Quote (experience audit §5.B). | Keep the Provider-listed label. On evaluate, show that the buyer amount is the Quote (authority, balance, GST as implemented). Do not dress directory price as checkout. | Sticker shock at Quote, or a Call refused for credit/policy the listing never mentioned. | `PARTIAL` | W-20 · Quote/listing commercial work |
| **FR-08** · P2 | Funding confused with authority | J3 · J-B05, J-B06 | `DEST-BUYER-CREDIT` vs `DEST-BUYER-AGENTS` | **S:** `AeOwnerCredit` hosts top-up **and** `AeMonthlySpendCeilingCard`. Copy correctly says browsing is free and Calls stay subject to each Agent’s spending policy. **L:** Agent access states connection ≠ spending permission. **D:** Credit dest is prepaid; Agents dest is Spending policy. | Keep ceiling editable, but present it as Account/Agent authority, not as a funding line. Do not imply a balance grants permission. | Customer funds the Account and believes Agents may spend; or treats a ceiling as a top-up. | `PARTIAL` | W-20 · W-23 · W-26 |
| **FR-09** · P2 | Generic errors | Cross-journey | Catch-alls · `FLOW-AUTH` | **S:** `AeObservabilityErrorBoundary` title “Something went wrong” (has Try again + Browse Tools). Connect-agent `mapUnexpectedDiagnostic` same title. `useAeMutationToast` falls back to “An unexpected error occurred”. **S retain:** `problem()` details on funding/market-demand/MCP; market filter errors; Call recovery Rule-shaped copy. | Reserve generic titles for unknown faults; pass `detail` through. Reuse `AeEmptyState` / Rule 4 triplets already on funding and Connect. | Recovery starts from a blank diagnosis; people retry the unsafe action or abandon. | `PARTIAL` | Existing error primitives · W-25 diagnostics |
| **FR-10** · P2 | Difficult support access | J3 · J-B08, J-S02 | `RES-CALL` · `/support` | **S:** `/support` accepts `?callRef=`; `ReferencedCallBanner` displays it. Call receipt surfaces cancel/reconcile/refresh and keeps `callRef`. **S:** no receipt control links to `/support?callRef=`. Help is footer / operator utility, not buyer header. | One “Get help with this Call” action on the receipt that opens `/support` with the same `callRef`. Keep email private; do not put credentials in the query. | Stuck buyer has identity on screen and no path to J-S02. Risk of unsafe retry or a public GitHub issue. | `PARTIAL` | Help · J-S02 |
| **FR-11** · P2 | Difficult cancellation (gap signal) | J5 · J-B04 | `DEST-PUBLIC-MARKET` (S6 not a chrome dest) | **S:** `marketDemand.record` / `withdraw` / `status` and HTTP routes exist; 30-day window; no auto-buy. **D:** journey blueprint — human dest for gap memory not walked. No buyer page in `src/components/ae` for withdraw. | When the product exposes gap memory, put eligibility, end date, and withdraw on a resumable page (not a new header dest until scheduled). | Agent/API can withdraw; a human cannot see or stop matching. Journey 5 looks like a silent tender. | `CHARTER` / `PARTIAL` | JI-08a |
| **FR-12** · P2 | Repeated data entry · Losing work | J3 · J-B03, J-R01 | `DEST-BUYER-AGENTS` · `RES-TOOL` | **S:** `AeToolNextAction` passes `resumeTool`; `/agent-access` validates it; `HomeResumeToolSection` links back. Experience register: Tool-ref continuity ≠ selected-input continuity. | Carry prepared inputs (or an explicit “inputs not kept”) through the Agent handoff. Do not put secrets in the query. | Customer reconnects the Agent and re-enters the Tool body. Repeat purchase (J6) stays as hard as first use. | `PARTIAL` | JI-04b (continuation) |
| **FR-13** · P2 | Premature provider onboarding | J4 · J-P01 | `DEST-PROVIDER-SUPPLY` | **S:** wizard order is profile (ABN) → payouts → first Tool. Payouts step badge “Action Required”; `handleSkipForNow` exists. **L:** first screen is brand, HTTPS, ABN. Charter: start from capability/source; Stripe KYC when payout is actually required. | Ask identity/payout when publish or earnings need them. Keep Stripe hosted. Do not block source preview on ABN (see FR-02). | Capable Providers bounce before a draft Tool exists. Journey 4 starts as banking, not supply. | `PARTIAL` | W-30 · W-31 |

---

## Strengths to retain (not hostility)

These are deliberate or already-safe seams. Do not “simplify” them into a shorter path that collapses a commitment.

| Seam | Evidence | Keep |
| --- | --- | --- |
| Guest can assess value | Public Market + Tool routes; anonymous chat with a stated cap | Do not put a sign-in wall on browse/search/compare |
| Top-up fee before payment | Funding quote: credit, platform fee, GST, total | Do not hide the fee in Stripe-only line items |
| Connection ≠ spending permission | Agent access L4; `AeAssistantInstallFunnel`; help Agent section | Do not treat install or credit as a grant |
| Same-Call recovery | `CallRecoveryPanel`; `MAX_CHAT_EXECUTE_CALLS = 1`; receipt prompt “Do not replay {callRef} as a new Call” | Do not add “Try again” that mints a new Call after possible dispatch |
| Market Back | `market-return-context.ts` tagged history; `MarketBackButton` fallback | Do not replace with a `from=` query that leaks path |
| Handoffs that resume | `resumeTool`; funding `/fund/$fundingSessionId`; OAuth `continuationDraftRef`; chat share `/s/$shareToken`; anonymous→auth handoff in `useChatSession` | Extend these; do not add a second resume store |
| Specific problems | RFC 9457 `problem({ detail })` on funding, market-demand, MCP; market filter error copy | Prefer `detail` over “Something went wrong” |
| Explained disables | Funding amount CTA; auto-recharge mandate alerts | Pattern for FR-06 |
| Provider withdraw / Call cancel | Owner Tool withdraw confirm; receipt Cancel Call confirm | Deliberate friction on those commitments |

---

## Sequencing (design only)

1. **Do not lose the inspect.** FR-01 / EX-01 — a visible card must open a truthful detail or a diagnosed unavailable state.
2. **Do not invent a buyer.** FR-03 / EX-04 — chat discovery continues on the existing Agent.
3. **Do not dress a directory row as a Call.** FR-04, then FR-07 so price is not mistaken for a Quote.
4. **Keep comparison outside the user’s head.** FR-05, FR-06.
5. **Ask Providers for facts you store.** FR-02 / EX-02, then relax FR-13 timing.
6. **Keep funding and authority on their dests.** FR-08. Preserve deliberate Quote/Call/publish/payout friction.
7. **Recovery stays on `callRef`.** FR-10. Do not “fix” FR-fresh-Call — it is not evidenced as hostility.
8. **Gap withdraw** (FR-11) waits on JI-08 human surface; do not build a demand CRM.

Every later assignment should name the journey, the existing component to reuse, and the failure/retry behaviour. This register authorises none of those changes.

---

## Sources

- [PRODUCT.md](../../PRODUCT.md) — journeys 1–6, operating principles, implementation boundary  
- [CONTEXT.md](../../CONTEXT.md) — Tool, Quote, Call, Spending policy, Suggested next action  
- Wave 1 — job map, journey blueprint, nav/route map  
- [platform-experience-register.md](./platform-experience-register.md) — EX-01–EX-04  
- Inspected source — `convex/chatTools.ts`, `convex/chatAnonymous.ts`, `market-return-context.ts`, `AeX402Directory.tsx`, `DirectoryToolCard.tsx`, `AeDirectoryToolCanonicalPage.tsx`, `AeToolNextAction.tsx`, `CallRecoveryPanel.tsx`, `CallTechnicalRecord.tsx`, `AeEmptyState.tsx`, `AeObservabilityErrorBoundary.tsx`, `AeCreditTopUpPanel.tsx`, `AeOwnerCredit.tsx`, `useSupplierOnboardingWizard.ts`, `useProviderWorkspaceInventory.ts`, `AeOwnerMcpOAuthCallback.tsx`, `suggested-next-action.ts`, `src/lib/server/problem.ts`  
- Local walk 21 Sep — experience audit L1–L5 (market, unavailable detail, Provider activation, Agent access, empty Calls)
