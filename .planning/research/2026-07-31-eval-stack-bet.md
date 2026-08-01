# Stack bet re-evaluation — Vercel AI SDK + Convex vs oh-my-pi harvest

Date: 2026-07-31. Source-level review by three subagents (VercelConvexEval,
OhMyPiHarvest — librarian, read-only, findings relayed; BetSynthesis — scout).
Full transcripts: `history://VercelConvexEval`, `history://OhMyPiHarvest`,
`history://BetSynthesis` / `agent://BetSynthesis`.

## Verdict (rank C > B > A)

| Option | Kernel fit | Convex SSoT | Migration | Framework risk | Lock-in | Assets survive | Leverage | Avg |
|---|---|---|---|---|---|---|---|---|
| **A** AI SDK + `@convex-dev/agent` + workflow | 2 | 2 | 2 | 2 | 2 | 3 | 5 | **2.6** |
| **B** hand-rolled + workflow/workpool + OMP patterns | 4 | 5 | 5 | 4 | 5 | 5 | 3 | **4.4** |
| **C** AI SDK transport/structured-output only + workflow/workpool + OMP patterns | 5 | 5 | 4 | 5 | 4 | 5 | 4 | **4.6** |

**Recommended: C.** This updates the prior position from "AI SDK rejected" to
"AI SDK accepted at the transport/typed-output seam; `@convex-dev/agent`
rejected for the loop and the canonical thread store."

## Why not A ("Vercel/Convex" as packaged)

`@convex-dev/agent` v0.6.4 (verified from its package.json + src):
- **Wraps AI SDK v6 only** (`AssertAISDKv6` in src/client/types.ts; peers
  `ai ^6.0.35`). Adopting it forks us onto AI6 + OpenRouter provider 2.x and
  forfeits AI7's stable `toolApproval` — a compatibility dead-end the moment
  we want current APIs (OR provider v3 peers `ai ^7`).
- **Owns its own Convex tables** (threads/messages/streamingMessages/
  streamDeltas — isolated component schema). It cannot reuse our
  `answerThreads`/`answerTurns`/`answerToolCalls`; adoption means a second
  message store (violates single-source rule) or a full thread migration +
  UI/auth projection rewrite.
- **Its loop executes tools** (delegates to AI SDK `generateText` tool
  dispatch); approval is tool-call approval, not our digest-bound preparation.
- The only constraint-respecting way to use A is no-thread `generateObject`
  with the Agent component dormant — which is just option C with an unused
  dependency.

## What C takes from the AI SDK (verified at source)

- `generateObject` (v6) / `generateText` + `Output.object` (v7 — v7 marks
  `generateObject` deprecated) performs ONE model call with
  `responseFormat: json + schema`, no tools, no loop: a clean typed-proposal
  seam. `ToolLoopAgent` is explicitly loop-owning — never used.
- OpenRouter provider v3 (`ai ^7`, Node ≥22 — matches TanStack Start's
  ≥22.12): model routing, `allow_fallbacks`, response healing, token+cost in
  `providerMetadata.openrouter.usage`.
- Streaming transforms/telemetry exist but our SSE protocol
  (`{seq,event}` frames in api.answer.turn.ts) stays; AI SDK UI streams are a
  different wire protocol and NOT adopted.
- No eval harness in the SDK; our existing contract server + eval suites
  remain the scoring layer.
- Compatibility: zod 4.4.3 ✓, React 19 ✓, Node 22 ✓, Convex 1.42 ✓
  (workflow 0.4.4 peers convex ^1.36.1 ✓).

## oh-my-pi harvest (MIT, commit 4df68d6, v17.2.1)

**Never adopt the runtime.** Its agent loop directly executes registered tools
(agent-loop.ts:849-1073, executeToolCalls :2200-2870) — contradicts
kernel-owns-dispatch; coding-agent package is ~250K TS LOC dragging
puppeteer/mupdf/xterm/native/TUI/Bun deps.

**Harvest as patterns (with copyright notice where code is copied):**
- `SoftToolRequirement` (types.ts:70-117 + loop enforcement :1298-1360):
  reminder → bounded escalation → forced single choice. Ideal shape for
  "the model must emit a proposal now" without paying forced tool-choice
  every turn.
- Staged resolve/propose devices (coding-agent/tools/resolve.ts): stage a
  side-effect as a preview, apply/reject as a separate authorized step —
  the proposal-then-kernel-commit UX in miniature (adapt: ours becomes
  digest-bound + Convex-persisted).
- Tool descriptor metadata (types.ts:694-863): effect tier, deferrable,
  discoverable loadMode, concurrency shared/exclusive, interruptible —
  vocabulary for our registered-action effect metadata extension.
- `xd://` discoverable-device catalog (tools/xdev.ts): candidate-menu
  discovery keeping the native tool list small — matches our ≤7-candidate
  menu rule (adapt: discovery yes, direct write-dispatch no).
- Approval precedence (tools/approval.ts: tool deny → user deny → yolo →
  override → tool policy → user → mode) and effective-args re-approval after
  transformation (extensions/wrapper.ts:125-320).
- Subagent budgets (task/executor.ts: soft request budget → grace → hard
  abort; wall-clock cap) for bounding model segments.
- Event-stream contract + bounded inline output with artifact spill
  (streaming-output.ts) for our SSE work-step events.
- Append-only tree + compaction ideas (session-manager.ts) — ideas only;
  Convex remains the store.

**Skip:** JSONL session store (second store), in-memory IRC bus/job manager
(not durable), provider catalog/OAuth, all coding tools, TUI.

## Phase-1 shape under C (cheapest path)

One bounded proposal segment inside the existing
`turn-orchestrator` model phase: `generateText`+`Output.object` (AI7+OR3,
no tools) returns a typed `{plan, next_action_proposal | clarifying_question,
rationale}`; kernel validates against the registry menu, budgets, and effect
metadata; deterministic paths (narrowSuburb, exact search) keep zero model
calls. `action-to-tool-spec.ts` retires when proposal-only replaces model
tool dispatch. Contract tests move from raw OpenRouter fixtures to the same
JSON-schema response contract.

## Pre-commit falsifiable check (run before adopting)

Adversarial contract test: a hostile mock model emits a schema-valid
disclosure/write proposal with a stale/mutated material-input digest, then
replays it. PASS = kernel refuses before `run` (zero provider/action/effect
calls), duplicate proposal idempotently rejected, and the deterministic
refinement path still executes with zero model calls.
