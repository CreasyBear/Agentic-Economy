# Walker 5 — Shared / marketing / account / ops

**Date:** 21 September 2026  
**App:** `http://127.0.0.1:3024`  
**Method:** code + browser + interpretation. No implementation.  
**Law:** [platform-experience-audit.md](../../designs/2026-09-21-platform-experience-audit.md) S1–S7, Account/help group, eight-rule page contract; [DESIGN.md](../../../DESIGN.md) two dialects (public/editorial-discover vs operator/compact-discover). Marketing pages: one job (door), not a working dest. Overview: dashboard habit vs journey.

## How this walk was done

Isolated Cursor browser, signed out, viewport **745×958** (under `md`, hamburger chrome). Public pages rendered. Every `/owner/*` and `/admin/*` route redirected to Clerk. No purchase, no sign-in, no form submit, no account mutation.

Quoted labels are from the accessibility tree (spaces intact). Screenshots of ExtraLight display often collapse word spaces (`Whoothismarketisfor`); treat that as the same capture/tracking note walker 2 recorded, not a copy defect. Computed `/for-agents` H1 text is `Add the market to your agent.` at ExtraLight 200 / `letter-spacing: -2.64px`.

Settings dialog was attempted from chrome only (⌘K / Find Tools, hamburger). It was not invented via auth.

## Group verdict

**Account and help — FAIL.** Personal vs workspace scope is designed in a dialog that is not mounted. `/owner/workspace`, `/owner/team`, and `/owner/settings` have no operator-nav slot. ⌘K is Find Tools; typing `settings` returns “No Tools matched.” Every `/owner*` gate says the visitor is a Provider.

**Marketing doors — FAIL as doors.** `/for-agents` is a working Codex install. `/about` restates two doors without linking them, then adds settlement, catalog, and machine files. `/terms` ends as a market/provider door. Legal pages explain the product; they do not finish a personal-data or contract job.

**Ops leaked onto public editorial — FAIL.** `/developers/discovery` is a source-owned readback on an ExtraLight document shell: 0 catalogs, “Artifacts unavailable,” then a wall of Unavailable. `/developers/api` works as a dest but speaks Scalar, not AE.

**Overview — dashboard habit, not a journey dest.** Source composes “what needs attention” plus a guessed next step. Default success goes to `/owner/market`, a second Market. This session only saw the Provider-framed sign-in wall.

---

## Group findings

1. **A door that does the work is not a door.** `/for-agents` ships Browse Tools *and* an open Connect-with-Codex procedure (the same funnel walker 2 failed on Agents). About’s hero is two doors; the next sections are explanation without actions.
2. **`/owner*` means Provider at the gate.** `projectSignInCopy` treats any redirect starting `/owner` as Provider (`Sign in to manage Tools` / `return to your Provider workspace`). Overview, workspace, team, settings, and credit all inherit that lie.
3. **Account destinations have no chrome.** Workspace / Team / Account & security are labelled routes with no `nav.operator` entry. The in-task dialog exists (`AeSettingsDialog`) and is never mounted. Clerk `UserButton` (signed-in only) opens Clerk’s profile, not AE settings.
4. **Dialect leak.** Public doors use ExtraLight + uppercase site buttons (allowed editorial). Document legal/developer pages reuse that ExtraLight header, then dump compact rails, Scalar, or Clerk. Operator pages in source stay compact (`AeRecordHeader` medium title) — correct *if* reached.
5. **S7 this session is compact-only.** At 745px, primary nav is hamburger (Market / For agents / For providers). Find Tools stays in the header. Core marketing tasks work; account tasks are unreachable without inventing auth.

---

## Rollup

| Page / state | Verdict |
| --- | --- |
| `/for-agents` | **FAIL** — door + working dest; two starts |
| `/about` | **FAIL** — door restated without links; extra jobs |
| `/privacy` | **PARTIAL** — moments are clear; only CTA is Provider fix |
| `/privacy/remove-business` | **PARTIAL** — form works; three names; cards ≠ reason |
| `/terms` | **FAIL** — product explainer + doors, not terms |
| `/developers/api` | **PARTIAL** — Scalar dest works; second language / iframe |
| `/developers/discovery` | **FAIL** — ops readback on a public editorial page |
| `/owner/` Overview | **FAIL** (gate) + **CODE-ONLY** (dashboard habit) |
| `/owner/workspace` | **FAIL** (gate) + **CODE-ONLY** (Clerk dump, no nav) |
| `/owner/team` | **FAIL** (gate) + **CODE-ONLY** (two directories, no nav) |
| `/owner/settings` | **FAIL** (gate) + **CODE-ONLY** (no nav) |
| `/admin/index-health` | **FAIL** (gate) + **CODE-ONLY** (ops readback) |
| `/admin/audit-events` | **FAIL** (gate) + **CODE-ONLY** (ops readback) |
| Settings dialog from chrome | **FAIL** — not reachable; not rendered |

---

## 1. `/for-agents`

### Job
Decide to add the market to an existing agent, then leave for Market or the skill. One door. Connection procedure belongs on Agents, not here.

### Code
- Route: `src/routes/for-agents.tsx:11-39` — public header nav “For agents”; title from `AGENT_PAGE`.
- Page: `src/components/ae/agents/AeAgentDoorPage.tsx:15-48` — editorial hero + `AeAssistantInstallFunnel`.
- Copy: `src/content/brand-copy.ts:57-65` — H1 `Add the market to your agent.`; harness line `Claude Code, Cursor, and Codex`.
- Funnel: `src/components/ae/console/AeAssistantInstallFunnel.tsx:28-97` — kicker `Agent connection`, title `Connect with Codex`, ordered MCP commands, accordion `Use Claude Code or Cursor` / `Troubleshoot a connection`. No `onCheckConnection` on this door, so step 3 has no Check connection button.

### Visual quotes
- Document title: `Connect your agent | Agentic Economy`.
- Eyebrow: `Connections`. H1: `Add the market to your agent.`
- Deck: `Find the service your task needs. Connect your account, review the terms, and make a Call within the authority you have granted.`
- Primary: **Browse Tools** → `/market`. Secondary: **Read the skill** → `/SKILL.md`.
- Next region: `Agent connection` / `Connect with Codex` / `Follow these steps in order. You can browse Tools before connecting.`
- Commands: `codex mcp add agentic-economy --url "http://127.0.0.1:3024/mcp"` then `codex mcp login agentic-economy`.
- Confirm: `Connection is complete only when it appears in Agents. … Account connection does not grant spending permission.`
- Expanded: Claude Code and Cursor each have their own copy command. Troubleshoot stayed collapsed.

### Interpretation
The hero is a door (browse, or read the skill). The first scroll is a working dest: install Codex now. Same two-starts failure as Agents first-use, on a marketing URL. Meta title says “Connect your agent”; the filled button says Browse Tools. A visitor who came to understand the door is asked to run CLI. That is not “one job (door).” Editorial dialect on the H1 is correct; the funnel’s collection title is compact-discover sitting on a public door.

### Verdict
**FAIL**

### Evidence
Rendered `/for-agents` snapshot + screenshot. Funnel expanded. Computed H1 styles as above. Same funnel component walker 2 failed on `/agent-access`.

### Handoff
Keep one public door: what an agent can do, and where to start (Market or skill). Move the ordered install to Agents first-use. If a short “how it connects” must stay, collapse it and do not title the page as a live Codex procedure.

---

## 2. `/about`

### Job
Understand who the market is for, pick one door (agent or Provider), leave. Not a working dest. Not a machine-file index.

### Code
- Route: `src/routes/about.tsx:9-32`.
- Page: `src/components/ae/about/AeAboutPage.tsx:26-127` — hero CTAs, then unlinked `AboutDoor` pair, settlement prose, catalog cover, machine-file rail.
- Cover: `src/components/ae/website/AeSiteCover.tsx:18-42` — ink block; `font-display … font-medium` (second display weight).
- Copy: `src/content/brand-copy.ts:76-92`.

### Visual quotes
- H1: `Who this market is for.`
- Deck: `Agents find, compare, and call. Providers publish the job, the price, and the access terms, and get paid after delivery.`
- Filled: **Connect your agent** → `/for-agents`. Outlined: **Publish a Tool** → `/for-providers`.
- Then, no links: `For your agent` / `Browse public Tools. Connect your account when you are ready to make a Call.` and `Publish a Tool` / `Publish one bounded job…`
- `Pay per call` — browse without a Provider account; price on the card; paid after delivery.
- `Listed Providers` + **Browse the live catalog** + charcoal cover `CATALOG` / `Market` / `Inspect before you call`.
- `Files for agents`: `llms.txt`, `SKILL.md`, `.well-known/ucp`.

### Interpretation
S1 almost works in the first screen: two audiences, two CTAs, charcoal filled vs outlined. Then the page repeats the doors as dead headings (decision information split from the action), adds settlement, a third door (Market cover), and machine files. “Connect your agent” vs “For your agent” vs “Browse public Tools” are three framings of one door. Machine files do not help a human choose a door (S6). The ink cover’s medium display is a dialect leak. This is a company explainer pretending to be one door.

### Verdict
**FAIL**

### Evidence
Rendered `/about` hero, mid, and footer screenshots. Compact hamburger; no desktop primary nav this session.

### Handoff
One screen: who it is for, two linked doors, exit. Put settlement on the door that needs it. Move machine files to `/for-agents` or footer Machines (already there). Link the door copy or delete the restated block.

---

## 3. `/privacy`

### Job
Know what the market does with data at browse / call / money / publish, and reach a correction if a listing is wrong. Account-personal privacy (email, sessions, Clerk) is a different job.

### Code
- Route: `src/routes/privacy.tsx:7-37` — `AePublicPage` `kind="document"`, ExtraLight header.
- Body: `src/components/ae/legal/privacy/AePrivacyPage.tsx:6-13` — facts, moment tabs, correction CTA.
- Facts/moments: `…/privacy.contracts.ts:27-77`.
- CTA: `…/PrivacyCorrectionCta.tsx:8-26` — **Open corrections** → `/privacy/remove-business`.

### Visual quotes
- Eyebrow `Legal`. H1 `Privacy`. Deck: `What the market handles when you browse, call, pay for, or publish Tools and listings.`
- Fact labels: `Call` / `Inputs go to the selected Provider`; `Record` / `Execution facts support recovery`; `Public page` / `Private call data stays off market pages`.
- Tabs: `Call` · `Browse` · `Money` · `Publish`. Default Call: `When an agent calls a Tool` plus three points. Money tab selected in-session: `When a metered call may cost money` / reserve / settle or release.
- Footer CTA: `Need a Provider profile fixed?` / **Open corrections**.

### Interpretation
The moments are the right grain for a market privacy page: outcome first, limitation next to the fact. Tabs work. The only action is a Provider listing correction. A person who came to ask “what do you know about me?” gets Call/Browse/Money/Publish and no account, cookie, or retention path. `Call` is both a fact kicker and a tab. Document ExtraLight is the editorial dialect on a legal dest — acceptable if the page stays a public explainer; it is not compact account-help.

### Verdict
**PARTIAL**

### Evidence
Rendered `/privacy`. Money tab clicked. No mutation.

### Handoff
Keep the moments. Add one line for account/identity data or point to Account & security. Do not let Provider correction be the only next step on a buyer privacy page.

---

## 4. `/privacy/remove-business`

### Job
Send a correction or removal for one Provider profile or Tool fact, get a receipt, leave.

### Code
- Route: `src/routes/privacy.remove-business.tsx:6-33` — nav `Remove a listing`; head title `Provider correction or removal`; page title `Provider corrections`.
- Page: `src/components/ae/privacy/remove-business/AeRemoveBusinessPage.tsx:7-16` — path cards + form after `useClientMounted`.
- Cards: `remove-business.contracts.ts:14-32` — Fix / Ownership / Remove. Form reasons: `Remove Provider profile`, `Provider ownership issue`, `Duplicate or impersonation`, `Incorrect Tool or Provider facts`.
- Form: `…/RemovalRequestForm.tsx:40-142` — slug, email, reason, what should change, **Send request**. Cards are not selectable.

### Visual quotes
- First paint (pre-hydrate): path cards only; form missing from the tree. After hydrate: labelled fields `Provider slug`, `Your email`, `Reason` (default `Remove Provider profile`), `What should change?`, **Send request**.
- Cards: `Fix published facts` badge `Details`; `Resolve Provider ownership` badge `Owner`; `Remove or merge` badge `Remove`.
- Footer: both `Privacy` and `Remove a listing` marked current (parent + child).

### Interpretation
The job is real and the form is honest once hydrated. Three names (footer / H1 / document title) and four reason codes that do not map onto the three cards force the user to interpret. Default reason is full-profile removal while the H1 says corrections. Path cards look like a choice and do nothing. Brief skeleton (`Preparing correction form.`) is a flash, not a CLS twin of the form. Parent `/privacy` stays `aria-current` — S2 noise.

### Verdict
**PARTIAL**

### Evidence
Rendered after hydrate. Form not submitted (no mutation). First snapshot lacked fields.

### Handoff
One name. Make cards set the reason, or delete them and let the select carry the decision. Do not default to “Remove Provider profile” on a corrections page. Keep `/privacy` from reading as current here.

---

## 5. `/terms`

### Job
Understand the rules that govern a Call enough to decide whether to use the market. Not a second About. Not a door.

### Code
- Route: `src/routes/terms.tsx:7-32`.
- Page: `src/components/ae/legal/terms/AeTermsPage.tsx:12-31` — capability list, practice accordion, then **Browse catalog** + **Publish a Tool**.
- Accordion cards: `…/TermsPracticeAccordion.tsx:14` — `rounded-card border bg-card`.
- Copy: `…/terms.contracts.ts:17-51`.

### Visual quotes
- H1 `Terms`. Deck: `Use Agentic Economy to find, inspect, pay for, and call published Tools.`
- List: `Find a Tool` / `Compare exact offers` / `Call through one boundary`.
- `What these terms mean in practice` — first item open: `The exact Tool sets the terms`. Collapsed: `Payment is not proof of delivery`; `Replay cannot create a second call or charge`.
- Bottom (in tree): **Browse catalog** → `/market`; **Publish a Tool** → `/for-providers`.

### Interpretation
This is the product chain restated as “terms,” then converted into doors. The three practice lines are the useful law (Tool sets terms; payment ≠ delivery; replay ≠ new charge). They sit in bordered cards DESIGN reserves for objects with their own action. There is no party, liability, or account-closure job. A legal dest that primary-actions into Market fails “one job” and S6 (essentials vs promotion).

### Verdict
**FAIL**

### Evidence
Rendered `/terms` screenshot + tree. Browse/Publish links present.

### Handoff
Lead with the three practice facts as prose, not cards. Drop the capability list (it is About/Market). Move Browse/Publish off this page or make them text links after the law.

---

## 6. `/developers/api`

### Job
Inspect the public REST surface (market reads, Call gateway, funding preflight, discovery) as a working dest for builders.

### Code
- Route: `src/routes/developers.api.tsx:14-51` — ExtraLight document header + `iframe` `srcDoc` loading Scalar CDN against `/openapi.json`. Comment: Scalar mutates `document.body`; keep it inside srcDoc.

### Visual quotes
- Eyebrow `Developers`. H1 `API reference`.
- Deck: `Every public REST operation - Tool market reads, the Call gateway, funding preflight, and business discovery - documented from the same contracts the platform runs on.`
- Inside iframe (pixels only; no a11y refs): `Agentic Economy API`, `Download OpenAPI Document`, `v0.1.0` / `OpenAPI 3.1.0`, Server `http://127.0.0.1:3024`, `No authentication selected`, Client Libraries (Shell, Ruby, Node.js, PHP, Python…), heading `Call gateway`.
- Iframe box: ~724×671. Tree has no operations.

### Interpretation
This is correctly a working dest, not a door. It fails S3/S7: Scalar is a second interaction language (white chrome, its own type, hamburger) inside an inaccessible iframe. The AE header is editorial ExtraLight sitting on a foreign app. A keyboard or AT user gets the deck and then a hole.

### Verdict
**PARTIAL**

### Evidence
Rendered screenshot. CDP measured iframe. Snapshot contained no Scalar controls.

### Handoff
Keep one builder dest. Either project the OpenAPI in AE compact rails, or drop the ExtraLight page chrome and treat Scalar as the page. Do not stack two dialects.

---

## 7. `/developers/discovery`

### Job
A builder should get current public catalog files, or a single honest “not published” state. This must not be an internal readback.

### Code
- Route: `src/routes/developers.discovery.tsx:14-174` — public (no operator guard), ExtraLight document header, download actions, then five `AeCollectionRail` blocks (readback, facts, schema, route health, support matrix, exclusions).
- Empty: `AeEmptyState` `No published catalog facts`.
- Health rows use `https://ae.example/...` placeholders while some rows say Available and the matrix says Unavailable.

### Visual quotes
- Title: `Read-only public catalog files`.
- Deck: `Source-owned catalog facts, schema shape, examples, freshness, and unavailable capability reasons for builders.`
- Header actions: **Download schema JSON** · **Download examples JSON**.
- `Source-owned readback` / `This page does not grant mutation, booking, commercial, or owner-action authority.`
- Facts: Freshness `Artifacts unavailable`; Published catalogs `0`; Schema version `developer-discovery:v1`; `Route returned current public readback.`
- Empty inbox: `No published catalog facts`.
- Later (tree): path rows mix `Available` (`https://ae.example/api/businesses`) with support-matrix `Unavailable` / `repair source readback before public claims`, then a long `Not in this product` list (API keys, SDK, CLI, plugin, hosted MCP, Agent Router, payment descriptors…).

### Interpretation
S1 fails immediately: a visitor cannot say what they can do. The page is an ops console (freshness, DTO, fixture labels, gated exclusions) wearing editorial display. Download buttons remain while artifacts are unavailable. Available + `ae.example` + matrix Unavailable is three truths. `Not in this product` is a backlog, not a decision. Footer Resources lists API reference only — this dest is a side door.

### Verdict
**FAIL**

### Evidence
Rendered first screen + full a11y tree. Public, unsigned.

### Handoff
If catalogs are 0, one empty + one download-when-real. Move readback/matrix to `/admin/index-health`. Do not publish placeholder hosts as Available.

---

## 8. `/owner/` Overview

### Job
A returning owner should continue a journey (selected Tool, open Call, missing Agent/credit) — not survey a dashboard. Habit home vs journey dest is the question.

### Code
- Route: `src/routes/_operator/owner.index.tsx:13-60` — nav **Overview**, group Workspace, `mobilePrimary`, dashboard icon. Loader settles balance / calls / agents / provider independently.
- Page: `src/components/ae/console/AeOwnerOverview.tsx:72-133` — title `Overview` / `See what needs attention, your available Balance, and connected Agents.` Section **Next step** + fact rows (Balance, Calls, Agents, optional Provider) + `Want to offer a service?`
- Next-step machine: `src/modules/principal-account/owner-overview.view-model.ts:51-106` — attention Calls → incomplete Calls → Agents → Balance → else **Explore Market** → `/owner/market`.
- Gate copy: `src/components/ae/auth/sign-in/sign-in.contracts.ts:25-34` — `redirect?.startsWith('/owner')` ⇒ Provider.

### Visual quotes (this session)
- URL: `/sign-in?redirect=%2Fowner`.
- H1: `Sign in to manage Tools`.
- Deck: `Use email, Google, GitHub, or a passkey. After you sign in, you’ll return to your Provider workspace.`
- Minimal chrome: **Back to market**. Path chip `/sign-in`.

### Interpretation
The rendered page is the wrong door: Overview is framed as Provider tool management. In source, Overview is a habit dashboard (four account facts) with a synthetic “Next step.” That next step is recovery/setup, not Find → inspect → use. Healthy state sends people to a second Market (`/owner/market`), not `/market` and not a retained Tool. Provider is an optional fourth row or an “Offer a Tool” aside — Supply leaking into the buyer habit home. DESIGN forbids treating this as a trading-desk dashboard; the composition is still “tiles of account state.”

### Verdict
**FAIL** (gate). **CODE-ONLY FAIL** (dashboard habit vs journey). Normal signed-in Overview **NOT CHECKED** in pixels.

### Evidence
Browser gate + `projectSignInCopy`. Page/next-step source as cited. No invented session.

### Handoff
Stop classifying all `/owner*` as Provider at sign-in. If Overview stays, it is a habit inbox: one next action from real work (open Call, missing Agent, empty credit), then links. Do not invent a second Market. Do not lead with four status rows.

---

## 9. `/owner/workspace`

### Job
Change this workspace’s public profile, tax facts, or dangerous ownership — knowing the scope is the workspace, not the person.

### Code
- Route: `src/routes/_operator/owner.workspace.tsx:10-48` — title `Workspace`. **No** `nav.operator` (not in sidebar). Stack: Clerk `OrganizationProfile` `general`, `TaxProfileFormSection`, `WorkspaceDangerZone`.
- Dialog twin: `settings-dialog/components/WorkspaceSettingsBody.tsx:11-44` dumps general + tax + danger + members + canonical directory into one scroll.

### Visual quotes (this session)
- `/sign-in?redirect=%2Fowner%2Fworkspace` — same Provider copy as Overview.

### Interpretation
Unauthenticated: the job is misnamed. Authenticated (source): three systems on one page (Clerk org, AE tax, close/transfer). Scope is implicit. No save/cancel contract at page level — Clerk owns general; tax has its own submit. Account/help requires explicit personal vs workspace and a stable entrance. This route has neither. Treating `/owner/workspace` as an `overview-cards` skeleton (`AeRouteStates.tsx:48`) admits it was designed as a dashboard, not a settings task.

### Verdict
**FAIL** (gate). **CODE-ONLY** for the dump. Pixels of Clerk/tax/danger **NOT CHECKED**.

### Evidence
Gate URL + copy. Route source. Sidebar builder requires `nav.operator` (`AeOperatorSidebar.tsx:161-169`).

### Handoff
Give workspace a labelled entrance or fold it into one settings dest with a Workspace tab. Do not stack Clerk + tax + danger as three first-class stories. Fix the `/owner` sign-in classifier.

---

## 10. `/owner/team`

### Job
See who is in the workspace, invite or remove, and trust one directory.

### Code
- Route: `src/routes/_operator/owner.team.tsx:10-51` — title `Team`. **No** `nav.operator`. Clerk `OrganizationProfile` `members` + heading `Canonical directory` + `AeTeamDirectoryTable`.
- Table: `src/components/ae/settings/AeTeamDirectoryTable.tsx` — Name / Email / Role / Status / Joined.

### Visual quotes (this session)
- `/sign-in?redirect=%2Fowner%2Fteam` — `Sign in to manage Tools` / Provider workspace.

### Interpretation
Two member lists (Clerk vs AE “canonical”) is the user interpreting the system. No chrome entrance. Gate is Provider again. Account/help: personal vs workspace must be explicit — this page never says “workspace members,” only `Team`.

### Verdict
**FAIL** (gate). **CODE-ONLY** (two directories). Table states **NOT CHECKED**.

### Evidence
Gate + route source. Dialog body repeats both lists.

### Handoff
One directory. One entrance (settings Workspace or a Team item). Same sign-in classifier fix.

---

## 11. `/owner/settings`

### Job
Manage this person’s profile, sessions, recovery, and email alerts without losing the previous task.

### Code
- Route: `src/routes/_operator/owner.settings.tsx:9-35` — nav label `Account & security`. **No** `nav.operator`. Loader: security history. Shell title from `ownerSettingsChrome` (`Account & security` / `Manage your owner profile, active sessions, recovery, and security history.`).
- Body: `src/components/ae/settings/OwnerSettingsSections.tsx:15-65` — Clerk `UserProfile`, Sign out, compromise checklist, email alerts, security history.

### Visual quotes (this session)
- `/sign-in?redirect=%2Fowner%2Fsettings` — Provider workspace copy.

### Interpretation
The page is the personal-scope dest the dialog claims to overlay. It has no sidebar slot, so the only signed-in chrome for “me” is Clerk’s `UserButton` modal (`AeAppShell.tsx:173`, `AeOperatorSidebar.tsx:131-132`) — a different product. Email-alert state is local React (`useState(DEFAULT_…)`) and is not a save/cancel contract. Gate still says Provider.

### Verdict
**FAIL** (gate + no entrance). **CODE-ONLY** for the stack. Signed-in settings **NOT CHECKED**.

### Evidence
Gate + route + `AccountSettingsSection`. No operator nav on this file.

### Handoff
Stable Account entrance. Keep Clerk profile *or* AE sections, not a scroll of both plus a second Clerk modal in the header. Persist notification saves. Fix `/owner` sign-in copy.

---

## 12. `/admin/index-health`

### Job
An admin checks catalog/projection readback before public discovery ships. Not a buyer dest.

### Code
- Route: `src/routes/_operator/admin.index-health.tsx:13-60` — nav **Catalog health**, admin Records. Search can open `SourceAuthorityReviewPanel`.
- Page: `src/components/ae/admin/catalog-health/AeAdminCatalogHealthPage.tsx:7-26` — compact operator title + `AeAdminReadbackPanel`.
- Panel: `src/components/ae/readback/AeAdminReadbackPanel.tsx:42-66` — `Readback available` / `Access denied` + `HTTP {status}`.

### Visual quotes (this session)
- `/sign-in?redirect=%2Fadmin%2Findex-health`.
- H1 `Sign in` (generic, not Provider). Deck: `After you sign in, you’ll return to where you left off.`

### Interpretation
Gate is less dishonest than `/owner*` but does not name the admin job. In source this is the correct compact ops dest — and it is the page `/developers/discovery` is impersonating in public. S2: Catalog health is a stable admin dest, not a primary buyer item. Good. Unsigned cannot verify denied vs allowed chrome.

### Verdict
**FAIL** (unsigned gate only). **CODE-ONLY** for the operator page. Rendered admin **NOT CHECKED**.

### Evidence
Gate + source. Contrast with public `/developers/discovery`.

### Handoff
Keep this the only catalog-readback dest. Do not require a buyer to see `developer-discovery:v1` on a marketing shell.

---

## 13. `/admin/audit-events`

### Job
Inspect redacted admin/recovery transitions. Not a buyer activity log.

### Code
- Route: `src/routes/_operator/admin.audit-events.tsx:12-58` — nav **Audit**; page title `Activity log` / `Inspect admin and recovery transitions with redacted payloads after source-owned membership is resolved.`
- Same `AeAdminReadbackPanel` with title `Audit readback`.

### Visual quotes (this session)
- `/sign-in?redirect=%2Fadmin%2Faudit-events` — generic `Sign in` / return to where you left off.

### Interpretation
Nav says Audit; title says Activity log; panel says Audit readback. Buyer `/activity` is also “Calls & Activity.” S3: same word, different objects. Compact dialect in source is right. Unsigned: only the gate.

### Verdict
**FAIL** (gate). **CODE-ONLY** (naming). Admin table **NOT CHECKED**.

### Evidence
Gate + route title vs nav label vs buyer Activity.

### Handoff
One name: Audit (admin) vs Calls (buyer). Do not reuse “Activity log.”

---

## 14. Settings dialog (⌘K / user menu)

### Job
Change personal or workspace settings without leaving the current task. Scope tabs explicit. Save/cancel/return. Not a navigation dest.

### Code
- Dialog: `src/components/ae/settings/settings-dialog/AeSettingsDialog.tsx:28-70` — title `Account & settings` / `Personal profile and workspace controls without leaving your current task.` Tabs Personal | Workspace. Personal loads security history; workspace mounts `WorkspaceSettingsBody` (org + tax + danger + members + directory).
- Hook: `useAeSettingsDialog.ts:13-33` — `openSettings` no-ops on `/owner/settings|team|workspace`.
- Command panel: `AeCommandPanel.tsx:35-38,138-140` optional `onOpenSettings`. `COMMAND_NAVIGATION_ITEMS` (`tools-search-page.contracts.ts:63-100`) has **no** `opensSettings` item.
- Shell: `src/components/ae/layout/AeAppShell.tsx:166` renders `<AeCommandPanel />` with no `onOpenSettings`. `useAeSettingsDialog` is never called from a parent. Grep: dialog imported only by its tests.

### Visual quotes
- Find Tools (⌘K) open on `/about`: Navigation = Tools Market, Calls & Activity, My tools, Balance & Credit, Agent Access & Keys, Provider Workspace. Quick Actions = Toggle Theme, Check System Status. No Account, Settings, Workspace, or Team.
- Query `settings`: `No Tools matched “settings”.` / **Try again** / **Clear search** / **Browse current Tools**.
- Signed-out chrome: Find Tools, Appearance, Open menu. No user menu. Menu (from peer walker + route `header.audience`): Market, For agents, For providers.

### Interpretation
The dialog is the Account/help entrance the pages need, and it is dead code. ⌘K is search, not settings. A signed-out visitor cannot open it; a signed-in visitor (source) gets Clerk’s profile modal instead. Even if mounted, Workspace scope would dump five sections into a 42rem dialog — a dest wearing a modal. Law: settings have a stable entrance; this has a component and no door.

### Verdict
**FAIL** (not reachable). Dialog UI **NOT CHECKED** in pixels. No auth was invented.

### Evidence
Rendered command panel + `settings` empty. Source: dialog unmounted; nav items lack `opensSettings`; AppShell does not pass the callback.

### Handoff
Mount the dialog from chrome *or* delete it and put Account in operator nav. Do not leave both. If mounted, Personal = profile/security only; Workspace = one of profile / members / danger, not all. ⌘K stays Find Tools.

---

## Site rules (this family)

| ID | Judgment | Note |
| --- | --- | --- |
| S1 | FAIL | About/for-agents do not leave one start. Discovery readback is unintelligible. `/owner` gate names the wrong role. |
| S2 | FAIL | Workspace/Team/Settings have paths and no nav. Audit ≠ Activity. Footer dual-current on remove-business. |
| S3 | FAIL | Scalar vs AE. Clerk vs AE directories. Browse Tools vs Connect your agent vs Connect with Codex. |
| S4 | n/a here | These pages are not Find → use. They interrupt it (install funnel, Provider gate). |
| S5 | PARTIAL | `redirect=` survives. Settings query does not open settings. `/privacy` stays current on the child. |
| S6 | FAIL | Machine files, discovery exclusions, and Market CTAs precede or replace the page job. |
| S7 | PARTIAL | Compact 745px: hamburger + Find Tools work. API iframe has no AT. Settings unreachable by keyboard. |

## Dialects

- **Editorial** is used correctly on `/for-agents` and `/about` heroes (ExtraLight, tracked eyebrow, uppercase site buttons).
- **Editorial is over-applied** to legal and developer document headers. Those are dests, not doors.
- **Compact** is correct in Overview / settings / admin source (`AeRecordHeader` medium title, no 7xl).
- **Forbidden mix:** ExtraLight page + Scalar; ExtraLight page + source-owned readback; ExtraLight door + live Codex workbench.

## Handoff (family)

1. Doors stay doors. Install lives on Agents. About keeps two linked CTAs and deletes the restated/unlinked block.
2. Classify sign-in by job, not by `/owner` prefix. Overview/settings/team/workspace are not Provider.
3. One Account entrance. Wire the dialog or nav-item the three orphan routes. ⌘K is not that entrance.
4. Move developer discovery readback to admin catalog health. Leave `/developers/api` as the builder dest, in one language.
5. Overview is not a fourth buyer dest. If it stays, it is a single next-action inbox, not a dashboard plus a second Market.
