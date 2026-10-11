# Path verification, 2026-10-11

Swarm 2 result for `lifecycle-map-2026-10-11.md` section 6. Eight explorers (A web, B CLI, C MCP, D HTTP, E funding, F provider, G email, H operator), each row checked by two independent verifiers. Live probes were read-only: no sign-up, payment, POST or paid call. Money rows are marked $.

Totals: 221 rows. Works 100, broken 46, missing 26, untestable 49. Of the 72 broken or missing rows, 71 confirmed, 1 refuted, 0 disputed.

## 1. Surface by path matrix

Cell key: works, broken, missing, untestable, n/a. A cell with two values means different rows disagree; the first is the golden row. Detail rows sit in sections 2 and 4.

### Anonymous browser

| Path | Web | ae CLI | MCP | HTTP | Email |
| --- | --- | --- | --- | --- | --- |
| Browse to tool page (golden) | works | works (describe) | works | works | n/a |
| Search by query and category tiles (golden) | broken | broken (503) | broken (same action) | n/a | n/a |
| Keyless first call (golden, $) | untestable | untestable | untestable | untestable | n/a |
| Sign-up prompt, trial, anonymous chat (golden) | works | n/a | n/a | n/a | welcome untestable |
| Start action (golden, $) | broken (three competing) | n/a | n/a | n/a | n/a |
| Availability copy: launch, status, for-agents | broken (contradict) | works | n/a | broken (/api/ready) | n/a |
| Catalogue freshness (edge) | broken | missing | missing | works (stale, 41 h) | n/a |
| Provider disclosure, OpenRouter (edge) | works (/market), missing (/t/new) | works | works | n/a | n/a |
| Dead ends: 404s, shims, soft 404s (unhappy) | broken | n/a | n/a | n/a | n/a |
| Agent-readable files (side) | works | n/a | missing (readonly=1 undocumented) | works | n/a |

### Agent builder and owner

| Path | Web | ae CLI | MCP | HTTP | Email |
| --- | --- | --- | --- | --- | --- |
| Fund: quote and limits ($) | untestable | broken (via constraints) | untestable | broken (503) | n/a |
| Fund: Stripe settles, receipt ($) | works | works (handoff) | untestable | works (webhook) | untestable (dark flag) |
| Fund unhappy: webhook late, async fail, expiry ($) | broken | broken | broken | broken | missing (no producer) |
| Fund: x402 as a funding path ($) | missing | missing | missing | missing | n/a |
| Fund gate: payments audience ($) | broken | broken | n/a | broken | n/a |
| Quote, Call, receipt ($) | untestable | untestable | untestable | untestable | untestable |
| Call history, status, wait | untestable | works | untestable | untestable | n/a |
| Refusal: balance vs cap, nextCommand ($) | untestable | untestable | missing | broken (200 on not-ready) | missing |
| Key revoke (side) | works (handoff) | works (handoff) | missing | n/a | missing |
| Alerts: per-kind opt-out ($) | broken | n/a | n/a | n/a | broken |
| Doctor and install | n/a | broken | works | n/a | n/a |
| Team member journey (3.6) | not walked | not walked | not walked | not walked | missing |

### Provider

| Path | Web | ae CLI | MCP | HTTP | Email |
| --- | --- | --- | --- | --- | --- |
| Publish (golden) | untestable | untestable | untestable | untestable | untestable (dark flag) |
| Verification failed (unhappy) | missing (pull only) | missing (pull only) | untestable | n/a | missing |
| Offboarding start and status | works | untestable | untestable | works | untestable |
| Offboarding in-flight Calls and payouts ($) | broken, missing | n/a | n/a | n/a | missing |
| Edit, price, pause (side) | missing | missing | missing | missing | n/a |
| Public listing after publish | broken (soft 404) | n/a | n/a | n/a | n/a |

### Operator

| Path | Web | ae CLI | MCP | HTTP | Email |
| --- | --- | --- | --- | --- | --- |
| Digest (golden) | n/a | n/a | n/a | n/a | broken (no queues, no CTA) |
| Uncertain Call queue ($) | works (broken 15 min filter) | missing | missing | missing | missing |
| Stuck funding, ledger, refund, chargeback queues ($) | missing | missing | missing | missing | missing |

Matrix corrections to lifecycle-map 3.8: MCP provider toolset exists in source (`mcp-toolsets.ts:8-14`), so "no" is wrong; operator CLI is missing, not partial; operator HTTP and MCP are confirmed missing; Fund via x402 has no code.

## 2. Confirmed broken and missing, ranked

Ranked by user harm, money first. Wave is from lifecycle-map 5.3.

### Money

1. Funding constraints 503 and quote blocked while `/api/ready` says sellable true. `api.v1.funding.constraints.ts:28-31`, `readiness.ts:340-377`. Wave 1 (availability truth), refusal code in wave 4.
2. Payments audience gate not applied on funding start; Stripe checkout can be created while copy says funding is not open. `ownerReserve.ts`, `agentFundingHandoff.ts`. Wave 1 (audience value read and documented).
3. Paid session never credits if the webhook is missed: public `/fund` read is DB-only; agent status never fulfils (`funding-handoff-api.ts:181-216`, `account-funding-http.ts:441`). Wave 4.
4. Funding expiry has no writer or cron; `checkout.session.expired` not subscribed; `/fund` loops on "Check this payment". Wave 4.
5. Async payment failure shows "Payment failed" with no retry; `funding_failed` has no producer. Wave 4.
6. Webhook ingest refusals return 503 so Stripe retries non-retryable failures (`stripe-webhook.ts:130-137`). Wave 4.
7. Operator has no queue for stuck funding, ledger credit failure, chargeback, or payment_stuck; no operator CLI, MCP or HTTP read. Waves 4 and 6.
8. x402 never emits `funded`, so the digest counts x402 funders as stalled; x402 has no funding path in code. Wave 3.
9. Provider payouts: `hasUnresolvedPayouts` stub returns false, payout states never render, payout emails have no producer. Wave 6.
10. Offboarding completion hardcodes zero active Calls (`verifyPages.ts` about 106). Wave 6.
11. Search 503 `tool-search-result-invalid` on 4 of 9 queries (`tools/ae/commands/search.ts:55-63`); web search shows "Search is unavailable" on every query. Golden path blocker. Wave 1 (pulled forward).
12. `POST /tools/call` returns HTTP 200 for not-ready refusal, OpenAPI says 503 (latent). Wave 5.
13. Price label A$0.01 against indicative about A$0.0072 on one Tool (unconfirmed intent). Wave 1.
14. Spend-cap and low-credit alerts have no per-kind opt-out. Blocked on D3.
15. Missing email producers: `funding_failed`, `credit_exhausted`, `task_stuck`, key and role kinds, provider kinds, `operator_exception`. Waves 4 and 6.
16. Uncertain Call queue filters after pagination and is not environment-scoped like the overview; denied read returns an empty page. Wave 5.

### Truth and dead ends

17. `/for-agents` "Start setup" contradicts its own pre-launch FAQ (`brand-copy.ts:55,71`). Wave 1.
18. `/status` says Tool API operational while search is unavailable; catalogue stale (41 h) with no banner on web, CLI or MCP. Wave 1.
19. OpenRouter disclosure missing on `/t/new`. Wave 1.
20. Three competing start actions. Wave 2, blocked on D5.
21. 404s: aecon.ai `/docs` `/status` `/support` `/trial`; app `/pricing` `/launch` `/developers`. Wave 2. (`/pricing` on aecon.ai is now 200.)
22. Owner redirect shims still present (seven files). Wave 2.
23. Registry external listings have no web page; soft 404s on `/tools/x` and `/providers/example`, the latter misstates a missing host as an outage. Wave 2.
24. CLI: `ae doctor` offers `npm run dev:local` to hosted users; `--version` reports development; `list --limit 2` returns 1; unknown call ref has no `nextCommand`. Wave 2.
25. MCP: readonly refusal does not name the fix; `readonly=1` undocumented; no buyer revoke tool. Waves 2 and 5.
26. HTTP: `afterVersion` error mislabelled `invalid_call_ref`. Wave 5.
27. Digest: no queue content, plain text without CTA, silent on missing env or Resend 4xx, single recipient, 24 h vs 72 h threshold. Waves 4 and 6; threshold blocked on D3.
28. Provider: verification and cleanup failures have no push; no edit, price or pause action; `withdraw` input names drift; provider lease reconciliation not located. Wave 6.
29. Buyer copy on `/fund` names Stripe and sends non-owner payers to "open Credit". Wave 4.

## 3. Disputed and refuted

- Refund failure (15c): refuted. Dropped from the broken list; no change to the matrix beyond the operator queue row group.
- Disputed: none.

## 4. Coverage gaps

31 paths in lifecycle-map section 3 that no explorer walked:

- Team member persona (3.6): accept invite, invite expiry or wrong address, role blocks action with named grantor, role removed mid-session, owner changes role, member leaves, member holds an agent key when removed, last owner removes self (7).
- Owner side paths (3.1, 3.5): key rotation, export, saved tools, market requests, change payment method, team invite, role change (7).
- Owner edge cases: account closed with open holds, empty states, month-boundary cap counting, email change snapshot, dormancy (5).
- Install fails (CLI tarball or npm name 404) (1).
- Spend cap distinct from balance on refusal (1); approval pending over cap rollup (1); low credit unseen until a Call fails (1); `invoice_ready` tax invoice over A$1,000 (1).
- Agent: OAuth grant renewal, key rotation while the agent runs, toolset switching, spend cap mid-task (4).
- Provider: second listing, first paid Call (2).
- Browser: arrival from a shared tool link, waitlist submit (2).

Deletion and export is blocked on D4 and excluded.

## 5. Wave 1 and 2 fix list

Each item is one atomic task. Verify by real use through the surface named.

### Wave 1, launch truth

1. Fix search output schema mismatch. File `tools/ae/commands/search.ts:55-63` and shared `toolChoiceSearchOutputSchema`. Verify: `ae search weather --json` returns ok, and `/market?query=weather` renders results.
2. Align `/for-agents` CTA and subhead with the pre-launch state. Files `src/content/brand-copy.ts:55,71`, `AeAgentDoorPage.tsx:25`. Verify: curl `/for-agents` as markdown and `ae status`; availability string matches `/launch`.
3. Drive `/status` Tool API row from the real search probe. Verify: stop search, then `curl /status` shows degraded.
4. Surface catalogue staleness in web, CLI and MCP. Files `src/modules/common/freshness.ts:13`, `mcp-api.ts:210-245`, CLI list and search. Verify: `ae list --json` and `/market?view=tools` both show stale.
5. Return the funding refusal code from constraints and base `sellable` on it. Files `api.v1.funding.constraints.ts:28-31`, `readiness.ts:340-377`. Verify: `curl /api/v1/funding/constraints` and `curl /api/ready` agree.
6. Read and document the payments audience value, and gate funding start on it. Files `ownerReserve.ts`, `agentFundingHandoff.ts`. Verify: `ae fund` handoff refuses when audience is not open.
7. Add OpenRouter disclosure to `/t/new`. Verify: curl `/t/new` text contains `openrouter.ai`.
8. Confirm the Tool price rounding rule and label it. Verify: `ae describe` label matches `displayPrice`.

### Wave 2, dead ends and install

9. Add `/docs`, `/status`, `/support` on aecon.ai (redirect to app). Verify: `curl -I` each returns 200 or 308.
10. Redirect app `/pricing`, `/launch`, `/developers` to marketing. Verify: `curl -I`.
11. Remove the seven owner redirect shims. Files `_operator/owner.index.tsx`, `owner.market.tsx`, `owner.team.tsx`, `owner.workspace.tsx`, `owner.settings.tsx`, `owner.operations.new.tsx`, `owner.settings.account.$.tsx`. Verify: sign-in redirect lands on the real routes.
12. Return real 404 for invalid tool refs and unknown hosts, and fix the host-unavailable copy. Files `tools.$toolRef.tsx`, providers route. Verify: `curl -I /tools/x` returns 404.
13. Add a web page or link-out for `registry:` listings. Verify: open a `/api/v1/registry` id in the browser.
14. Replace `npm run dev:local` in `ae doctor` with a hosted action, and set release provenance in `--version`. Verify: `ae doctor --json` and `ae --version`.
15. Honour `ae list --limit`, and add `nextCommand` to unknown call refs. Verify: `ae list --limit 2 --json` count 2; `ae wait <bad ref>`.
16. Put one MCP line and `readonly=1` on `/developers` and in `llms.txt`, and name the fix in the readonly refusal. Verify: curl both files; readonly `tools/call` on a buy tool via `ae doctor` MCP check.
17. Single start action. Blocked on D5.

## Unwalked paths, walked 2026-10-11

Method: live GET only (no POST, no paid call, no sign-in), local `ae` read-only commands, and source reads. "Source" rows are judged from code, because the web app sits behind sign-in (`/owner/*` returns 307 to `/sign-in`). Status key: works, broken, missing (no surface or behaviour exists), untestable (needs a credential or second session). Surfaces: Web = app.aecon.ai, Mkt = aecon.ai, API = public API (`openapi.json`, 62 paths, no team, invite, role, export or close route), CLI = `ae`, MCP = `app.aecon.ai/mcp` (GET 405, POST and DELETE only).

Caveat: the `ae` on PATH resolves to the Agentic-Economy checkout `packages/cli/dist/ae.js` and prints `ae 0.3.2 (development)`, not the waves36 build.

### A. Team member paths (P1 to P8)

Mkt is missing for every row: aecon.ai has no team surface (`GET /` returns 200, `/for-agents` returns 308).

| Path | Web (source) | API | CLI | MCP | Evidence |
|---|---|---|---|---|---|
| P1 accept invite | untestable | missing | missing | missing | Needs a real invite ticket. No accept route under `src/routes` (only `owner.settings.team.tsx`). Clerk-hosted acceptance feeds `memberships/membershipCreated.ts`. `ae account status` has no role field. No invite tool in `src/lib/mcp-protocol.ts`. |
| P2 invite expiry or wrong address | missing | missing | missing | missing | `workspace/invitation.ts:13-37` has only available, role_restricted, organization_unset, binding_unavailable. No expired or wrong-email outcome, no invitation email kind. Expiry left to Clerk. |
| P3 role blocks action, named grantor | broken | untestable | untestable | untestable | `TeamRolesPage.tsx:11` "Ask an owner or admin" names a role class. `TeamAccessManagement.tsx:18` "Your current account role cannot make this change" names no one. `GET /api/v1/account` unauthenticated returns 401. |
| P4 role removed mid-session | untestable | untestable | untestable | untestable | `membershipUpdated.ts:98-122` patches role and audits, no session revocation. Next-request behaviour depends on `accessFacts.ts`, not traced. |
| P5 owner changes role | untestable | missing | missing | missing | Role chosen at invite (`TeamInviteDialog.tsx:35-40`). Change applied via `membershipUpdated.ts:98-122` with a role_changed audit. No change-role control confirmed. |
| P6 member leaves | missing | missing | missing | missing | No leave action in `team-roles/`. `ae account disconnect` removes only the local profile. |
| P7 member holds agent key when removed | broken | untestable | untestable | untestable | `membershipDeleted.ts` ends the membership with no call into agentAccess. `revocation.ts:217` is a read-time guard, not a revocation. |
| P8 last owner removes self | broken | missing | missing | missing | `membershipDeleted.ts:60-69` returns `ignored` for any active `accountOwnerships` row, so a Clerk-removed owner stays owner in AE. Last-owner guards exist only in account deletion and the admin console. |

3.6 source pass (second walker) agrees: `manageTeamInvitationServer` offers cancel and resend only (no edit-address); server refusals are bare codes (`forbidden`, `stale`); `changeTeamAccessServer` refuses any change to the owner row with generic `stale`; `membershipDeleted.ts` has no key, credential or revoke logic; `changeTeamAccessServer` supports admin, member, remove with MFA and a staleness check (works); last-admin guard refuses when admins < 2 (works).

### B. Owner side paths (lifecycle 3.1, 3.5, 3.6)

Mkt is untestable for every row: no owner surface on aecon.ai (`/team`, `/settings`, `/account`, `/keys`, `/agent-keys`, `/billing`, `/credit`, `/export`, `/saved` all 404).

| Path | Web (source) | API | CLI | MCP | Evidence |
|---|---|---|---|---|---|
| Team invite | works | missing | missing | missing | `TeamInviteDialog` to `inviteTeamMemberServer` creates a Clerk org invitation; cancel and resend in `team-access.functions.ts:89-107`. `ae help invite` is Unknown command. No invite action in `mcp-toolsets.ts:4-12`. |
| Role change | broken | missing | missing | missing | `changeTeamAccessServer` (`team-access.functions.ts:55-88`) is owner-only, MFA-gated, guards last admin. Broken on the named-grantor rule (`TeamAccessManagement.tsx:17`). |
| Key rotation | missing | missing | missing | missing | `/owner/settings/agent-keys` offers create and revoke only (`AeAgentKeysSettings.tsx:71`). Rotation exists only in the OAuth consent path (`oauth/contracts.ts:14,29`). `AeCompromiseRecoveryChecklist.tsx:17-18` promises a rotation the page does not offer. Audit kind `api_key.rotated` exists but `apiKeyRevokeRotate: 0` in `developer-discovery-support-matrix.ts:40`. |
| Data export | broken | untestable | missing | missing | `owner.settings.privacy.tsx:20` links `/api/owner/data-export` (401 problem+json unauthenticated, auth gate works). Sections: personal, tax profile, agent connections, calls, invoices. Saved tools and market requests absent from `exportData.ts`. Failing sections degrade to excluded. |
| Saved tools | works | untestable | works | works | `DirectorySavedTools.tsx`; `ae saved list --json` returns available, items []. API routes are POST-only (405 on GET). MCP `market.savedTools.*`, readonly=1 blocks writes. |
| Market requests | missing | untestable | works | works | No owner settings page lists or withdraws requests. `ae request list --json` returns available, items []. MCP `marketDemand.*`. |
| Change payment method | missing | missing | missing | missing | No saved-card management. `card_changed` email has no producer (`notifications/enqueue.ts:23,32`); `billing.portal_started` has no emitter. `ae` fund is handoff only. |

### C. Owner edges

| Path | Web (source) | Others | Evidence |
|---|---|---|---|
| E1 account closed with open holds | broken | API, CLI, MCP missing | `close.ts` runs `checkWorkspaceFences` (`decommissionFences.ts:33-92`) for obligations, calls, holds, funding, reconciliation. Gap: no disposition for a positive credit balance on close. |
| E2 empty states | untestable | CLI works (empty items) | Copy found for keys, receipts, saved needs, providers, reports. Zero-funds and no-reachable-tools states not located. |
| E3 month-boundary cap counting | broken | untestable | `utc-calendar.ts:21-27`, `periods.ts:34`: caps reset on the UTC month. 09:00 AEDT on 1 Nov counts against October. No AU-local option. |
| E4 email change snapshot | broken | untestable | `notificationDelivery.ts:40-75` reads `primaryEmailAddress` at send time, so the notice goes to the new address; no old-address snapshot. |
| E5 dormancy | missing | API, CLI, MCP missing | Only `account_inactive` guards and 30-day chat retention copy. No inactivity state, notice or cleanup. |

Second pass, source only and unwalked live: cap-vs-balance refusal distinction, approval pending over cap, low-credit alert before a failed call (`usageAlerts.ts` gated by prefs), `invoice_ready` over A$1,000 (no threshold found), spend cap mid-task, provider second listing. All untestable without a credential.

### D. Agent paths

| Path | Web | API | CLI | MCP | Evidence |
|---|---|---|---|---|---|
| OAuth grant renewal | works | works | works | untestable | AS metadata lists `refresh_token`; `token-family.ts:121-240`, `refreshFamilies.ts:190-200` (reuse revokes family). CLI refreshes first, falls back to re-consent. Papercut: `ae account status` scopes `[market_tools:call]` differ from stored `market_tools:call customer_requests:spending_policy`; stale dev profiles for 127.0.0.1:3024, 3025, 3034. |
| Key rotation while agent runs | works (source) | missing | missing | untestable | Replacement is server-only (`agentAccessPrincipals.ts:71-77`). Overlap validity of the old key unconfirmed. Dead ends: `app.aecon.ai/agent-keys` and `/owner/agent-keys` return 404; `aecon.ai/agent-keys` 404. |
| Key revocation, agent keeps calling | works | works | works (handoff) | untestable | `revocation.ts` revokes, promotes remaining credential, invalidates refresh families. `agent-access-auth.ts:220-232` checks key state each call. `key_revoked` email gated off by default (`AE_EMAIL_PHASE2_ENABLED`, `AE_EMAIL_KIND_KEY_REVOKED_ENABLED`). Papercut: revoked and never-issued keys both return `authentication_required`. |
| OAuth revocation (RFC 7009) | works | untestable | missing | missing | `/oauth/revoke` returns 405 on GET on both hosts; `token-family.ts:45-64` revokes family and bearer. No CLI or MCP route lets an agent revoke its own grant. |
| Toolset switching | works (source) | works | n/a | works | `mcp-api.ts:619-621` returns `mcp_toolset_required` and now names the read-only fix (differs from doc item 25). |

### E. Install, auth and version

| Check | Status | Evidence |
|---|---|---|
| npm `@agentic-economy/cli@0.3.2` | works | Registry 200, latest 0.3.2, tarball sha1 `9df6872e...` matches. Lifecycle map "npm name 404" is stale. |
| Hosted tarball `aecon.ai/downloads/agentic-economy-cli-0.3.2.tgz` | broken | 404. Built by `src/lib/cli-distribution.ts:27-33`; `aeCliInstallCommand` has no callers. No `/downloads` route. |
| Hosted tarball `app.aecon.ai/downloads/...0.3.2.tgz` | broken | 200 but 1,415,088 bytes, sha1 `8a922483...`, vs npm 1,372,411 bytes. `ae.js` and README differ. Same version, different bytes. |
| Signed archive via GitHub release v0.3.2 | broken | 404 at `CreasyBear/aecon-cli/releases/download/v0.3.2/...`. README lines 23-41 describe it as the existing-version route. |
| README install line / `/developers` | missing | Placeholder in README; `aecon.ai/developers` 200 but static HTML has no install line (may be JS-rendered, unconfirmed). |
| `ae --version` | broken | `ae 0.3.2 (development)` on PATH; waves36 build prints `(debfeebeadea)`. No provenance tie to a published artifact. |
| Global `ae` | broken | PATH resolves to the Agentic-Economy checkout dist, not waves36. |
| `ae doctor` server compatibility | works | origin, server (manifest v2), mcp, release (`d3c9061f...`) pass. |
| `ae doctor` readiness | broken | Degraded, exit 1: `payments_unavailable`, catalogue stale, 17 missing local provider env names (Stripe, CDP, x402). Hosted user sees local-dev remediation. |
| `ae account status` with no credential | works | 401 `agent_access_key_required`, handoff to `/agent-access`, next command named. |
| `ae account connections` with no credential | works | Exit 0, items [], next command `ae connect`. |
| Device flow / AS metadata | works | Metadata 200; `/oauth/device_authorization` GET 405 (POST-only). Approval not run. |
| `/agent-access` signed out | works | 307 to `/sign-in?redirect=%2Fagent-access`. |
| MCP protected resource metadata | works | 200, six scopes. |
| `GET /mcp` | works | 405, allow POST, DELETE. Unauthenticated POST challenge not run. |
| MCP install: Claude Code, Codex, Cursor | untestable | Add steps are writes, not run. `codex` not on PATH. `cursor --status` unverified. |
| Agent discovery files | works | `llms.txt`, `SKILL.md`, `.well-known/ucp` all 200. |
| `ae search --base-url https://aecon.ai` | works | Exit 0, `partialResults true`, freshness absent. |
| `ae search weather --json` | broken | 503 `tool-search-result-invalid` (doc item 11). `ae list --limit 2` returns count 1 (item 24). |
| `GET /api/ready` | broken | 503 with `payments_unavailable`, catalogue stale, `sellable true`. Contradictory. |
| `GET /tools/x` | broken | 200 soft 404 (items 12, 23). |
| `GET /tools/operation:v1:589bdc22...` | works | 200 for a real ref. |
| `GET /waitlist` | missing | 404, no route. |
| Provider first paid call earnings | broken | Carried from section 2 (item 9): `hasUnresolvedPayouts` stub returns false. Not re-walked. |

### F. Confirmed broken or missing (both verifiers agreed), ranked by user harm

Wave labels follow lifecycle sections 3.1 (owner), 3.5 (changes), 3.6 (team).

Security or money harm
1. P7 removed member keeps agent key (Web, broken, 3.6). Removal does not revoke access.
2. P8 last owner removal from Clerk is ignored, owner stays owner (Web, broken, 3.6).
3. E1 close with a positive credit balance has no disposition (Web, broken, 3.1); E1 close absent from API, CLI, MCP (missing).
4. E4 email-change notice goes to the new address, no old-address snapshot (Web, broken, 3.5).
5. E3 caps reset on the UTC month, wrong for AU owners (Web, broken, 3.1/3.5).
6. P3 and P2 role refusals name no grantor (Web, broken, 3.6); 3.6 team-level "role blocks action" missing.

Owner cannot complete the job
7. Key rotation: no rotate action on the keys page, checklist promises it (Web, API, CLI, MCP missing; 3.1; includes the agent and 3.1 owner rows). OAuth revocation has no CLI or MCP route.
8. Dead-end rotation links `/agent-keys` and `/owner/agent-keys` (404), and `aecon.ai/agent-keys` (404) (3.1).
9. Change payment method: none on any surface, `card_changed` and portal emitters absent (3.1).
10. Data export omits saved tools and market requests (Web, broken, 3.1); no CLI or MCP export.
11. Market requests: no owner page to list or withdraw (Web, missing, 3.1).
12. P2 invite expiry or wrong address: no outcome, no edit-address (Web, API, CLI, MCP, Mkt missing, 3.6).
13. P1, P5, P6 on API, CLI, MCP, Mkt: no team, role or leave route anywhere outside the web app (missing, 3.5/3.6); P4 and P5 on Mkt not applicable.
14. E5 dormancy: no inactivity state or notice on any surface (3.5).
15. P1 Team invite and P2 Role change absent from API, CLI, MCP (3.1/3.5).

Install and trust
16. Hosted tarball differs from the npm artifact (same version, different bytes), `aecon.ai/downloads` 404, GitHub release 404 (broken).
17. `ae --version` reports `development`; global `ae` is another checkout (broken).
18. `ae doctor` shows local-dev remediation and readiness fails to a hosted user (broken); README install line missing on `/developers`.
19. `/api/ready` 503 vs `sellable true`; `ae search` 503; `ae list --limit` ignored; `/tools/x` soft 404; `/waitlist` 404 (broken or missing).
20. Provider first paid call earnings stub (broken, carried from section 2).

### G. Disputed (one verifier dissented, not confirmed)

- 3.5 Owner: export "missing" in the second pass conflicts with the first pass that found the export route, so only the narrower finding (item 10, partial sections) stands.
- P2 Agent key rotation on Web, rated works by the walker but missing by the 3.1 owner row, resolved as item 7: the consent path rotates, the keys page does not.
- P3 key revocation on MCP and P1 grant renewal on MCP stay untestable: no authenticated MCP session, so neither verifier could confirm or deny a tool.
- `key_revoked` email: the lifecycle map's "no email" is stale in source, but delivery is dark behind two env flags, so it is not counted as working.
