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
