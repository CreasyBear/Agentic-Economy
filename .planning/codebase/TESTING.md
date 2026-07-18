# Testing Patterns

**Analysis Date:** 2026-07-18
**Last Mapped Commit:** `3463c1d4`

## Test Framework

**Runner:**
- Vitest `4.1.9` — primary unit/integration/types/imports/copy/seo/ui-contract suite
- Config: `vitest.config.ts` (`environment: 'node'`, `globals: false`, `watch: false`, `tsconfigPaths: true`)
- Include: `tests/**/*.test.ts`, `tests/**/*.test.tsx`, `convex/**/*.test.ts`

**Browser / hosted:**
- Playwright `1.61.1` — `playwright.config.ts` (local e2e, `tests/e2e`), `playwright.deploy-smoke.config.ts` (deployed smokes)

**Assertion Library:**
- Vitest `expect` (no separate Chai). React components: `@testing-library/react` + `@testing-library/jest-dom` where UI units exist.

**Run Commands:**
```bash
npm test                          # vitest run (default include)
npm run test:unit                 # tests/unit
npm run test:integration          # tests/integration + convex/customerRequestRouteMandate.test.ts (--no-file-parallelism)
npm run test:types                # tests/types
npm run test:imports              # module/route boundary scans
npm run test:ts-standards         # any / non-null / CSRF / status-string scans
npm run test:copy                 # public copy claim scans
npm run test:seo                  # SEO surface scans
npm run test:ui-contract          # UI structure contract scans
npm run test:e2e                  # Playwright tests/e2e
npm run test:a11y                 # Playwright tests/e2e/a11y
npm run test:all                  # typecheck + codegen dry-run + unit/integration/types/imports/ts-standards/copy/seo/ui-contract + build
npm run test:release              # full source release gate + hosted readback/smokes
npm run typecheck                 # tsc --noEmit
npm run lint                      # oxlint --deny-warnings
npm run check:convex-codegen      # convex codegen --dry-run
```

**Verification gate (from `ae-verification-gates` skill):** run the narrowest proof for the change first (unit → integration → imports → copy/seo/ui → browser → hosted smoke). Planning docs are not gates.

## Test File Organization

**Location:**
- `tests/unit/<domain>/` — pure module and Convex-host unit tests (mirrors `src/modules` / domain names)
- `tests/integration/` — Convex-test / HTTP / multi-module flows
- `tests/imports/` — architectural import and TypeScript standards scanners
- `tests/copy/`, `tests/seo/`, `tests/ui-contract/` — static contract scans
- `tests/types/` — type-level / contract shape tests
- `tests/e2e/`, `tests/e2e/a11y/` — Playwright local browser
- `tests/deploy-smoke/` — Playwright against hosted surfaces
- `tests/eval/` + `eval/answer/` — promptfoo / answer eval harness
- `tests/helpers/` — shared admission/fakes (`source-write-admission.ts`, `answer-thread-test-port.ts`, `openrouter-contract-server.ts`)
- `tests/fixtures/` — deliberate bad fixtures for scanner self-tests (`AE_SCAN_MODE=fixtures`)
- Occasional co-located `convex/**/*.test.ts`

**Naming:**
- Behavior: `<feature>.test.ts`
- Architecture locks: `<area>-thinness.test.ts`
- Playwright: `<flow>.spec.ts`

**Structure:**
```text
tests/
├── unit/
│   ├── customer-request/
│   │   ├── application/*-thinness.test.ts
│   │   └── route-execution/
│   │       ├── journal-thinness.test.ts
│   │       ├── machines-thinness.test.ts
│   │       └── problem-mutation-thinness.test.ts
│   ├── inquiries/
│   │   ├── convex-host-thinness.test.ts
│   │   ├── inquiry-source-state-thinness.test.ts
│   │   └── notification-bridge-thinness.test.ts
│   └── …
├── integration/
├── imports/
├── helpers/
└── e2e/
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi } from 'vitest'

import { provideCustomerRequestFacts, type ProvideFactsPorts } from '@/modules/customer-request/application/public'

describe('customer-request provide-facts', () => {
  it('binds facts through ports and returns the projected aggregate', async () => {
    const ports: ProvideFactsPorts = { /* … */ }
    const result = await provideCustomerRequestFacts(input, ports)
    expect(result.kind).toBe('ok')
  })
})
```

**Patterns:**
- Prefer testing through public seams (`@/modules/<domain>/public` or `application/public`).
- Build ports objects / `vi.fn` doubles at the seam — do not mock private internals.
- Convex integration: `convex-test` + `import.meta.glob` of `convex/**/*` modules (see `tests/integration/customer-request-v2-multi-capability-route.test.ts`).
- Handler extraction for Convex functions: cast to `{ _handler }` when exercising mutation/query bodies with a fake `Db` (see `tests/unit/convex/notification-outbox-runtime.test.ts`).

## Thinness Tests (architecture locks)

Thinness tests are **source-structure contracts**. They `readFileSync` production files and assert layering — they do not exercise runtime happy paths. Pair every deepen (ports extract) with an updated thinness lock **and** keep behavioral unit/integration coverage.

### Shared recipe

When adding or extending a thinness suite:

1. Assert host no longer **defines** moved helpers (`function` / `const` at file scope).
2. Assert host **delegates** through ports factories and module public exports.
3. Slice each host export body; assert line-budget and forbidden tokens (`ctx.db.insert`, table `query('…')`, decision helpers).
4. Walk pure package trees with a local `listTsFiles`; forbid Convex imports (`_generated`, `convex/server`, `ActionCtx`/`MutationCtx`/`QueryCtx`, `Doc<`).
5. Assert ports factory size budgets and required method names.
6. Assert **no sibling host files** and **no cross-package pollution** (e.g. provide-facts symbols not in refine/confirm).
7. Forbid `WritePlan` / `writePlan` / `intendedPatches` in machines and journal.

### Critical suite: problem-mutation-thinness

**File:** `tests/unit/customer-request/route-execution/problem-mutation-thinness.test.ts`

**Locks:**
- Host exports `reportProblem`, `recordProblemBusinessReport`, `updateProblemStatus`, `replyProblem` as thin `internalMutation` shells using `problemMutationPorts(ctx)` and `*Machine` imports from `@/modules/customer-request/route-execution/machines`.
- Each host body ≤ 40 lines; no direct problem-table queries, `ctx.db.insert/patch`, or `decide*` helpers.
- Machines live under `machines/` (`problem-report.ts`, `problem-business-report.ts`, `problem-update-status.ts`, `problem-reply.ts`, `problem-ports.ts`); index exports + `ProblemMutationPorts`.
- `problem-ports.ts` must not mention `WritePlan` / `intendedPatches`.
- Machines free of Convex runtime and write-plan DTOs; call `ports.*`.
- `problem-support/` must not import machines / `ProblemMutationPorts` / write-plan DTOs.
- Ports adapter `convex/customerRequestRouteExecutionProblemPorts.ts` ≤ 1000 lines; no sibling `convex/customerRequestRouteExecutionProblem.ts`.

**When to run:** any edit to problem machines, problem ports, or problem-related exports in `convex/customerRequestRouteExecution.ts`.

### Critical suite: machines-thinness

**File:** `tests/unit/customer-request/route-execution/machines-thinness.test.ts`

**Locks:**
- Required machine files present (start/lease/outcome/cancel/problem/ports/types/index).
- Index exports journal, cancel, and problem port types and machine entrypoints.
- Entire `machines/` tree free of Convex runtime and `ctx.db` / `ctx.scheduler`.
- Start/lease/outcome use `JournalMutationPorts`; cancel variants use `CancelMutationPorts` / `CancelOpenPorts`; problem variants use `ProblemMutationPorts`; all call `ports.*`.
- No `WritePlan` / `intendedPatches` in `machines/` or `journal/`.
- Journal must not import machines or mutation port types.
- Host wires `journalMutationPorts`, `cancelMutationPorts`/`cancelOpenPorts`, `problemMutationPorts`; all three ports files ≤ 1000 lines; forbids Start/Lease/Outcome/Cancel/Problem sibling hosts.
- Each machines file ≤ 1000 lines.

**When to run:** any change under `route-execution/machines/` or the three ports adapters.

### Critical suite: journal-thinness

**File:** `tests/unit/customer-request/route-execution/journal-thinness.test.ts`

**Locks:**
- Host `startOrResume` / `leaseNextDispatch` / `recordOutcome` are ports-wired shells (≤ 40 lines, `journalMutationPorts`, no run/outbox table queries or `ctx.db` writes in the body).
- Cancel exports similarly thin via cancel ports; no inline `resolveCancellationCommand`.
- No Start/Lease/Outcome/Cancel/Problem sibling Convex hosts; ports files exist.
- Recover helpers remain imported from journal on the host; cancel journal helpers (`cancelDisposition`, etc.) live in machines/ports — not redefined on the host.
- Journal package free of Convex runtime, write-plan DTOs, and mutation port / `startOrResume` coupling.
- Host retains `parseBoundedJson` and `exportedStepState`; `exportCustomerEvidence` stays a thin evidence-load adapter.
- Journal/cancel/problem ports factories ≤ 1000 lines with required persist/branch helpers; machines also free of Convex + write-plan DTOs.

**When to run:** journal package, host start/lease/outcome/cancel wiring, or journal ports adapter changes.

### Inquiry / outbox thinness

| File | What it locks |
|------|----------------|
| `tests/unit/inquiries/convex-host-thinness.test.ts` | `convex/inquiries.ts` does not redefine source-state, notification, or serialize helpers; delegates `inquirySourceStatePorts` / `inquiryNotificationPorts` / serializers; `submitPublicInquiry` ≤ 90 lines; pure serializers in module vs `RuntimeDocument` operator serialize in Convex; ports factories ≤ 80 lines; impl files ≤ 1000; no `inquiryGovernedSendPorts` unless host owns that persistence |
| `tests/unit/inquiries/inquiry-source-state-thinness.test.ts` | Source-state load/persist via ports; `repairErasureKeys` on ports (no freestanding repair exports); ports type Convex-free and re-exported via ledger/public; **no notification outbox orchestration** inside source-state ports (`enqueueInquiryNotification`, `notificationDispatches`); shared `inquiryRuntimeDbHelpers` |
| `tests/unit/inquiries/notification-bridge-thinness.test.ts` | Notification enqueue via `inquiryNotificationPorts`; ports type Convex-free; factory ≤ 80 lines with no freestanding RuntimeDb side-doors; **no source-state load/persist** inside notification ports; bridge reuses `inquiryRuntimeDbHelpers` + `notificationOutboxPersistence` |

**Outbox behavior (not thinness):** `tests/unit/convex/notification-outbox-runtime.test.ts` and `tests/unit/notification-outbox/readback.test.ts` exercise enqueue/dispatch/webhook/readback with fake DB and source-write admission — keep these when changing outbox semantics; keep inquiry thinness when moving orchestration between host/ports/bridge.

**Prescriptive split:** source-state ports own inquiry ledger IO; notification ports/bridge own dispatch enqueue + shared outbox persistence; host only composes both and calls module commands (`submitInquiryModule`, `replyToInquiryModule`).

### Other thinness suites (same recipe)

**Customer-request application** (host `convex/customerRequestApplication.ts` → `application/<slice>`):
- `provide-facts-thinness.test.ts`, `refine-thinness.test.ts`, `confirm-route-thinness.test.ts`, `standing-route-thinness.test.ts`, `compare-resume-thinness.test.ts`, `authorize-preparation-thinness.test.ts`, `preparation-egress-thinness.test.ts`, `action-projection-thinness.test.ts`, `problem-route-thinness.test.ts`

Typical provide-facts host budget: ≤ 30 lines; compile only through ports; no dual compilers / mandate / journal leakage into the slice.

**Capability-supply / routing / answer-thread:**
- `tests/unit/capability-supply/*-thinness.test.ts` (convex-host, eligible-supply, graph-probe, operation-ledger, publication-commands, supply-writers)
- `tests/unit/routing-kernel/kernel-execute-reconcile-thinness.test.ts`
- `tests/unit/answer-thread/turn-path-thinness.test.ts`
- `tests/unit/customer-request/route-execution/evidence-load-thinness.test.ts`

## Mocking

**Framework:** Vitest `vi` (`vi.fn`, `vi.mock`, `vi.hoisted`).

**Patterns:**
```typescript
const routeProviderFetch = vi.hoisted(() => vi.fn<typeof import('undici').fetch>())
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<typeof import('undici')>(),
  fetch: routeProviderFetch,
}))
```

**What to Mock:**
- External network (`undici`/`fetch`), provider SDKs, time via ports (`ports.now()`).
- Ports collaborators in unit tests of pure application/machines.
- Auth/admission helpers via `tests/helpers/source-write-admission.ts` for write-gated Convex units.

**What NOT to Mock:**
- The public module under test.
- Private `internal/` collaborators of the same module (refactor the seam instead).
- Thinness tests should not mock — they read source text.

## Fixtures and Factories

**Test Data:**
- Inline typed fixtures next to the suite (see `tests/unit/customer-request/application/provide-facts.test.ts`).
- Sandbox supply constants from `@/modules/sandbox-supply/public` in integration routes.
- Scanner self-tests: `tests/fixtures/bad-ts-standards`, `tests/fixtures/bad-imports/…` with `AE_SCAN_MODE=fixtures`.

**Location:**
- Prefer local fixtures in the test file; shared helpers only in `tests/helpers/`.
- Do not invent a second fixture framework.

## Coverage

**Requirements:** None enforced as a global percent gate in `package.json`.

**View Coverage:** Not a first-class script; use Vitest coverage flags ad hoc if needed. Prefer proof-class gates (`test:unit`, `test:integration`, thinness, imports) over coverage %.

## Test Types

**Unit Tests:**
- Pure domain, projections, machines (with fake ports), Convex host handlers with in-memory Db doubles, React unit mounts where present.
- Always include/update thinness when extracting ports or thinning a host.

**Integration Tests:**
- `convex-test` against real schema + module graph; multi-capability route, registry API, discovery parity, answer-turn flows under `tests/integration/`.
- `npm run test:integration` disables file parallelism for stability.

**Import / contract scans:**
- Boundaries: `tests/imports/customer-request-boundaries.test.ts`, capability/routing/private-import suites.
- Copy: `tests/copy/*` via `scanCopyClaims`.
- UI/SEO: `tests/ui-contract`, `tests/seo`.

**E2E Tests:**
- Playwright local (`npm run test:e2e`) — compact + wide Chromium projects; optional local webServer on `127.0.0.1:3020` with Clerk disabled for e2e.
- Deploy smokes: `tests/deploy-smoke/*` via `playwright.deploy-smoke.config.ts` and release scripts in `package.json`.

**Evals:**
- `npm run test:eval` — promptfoo + `tests/eval` (separate from release unit gate).

## Common Patterns

**Async Testing:**
```typescript
const result = await provideCustomerRequestFacts(input, ports)
expect(result.kind).toBe('ok')
```

**Error / refuse Testing:**
```typescript
expect(result).toEqual({ kind: 'refused', reason: 'request_not_found' })
```

**Thinness body slice:**
```typescript
const start = host.indexOf('export const startOrResume = internalMutation({')
const end = host.indexOf('\n})', start)
const body = host.slice(start, end)
expect(body.split('\n').length).toBeLessThanOrEqual(40)
expect(body).toContain('journalMutationPorts(ctx)')
expect(body).not.toContain('ctx.db.insert(')
```

**Exhaustive domain unions:** assert every `kind` the public contract can return; keep TypeScript `never` checks in production switch defaults.

**Source-write admission:** wrap writes with `withSourceWrite` / `withoutSourceWrite` from `tests/helpers/source-write-admission.ts` when testing gated Convex mutations.

## Prescriptive checklist for new deepenings

1. Extract pure machine/application under `src/modules/...`.
2. Add ports type (no Convex imports, no `WritePlan`).
3. Add `convex/*Ports.ts` factory adapting `ctx`.
4. Thin host export to ports + machine call (respect line budgets).
5. Add/extend `*-thinness.test.ts` locking the above.
6. Keep or add behavioral unit tests through ports.
7. If route execution / multi-capability behavior changes, run the relevant `tests/integration/customer-request-*.test.ts`.
8. Run `npm run test:unit` (at least the thinness + sibling unit files) and `npm run typecheck`.

---

*Testing analysis: 2026-07-18 (commit `3463c1d4`)*
