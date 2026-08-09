# Engine Eval Ladder, [PROPOSED] SLOs, and Dependency Verdict (record)

**Date:** 2026-08-05
**Type:** record (read-only synthesis; no source edits). Consolidates the dependency
ADOPT/DEFER/REJECT verdict from `.planning/research/2026-08-05-reference-architecture.md` §3,
maps the L0–L7 eval ladder onto the project engine (reference architecture §8 extending the
2026-08-02 audit), and records the [PROPOSED] engine SLOs plus current measurement status.

Sources: `.planning/research/2026-08-05-reference-architecture.md` (esp. §1, §2, §3, §8),
`.planning/research/2026-08-02-agent-runtime-architecture-audit.md` (eval ladder, SLOs, migration),
`.planning/research/2026-08-05-engine-usefulness-path.md` (slices A–F, evaluation table),
`eval/engine/run-evaluation.mjs` (live engine harness), focused customer-request unit suites.

---

## 1. Dependency verdict (reference architecture §3, verified from `node_modules` 2026-08-05)

The engine/model orchestration seam is **`ai` (Vercel AI SDK) + Convex components + the
deterministic AE kernel** — never `ai` + a second framework, and never a foreign orchestrator
leasing durability/authority away from Convex.

| Candidate | Verdict | Evidence / role | Gate to reconsider |
|---|---|---|---|
| **Vercel AI SDK `ai@7.0.44`** | **ADOPT** | The model-transport/tool/structured-output/stream seam. ESM, Node ≥22, v7-native `instructions`, `Output.object`, `stopWhen`/`isStepCount`, `prepareStep`/`activeTools`, `onStepEnd`, `createUIMessageStream`. Already installed and used; the live-engine fixes (slices A/B/C) land on it. | — |
| **`@convex-dev/workflow@0.4.4`** | **ADOPT** | Durable multi-step sleep/event/restart; embeds Workpool; durable Project/inquiry state-machine substrate (proven in `convex/projectSpine.ts`). Never replaces the route journal. | definition-version router + generation-fence deploy-survival (spiked) |
| **`@convex-dev/workpool@0.4.9`** | **ADOPT** | Bounded async queue/retry/concurrency for study/transport enqueue (`maxParallelism: 32`, retry max 3, `runAfter` 5 s). AE journal stays authoritative; never read status from terminal work rows (no source `statusTtl`). | none |
| **`@convex-dev/agent@0.6.4`** | **DEFER** | Official release peers `ai ^6.0.35` / `@ai-sdk/provider-utils ^4.0.6` against installed **ai 7 / provider-utils 5**; source emits an explicit v6 guard (`AssertAISDKv6`). Its generic `threads/messages/streamingMessages` rows are not AE identity/authority/evidence/projection/recovery. | only when it peers on the installed `ai` major AND covers a named invariant `ai`+Convex cannot (none today); re-verify, don't assume. |
| **Temporal / Restate / Inngest / Trigger** | **REJECT** | Each is a foreign orchestrator that would lease durability/authority outside Convex, contradicting "Convex is the source of truth" (verdict D4). AE already owns a durable state machine; adding one re-parallelizes lifecycle. | — |
| **LangGraph / other agent frameworks** | **REJECT** | `ai` covers the seam (tools + structured output + loop controls + harness); a second framework duplicates the tool plan/menu/stop/budget the AE deterministic kernel already owns (D2). | — |

Engine-relevant consequence: no dependency work is required to ship the A/B/C engine shape —
recovery, teaching (`inputExamples` projection), and the bounded retry ladder all compose the
already-ADOPTed `ai@7.0.44` surfaces (`tools` + `strict` + `stopWhen`/`isStepCount`, `Output.object`
wire validation) with the AE kernel owning selection authority.

## 2. Project-engine eval ladder (L0–L7)

Reference architecture §8 extends the 2026-08-02 audit ladder to the project engine; each row is
grounded in the engine-usefulness evaluation table (2026-08-05). For the natural-language capability
engine (planPreview) specifically, L2/L3/L7 are the load-bearing rows.

| Level | Evidence gate | Example failure = fail |
|---|---|---|
| L0 source/contract | Version lock, map anchors, Node ≥22 runtime, no incompatible agent dep, seam schemas frozen | v6 API use, configured runtime below Node 22, missing row/owner/citation |
| L1 grill/charter schema | Typed charter proposal validates/strict round-trips; wants/needs/envelope/date survive; split expiry | Wrong/incorrect fields, expiry wall where continuity should stand, leak |
| L2 deterministic decompose/commit | Facet tree + five-dim rollup deterministic; frontier/one-in-progress; compose geocode→forecast | Wrong branch, stale digest accepted, false positive (crypto→Frankfurter) |
| L3 decision-graph rank quality | Model-proposed weights validated vs playbook baselines; ≤3 inbox; event-triggered | Model rank committed verbatim; inbox >3; daily-ritual burden |
| L4 study parity vs human | Weighted study counts real quotes + cited discovery; recommendation one-tap explainable; provider no-AE response gate | Unweighted/collapsed recommendation; rating from counters; concierge-touch overrun |
| L5 authority ratchet correctness | Zero unauthorized effects; digest-bound yes; agent≠person authority; no batch-approve; `full_yolo` absent | Approval token forgery, agent self-approve, disclose-without-authority |
| L6 resumability / recovery | Crash after each commit/effect boundary; days-later wake (no polling); plan-B; `unknown` preserved; stranding risk from deploy managed | Lost durable intent, false cancel, workflow stranding, no recovery branch |
| L7 adversarial honesty | Zero fabrication/leak/hostility; 3× determinism; `needs_information` reachable; no `[ERROR]` leak; eval report honest | Any MUST-cell fail in engine-usefulness table, fake `ok`, cross-protocol conversion |

Engine-specific mapping of the MUST cells (engine-usefulness table): resolves-real-capability
(L2/L3 parity — the selected op is a registered, routeable capability and no false positive);
correct-inputs (L2 — e.g. geocode→weather compose feeds coordinates forward); no-false-positive /
no-fabrication (L2/L7 — crypto never resolves to Frankfurter, unmatched requests propose nothing);
ambiguous→`needs_information` (L7 — the ask is reachable, not collapsed to a bare refusal);
latency / determinism (L7 — measured live, 3× run stability); no internal `[ERROR]`/`[WARN]` leak
(L7).

Minimum metric set (per audit): model calls/retries, per-step/final-step tokens, tool calls by
canonical ID, byte bounds, time-to-frame, Convex/OCC conflicts, queue metrics, grant/mandate/
release refusals, provider idempotency, `unknown` rate, evidence/journal completeness, projection
parity/redaction, eval coverage.

## 3. [PROPOSED] engine SLOs (from the 2026-08-02 audit) and measurement status

The numeric budgets below are **[PROPOSED]** release targets for a first characterization window —
targets to measure and tune, not observed facts and not copied from external benchmarks. No latency,
cost, throughput, or deployed recovery measurement has been run for this engine yet.

| Surface | [PROPOSED] SLO/budget | Budget owner and reason | Required measurement/proof |
|---|---|---|---|
| Flow B interpretation (planPreview) | Exactly two attempts maximum; no-key deterministic fallback makes zero model calls; p95 shell reservation ≤500 ms and non-model compile/commit ≤1.5 s under fixture load | Attempt ladder/domain; keeps provider work bounded and preserves replay | Convex deployment with concurrency, graph refresh, digest, retry/refusal and mutation timing traces |
| Flow A model path (context) | p95 first progress frame ≤2.0 s; p95 completion ≤12 s; one agent invocation, ≤4 model steps, ≤8 read-tool calls per turn; 100% requests obey an abort deadline | AI SDK adapter supplies step/timeout mechanics; AE plan owns budget | Mock and provider-capture runs; per-step usage, tool count, retries, time-to-first-frame, abort-to-no-write, accepted/refused rate |
| Flow A cost (context) | p95 input/output token budget per turn is plan-specific and exposed in harness report; no retry when `maxRetries: 0`; deterministic branches cost zero provider calls | Harness/domain accounting; avoids hidden SDK defaults (v7 retry default is 2 when unspecified) | Assert request count, token usage aggregation, `finalStep` usage, provider billing sample |
| Flow B queue/transport | Existing configured ceiling: Workpool max parallelism 32, max 3 attempts, 5 s pre-release delay. p95 committed-outbox-to-worker-open ≤10 s excluding provider latency; no customer state depends on Workpool terminal row | Workpool mechanics plus AE journal; status-TTL conflict makes AE projection mandatory | Trace outbox, Workpool ID, open/release, retries, AE terminal rows; queue saturation and duplicate provider IDs |
| Flow B effect/recovery | Unauthorized releases = 0; every provider attempt has a stable idempotency/reconciliation key; provider outcome remains `unknown` within one recovery cycle when commit is ambiguous; p95 projection update ≤2 s after outcome commit | AE authority/outcome kernel; retries cannot prove third-party exactly-once | Crash injection after release and before outcome, provider reconciliation, duplicate command, cancel, projection readback |
| Flow C eval | Fixture suite is deterministic 100% repeatable; `report.ok` cannot be true with missing coverage or failed case; direct Promptfoo probes labeled non-E2E | Eval protocol/domain | Repeat runs, failure injection, coverage audit, report integrity checks |

**Current measurement status:**
- **Focused unit suites green: 79 files / 688 tests across customer-request** (deterministic
  multi-step compose, preview retry + `needs_information` reachability, selection boundary,
  discovery, interpreter recovery, and surrounding engine suites).
- **The eval/engine harness exists** — `eval/engine/run-evaluation.mjs` runs the engine-usefulness
  evaluation table against the LIVE `customerRequest.planPreview` action (per-query kind/steps/
  reason, latency, `[ERROR]`/`[WARN]` leak detection, determinism across N runs; nonzero exit on any
  MUST-cell failure). It must be **run live** (seeded local deployment, `npm run seed:dev` +
  `node eval/engine/run-evaluation.mjs [--runs N]`) to produce authoritative latency/determinism/
  no-leak numbers — it does not mock, and no such live run is recorded in this record.

## 4. Open evidence boundary

- **Green today:** source shape + focused local tests. The engine's recovery (bounded ≤2-selection
  compose under the domain guard, identity dedupe, geocode filter-then-prepend), teaching
  (`inputExamples` projected via `publicDescriptor`), and retry (one-retry attempt ladder +
  `needs_information` reachability) are covered by the focused customer-request unit suites.
- **Not yet measured (pending the live eval-harness run):** live latency vs the [PROPOSED] SLOs,
  run-to-run determinism (3×), `[ERROR]`/`[WARN]` leak absence on the live path, and per-step token/
  tool-count accounting. These require the seeded local deployment + `eval/engine/run-evaluation.mjs`.
- **Facts the record deliberately does not claim:** no hosted-runtime readback, no provider-capture
  cost/latency distributions, no Convex fault/load runs, no external-benchmark transfer. The
  [PROPOSED] SLOs are targets to measure, not observed performance.

*Record: 2026-08-05 — engine eval ladder + SLO + dependency stance, consolidating the reference
architecture verdict and the 2026-08-02 audit; re-verify against live source before relying on it.*
