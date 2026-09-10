#!/usr/bin/env node
/**
 * Ratchet for `npm run deps:check`, in the spirit of an ESLint/Betterer
 * ratchet applied to a legacy codebase: dependency-cruiser rules can only be
 * tightened, never loosened, by capping each rule's violation count at a
 * ceiling recorded here. Lower these as work lands; never raise them.
 *
 * Runs `depcruise` itself (do not call `depcruise` separately in
 * `deps:check`) so the ceilings stay next to the one command that enforces
 * them.
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEPCRUISE_BIN = resolve(PROJECT_ROOT, 'node_modules/.bin/depcruise')
const CONFIG_PATH = resolve(PROJECT_ROOT, '.dependency-cruiser.cjs')
const CRUISE_TARGETS = ['src', 'convex', 'tools']

// Ceilings, one per dependency-cruiser rule name. A rule not listed here has
// no ceiling (any count is a failure, matching depcruise's own default
// error-on-any-violation behaviour for that rule).
const RATCHET = {
  'no-circular': 0,
  'no-circular-via-barrel': 258,
  'no-circular-capability-supply-internal': 34,
}

function runDepcruise() {
  const args = [
    '--config',
    CONFIG_PATH,
    '--output-type',
    'json',
    ...CRUISE_TARGETS,
  ]
  // depcruise's own exit code reflects whether *any* rule fired, not
  // whether counts are within the ratchet's ceilings - the ratchet script
  // makes that call itself from the JSON report, so a non-zero exit here is
  // expected and not an error.
  const result = execFileSync(DEPCRUISE_BIN, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return JSON.parse(result)
}

function countViolationsByRule(report) {
  const counts = {}
  for (const violation of report.summary.violations) {
    const name = violation.rule.name
    counts[name] = (counts[name] ?? 0) + 1
  }
  return counts
}

function main() {
  let report
  try {
    report = runDepcruise()
  } catch (error) {
    // depcruise exits non-zero when error-severity rules fire; stdout still
    // carries the JSON report in that case.
    const stdout = error.stdout?.toString()
    if (!stdout) {
      console.error('deps-ratchet: depcruise produced no output to parse.')
      console.error(error.message)
      process.exit(1)
    }
    report = JSON.parse(stdout)
  }

  const counts = countViolationsByRule(report)
  const ruleNames = new Set([...Object.keys(RATCHET), ...Object.keys(counts)])

  const rows = [...ruleNames].sort().map((name) => {
    const count = counts[name] ?? 0
    const ceiling = RATCHET[name] ?? 0
    const status =
      count > ceiling ? 'FAIL' : count < ceiling ? 'lower the ceiling' : 'ok'
    return { name, count, ceiling, status }
  })

  const nameWidth = Math.max(...rows.map((row) => row.name.length), 'rule'.length)
  const countWidth = Math.max(...rows.map((row) => String(row.count).length), 'count'.length)
  const ceilingWidth = Math.max(...rows.map((row) => String(row.ceiling).length), 'ceiling'.length)

  console.log(
    `${'rule'.padEnd(nameWidth)}  ${'count'.padStart(countWidth)}  ${'ceiling'.padStart(ceilingWidth)}  status`,
  )
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(nameWidth)}  ${String(row.count).padStart(countWidth)}  ${String(row.ceiling).padStart(ceilingWidth)}  ${row.status}`,
    )
  }

  const failures = rows.filter((row) => row.count > row.ceiling)
  if (failures.length > 0) {
    console.error(
      `\ndeps-ratchet: ${failures.length} rule(s) exceeded their ceiling: ${failures
        .map((row) => `${row.name} (${row.count} > ${row.ceiling})`)
        .join(', ')}`,
    )
    process.exit(1)
  }
}

main()
