# Master Code Audit — Agentic Economy

**Date:** 2026-07-02 · **Mode:** AUDIT ONLY (no remediation applied) · **Handoff target:** a coding/remediation agent.

## How this was produced

Seven read-only audits, synthesized + de-duplicated:

| Source | Method | Output |
|---|---|---|
| `RDScan` | react-doctor@0.5.8 full scan, src/-scoped | `local://audits/rd-findings.json`, `rd-digest.md` (388 src findings) |
| `SoCArch` | graphify + targeted reads | `local://audits/soc-arch.md` (separation of concerns) |
| `DeadCode` | graphify orphan/god-node + reads | `local://audits/dead-code.md` |
| `DomainAnswerChat` | rd slice + code verify | `local://audits/domain-answer-chat.md` |
| `DomainPublic` | rd slice + code verify | `local://audits/domain-public.md` |
| `DomainOwnerOps` | rd slice + code verify | `local://audits/domain-owner-ops.md` |
| `DomainShared` | rd slice + code verify | `local://audits/domain-shared.md` |
| **3rd-party** | react-doctor full-repo + codebase map | `.planning/architecture-measurement/MEASURABLE-ARCHITECTURE-REVIEW.md` (645 src diagnostics) |

**Read the per-domain `local://audits/*.md` files for per-finding detail** (file:line + classification). Those are session scratch; persist to `.planning/audits/` if you want them durable for the coding agent.

## Critical caveats (read before acting)

1. **react-doctor coverage was incomplete.** `RDScan` reached ~163 of ~377 tracked src files. The 3rd-party full-repo run (645 diagnostics) is more complete — **use it as the canonical rule baseline**; treat `rd-findings.json` as the src-scoped subset.
2. **~50% of react-doctor deslop findings are FALSE POSITIVES** on this repo due to Convex convention-loading and the TanStack `useServerFn` macro blind spot. Every finding below is code-verified REAL; do NOT blindly work the raw rule list.
3. **Dead code is settled** — `dead-code.md` is authoritative; react-doctor dead-code hits should be deleted per that report, not "fixed".
4. Coverage gaps the coding agent must close manually: `business-action.functions.ts` (unscanned), `src/hooks/**` (unscanned, spot-checked clean), home/listing/root-layout routes (unscanned, spot-checked clean).

## Corroboration map (high-confidence — ≥2 independent audits)

| Finding | Sources | Confidence |
|---|---|---|
| Operator `role` prop collides with ARIA semantics (×33 aria-role + ×10 prefer-tag) | DomainOwnerOps + 3rd-party C4 | HIGH |
| Circular seams: `observability↔security`, `catalog` barrel | DomainShared + DomainOwnerOps + 3rd-party C2 | HIGH |
| Answer-thread turn module is shallow/wide | DomainAnswerChat + 3rd-party C1 | HIGH |
| Route files mix JSX + loader + projection + utils | all domain audits (only-export/no-multi-comp) + 3rd-party C3 | HIGH |
| Action seam half-adopted (bare server fns) | SoCArch (single, well-grounded) | MED-HIGH |

---

# P0 — none
No correctness/security blocker that breaks runtime today.

# P1 — trust/safety invariants + core architectural debt (do first)

### P1.1 — Mandated validation is never called (TRUST GAP)
`sanitizeStructuredAnswer` / `validateCatalogGrounding` exist, are exported, and are **mandated by `.planning/.../07-DECISIONS.md:134`** ("apply before persist and SSE-complete") — but called by **nothing** in src/convex/tests/eval.
- **Source:** DomainAnswerChat · **Why:** AE's grounding/trust thesis depends on catalog grounding being enforced before an answer is persisted or streamed. This is a plan-vs-implementation gap.
- **Fix direction:** wire them into the turn-orchestrator persist + SSE-complete path, OR formally retire the mandate with a recorded decision. Verify with an eval that asserts rejection of ungrounded answers.
- **Blast radius:** answer-thread persist/SSE path; answer-thread tests.

### P1.2 — Receipt/signature hash comparison is timing-unsafe
`business-action.ts:977-989` `verifyReceiptStatus` uses `!==` on `signatureRefHash` / `cardHash` / `mandateHash` etc. Repo already has `safeEqualHex` + `constantTimeEqual` (used for signatures/webhooks).
- **Source:** DomainOwnerOps · **Why:** AE's identity is receipt-backed integrity; non-constant-time compare is a defense-in-depth weakness on that invariant (low exploitability — source-owned receipts — but cheap and on-thesis).
- **Fix direction:** route all hash compares through the existing `safeEqualHex`/`constantTimeEqual`.
- **Blast radius:** `business-action.ts` verify path only.

### P1.3 — Action seam is half-adopted (core architectural debt)
Only `registry` + `inquiries` are real actions. `billing`, `business-action`, `protected-action`, `catalog`, `observability` owner+admin ops are **bare server functions** — no `boundaries`/`summary`/schema/registration. `/api/businesses/*` bypass the action contract entirely (registry actions' declared `http` surface is vestigial); UI inquiry-submit + owner inquiry mutations use a server fn, not an action; the `ui`/`http` action surfaces are dead weight.
- **Source:** SoCArch · **Why:** AGENTS.md's action model is the documented seam; half-adoption means the contract can't be trusted as the single source of operations.
- **Fix direction:** decide per-module — either promote to actions (with boundaries/summary/schema + registration in `src/modules/actions/index.ts`) or formally retire the action model for those ops and remove vestigial `http`/`ui` surfaces. Do NOT leave it half-applied.
- **Blast radius:** large — `src/modules/{billing,business-action,protected-action,catalog,observability}/**`, `src/modules/actions/index.ts`, `/api/businesses/*`, `src/modules/registry/*.actions.ts`.

### P1.4 — Circular public seams (observability↔security, catalog barrel)
`observability` ↔ `security` bidirectional (`operator-controls→security/public`; `security/internal/{admin-authority,disputes}→observability/public`; `observability/public→security/public`). Plus `catalog` barrel cycle (`public.ts ↔ internal/publish.ts ↔ owner-public-flow.ts`). 7 react-doctor circular-dependency findings across 4 cycle clusters.
- **Source:** DomainShared + DomainOwnerOps + 3rd-party C2 · **Why:** inverts the public/internal seam; latent init-order risk; fragile.
- **Fix direction:** extract a shared `AuditEventSink` abstraction (dependency inversion) for observability↔security; collapse the catalog barrel so `public.ts` doesn't re-export ~20 internal impls.
- **Blast radius:** internal refactor, no public API change.

### P1.5 — /owner/billing* routes leak into parked future-phase scaffold
5 active `/owner/billing*` route files import panels + readback from `src/future-phases/05-*` — active routes depending on a parked scaffold + duplicate route definitions. (CONCERNS.md already tracks this.)
- **Source:** DeadCode · **Fix direction:** promote the needed panels/readback into live `src/` and cut the future-phases dependency.
- **Blast radius:** `src/routes/owner.billing*`, `src/future-phases/05-*`.

### P1.6 — Answer-thread turn module is shallow & wide
`turn-orchestrator.ts` 1373 lines; `answer-thread/public.ts` ~80 exports; `answer/public.ts` ~96 exports. Plus `registrySearchTool/registrySearchToolDef` (`registry-search.tool.ts`) is a prepared-but-**unconsumed** TanStack toolDefinition seam — the live loop resolves tools via `KNOWN_TOOL_IDS`+`findAction` (`tool-runner.ts:47,60`) and never imports it.
- **Source:** DomainAnswerChat + 3rd-party C1 · **Fix direction:** deepen the turn module behind a narrow interface (≤30 exports); delete or wire the unconsumed tool seam. Has test leverage (`tests/unit/chat/*`).
- **Blast radius:** answer-thread + answer modules, chat components.

---

# P2 — quality / perf / conversion

| # | Finding | Location | Fix direction | Source |
|---|---|---|---|---|
| P2.1 | Operator `role` prop collision → 33 aria-role + 10 prefer-tag-over-role errors (systemic, NOT 43 bugs) | `AeOperatorShell`/Sidebar/CommandMenu + 33 call sites | rename prop `role`→`operatorRole` | DomainOwnerOps + 3rd-party C4 |
| P2.2 | Inquiry form hydration gate flashes disabled→enabled (conversion-critical) | `$slug.inquiry.tsx:66,73` | replace `useState`+`useEffect` hydrated gate | DomainPublic |
| P2.3 | `AeGenerativeMap` iframe missing `sandbox` ×2 | `AeGenerativeMap.tsx:17,45` | add `sandbox` (defense-in-depth) | DomainShared |
| P2.4 | Plain `<a>` causes full reload, loses operator form/pendingAction state ×3 | `owner.billing.redirecting:36`, `admin.monetization.$operationId:156`, `owner.inquiries.$threadId:244` | swap to TanStack `<Link>` | DomainOwnerOps |
| P2.5 | `motion`→`m`+`LazyMotion` bundle trim (~30KB) | `animate/fade-in.tsx:2`, `ai-elements/shimmer.tsx:5` | do as a pair | DomainShared |
| P2.6 | `isComposing` as `useState` causes spurious re-renders | `ai-elements/prompt-input.tsx:87` | `useState`→`useRef` (only read in handler) | DomainShared |
| P2.7 | `AeChat.tsx` 4× `no-adjust-state-on-prop-change` (errors, overstated) | `AeChat.tsx:93-128` | prev-prop inline pattern; NOT covered by existing route-promotion test (extend it) | DomainAnswerChat |
| P2.8 | `normalizeSearchToken` duplicated src↔convex | src + convex | dedupe to one shared location | DomainPublic |

## Backend perf rules (from 3rd-party full-repo scan — my src-scoped run missed these)
Apply to `convex/*Store.ts`, `*.functions.ts`, server fns: `async-await-in-loop` (67), `js-combine-iterations` (63), `server-sequential-independent-await` (20), `zod-v4-no-deprecated-schema-apis` (18), `js-min-max-loop` (15). Verify each — some awaits-in-loops are genuinely sequential.

---

# P3 — bulk cleanup (low-risk, high-volume; do as a sweep)

**Dead code to delete** (per `dead-code.md`):
- `src/modules/answer/openui/**` (~25KB) + dep `@openuidev/react-lang` (remove together) — deferred "Phase 2C", never shipped.
- `src/modules/lifecycle/**` — entire module floating (public.ts imported only by its own internals).
- `src/modules/answer/artifacts.ts`; `protected-action/internal/{policy,attempt-readback,reconstruction}.ts` (collapsed into `contact-follow-up.ts`); `seo/internal/validators.ts`.
- Dead components: `AeSearchContextBar` (its test even forbids it), `AeProseBlock`, `AdminAnalyticsPanel`.
- Dead shadcn primitives: `hover-card`, `native-select`, `toggle`, `toggle-group`.
- `ai-elements/message.tsx` — 9 unused exports (MessageBranch*/Actions/Toolbar subsystem ~150 lines; AE uses custom chat).
- Root scratch: `.tmp-answer-eval-inspect.ts`; devDep `atmn` (zero usage).
- 2 `@deprecated` funnel fns worth deleting.

**Verified ALIVE — do NOT delete:** all `convex/*.ts` API/store/cron/seed (framework-loaded), `answer-thread/projection.ts` (cross-boundary import), `dev/` module (seed path), `radix-ui` dep (20+ shadcn consumers), `billing/protected-action/business-action` as non-actions (by design).

**Unused exports:** most are "drop the `export` keyword, don't delete the function" (used in-file). High FP rate on Zod `*Values`/`*Schema` in `typeof X[number]` / `z.enum()` type positions and `useServerFn` macros — **grep type positions + `convex/` before removing.**

---

# React-doctor NOISE register — DO NOT "fix" these

| Rule | Verdict | Reason |
|---|---|---|
| `prefer-tag-over-role` (10) | ALL FP | suggests semantically wrong tags (`<address>` for group, `<menu>` for list, `<a>` for current-page) |
| `useContext_deprecated` (×5) | FP | `useContext` is NOT deprecated in React 19 |
| `only-export-components` / `no-multi-comp` on route files + shadcn | NOISE | intentional route/page co-location + shadcn slot convention |
| `unused-export` on Zod type-position + `useServerFn` wrappers | ~95% FP | see P3 note |
| `no-render-in-render` `admin.inquiries:253` | FP | `renderRef` returns a string |

---

# Recommended remediation order

1. **Phase 0 — Trust/safety invariants (small, must-do):** P1.1 wire/retire mandated validation · P1.2 constant-time hash compare. Protects AE's core thesis; localized; fast.
2. **Phase 1 — Dead-code sweep (bulk, low-risk):** P3 deletions. Drops ~150+ diagnostics, shrinks the surface so architectural work is cleaner. Delete `openui/`+dep, `lifecycle/`, dead primitives/components/exports, scratch file.
3. **Phase 2 — Circular seams:** P1.4 (observability↔security dep inversion; catalog barrel). Triple-corroborated, well-bounded, no API change. Clean boundaries before the bigger lifts.
4. **Phase 3 — Operator `role` rename:** P2.1 (`role`→`operatorRole`). Mechanical, kills 33 errors + 10 prefer-tag in one pass.
5. **Phase 4 — Answer-thread deepening:** P1.6 (+ P2.7 test extension). Biggest single architectural leverage, active worktree, has test coverage. Wire-or-delete the unconsumed tool seam.
6. **Phase 5 — Action seam completion:** P1.3. The largest lift; do it after module boundaries are clean. Promote-or-retire per module; remove vestigial `http`/`ui` surfaces; route `/api/businesses/*` through the contract or document why not.
7. **Phase 6 — P2 polish:** inquiry hydration (P2.2), `<a>`→`Link` (P2.4), iframe sandbox (P2.3), motion bundle (P2.5), prompt-input ref (P2.6), `normalizeSearchToken` dedupe (P2.8), backend perf rules sweep.
8. **Phase 7 — billing/future-phases cut-over:** P1.5 (promote panels out of `future-phases/05-*`).

**Sequencing rationale:** safety invariants and dead-code first (cheap, de-risk, declutter); then the boundary fixes that everything else depends on (cycles → role → answer-thread → action seam); perf/conversion polish last.
