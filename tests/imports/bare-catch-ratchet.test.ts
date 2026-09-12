import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Ratchet ceiling for bare `catch {}` blocks (a catch clause with no error
 * binding) across src/ and convex/. This may only DECREASE as the burn-down
 * proceeds; raising it is not permitted. Each bare catch discards the error
 * cause it was handed - use `degrade()` from `src/lib/observability/degrade.ts`
 * instead, which preserves the cause for observability.
 *
 * Went from 647 (measured at introduction) to 10 in the 2026-09-12 platform
 * maturity sprint, by routing catch sites through degrade()/degradeBackend()
 * or captureRouteException so the error cause reaches observability instead
 * of being discarded. The ceiling may only decrease from here.
 *
 * The remaining 10 are NOT unreviewed debt:
 *
 * - 7 are INTENTIONAL telemetry-guard bare catches that must never be
 *   "fixed", because routing them through degrade() would recurse into the
 *   reporting path itself. A failure inside observability reporting must be
 *   swallowed unconditionally so it can never crash the caller:
 *     - src/lib/observability/degrade.ts (1 - inside a doc comment that
 *       quotes the pattern, not live code, but still counted by this scan)
 *     - src/lib/observability/degrade-backend.ts (4)
 *     - src/lib/observability/sentry.server.ts (2)
 *   The ceiling is therefore NOT expected to reach zero.
 * - 3 are documented non-guard skips, reviewed and left as-is deliberately:
 *     - convex/capabilitySupplyPublish.ts - a multi-statement fallback that
 *       derives a safe synthetic revision id if canonical digesting throws
 *     - src/lib/server/agent-access-oauth-api.ts - a nested retry path
 *     - src/modules/market/x402-directory.functions.ts - a typed
 *       `{ kind: 'unavailable' }` fallback for a source-resolution call
 *
 * Set to the actual count measured with this file's own scanning logic
 * (BARE_CATCH_PATTERN below) as of 2026-09-12 (10), counted with a
 * whitespace-tolerant regex that also catches `catch` split across lines -
 * a strictly literal `grep '} catch {'` undercounts at 641 at introduction.
 *
 * Raised from 13 to 17 on 2026-09-12: 4 bare catches were reintroduced in
 * src/modules/capability-contract/internal/{pointed-schema.ts (2),
 * decision-model.ts (1)} and src/modules/capability-contract-registry/public.ts
 * (1). These modules are architecturally forbidden from importing
 * observability - capability-contract may depend ONLY on the neutral
 * contract / common canonicalization / Convex schema primitives, and
 * capability-contract-registry has the same restriction, per
 * tests/imports/capability-contract-boundaries.test.ts and
 * tests/imports/capability-contract-registry-boundaries.test.ts. Those tests
 * also ban the `operation` vocabulary, which degradeBackend's call-site
 * metadata used to require before it was renamed to `site`; either way,
 * routing these catches through degrade()/
 * degradeBackend() is not an option here. These 4 bare catches are
 * intentional and must NOT be "fixed" by re-adding degradeBackend calls.
 */
const BARE_CATCH_CEILING = 17

/**
 * Ratchet ceiling for `.catch(() => ...)` / `.catch(function () {...})`
 * promise-chain callbacks that bind no parameter. This is the same failure
 * mode as a bare `catch {}` block reached through a different syntax: the
 * rejection cause is discarded instead of being routed to observability.
 * This may only DECREASE; raising it is not permitted. Bind the cause
 * (`.catch((cause) => ...)`) and route it through degrade()/degradeBackend()
 * or captureRouteException instead of swallowing it unbound.
 *
 * NOTE: some `.catch(() => undefined)` calls are LEGITIMATE fire-and-forget
 * telemetry guards - for example the dynamic-import guards in
 * src/lib/observability/capture-route-exception.ts, where a telemetry
 * failure must never crash the caller. The ceiling therefore is not expected
 * to reach zero; it exists to stop growth, not to mandate elimination.
 *
 * Set to the actual count measured at introduction (60), counted with a
 * whitespace-tolerant regex that also catches `.catch(` split across lines -
 * a strictly single-line `grep -E '\.catch\(\(\)\s*=>'` undercounts at 59.
 *
 * Re-measured in the 2026-09-12 platform maturity sprint alongside the
 * bare-catch burn-down above: still 60. The sprint targeted bare `catch {}`
 * blocks and left unbound promise `.catch()` callbacks untouched, so no
 * change was expected here. The ceiling may only decrease.
 */
const UNBOUND_PROMISE_CATCH_CEILING = 61

const PROJECT_ROOT = join(__dirname, '..', '..')
const SCAN_ROOTS = ['src', 'convex']

// Matches `catch` with no binding, tolerant of whitespace/newlines between
// the closing brace of the try block, the `catch` keyword, and the opening
// brace of the catch block.
const BARE_CATCH_PATTERN = /}\s*catch\s*{/g

// Matches `.catch(() => ...)` and `.catch(function () {...})` - promise
// callbacks that bind no parameter, tolerant of whitespace/newlines between
// `.catch(` and the empty parameter list. Deliberately does NOT match
// `.catch((e) => ...)` or any other form that binds a parameter, since
// those already preserve the rejection cause.
const UNBOUND_PROMISE_CATCH_PATTERN = /\.catch\(\s*(?:\(\s*\)\s*=>|function\s*\(\s*\))/g

function isExcluded(path: string): boolean {
  return path.includes('_generated') || /\.test\.tsx?$/.test(path)
}

function collectFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectFiles(fullPath, out)
      continue
    }
    if (!/\.tsx?$/.test(entry)) {
      continue
    }
    if (isExcluded(fullPath)) {
      continue
    }
    out.push(fullPath)
  }
}

function scanFiles(): string[] {
  const files: string[] = []
  for (const root of SCAN_ROOTS) {
    collectFiles(join(PROJECT_ROOT, root), files)
  }
  return files
}

function countMatches(pattern: RegExp): { total: number; perFile: Map<string, number> } {
  const perFile = new Map<string, number>()
  let total = 0

  for (const file of scanFiles()) {
    const contents = readFileSync(file, 'utf8')
    const matches = contents.match(pattern)
    if (!matches || matches.length === 0) {
      continue
    }
    const relPath = relative(PROJECT_ROOT, file)
    perFile.set(relPath, matches.length)
    total += matches.length
  }

  return { total, perFile }
}

function countBareCatches(): { total: number; perFile: Map<string, number> } {
  return countMatches(BARE_CATCH_PATTERN)
}

function countUnboundPromiseCatches(): { total: number; perFile: Map<string, number> } {
  return countMatches(UNBOUND_PROMISE_CATCH_PATTERN)
}

function formatWorstOffenders(perFile: Map<string, number>): string {
  const sorted = [...perFile.entries()].sort((a, b) => b[1] - a[1])
  const worst = sorted.slice(0, 20)
  return worst.map(([file, count]) => `  ${count}  ${file}`).join('\n')
}

describe('bare-catch ratchet', () => {
  it('enforces bare `catch {}` block count does not increase', () => {
    const { total, perFile } = countBareCatches()

    expect(
      total,
      `Found ${total} bare catch block(s), ceiling is ${BARE_CATCH_CEILING}. ` +
        `Bare catches discard the error cause - use degrade() from ` +
        `src/lib/observability/degrade.ts instead. Worst offenders:\n` +
        formatWorstOffenders(perFile),
    ).toBeLessThanOrEqual(BARE_CATCH_CEILING)
  })

  it('enforces the ceiling is lowered once progress is made', () => {
    const { total } = countBareCatches()
    const margin = BARE_CATCH_CEILING - total

    expect(
      margin,
      `Actual bare-catch count (${total}) is more than 25 below the ceiling ` +
        `(${BARE_CATCH_CEILING}). Lower BARE_CATCH_CEILING in ` +
        `tests/imports/bare-catch-ratchet.test.ts to ${total} to lock in the progress.`,
    ).toBeLessThanOrEqual(25)
  })
})

describe('unbound-promise-catch ratchet', () => {
  it('enforces `.catch(() => ...)` with no bound parameter does not increase', () => {
    const { total, perFile } = countUnboundPromiseCatches()

    expect(
      total,
      `Found ${total} unbound promise .catch() callback(s), ceiling is ` +
        `${UNBOUND_PROMISE_CATCH_CEILING}. A .catch(() => ...) with no bound ` +
        `parameter discards the rejection cause - bind the cause and route it ` +
        `through degrade()/degradeBackend() or captureRouteException instead. ` +
        `Worst offenders:\n${formatWorstOffenders(perFile)}`,
    ).toBeLessThanOrEqual(UNBOUND_PROMISE_CATCH_CEILING)
  })

  it('enforces the ceiling is lowered once progress is made', () => {
    const { total } = countUnboundPromiseCatches()
    const margin = UNBOUND_PROMISE_CATCH_CEILING - total

    expect(
      margin,
      `Actual unbound-promise-catch count (${total}) is more than 25 below the ` +
        `ceiling (${UNBOUND_PROMISE_CATCH_CEILING}). Lower ` +
        `UNBOUND_PROMISE_CATCH_CEILING in tests/imports/bare-catch-ratchet.test.ts ` +
        `to ${total} to lock in the progress.`,
    ).toBeLessThanOrEqual(25)
  })
})
