# Domain Audit — answer / chat subsystem

Auditor: Domain-AnswerChat · Scope: `src/modules/answer/**`, `src/modules/answer-thread/**`, `src/components/ae/chat/**`, `src/components/ae/ai-elements/**`, `*AeChat*.tsx`.
Repo: `~/Jcsyc_Projects/agentic-economy` · READ-ONLY · grounded against current `src/`.
Format: `[Pn] · REAL|NOISE|FP · category · path:line · evidence · fix-direction · blast-radius`

## Scope facts
- react-doctor flagged **91 diagnostics** in this domain (76 LIVE + 15 inside files already ruled DEAD by dead-code.md). 4 `error` (all `no-adjust-state-on-prop-change` in `AeChat.tsx`), 72 `warning` (live).
- **Coverage caveat**: react-doctor scanned only ~163 of ~609 src files. Many live answer/chat files DID scan (AeChat, chips, tools, prompts, schema). Spot-checked every LIVE finding against the actual code. The Zod-heavy answer schema/contract surface produces a **high unused-export FP rate** (see §4) — verified, not asserted.
- **circular-dependency: NONE in this domain.** All 7 repo-wide are in `catalog/` and `observability/`. (Confirmed via the findings JSON.) No action.
- Dead-code overlap (NOT re-audited — dead-code.md is authoritative): `src/modules/answer/openui/` (ae-library.tsx 9 + ae-openui-lazy.tsx 3 = 12 findings), `src/modules/answer/artifacts.ts` (1), `src/components/ae/chat/AeSearchContextBar.tsx` (2). These 15 findings are on dead code; ignore until dead-code.md's deletions land.

## P0 / P1 — none
No correctness, security, or integration-blocking issues in the live answer/chat code. The 4 `error`-severity findings are quality/perf (one-frame stale UI), reclassified to P2 below; the `error` label is overstated.

---

## §1. AeChat.tsx stale-state cluster — the 4 `error`s + cascades  [REAL, P2]

The known route-promotion regression test (`tests/unit/chat/ae-chat-route-promotion.test.tsx`) mocks `AeThreadTranscript`/`AePublicShell` and asserts the **liveTurn / welcome-promotion** flow (the `handleTurnComplete` → `navigate` → `setLiveTurn(null)` path, AeChat.tsx:181-200). It does **NOT** cover the effects react-doctor flagged. These are a separate, real UX defect.

**[P2] · REAL · quality/perf · src/components/ae/chat/AeChat.tsx:93-110 (no-adjust-state-on-prop-change L96,L101,L106; no-cascading-set-state L93; no-derived-state L95,L105)**
- Evidence: `useEffect` syncs `projection` + `projectionUnavailable` from the `routeThreadId`/`initialProjection` props AFTER render (3 branches). On thread switch the component paints one frame with the **previous thread's projection still in state** before the effect re-syncs (commit → paint → effect → commit). `showThreadUnavailable`/`AeThreadTranscript` read stale `projection` for that frame → flash of wrong thread's turns.
- The memory note's "route-promotion flicker" fix (keep `liveTurn` mounted during nav) is a DIFFERENT code path (`handleTurnComplete`), so this is an unresolved regression, not an accepted tradeoff.
- Fix-direction: React's prescribed pattern — store a `prevRouteThreadId` and adjust inline during render: `if (routeThreadId !== prevRouteThreadId) { setPrevRouteThreadId(routeThreadId); setProjection(...); setProjectionUnavailable(...) }`. Or reset `projection` to `null` inline on route change and let `refreshProjection` fill it. This removes the stale frame.
- Blast-radius: AeChat.tsx only; covered by an existing test harness that can be extended to assert no stale projection on route change.

**[P2] · REAL · quality/perf · src/components/ae/chat/AeChat.tsx:112-128 (no-adjust-state-on-prop-change L122; no-chain-state-updates L122; no-derived-state L123; no-cascading-set-state L112)**
- Evidence: `initialQuery` prop change → effect calls `setStreamingBusy(true)` then nests `setLiveTurn(...)` inside a `setGeneration` updater (123-127). Two chained renders on deep-link entry (`/?q=`), one extra frame of `streamingBusy=false`.
- Fix-direction: lift into an event handler (deep-link submit can start the turn synchronously during the same tick as route entry), or coalesce generation+liveTurn+streamingBusy into one `useReducer` action (also addresses the `prefer-useReducer` L36 finding — 10 `useState` here).
- Blast-radius: AeChat.tsx; deep-link entry path.

**[P2] · REAL · quality/perf · src/components/ae/chat/AeChat.tsx:130-145 (no-cascading-set-state L130)**
- Evidence: `showWelcome`-driven welcome-exit timer effect does `setLeavingWelcome(true)` then schedules `setLeavingWelcome(false)`. Two commits for a 220ms exit animation gate.
- Fix-direction: acceptable as a deliberate transition gate; if tightening, drive `leavingWelcome` from `wasShowingWelcomeRef` inline + a single timer.
- Blast-radius: cosmetic exit animation only; low value to fix.

**[P2] · REAL · quality · src/components/ae/chat/AeChat.tsx:36-46 (prefer-useReducer L36; rerender-state-only-in-handlers L42)**
- Evidence: 10 related `useState` (projection, projectionUnavailable, threads, liveTurn, generation, streamingBusy, sessionThreadId, searchContext, sidebarManuallyOpen, leavingWelcome). `generation` is never rendered directly (it's a turn-invalidation token).
- Fix-direction: group `{projection, projectionUnavailable}` into a status slice and `{liveTurn, generation, streamingBusy}` into a turn reducer. Removes the cross-effect coupling that causes the §1 stale frames.
- Blast-radius: AeChat.tsx internal refactor; the route-promotion test should still pass (mocks the subtree).

---

## §2. Prepared-but-unconsumed TanStack tool seam  [REAL, P2]  ← cross-ref soc-arch.md §DIGEST #4

**[P2] · REAL · architectural/dead-seam · src/modules/answer/tools/registry-search.tool.ts:13,29 (+ re-export `src/modules/answer/public.ts:75-76`) · `registrySearchToolDef` / `registrySearchTool`**
- Evidence: `registrySearchToolDef = toolDefinition({...})` and `registrySearchTool = registrySearchToolDef.server(...)` are defined and barrel-re-exported, but the **live answer loop does not import them**. `tool-runner.ts:47,60` resolves tools via `KNOWN_TOOL_IDS` (`{'registry.search','registry.detail'}`) + `findAction` from the action registry — NOT via the TanStack `toolDefinition` const. Grep across src/convex/tests/eval finds no value-position consumer of `registrySearchTool`/`registrySearchToolDef` beyond the definition and barrel re-export.
- This is the physical manifestation of soc-arch.md's P2: the answer-loop tool whitelist is a **3rd hand-maintained list** decoupled from (a) the action registry and (b) this prepared TanStack tool contract. Memory lesson (TanStack AI cross-ref) confirms the intended direction: "promote AE ActionDefinition into one typed tool contract … that can generate TanStack toolDefinition" — i.e. this is a FUTURE seam, currently orphaned.
- Fix-direction: pick one. Either (a) DELETE `registry-search.tool.ts` + drop the `public.ts` re-export until the tool contract is adopted (honest dead-code removal), or (b) wire the answer loop to derive its tools from this typed contract so `KNOWN_TOOL_IDS` is no longer hand-maintained. Leaving it half-built is the worst option.
- Blast-radius: 2 exports + 1 file + 1 barrel entry. No runtime caller to break.

---

## §3. Genuine dead/unconsumed exports in live modules  [REAL, P3]

Verified by grep across `src/`, `convex/`, `tests/`, `eval/` — consumer search returned only the definition (and sometimes a barrel re-export), no call site.

- **[P3] · REAL · dead-export · src/modules/answer/internal/answer-llm-prompts.ts:27 `buildAnswerProseSystemPrompt`** — LLM-prose prompt builder; the v1 synthesizer is deterministic (07-DECISIONS.md: "Production default: deterministic synthesizer until eval suite passes"). Prepared-but-unused until the eval gate flips. Fix: delete or gate behind the eval flag with the consumer. Blast: none.
- **[P3] · REAL · dead-export · src/modules/answer-thread/internal/answer-response-planner.ts:139 `defaultToolPolicyForMode`** — helper with no caller; planner resolves policy elsewhere. Delete. Blast: none.
- **[P3] · REAL · dead-export · src/modules/answer-thread/internal/intent-router.ts:43,48 `routeCallsTools` / `routeIsBoundary`** — route predicate helpers, no callers; intent checks appear inlined at use sites. Delete. Blast: none.
- **[P3] · REAL · dead-export · src/modules/answer/internal/catalog-grounding.ts:8,25 `validateCatalogGrounding` / `sanitizeStructuredAnswer`** — re-exported from `public.ts:62-64` but NO consumer in src/convex/tests/eval. 07-DECISIONS.md:134 says "Apply sanitizeStructuredAnswer before persist and SSE complete" — that is a PLAN intent, not wired code. This is a **plan-vs-implementation gap**: the grounding guard exists but is never invoked on the persist/SSE path. Fix: either wire it into the snapshot/persist path (real safety win) or delete + update the planning doc. Blast: if wired, touches `emit-snapshot-events.ts`/turn-orchestrator; if deleted, 2 exports + 1 barrel entry.
- **[P3] · REAL · dead-export · src/modules/answer/internal/structured-artifacts.ts:4 `artifactsFromStructured`** (re-export `public.ts:46`) — no consumer. Delete or wire. Blast: none.
- **[P3] · REAL · dead-export · src/modules/answer/internal/emit-snapshot-events.ts:245 `mergeProseIntoSnapshot`** — no caller in src/convex/tests/eval. Delete. Blast: none.
- **[P3] · REAL · dead-export · src/modules/answer/internal/answer-llm-prompts.ts:10 `buildCatalogDataBlock`** — used only intra-file (lines 43,78,129). Drop the `export`. Blast: none.
- **[P3] · REAL · dead-export · src/modules/answer/internal/openrouter-models.ts:59,67,81 `formatProviderId`/`readAnswerModelWhitelist`/`isChatModelCandidate`** — all used only intra-file (lines 56,101/193,105) yet exported. Drop `export`s. Blast: none.
- **[P3] · REAL · dead-export · src/components/ae/chat/answer-stream.ts:6,32 `parseAnswerSseBuffer`/`streamAnswerSse`** — used only intra-file (lines 71,107). Drop `export`. Blast: none.
- **[P3] · REAL · dead-export · src/components/ae/chat/copy-thread-link.ts:3 `threadUrl`** — used only intra-file (line 9). Drop `export`. Blast: none.
- **[P3] · REAL · dead-export · src/modules/answer/answer-prose.ts:12 `proseToNextStep`** — used only intra-file (line 24). Drop `export`. Blast: none.
- **[P3] · REAL · dead-export · src/modules/answer-thread/internal/commands.ts:43,47 `appendAnswerToolCallsMutation`/`readTurnToolCallsQuery`** — typed Convex `sourceMutation`/`sourceQuery` handles; consumed intra-file (lines 72,79) but not externally. These look like intended Convex-bridge exports; if no cross-boundary consumer exists, drop `export` (verify convex/ side before removing). Blast: none.
- **[P3] · REAL · dead-export · src/modules/answer-thread/internal/session-cookie.ts:2,33 `AE_SESSION_MAX_AGE_SECONDS`/`buildSessionSetCookieHeader`** — no external caller found; session logic may use siblings only. Verify then drop `export`. Blast: none.

---

## §4. unused-export FALSE-POSITIVES (react-doctor graph blindness) — do NOT act

High FP rate here. react-doctor's deslop cannot see (a) Zod `*Values` arrays used only to derive a type via `typeof X[number]`, (b) value uses inside `z.enum(...)`, and (c) barrel `public.ts` re-exports that downstream files import through the barrel. Verified FPs:

- **[FP] `AeSearchModeValues` (search-context.ts:3)** — used as a VALUE at line 23 `mode: z.enum(AeSearchModeValues)`. Definitive FP.
- **[FP] `AnswerLayoutProfileValues` (answer/internal/answer-layout-profile.ts:4 + layout-profile.ts:2)** — used in `type AnswerLayoutProfile = (typeof AnswerLayoutProfileValues)[number]` and barrel-re-exported. Type-position + barrel → invisible to the scanner.
- **[FP]** all `*Values`/`*Schema` Zod-derivative exports: `ThinkingStepValues`, `AnswerCompareFieldSchema`, `AnswerArtifactSchema`, `AeAnswerArtifactsSchema`, `AnswerWorkStepPhaseValues`, `AnswerWorkStepStatusValues`, `AeSearchLocationSourceValues`, `AeSearchLocationSchema`, `AeSearchContextSchema` — same pattern (type derivation / `z.enum` / barrel). Keep.
- **[FP] `isAnswerToolUseAgentError` (answer-tool-use-agent.ts:675)** — error-type guard, likely used in a catch branch the scanner misses; verify before touching, but not a finding.
- **[FP] `DEFAULT_OPENROUTER_MODEL` (llm-config.ts:1)** — used intra-file (line 14) AND barrel-re-exported (public.ts:79). Not dead.

## §5. unused-file / only-export-components — FP or accepted convention

- **[FP] unused-file src/modules/answer-thread/projection.ts:0** — dead-code.md's NON-FINDINGS section confirms this is ALIVE: imported cross-boundary by `convex/answerThreads.ts:12` (`buildPublicThreadProjection`), which react-doctor cannot trace through the `../src/...` Convex import. Do NOT delete.
- **[FP/NOISE] unused-file src/modules/answer/artifacts.ts** — flagged here too, but dead-code.md already rules it DEAD (orphan sibling of `projection.ts`) and owns the deletion. Cited, not re-audited. (The 1 finding inside it is in the dead-code bucket.)
- **[FP] only-export-components (6 in openui/)** — all inside the DEAD openui folder. react-doctor's "file should also export non-component values" rule misfires on a dead, never-rendered library. Dead-code.md owns deletion.
- **[FP/NOISE] no-multi-comp (3 in domain, e.g. answer-stream/copy-thread-link adjacency)** — AE's convention co-locates a component + its helpers/IO in one file (AGENTS.md style). Intentional co-location, not a violation.

---

## §6. Component quality nits (LIVE)

- **[P3] · REAL · perf · src/components/ae/chat/AeAnswerThinkingTrace.tsx:26,27,57 `steps = []` / `workLog = []` / `steps = []` default props (rerender-memo-with-default-value)** — a fresh array literal per render defeats memoized children. Cheap fix: hoist `const EMPTY_STEPS: readonly string[] = []` at module top and reference it. Low current cost (children aren't `memo`-wrapped) but it's a free correctness-for-memo win. Blast: this file only.
- **[P3] · REAL · a11y/hydration · src/components/ae/chat/AeAnswerPromptInput.tsx:48-50 (rendering-hydration-no-flicker + no-initialize-state)** — `hydrated` gate set in `useEffect([])` to avoid SSR/client mismatch on the char-counter UI. Standard pattern, but React 19 prefers `useSyncExternalStore` or `suppressHydrationWarning` to skip the post-mount flash. Blast: this file; verify what `hydrated` actually gates before changing.
- **[NOISE] · no-fetch-in-effect · AeAnswerModelContext.tsx:26, AeSuggestionChips.tsx:78,101** — client `fetch` to `/api/chat/models`, `/api/answer/eval-status`, `/api/answer/follow-up-chips`. These are deliberately client-side (eval-gated, same-origin credentials, post-mount feature probing) in a TanStack Start SSR app. Reasonable pattern; react-doctor's "use a data layer / Server Component" suggestion doesn't fit the eval-gating requirement. The one genuine smell: `/api/answer/eval-status` fires on EVERY `AeFollowUpChips` mount (one per completed turn) — consider hoisting the eval flag into the existing `AeAnswerModelContext` provider to dedupe. Blast: optional, AeSuggestionChips + provider.
- **[NOISE] · exhaustive-deps · AeSuggestionChips.tsx:133, AeThreadTurnStreamSection.tsx:70,79** — `AeSuggestionChips` deps `[turn.turnId, turn.query, turn.artifacts, llmChipsEnabled]` are the CORRECT stable-field deps (better than whole-`turn` identity). `AeThreadTurnStreamSection.ts:70` deliberately FREEZES `threadId` at generation boundaries with a code comment ("remounts do not POST a just-created thread id before Convex persistence finishes") — the omission is the point. Both are intentional, not stale-state bugs.
- **[NOISE] · no-derived-state · AeResearchProcess.tsx:42,47** — `open` and `expandedSteps` reconcile incoming props with preserved user toggles (`current[step.id] ?? step.status === 'running'`). Legitimate "derive initial, keep user state" merge pattern, not pure derivable state.
- **[P3] · REAL · nit · AeAnswerModelContext.tsx:1 (no-react19-deprecated-apis)** — React 19 prefers `use()` over `useContext`. `useContext` still works; migrate when touching the file. Blast: this file.

---

## §7. WHAT REACT-DOCTOR MISSED (judgment added)

Real issues in this domain the scanner did NOT flag:
1. **The `sanitizeStructuredAnswer` grounding guard is never invoked** (§3 above). react-doctor can't know a planning-doc safety requirement is unwired. This is the highest-value missed item: a catalog-grounding validator exists, is exported, is mandated by 07-DECISIONS.md, and is called by nothing. Real safety/quality gap.
2. **`KNOWN_TOOL_IDS` ↔ action-registry ↔ `registrySearchTool` three-list drift** (§2 + soc-arch.md #4). react-doctor flagged the orphan export but not the architectural drift it implies.
3. **Projection stale-frame on thread navigation** (§1) — react-doctor DID flag the mechanism, but its `error`/Bugs framing obscures that the real defect is a stale-data flash the existing regression test doesn't cover. The test gap itself is what the scanner can't see.
4. **eval-status fetch fires per-mount** (§6) — N+1 request smell on thread lists with many turns. Not a lint category.

---

## DIGEST (≤30 lines)
- **91 domain findings** (4 err / 72 warn live; 15 in dead-code.md-owned dead files — skipped). **0 circular-deps** in answer/chat (all 7 repo-wide are catalog/observability).
- **No P0/P1.** The 4 `error`s are all `no-adjust-state-on-prop-change` in **AeChat.tsx** — REAL but P2 (one-frame stale UI), overstated as `error`/Bugs. They are NOT covered by the existing route-promotion regression test (that test covers the liveTurn/welcome path, not projection-sync). Fix with React's inline prev-prop pattern. [§1]
- **P2 architectural**: `registrySearchTool`/`registrySearchToolDef` (registry-search.tool.ts) is a **prepared-but-unconsumed TanStack toolDefinition seam** — the live loop resolves tools via `KNOWN_TOOL_IDS`+`findAction`, ignoring this const. Either delete or wire; half-built is worst. Corroborates soc-arch.md #4. [§2]
- **Highest-value MISS**: `sanitizeStructuredAnswer`/`validateCatalogGrounding` exist + are exported + are mandated by 07-DECISIONS.md ("apply before persist and SSE complete") but are **called by nothing**. Plan-vs-implementation safety gap. [§3/§7]
- **~12 genuine P3 dead/over-exported helpers** in live modules (buildAnswerProseSystemPrompt, defaultToolPolicyForMode, routeCallsTools/routeIsBoundary, artifactsFromStructured, mergeProseIntoSnapshot, intra-file-only exports). [§3]
- **High unused-export FP rate** on this Zod-heavy surface: `*Values`/`*Schema` type-derivations (e.g. `AeSearchModeValues` IS used in `z.enum(...)`), and barrel `public.ts` re-exports. Do NOT delete without grepping type position + convex/. [§4]
- **unused-file projection.ts is FP** — alive via cross-boundary `convex/answerThreads.ts:12` import (dead-code.md NON-FINDINGS). [§5]
- **Minor REAL nits**: default-array props in AeAnswerThinkingTrace (P3 perf), hydration `hydrated` gate in AeAnswerPromptInput (P3), React-19 `use()` migration in AeAnswerModelContext. [§6]
- **NOISE**: fetch-in-effect on eval-gated client endpoints (reasonable), exhaustive-deps where deps are deliberately frozen/stable-field (AeThreadTurnStreamSection threadId freeze is commented intent), no-derived-state on reconcile-with-user-toggle state.
- Report: **local://audits/domain-answer-chat.md**
