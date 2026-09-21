# ALLOW / identity walk — walker 2

**Date:** 2026-09-21  
**App:** `http://127.0.0.1:3024`  
**Method:** code + browser (cursor-ide-browser) + interpretation  
**Session:** unsigned Clerk. No purchase, no Stripe checkout, no account mutation.  
**Law:** [2026-09-21-platform-experience-audit.md](../../designs/2026-09-21-platform-experience-audit.md) §2 Set up/use + Account + page contract; [buyer-journey-baseline.md](../buyer-journey-baseline.md) Agents + Credit rows. Context: funding ≠ authority; connect ≠ grant.

## Session

Navigated, locked, snapshotted, unlocked. First operator destinations redirected to sign-in. Signed-in Agents / Credit / Authorize-ready states were not rendered. Identity and public funding-return pages were.

Quoted labels below are from the accessibility tree (spaces intact). Screenshots of identity headings often collapse word spaces (`SignintomanageTools`); treat that as a capture/font-tracking note, not the primary FAIL.

## Watch items

| Watch | Result |
| --- | --- |
| Two competing starts on Agents | **FAIL in source.** Empty directory still mounts `+ Connect New Agent` (key-issue wizard) beside an already-open `Connect with Codex` procedure. Not re-rendered this session (unsigned). |
| Credit load error + Call warning | **FAIL in source** on the operator error shell used by `/owner/credit`. Not re-rendered this session. Unsigned Credit visit instead mislabels the buyer as a Provider. |
| Onboarding Back overwrite | **CODE-ONLY FAIL.** `Back` keeps step-1 only; `Continue` rewrites the workspace name from the suggested value. Unsigned `/onboarding` never reached the wizard. |

## Rollup

| Page / state | Verdict |
| --- | --- |
| `/agent-access` first-use composition | **FAIL** (code; browser BLOCKED) |
| `/agent-access` returning | **CODE-ONLY** |
| `/agent-access` unsigned gate | **FAIL** (connect copy for a grant dest) |
| `/agent-access/authorize` empty | **CODE-ONLY** (browser = sign-in gate) |
| `/agent-access/authorize?user_code=` | **BLOCKED** (query survives; form unseen) |
| `/owner/credit` | **FAIL** (gate) + **CODE-ONLY** (page) |
| `/fund/cancelled` | **FAIL** |
| `/fund/test-session` | **FAIL** |
| `/sign-in` | **FAIL** |
| `/sign-up` | **FAIL** |
| `/onboarding` | **FAIL** (unsigned) + **CODE-ONLY** (Back) |

---

## `/agent-access` — first-use (empty directory)

**Job:** Connect the Agent the buyer already uses, then return to the selected Tool or Market. One first-use path; connect is not a grant.

**Code:** `src/components/ae/agent-access/home/AeAgentAccessHome.tsx:50-57` mounts `HomeEmptyInstallPanel` when `directory.items.length === 0 && search.caller === undefined`. That leaf (`home/components/HomeEmptyInstallPanel.tsx:15-25`) places a primary `+ Connect New Agent` button above `AeAssistantInstallFunnel`. The funnel (`console/AeAssistantInstallFunnel.tsx:28-31`) is already titled `Connect with Codex` with ordered commands. The button opens `AeConnectAgentWizardDialog` (`home/useAeAgentAccessHome.ts:394`; wizard `console/connect-agent-wizard/AeConnectAgentWizardDialog.tsx:51-52`: `Connect new agent` / `Step 1 of 2 · Set policy`). Funnel step 3 (`AeAssistantInstallFunnel.tsx:55-56`): `Account connection does not grant spending permission.` Search retains `resumeTool` (`routes/_operator/agent-access.tsx:13-19`).

**Visual:** Not rendered. Unsigned visit redirected (see gate card).

**Interpretation:** The page still offers two beginnings. The wizard issues a credential and sets a spending policy (connect **and** grant). The Codex rail is a copy-paste MCP procedure that later needs `/agent-access/authorize`. A first-time owner must guess which start is theirs. That is the audit’s Agents first-use failure, still in source. `resumeTool` is the right return seam; it does not resolve the two starts.

**Verdict:** FAIL

**Evidence:** Composition above. Register row 6 already failed the same hierarchy. This walk could not re-render it.

**Handoff:** One first-use path. Either lead with the Codex (or chosen-app) procedure and demote key-issue, or lead with “choose your app” and keep the wizard off the first screen. Do not present `+ Connect New Agent` and an open `Connect with Codex` rail as peers. Keep `resumeTool` and the connect ≠ grant sentence.

---

## `/agent-access` — returning (directory has items)

**Job:** See connected Agents, tighten grant (who / how much / which Tools), or connect another. Credit is not the grant.

**Code:** Non-empty directory skips the empty panel and mounts `AeAgentOperatorConsole` (`AeAgentAccessHome.tsx:66-93`) plus `HomeAddAnotherAgent` (`102-116`). Console header still has `+ Connect New Agent` (`console/agent-operator-console/AeAgentOperatorConsole.tsx:128-131`). Add-another is a separate section titled `Add another Agent` with toggle `Connect another Agent` / `Hide setup` (`home/components/HomeAddAnotherAgent.tsx:13-16`; label `useAeAgentAccessHome.ts:335`). Page chrome: `Agents` / `Connect Agents, review requests, and control what each Agent can do.` (`AeAgentAccessHome.tsx:29-30`). `#fund` on this route is rewritten to `/owner/credit` (`useAeAgentAccessHome.ts:145-148`).

**Visual:** Not rendered (unsigned).

**Interpretation:** Returning composition is closer to the required “list + connect another” split, but it still ships two connect CTAs (`+ Connect New Agent` on the list, `Connect another Agent` below). Hash `#fund` sending people to Credit from Agents is the easy funding/authority mix the baseline warns about.

**Verdict:** CODE-ONLY

**Evidence:** Source only. Register row 7 still NOT CHECKED with connected data.

**Handoff:** One “connect another” control. Keep spending policy on the Agent record, not as a funding line. Do not deep-link Credit as if it were a grant.

---

## `/agent-access` — unsigned gate (this session)

**Job:** Sign in so the owner can reach Agents, then continue the connection they started.

**Code:** `_operator` layout uses `requireOperatorBeforeLoad` (`src/lib/server/require-operator-session.ts:28-30`). Sign-in copy treats any `/agent-access*` redirect as connect (`auth/sign-in/sign-in.contracts.ts:24-32`).

**Visual:** Landed on `http://127.0.0.1:3024/sign-in?redirect=%2Fagent-access`. Eyebrow `Account`. Heading `Sign in to connect an agent`. Body `Use email, Google, GitHub, or a passkey. After you sign in, you’ll return to the agent connection you started.` Controls: GitHub, Google, `Email address`, `Continue`, `Don't have an account? Sign up`, `Back to market`.

**Interpretation:** Gate and redirect target are correct. Copy collapses the destination to “connect.” Agents is also where grants are reviewed and limits are tightened. Connect ≠ grant is already lost at the door.

**Verdict:** FAIL

**Evidence:** Live URL + quoted heading/body. Same heading for `/agent-access/authorize` (grant page).

**Handoff:** Keep `redirect=/agent-access`. Name the destination as Agents / access, not only “connect an agent.”

---

## `/agent-access/authorize` — empty (no `user_code` / `grant_ref`)

**Job:** Review one access request — Agent, limits, Tools — then approve or decline. Contextual, not a global dest.

**Code:** Search: `user_code`, `grant_ref`, `state` (`routes/_operator/agent-access.authorize.tsx:13-17`). Loader returns `{ kind: 'missing' }` unless exactly one of `user_code` or `grant_ref` is present (`authorize/load-agent-access-authorize.ts:25-30`). Empty ready-state UI (`authorize/AeAgentAccessAuthorizePage.tsx:82-90`): title `Review agent access`, description `Choose what this agent may do, then approve or decline.`, alert `This access request is missing a code` / `Start a new request from your agent.` Ready form primary label is `Connect agent` (`authorize-form/useAgentConsentDecision.ts:217-222`), not “Approve spending access.” Outcome states: `Access approved` → `Open Agents`; `Check the current access status` (do not resubmit); problem via `presentConnectionProblem`.

**Visual:** Unsigned empty URL redirected to `/sign-in?redirect=%2Fagent-access%2Fauthorize`. Same `Sign in to connect an agent` heading as the Agents list.

**Interpretation:** Missing-code empty state is honest and has a next step (start from the agent). The primary approve label and the sign-in heading both say “connect,” so a grant decision is framed as a connection. Baseline: grant names Agent, limits, Tools.

**Verdict:** CODE-ONLY (empty UI) / FAIL (gate copy)

**Evidence:** Loader + missing-code alert. Browser never mounted the operator page.

**Handoff:** Empty: keep “missing a code / start from your agent.” Ready: approve/decline must name the grant consequence. Sign-in for this path must not say only “connect an agent.”

---

## `/agent-access/authorize?user_code=ABCD-1234`

**Job:** Same grant decision, with the device/user code the agent showed.

**Code:** Single locator `{ kind: 'user_code', value }` (`load-agent-access-authorize.ts:25-26`). Also accepts `grant_ref` (not both). `state` carried into OAuth recovery (`AeAgentAccessAuthorizeForm.tsx:22-25`).

**Visual:** Redirected to `/sign-in?redirect=%2Fagent-access%2Fauthorize%3Fuser_code%3DABCD-1234`. Query survived. Form, limits, and Tools were not shown.

**Interpretation:** Interrupted-journey retention for the code is correct (S5). The grant UI itself is unseen, so the page contract (one request, named consequence, return) is BLOCKED.

**Verdict:** BLOCKED

**Evidence:** Live redirect URL with encoded `user_code`. No signed-in form.

**Handoff:** After a signed-in walk: confirm the form names Agent, mode, Tool scope, and expiry; primary action is approve/decline, not “Connect agent”; decline and `Open Agents` remain.

---

## `/owner/credit`

**Job:** Decide whether to add funds. Show available **and** reserved. Quote credit, fee, GST, total before Stripe. Spending policy is not a funding line. Actor must refuse “I topped up, so it can buy.”

**Code:**

- Route chrome: `Credit` / `Add AUD credit for paid Calls. Each Agent’s spending limit remains separate.` (`console/owner-credit/AeOwnerCreditPage.tsx:11-14`). Good funding ≠ authority sentence.
- Balance card shows only `Available credit` (`console/AeOwnerCredit.tsx:204-212`). `AccountFundingBalance` has `balance` and `locked`, no reserved (`modules/money/internal/account-funding-http.ts:72-83`). Baseline Now: “Reserved hidden.”
- Top-up quote **does** list Credit added / Platform fee / GST / Total payable before Stripe (`console/AeCreditTopUpPanel.tsx:232-257`). Primary: `Pay {total} and add {principal}`.
- Route uses `operatorRouteOptions` (`routes/_operator/owner.credit.tsx:21`) → `OperatorRouteError` title `Couldn’t load this page` **and** alert `Couldn’t load this page` with `Try loading it again. If it still fails, check system status before repeating a Call.` (`layout/AeRouteStates.tsx:288-329`). No Credit loader; this fires on layout/source failure while the path is still Credit.
- Sign-in/up treat any `/owner*` redirect as Provider (`sign-in.contracts.ts:25-34`; `sign-up.contracts.ts:34-43`). Onboarding preselects supplier for `/owner` (`modules/principal-account/onboarding.contracts.ts:55-58`).

**Visual:** `/owner/credit` → `/sign-in?redirect=%2Fowner%2Fcredit`. Heading `Sign in to manage Tools`. Body `…you’ll return to your Provider workspace.` Sign-up with the same redirect: `Create a Provider account` / `…you’ll continue to the Tool publishing workspace.` Credit page itself not rendered. Call-warning error shell not rendered.

**Interpretation:** The buyer came to fund an Account. The gate says they are about to manage Tools in a Provider workspace. That is the wrong role, the wrong job, and it teaches “funding is supply setup.” After sign-up, role intent would be **supplier**. The page copy (when it loads) correctly separates credit from Agent limits, then hides reserved and, on load failure, warns about repeating a Call — a Records-group caution on an Account page. Audit copy rule: “We couldn't load your credit information. Try again.” Mention money/Calls only when a pending transaction exists.

**Verdict:** FAIL (gate + role) / CODE-ONLY (reserved hidden; Call warning on error)

**Evidence:** Live Credit → sign-in/up quotes. Source for balance shape, quote rows, and `OperatorRouteError`. Register row 9.

**Handoff:** Classify `/owner/credit` as buyer Account, not Provider. Show reserved beside available. Keep the quote-before-Stripe block. Replace the operator error Call sentence on this dest. Do not onboard a Credit visitor as supplier.

---

## `/fund/cancelled`

**Job:** Understand that this checkout did not change credit or authority, then return to the funding task (agent or Credit), not a new payment.

**Code:** `routes/fund.cancelled.tsx:18-26`. Title `Payment cancelled`. Description `No Account credit or authority changed. Return to the agent if you still want to fund it.` Action: `Back to Market` → `/market`.

**Visual:** Same title and body. Primary button `Back to Market`. Header still offers `Find Tools`.

**Interpretation:** The body is the right law (funding ≠ authority; nothing changed). The primary action ignores that body and dumps the person on Market. No agent return, no Credit, no `resumeTool`. A cancelled funder is told to shop.

**Verdict:** FAIL

**Evidence:** Live page, quoted title/body/button. `fund.cancelled.tsx:23-25`.

**Handoff:** Keep the no-credit/no-authority sentence. Make the primary action match the body: return to the agent, or Credit if this was an owner top-up. Market is secondary.

---

## `/fund/test-session` (dummy id; Stripe not started)

**Job:** Read this payment’s status without starting another payment. Invalid link ≠ “try Market.”

**Code:** `AeFundingReturnPage.tsx:29-52` polls `/api/v1/account/funding-sessions/public/:id`. Dummy id → 404 → `not_found` (`AeFundingReturnState.tsx:42-53`): `Funding link unavailable` / `This funding link is invalid or no longer available. Return to the agent that provided it for a current link.` Action: `Open Market`. Checking copy first: `Checking funding` / `Confirming the latest status for this payment.` True API failure would say `Funding status unavailable` and `Do not start another payment` (`28-38`) — that caution is correct **for** a payment, not for a missing link.

**Visual:** Checking, then `Funding link unavailable` + quoted body + `Open Market`. No Stripe. No second checkout.

**Interpretation:** Dummy-id error is truthful (invalid/gone; no credit claimed). Same exit bug as cancelled: body says return to the agent; button opens Market. Good that it did not invent a payment or send the user into Stripe.

**Verdict:** FAIL

**Evidence:** Live `/fund/test-session` after poll. `AeFundingReturnState.tsx:48-51`.

**Handoff:** Keep not-found vs unavailable distinct. Not-found primary action should be the agent (or Market as secondary browse). Do not attach “do not start another payment” to a link that never existed unless a session is in hand.

---

## `/sign-in`

**Job:** Establish identity only as needed to resume the intended dest. Say why. Preserve `redirect`.

**Code:** `routes/sign-in.$.tsx` + `projectSignInCopy` (`sign-in.contracts.ts:23-36`). Methods blurb is accurate. `fallbackRedirectUrl` with no `redirect` is `/owner/settings` (`useSignInPage.ts:6`), while generic body says `you’ll return to where you left off.` `/owner*` → Provider Tools copy. `/agent-access*` → connect copy. Redirect sanitiser rejects auth loops and off-origin (`lib/client/auth-redirect.ts:11-44`). Clerk primary is `Continue`.

**Visual:**

- `/sign-in`: `Sign in` / `Use email, Google, GitHub, or a passkey. After you sign in, you’ll return to where you left off.` GitHub, Google, email, `Continue`, `Sign up`.
- `?redirect=/agent-access` and `?redirect=/agent-access/authorize…`: `Sign in to connect an agent`.
- `?redirect=/owner/credit`: `Sign in to manage Tools` / Provider workspace.

**Interpretation:** Methods and `redirect` preservation work. The page then lies about *why* and *where*. A Credit visitor is recruited as a Provider. A bare `/sign-in` promises “where you left off” and defaults to settings. `Continue` does not name the consequence (Krug / baseline). Buyer and Provider are not distinguishable (S3).

**Verdict:** FAIL

**Evidence:** Three live redirect variants + `projectSignInCopy` branches + default `/owner/settings`.

**Handoff:** Copy from dest class: Agents/access, Credit/account, Provider/operations — not “any `/owner` is Provider.” Bare sign-in should not claim a preserved task it does not have. Keep sanitiser.

---

## `/sign-up`

**Job:** Create the account needed for the current task, then onboarding, then the same dest. Do not assign a commercial role from a path prefix.

**Code:** `projectSignUpCopy` (`sign-up.contracts.ts:32-47`). Force/fallback to `/onboarding?redirect=…` (`useSignUpPage.ts:16`; `buildOnboardingRedirectUrl` 50-53). Footer: `Already have an account? Sign in`, `Terms`, `Privacy` (`SignUpLegalFooter.tsx:8-34`). Same `/owner*` → Provider branch as sign-in.

**Visual:**

- `/sign-up`: `Create an account` / `…you’ll set up your workspace.` Email, password, `Continue`, legal footer.
- `/sign-up?redirect=%2Fowner%2Fcredit`: `Create a Provider account` / `…you’ll continue to the Tool publishing workspace.`

**Interpretation:** Bare sign-up is the only honest identity page in this set (account → workspace). Credit-gated sign-up is a role error: a funder is told they are creating a Provider account. That role then preselects supplier on onboarding. Legal + switch-to-sign-in are present and useful.

**Verdict:** FAIL

**Evidence:** Live Credit-gated heading/body. `isProviderFlow = redirect?.startsWith('/owner')`.

**Handoff:** Same dest-class fix as sign-in. A Credit or Agents redirect must not create a Provider account in copy or in `roleIntent`.

---

## `/onboarding`

**Job:** Choose how this workspace will be used and name it. Back keeps the name. Completion returns to the intended task. Unsigned visitors must be asked to sign in, not shown a source-down error.

**Code:**

- Route has no auth `beforeLoad` (`routes/onboarding.tsx`). Convex `readState` throws `identity_invalid` when unsigned (`convex/interactiveOnboarding.ts:104-105`).
- Wizard: step 1 role (`Buyer / Agent Operator`, `Supplier / Tool Provider`, `Continue`); step 2 `Workspace name`, `Back`, `Finish setup` (`OnboardingRoleStep.tsx:30-61`; `OnboardingWorkspaceStep.tsx:19-51`). Primary `Continue` / `Finish setup` — `Continue` does not name the next step.
- `openWorkspaceStep` (`useOnboardingPage.ts:39-43`) always `setWorkspaceName(resolveSuggestedWorkspaceName(…))` when phase is `incomplete`. `onBack` is `() => setStep(1)` (`118`) and does not stash the typed name. Back → Continue overwrites. Tests cover suggested fill and Back’s existence (`tests/unit/routes/onboarding.test.tsx:120-130`), not survival of an edit.
- `/owner*` redirect preselects supplier (`onboarding.contracts.ts:55-58`), so a Credit return path selects Provider.

**Visual:** `/onboarding` unsigned: pending `Loading the latest available information.`, then public `RouteError`: `Couldn’t load this page` / `The current source could not be reached. No newer state is claimed.` Actions: `Try again`, `Check system status`. Not a sign-in. Wizard unseen.

**Interpretation:** Two failures. (1) Live: an unsigned owner-to-be cannot tell “I need to sign in” from “the backend is down.” Account group requires a stable entrance and a truthful error. (2) Source: Back does not retain the workspace name — the register already named this. Role preselect from `/owner` will mis-set a Credit or owner-overview visitor as supplier if they ever reach the wizard.

**Verdict:** FAIL (unsigned error) / CODE-ONLY (Back overwrite + `/owner` → supplier)

**Evidence:** Live error quotes. `useOnboardingPage.ts:39-43,118`. `initialRoleIntentFromRedirect`. Register supporting row “Sign-in and onboarding.”

**Handoff:** Gate onboarding like other owner work, or map `identity_invalid` to sign-in with `redirect=/onboarding`. In the hook: seed the suggested name once; Back must not re-seed. Classify `/owner/credit` (and other buyer `/owner` dests) as buyer, not supplier.

---

## Cross-page

1. **`/owner*` = Provider** in sign-in, sign-up, and onboarding role intent. Credit is a Buy dest. This is the session’s worst identity break.
2. **Connect swallows grant.** Agents first-use, Authorize approve, and Agents-gated sign-in all say “connect” for authority work.
3. **Funding returns send people to Market** while telling them to return to the agent.
4. **Operator error copy is dest-blind.** Credit (and any failed owner page) inherits “before repeating a Call.”
5. **Reserved credit is not a displayed fact.** Available-only cannot satisfy the Credit row.

## Out of this walk

Signed-in first-use Agents, populated Agents, Authorize ready/approve, Credit balance/top-up success, Stripe checkout, and a completed onboarding Back→Continue were not exercised. Re-walk those after a signed-in session; do not treat this file as a pass on those states.
