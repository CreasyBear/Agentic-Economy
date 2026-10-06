# Plan Quotes: handoff (2026-10-06)

## Continuation status (2026-10-06)

W2–W6 source is now implemented in this worktree: HTTP/MCP/CLI quote/run/get/cancel,
one purchased/promotional Hold, durable Workflow and ordinary Call allocation,
owner approval/status/receipts/Activity, and bounded chat suggestion/import/run.
The existing implementation plan below is retained as the original handoff;
its remaining-work list and funding prohibition are historical.

Joel subsequently authorized the current live funding for the final paid proof.
No Clerk configuration change is required. Release still requires the full source
gate, a PR, verified production v1.7 chart installation/readback, separate backend
and web deployment, and the actual paid CLI/MCP/HTTP journey. Those release steps
are pending at this update; local and native evidence is not a hosted claim.

Native Ledger :3080: twelve Plan money tests pass, including the actual Workflow
with purchased/promotional credit, partial delivery, uncertain settlement and paid
owner approval. Lifecycle, chat, parser, selector, HTTP/CLI and presenter tests
cover their boundaries; `npm run check` passes before the latest inspection and
approval additions, whose final check is running. See build decisions B8–B12.

Current limits: paid execution requires managed x402; paid fixed-AUD execution
refuses before Hold. Deferred managed prices need a proven finite bound. An
approval-required quote needs current published readiness and performs no unpaid
Provider request until approval. Conventional Provider async completion, selected
binary artifacts and alternate payment rails remain separate ADR 0006 work.

## Original handoff snapshot
- **Worktree:** `/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/aecon-plan-quotes`.
- **Branch:** `well-32/plan-quotes`, based on `main` at 453b6f60d. It has not been pushed and there is no PR yet.
- **Commits:**
  - f15a5726c: RFC and Bazaar evidence.
  - 90f2f95b1: decisions, ADR 0006 amendment, parity register and build plan.
  - c0218f0bf and 6175a74e8: code.
- **Typecheck:** `tsc` reported 0 errors for both `tsconfig.json` and `convex/tsconfig.json` at 6175a74e8.
- **Documents to read first:**
  - `docs/designs/2026-10-05-plan-quotes-rfc.md`: the design.
  - `docs/operations/plan-quotes-build-decisions.md`: binding decisions B1–B7. This overrides the RFC where the two differ.
  - `docs/operations/plan-quotes-build-plan.md`: 55 tasks with dependencies, listed at line 91.
  - `docs/operations/mercator-parity-register.md`: MP and BP rows, with the "surprise" targets in BP-08..14.
  - `docs/adr/0006-mercator-capability-foundations.md`: see "Decision 2026-10-05".
- **Production money is live (Joel, 2026-10-06).** Older notes that say production funding is disabled are out of date.
  - Never point any Plan work at production Formance, Stripe or Convex.
  - The ledger chart v1.7 (Plan Hold) is installed only on the isolated native ledger. Production still runs v1.6 (`commercial-policy.ts` pin unchanged).
  - Before anything is deployed, production needs the v1.7 schema install and readback. That is a separate step that needs consent (convex-deploy-guard).

## Done (build-plan task IDs)
- **W1, all tasks (T1–T5, TG):** `src/modules/capability-execution/plan/{contracts,parse,graph,references,resolve}.ts` and `CONTEXT.md`. The GateOwner routed `pointed-schema` helpers through `capability-contract/public.ts`. The boundary test passes 12/12.
- **W2-T1:** the `capabilityPlans` table, plus `planRef`, `planNodeId` and `by_planRef` on `capabilityCalls`.
- **W2-T2:** Open-Meteo geocode and weather sandbox seeds (`convex/lib/dev/seed/sandboxGeoWeather.ts`), plus the `ae_envelope` probe-input fix in `read-probe-target.ts`. Readiness is `active`.
- **W2-T3:** `plan/pricing.ts` and `convex/lib/capabilityExecution/plans/priceQuote.ts`. Only `fixed_aud` counts as `fixed`. Nodes priced by item count need a worst-case probe; an `unknown` price on a deferred node is refused.
- **W2-T4:** the `capabilityPlans.quote` action and the internal `quotePlanHandler` (`convex/lib/capabilityExecution/plans/quotePlan.ts`). Quoting places no Hold and creates no Call.
- **W2-T5 and W2-T6:** `plan/quote.actions.ts`, `tool.plan.quote` registered, and MCP `ae_tool_plan_quote` in `buy`.
- **W3-T1, W3-T2:** the `PlanNodeAuthorityBasis` variant in `call-admit.ts`, the action-execution contracts and the identity validators. `buildCallAuthority` refuses a node Call whose input digest doesn't match or whose price exceeds the node's ceiling (security finding).
- **W3-T3, W3-T4:** Formance v1.7 (`PLAN_HOLD_RESERVED_AUD`, `PLAN_NODE_ALLOCATED_AUD`, `PLAN_NODE_SETTLED_AUD`, `PLAN_NODE_RELEASED_AUD`, `PLAN_REMAINDER_RELEASED_AUD`). The workflows are `reservePlanHold`, `allocatePlanNode`, `settlePlanNode`, `releasePlanNode` and `releasePlanRemainder`.
  - Each Hold account is unique to one run: it is keyed on a digest of {planRef, planDigest, accountRef}.
  - Allocation is checked against the node ceiling.
  - The remainder released is read from the ledger, not taken from the caller.
  - Native smoke on :3080: capacity is debited once, a lost response replays correctly, and every Plan reserve balance ends at 0. The native boundary suite passes 9/9 and `formance.test.ts` passes 47/47.
- **W3-T5a:** the monthly fence takes `heldPlanExposure?: {kind:'known',units}|{kind:'unavailable'}`.
- **Commercial policy:** `operations.planRateToleranceBps` (default 50). The admin form for changing it does not exist yet.
- **Built ahead of their waves:**
  - W4-T2: `plan.view-model.ts` and `src/components/ae/plans/plan-confirmation/` (a presenter only; not connected to a live query).
  - W5-T1: `plan/suggest.ts` and the `query-graph.ts` ToolRefs.
  - W5-T2: `plan/mercator.ts` and `directoryIndex/lookup.ts` (Mercator plan import, which fails closed).

## Remaining work, in dependency order
1. **W2-T7, T7a, T8, T9, TG:** wire `CallService.planQuote` through `src/lib/server/plan-api.ts`, add the HTTP route `api.v1.tools.plans.quote.ts`, the CLI `tools/ae/commands/plan.ts` (`ae plan quote`) and the manifest entry, then run the GateOwner codegen and RPC snapshot.
   - `tool-surface-conformance.test.ts` fails until the CLI adapter lands.
2. **W3-T5b, T5c:** read the outstanding Plan exposure and pass `heldPlanExposure` explicitly at **every** quote and admission site.
   - Security finding F2: an omitted value currently counts as 0. Make the field required once T5c lands.
3. **W3-T6:** the Call allocation seam. Node Calls must reserve from the Hold and settle or release through the PLAN_NODE_* templates, never through `CALL_*` against their own periods.
4. **W3-T7 to T15:**
   - `runPlan` replay identity: hash the full command `{planRef, planDigest, approvedTotalAudUnits}`. A changed command refuses with `idempotency_key_reused`.
   - `admitPlanNode`.
   - The **Workflow** runner (`@convex-dev/workflow` 0.4.6: `awaitEvent`/`sendEvent`, cancel, `onComplete`).
   - The **Triggers** bridge: register on the existing `usageSourceTriggers` (`convex/lib/capabilityExecution/serviceUsage/sourceVersions.ts`) so `sendEvent` fires only when a node Call is financially conclusive (RFC §6:142).
   - Run, get and cancel actions; HTTP routes; CLI run, watch and cancel; MCP; GateOwner.
5. **W4-T1** (one approval; Hold placed only after authority), **W4-T3** (the plan-run presenter with AgentRun), **W4-TG**.
6. **W5-T3, T4** (in chat, `tool.plan.run` uses the single execute slot), **W5-TG**.
7. **W6-T1 to T3, TG:** receipts, the PaymentFlow money path built only from settled amounts, and founder Activity.
8. **Live journeys** through `ae`, MCP and HTTP on the isolated stack, then `npm run gate`, then the PR.

## Isolated stack (`/tmp/ae-plan-quotes/stack.md` has full detail)
- **Convex:** anonymous local, `http://127.0.0.1:3212`, site :3213.
- **Vite:** :3025 and :3034. The CLI uses `--base-url http://127.0.0.1:3034` and needs `AE_CANONICAL_BASE_URL=http://127.0.0.1:3034`.
- **Native Formance:** compose project `ae-plan-quotes` at `http://127.0.0.1:3080`, ledger `ae-plan-quotes`. Leave :3079 alone; it belongs to another project, `ae-sepolia-proof-stage70`.
- **Seeded ToolRefs:**
  - geocode: `operation:v1:50a1ccfc6723ca45617a4eec61b3dcd25a8b6b332749d8e10ee98105f2b1f13b`
  - weather: `operation:v1:98c5c35844704ca350b9ea093e362b788dd2952f466f74fc0f73c879fd0aef93`
  - Frankfurter: `…4f548c66…` (inactive; its stored binding still points at the old URL)
  - Each is fixed at AUD 1.
- **Buyer:**
  - Sandbox account `acc_98cef30fcfab4713abf427fcb6a52743` with a grant of AUD 1 per call, AUD 5 per day and AUD 20 per month.
  - The CLI credential is in `~/.config/ae/config.json`, alongside Joel's existing profiles.
  - For isolation, `AE_CONFIG_DIR=/tmp/ae-plan-quotes/ae-cli-isolated-config` is supported.
- **Blocker:** the sandbox Account balance is AUD 0, so `ae quote` returns `insufficient_balance`. The only funding options are:
  - A promotional grant, which needs `strict_mfa`. The Clerk dev instance has no second factor enabled, and Joel declined changes to the Clerk config.
  - Stripe test funding, but there is no `STRIPE_SECRET_KEY` in `.env.local`.
  - A Joel decision is needed before a paid live run.

## Open review items
- **Parse:** empty-key RFC 6901 segments are rejected on purpose (repo canonical validator).
- **Security findings to close in W3-T5c and W3-T6:**
  - F2: the fence fails open when `heldPlanExposure` is omitted.
  - F3c: node settlement must use the Plan's period accounts.
- **Coverage gate:** confirm that every `capabilityCalls` writer is registered through the wrapper in `convex/usageTrackedMutation.ts`, so the Triggers bridge sees every write.

## How to run agents (lessons from this session)
- Subagents inherit the session's working directory. Start the next session **inside the worktree**. In this session, three agents edited the main checkout through relative paths and the orchestrator had to restore those files.
- Models: `task` and `reviewer` run on sol; `scout` and `sonic` run on luna, which reasons poorly and should only be used to pull facts; `security-reviewer` runs on opus. Have opus review all money and authority code.
- Every task gets owner files, an exact change and an evaluator. Implementers run filtered `tsc` only. The orchestrator runs the full typecheck and commits at each wave boundary.
