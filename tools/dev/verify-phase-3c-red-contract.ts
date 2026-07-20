import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

export const EXPECTED_PHASE_3C_REDS = Object.freeze({
  'Phase 3C hosted paid-operation contract RED reconstructs the hosted aggregate from bounded source and control records':
    'hosted_aggregate_reconstruction_absent',
  'Phase 3C hosted paid-operation contract RED returns aggregate_incomplete instead of projecting a cap plus one read':
    'bounded_aggregate_cap_absent',
  'Phase 3C hosted paid-operation contract RED reloads the committed aggregate after every mutating command':
    'post_command_durable_refresh_absent',
  'Phase 3C hosted paid-operation contract RED keeps business and provider truth out of neutral control':
    'business_control_ownership_gate_absent',
  'Phase 3C hosted paid-operation contract RED persists only opaque custody references and rejects raw secret or evidence material':
    'opaque_custody_serialization_gate_absent',
  'Phase 3C hosted paid-operation contract RED persists submission-started before a possible provider release':
    'submission_started_ordering_contract_absent',
  'Phase 3C hosted paid-operation contract RED exposes an intent-only public reconcile command':
    'public_reconcile_intent_dto_absent',
  'Phase 3C hosted paid-operation contract RED separates public reconcile intent from internal trusted resolution types':
    'public_internal_reconcile_split_absent',
  'Phase 3C hosted paid-operation contract RED admits reconciliation only through a trusted evidence observer':
    'trusted_reconciliation_observer_absent',
  'Phase 3C hosted paid-operation contract RED creates pairwise-distinct consequence lineage when switching provider':
    'provider_switch_new_lineage_contract_absent',
  'Phase 3C hosted paid-operation contract RED allows reconcile only while payment truth is uncertain':
    'uncertainty_continuation_gate_absent',
  'Phase 3C hosted paid-operation contract RED keeps authority recording and execution as distinct golden transitions':
    'golden_authority_execute_boundary_absent',
  'Phase 3C hosted paid-operation contract RED supplies evidence labels at runtime without letting local fixtures claim hosted proof':
    'runtime_evidence_label_admission_absent',
  'Phase 3C hosted paid-operation authentication RED derives the hosted actor from ctx.auth instead of caller owner fields':
    'ctx_auth_actor_bridge_absent',
  'Phase 3C hosted paid-operation authentication RED keeps authentication and evaluator admission separate from consequence authority':
    'identity_authority_separation_absent',
  'Phase 3C hosted paid-operation authentication RED reserves evaluator count concurrency and rate limits atomically':
    'atomic_trial_admission_absent',
  'Phase 3C hosted paid-operation authentication RED fails closed for revoked paid-operation agent credentials':
    'paid_operation_agent_revocation_absent',
  'Phase 3C hosted paid-operation authentication RED uses a non-enumerating missing and cross-principal hosted read boundary':
    'hosted_non_enumeration_boundary_absent',
  'Phase 3C hosted paid-operation authentication RED rejects direct bypass before any hosted operation facts are loaded':
    'hosted_direct_bypass_guard_absent',
} as const)

type Assertion = {
  fullName?: unknown
  status?: unknown
  failureMessages?: unknown
}

export type RedClassification =
  | Readonly<{
      kind: 'expected_red'
      tests: readonly Readonly<{ fullName: string; reason: string }>[]
    }>
  | Readonly<{ kind: 'rejected'; code: string; detail: string }>

export function classifyPhase3CRedReport(value: unknown): RedClassification {
  if (!isObject(value) || !Array.isArray(value.testResults)) {
    return rejected('malformed_output', 'Vitest JSON testResults are missing.')
  }
  const testResults = value.testResults
  if (testResults.some((result) => !isObject(result) || !Array.isArray(result.assertionResults))) {
    return rejected('malformed_output', 'Vitest JSON assertionResults are missing.')
  }
  const assertions = testResults.flatMap((result) =>
    (result as { assertionResults: Assertion[] }).assertionResults)
  if (assertions.length === 0) return rejected('missing_test', 'No assertions were reported.')

  const expected = new Map(Object.entries(EXPECTED_PHASE_3C_REDS))
  const observed = new Map<string, string>()
  for (const assertion of assertions) {
    if (typeof assertion.fullName !== 'string' || typeof assertion.status !== 'string') {
      return rejected('malformed_output', 'An assertion lacks fullName or status.')
    }
    const reason = expected.get(assertion.fullName)
    if (reason === undefined) {
      return rejected('unrelated_failure', `Unexpected test: ${assertion.fullName}`)
    }
    if (assertion.status === 'passed') {
      return rejected('unexpected_pass', assertion.fullName)
    }
    if (assertion.status !== 'failed') {
      return rejected('infrastructure_failure', `${assertion.fullName}: ${assertion.status}`)
    }
    if (!Array.isArray(assertion.failureMessages)
      || !assertion.failureMessages.every((message) => typeof message === 'string')) {
      return rejected('malformed_output', `${assertion.fullName}: failureMessages missing`)
    }
    const messages = assertion.failureMessages.join('\n')
    const primaryDiagnostic = messages.split('\n', 1)[0] ?? ''
    const marker = `[P3C_RED:${reason}]`
    if (primaryDiagnostic.startsWith(`AssertionError: ${marker}`)) {
      if (observed.has(assertion.fullName)) {
        return rejected('duplicate_test', assertion.fullName)
      }
      observed.set(assertion.fullName, reason)
      continue
    }
    if (/(Failed to load url|Cannot find module|ERR_MODULE_NOT_FOUND|config|timed out|timeout|Worker exited|Unhandled Error)/iu
      .test(primaryDiagnostic)) {
      const code = /timed out|timeout/iu.test(primaryDiagnostic)
        ? 'timeout_failure'
        : /Cannot find module|ERR_MODULE_NOT_FOUND|Failed to load url/iu.test(primaryDiagnostic)
          ? 'import_failure'
          : /config/iu.test(primaryDiagnostic)
            ? 'config_failure'
            : 'infrastructure_failure'
      return rejected(code, assertion.fullName)
    }
    return rejected('reason_mismatch', `${assertion.fullName}: expected ${marker} as the primary diagnostic`)
  }
  const missing = [...expected.keys()].filter((fullName) => !observed.has(fullName))
  if (missing.length > 0) return rejected('missing_test', missing.join(', '))
  return {
    kind: 'expected_red',
    tests: [...observed].map(([fullName, reason]) => ({ fullName, reason })),
  }
}

function rejected(code: string, detail: string): RedClassification {
  return { kind: 'rejected', code, detail }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function reportPath(args: readonly string[]): string | undefined {
  const index = args.indexOf('--report')
  return index === -1 ? undefined : args[index + 1]
}

export function runPhase3CRedVerifier(args = process.argv.slice(2)): number {
  const outputPath = reportPath(args)
  if (outputPath === undefined) {
    console.error('Usage: verify-phase-3c-red-contract.ts --report <path>')
    return 2
  }
  const command = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      'vitest',
      'run',
      'tests/unit/action-invocation/hosted-paid-operation-contract-red.test.ts',
      'tests/unit/server/hosted-paid-operation-auth-contract-red.test.ts',
      '--reporter=json',
    ],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
  )
  let parsed: unknown
  try {
    parsed = JSON.parse(command.stdout)
  } catch {
    parsed = undefined
  }
  const classification = command.error?.code === 'ETIMEDOUT'
    ? rejected('timeout_failure', 'Vitest exceeded 60 seconds.')
    : command.error !== undefined
      ? rejected('infrastructure_failure', command.error.message)
      : classifyPhase3CRedReport(parsed)
  const report = {
    schema: 'phase-3c-red-report:v1',
    generatedAt: new Date().toISOString(),
    command: `npx --offline tsx tools/dev/verify-phase-3c-red-contract.ts --report ${outputPath}`,
    classifiedCommand:
      'npx vitest run <two allowlisted Phase 3C RED files> --reporter=json',
    vitestExitCode: command.status,
    disposition: classification.kind,
    classification,
    expectedCount: Object.keys(EXPECTED_PHASE_3C_REDS).length,
    evidenceClass: 'source_inspection_and_classified_executable_failing_fixtures',
    claimCeiling: 'contract_gaps_only_no_implementation_or_hosted_provider_payment_claim',
  }
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  if (classification.kind !== 'expected_red' || command.status !== 1) {
    console.error(JSON.stringify(report, null, 2))
    return 1
  }
  console.log(JSON.stringify({
    disposition: classification.kind,
    expectedCount: report.expectedCount,
    vitestExitCode: command.status,
    report: outputPath,
  }))
  return 0
}

if (process.argv[1]?.endsWith('verify-phase-3c-red-contract.ts')) {
  process.exitCode = runPhase3CRedVerifier()
}
