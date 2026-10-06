import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUIRED_NATIVE_MONEY_FILES = Object.freeze([
  'tests/integration/capability-call-money-matrix.test.ts',
  'tests/integration/capability-call-workpool.test.ts',
  'tests/integration/money-formance-boundary.test.ts',
  'tests/integration/money-formance-plans.test.ts',
  'tests/integration/plan-workflow-money.test.ts',
])

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sanitizeNativeMoneyLog(text: string): string {
  // The job receives no credentials. Still exclude sensitive-shaped diagnostic
  // lines rather than uploading arbitrary SDK/database exception payloads.
  return text.split('\n').map(line =>
    /authorization|bearer|password|secret|credential|token|postgres(?:ql)?:\/\//iu.test(line)
      ? '[sensitive-shaped diagnostic omitted]'
      : line,
  ).join('\n')
}

/**
 * Requires: an actual Vitest JSON report from every explicitly listed file.
 * Ensures: each required file contains executed, passed assertions; counts alone
 * cannot establish native proof. Output omits exception payloads and raw inputs.
 * Invariant: missing, pending, skipped, empty or failed evidence never passes.
 * On violation: publish a sanitized failed report and exit nonzero at the CLI.
 * Keep this one evidence boundary: it replaces repeated inline report checks,
 * and lets CI and local acceptance consume the identical fail-closed rule.
 */
export function inspectNativeMoneyReport(input: unknown) {
  const results = record(input) && Array.isArray(input.testResults) ? input.testResults : []
  const files = REQUIRED_NATIVE_MONEY_FILES.map(file => {
    const matches = results.filter(result => record(result) && typeof result.name === 'string'
      && (result.name.replaceAll('\\', '/') === file || result.name.replaceAll('\\', '/').endsWith(`/${file}`)))
    const result = matches.length === 1 ? matches[0] : undefined
    const assertions = record(result) && Array.isArray(result.assertionResults) ? result.assertionResults : []
    const tests = assertions.map(assertion => ({
      name: record(assertion) && typeof assertion.fullName === 'string' && assertion.fullName.trim().length > 0
        ? sanitizeNativeMoneyLog(assertion.fullName) : '[invalid assertion name]',
      status: record(assertion) && typeof assertion.status === 'string'
        && ['passed', 'failed', 'pending', 'skipped', 'todo'].includes(assertion.status) ? assertion.status : 'invalid',
    }))
    const passed = record(result) && result.status === 'passed' && tests.length > 0
      && tests.every(test => test.status === 'passed' && test.name !== '[invalid assertion name]')
    return { file, status: passed ? 'passed' : 'failed', assertions: tests }
  })
  const passed = record(input) && input.success === true && files.every(file => file.status === 'passed')
    && input.numFailedTests === 0 && input.numPendingTests === 0 && input.numTodoTests === 0
    && input.numFailedTestSuites === 0 && input.numPendingTestSuites === 0
  return { evidenceClass: 'native-money-contract', sanitized: true, status: passed ? 'passed' : 'failed', files }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, inputPath, outputPath] = process.argv.slice(2)
  if ((mode !== 'report' && mode !== 'logs') || inputPath === undefined || outputPath === undefined) {
    console.error('usage: node tools/release/native-money-evidence.ts report|logs <input> <output>')
    process.exitCode = 1
  } else if (mode === 'logs') {
    writeFileSync(outputPath, sanitizeNativeMoneyLog(readFileSync(inputPath, 'utf8')))
  } else {
    let input: unknown
    try {
      input = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown
    } catch {
      input = undefined
    }
    const evidence = inspectNativeMoneyReport(input)
    writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
    if (evidence.status !== 'passed') {
      console.error('native money evidence incomplete or failed; inspect sanitized report')
      process.exitCode = 1
    }
  }
}
