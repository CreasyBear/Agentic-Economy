> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../README.md) for its successor and remaining limits.

# Fragility elimination protocol — 28 September 2026

**Owner:** root orchestrator; **decider:** Joel. **Binding:** [00-decisions.md](../reviews/maturity/00-decisions.md) "minimise fragility". **Evidence base:** four primary-source dossiers ([stability](../reviews/alpha/research-stability.md), [stack](../reviews/alpha/research-stack.md), [method](../reviews/alpha/research-method.md), [journeys](../reviews/alpha/research-journeys.md)), three takedown maps ([external](../reviews/alpha/fragility-external.md), [backend](../reviews/alpha/fragility-backend.md), [UI](../reviews/alpha/fragility-ui.md)) and five live sweeps (`../reviews/alpha/sweep-*.md`).

## Objective and measure

Reduce the number of independent conditions that can stop a **specific user journey**, on both the golden path and its unhappy paths. Adding error branches doesn't count as progress. Progress is measured per journey as: hard dependencies on the path (fewer is better), non-final journey states without a recoverable exit (target zero), and injected faults that the journey survives with a truthful outcome (target: every soft dependency).

## Principles (each is a rule for design and review)

1. **The continuously exercised path is the only safe path.** Emergency-only fallbacks are hard to test, fail when needed and amplify outages; put the needed data on the normal serving path instead ([AWS Builders' Library, *Avoiding fallback*](https://d1.awsstatic.com/builderslibrary/pdfs/avoiding-fallback-in-distributed-systems.pdf); [Google SRE ch. 22](https://sre.google/sre-book/addressing-cascading-failures/)). Most catastrophic failures sit in error-handling code ([Yuan et al., OSDI 2014](https://www.usenix.org/conference/osdi14/technical-sessions/presentation/yuan)), so fewer special modes is itself a reliability gain.
2. **Classify every dependency per journey as H (hard: needed for a truthful outcome), S (soft: the journey runs without it) or C (currently hard, can be softened)** ([AWS Reliability Pillar, Availability](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/availability.html); [REL05-BP01](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_graceful_degradation.html)). An S or C dependency on a request path is a defect.
3. **Static stability and constant work.** Keep serving from the last good persisted state when a control or refresh plane stalls. Refresh on a schedule, not in the request ([AWS static stability](https://aws.amazon.com/builders-library/static-stability-using-availability-zones/); [REL04-BP03](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_prevent_interaction_failure_constant_work.html)).
4. **Bound work and waits; retry at one layer only, and only idempotent effects** ([AWS, Timeouts, retries and backoff](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/); [Convex action error semantics](https://docs.convex.dev/functions/error-handling/)).
5. **Contain failure to the smallest UI unit.** Route-level `errorComponent`/`pendingComponent` and leaf boundaries; one failing query never takes down a page or the shell ([TanStack Router data loading](https://tanstack.com/router/latest/docs/guide/data-loading); [TanStack Start error boundaries](https://tanstack.com/start/latest/docs/framework/react/guide/error-boundaries)).
6. **Every journey is an explicit state machine; every non-final state has a recoverable transition.** Input is preserved, and validation failure is distinct from service failure. Show progress and the next action beyond 1 s and 10 s ([Stately statecharts](https://stately.ai/docs/state-machines-and-statecharts); [GOV.UK error messages](https://design-system.service.gov.uk/components/error-message/); [NN/g response times](https://www.nngroup.com/articles/response-times-3-important-limits/)).
7. **Redirect returns are lookups; fulfilment is idempotent from both sides.** Stripe Checkout success page retrieves the Session and fulfils, and the webhook fulfils the same idempotent record ([Stripe fulfilment](https://docs.stripe.com/checkout/fulfillment)).
8. **Keep every money and identity integrity fence.** Clerk authorisation, Formance reservation, Stripe signature/idempotency, x402 challenge and outcome-unknown reconciliation stay hard. Availability is never bought with a guessed price, guessed authority or double charge ([REL05-BP01 anti-patterns](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_graceful_degradation.html)).

**Not doing:** circuit-breaker libraries, second caches, chaos platforms, SLO dashboards, numeric RPN or 24/7 runbooks. None of these fit pre-alpha evidence ([method dossier, "Where sources pull in different directions"](../reviews/alpha/research-method.md)). A new intermediary is added only if a tested journey can't be made correct with Convex persistence and scheduling.

## Journeys in scope

| ID | Journey (golden path) | Unhappy paths that must end in a recoverable state |
|---|---|---|
| J1 | Find and compare: Market, Tool detail, compare, search API/MCP/CLI | ranker down, directory refresh failing, no match, pagination, long query, mobile |
| J2 | Chat answer: ask → answer with selectable Tool cards → follow-up | model timeout, Convex reconnect, anonymous vs signed-in, no match, cursor continuation, share link |
| J3 | Sign-in and session | Clerk slow/down on public pages, session expiry mid-flow, sign-out, deep link after sign-in |
| J4 | Fund credit: Stripe Checkout → balance | webhook absent/late, cancel, refresh on return page, duplicate return |
| J5 | Quote → Call → receipt → Activity → ledger → Help | FX refresh down, Provider timeout/refusal, outcome unknown, double submit, back button |
| J6 | Agent connect and call via CLI/MCP/HTTP | OAuth consent with MFA, bot-looking user agents, schema discovery, cursor follow, rate limits |
| J7 | Provider publish: Add Tool → identity → source → validate → preview → publish → appears in search | validation refusal, draft resume, identity incomplete, source preview failure |
| J8 | Operator: queues, approvals, audit | MFA claim absent, empty and large backlogs |

## The protocol (one worksheet, one executable proof per important row)

The worksheet `docs/reviews/alpha/fragility-worksheet.md` is the only tracking artefact.

| Step | Exit condition |
|---|---|
| 1. **Inventory** | For each journey J1–J8, list every synchronous call, boot/env check, background job, UI-wide join and state, with code evidence. Existing maps and sweeps are the input; extend them, don't redo them. |
| 2. **Classify** | Each edge gets H/S/C, the invariant it protects and its blast radius. Each journey state is marked with its recoverable exit, or `none` (defect). |
| 3. **Analyse** | Top failure modes get effect → cause → detection, with S/O/D high/medium/low and the basis (observed vs hypothetical). App-down and money-critical rows come first ([NIST AMS 300-7](https://doi.org/10.6028/NIST.AMS.300-7)). |
| 4. **Redesign** | Each row states `before graph → after graph`: which blocker disappears, which hedging branch is deleted, which fence is retained. Prefer deletion and normal-path persistence to new modes. |
| 5. **Verify by injection** | Inject one fault at a time at the dependency boundary on the local stack: env unset, dependency 500, timeout, Convex reconnect, network drop via Playwright route mocking. Rerun the journey and an unrelated one. Record the observed outcome, elapsed time, authoritative state and Provider-call count ([Principles of Chaos](https://principlesofchaos.org/); [AWS REL12-BP04](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_testing_resiliency_failure_injection_resiliency.html); [Playwright network](https://playwright.dev/docs/network)). |
| 6. **Guard** | Keep the smallest deterministic injection test that would catch the takedown returning, next to the boundary it protects. Re-open the row on any new incident. |

## Workstreams, in order

- **W0 Worksheet.** Steps 1–3 for J1–J8 from the existing maps and sweeps, done in one pass.
- **W1 App-down and global gates.** Optional config removed from global boot/readiness; telemetry never blocks requests; the root entitlement query is isolated from public pages; `dev:local` boots without optional seeds or scans and seeds its own local secrets (e.g. `AE_CHAT_SHARE_SECRET`).
- **W2 Serving-path redesign (static stability).** Indexed search is the normal path and Jev enriches it (landed in `f95182cec`). The FX rate is persisted and refreshed by cron, and Quotes read the persisted rate within a bounded age. Stripe fulfilment runs on return plus webhook, idempotent. Provider publication commits independently of directory projections. Bearer-key API/MCP routes are authenticated without Clerk session middleware. Paid-Call reconciliation is scheduled independently of optional crons.
- **W3 Containment and transitions.** Route-level error/pending components on every route. Leaf isolation for optional widgets (recipient, SEO, balance enrichment). Localized retry. Preserved input. No generic "Something stopped this step".
- **W4 Journey state machines.** Fix every `none`-exit state found in W0 and the sweeps, e.g. draft "Continue setup" without an action, submit locking, "Payment is still processing" forever, chat account-connection dead end, raw cursors shown to humans, occluded Save button, MCP schemas advertising no arguments, oversized registry cursor, empty business pages.
- **W5 Delete hedging.** Remove refusal states, duplicate `unavailable` modes and fallback branches that the redesigned paths make unreachable, together with the tests that pin them.
- **W6 Prove.** Run step 5 injections per journey and keep the step 6 regressions. Run one solo game day on J5 (ambiguous Provider timeout → reconciliation → no second charge).

W1–W4 run in parallel by file ownership. W5 follows the path it deletes. W6 closes each journey.

## Worker rules

Every brief cites the worksheet row it closes, the principle(s) applied and the injection that proves it. Workers never add a mode, state or fallback without naming the H invariant it protects. Changes are verified on the local stack (`npm run dev:local`) and with `npm run check`. `npm run gate` runs once per merge, with no CI until alpha (see the [maturity protocol](2026-09-27-maturity-subagent-protocol.md) rule 8).
