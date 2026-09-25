import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { line, printJson } from '../lib/output'
import { usageFailure } from '../lib/help'
import { checkBuyer, connectNextCommand } from './doctor/credential'
import { checkDeployment, checkMcp, checkServer } from './doctor/discovery'
import { checkProvider } from './doctor/provider'
import { skippedQuoteCheck } from './doctor/quote'
import { computeTier, type DoctorGroup, type GroupState, type DoctorCheck, type DoctorCheckDraft, type DoctorResult } from './doctor/shared'


const CHECK_GROUPS: Readonly<Record<string, DoctorGroup>> = {
  origin: 'discovery', server: 'discovery', mcp: 'discovery',
  readiness: 'discovery', release: 'discovery', catalogue: 'discovery',
  buyer: 'quoting', quote: 'quoting',
  balance: 'purchase', funding: 'purchase', call: 'purchase', market_requests: 'purchase',
  repeat_use: 'purchase', provider: 'purchase', 'provider.readiness': 'purchase',
}

/** Skipping one of these proves nothing about its group, so it cannot roll up as a pass. */
const REQUIRED_CHECK_IDS: readonly string[] = ['quote']



function withGroup(check: DoctorCheckDraft): DoctorCheck {
  const group = CHECK_GROUPS[check.id]
  if (group === undefined) throw new Error('doctor_check_group_missing')
  const { id, ...rest } = check
  return { id, group, ...rest }
}

/**
 * One failed check fails its group, and a skipped check never stands in for a
 * pass: a skipped required check, or a group nothing reached, reports skipped.
 */
function groupState(checks: readonly DoctorCheck[], group: DoctorGroup): GroupState {
  const members = checks.filter((check) => check.group === group)
  if (members.some((check) => check.state === 'fail')) return 'fail'
  if (members.some((check) => check.state === 'skipped' && REQUIRED_CHECK_IDS.includes(check.id))) return 'skipped'
  // An empty group was never reached, so `every` reporting skipped is correct.
  if (members.every((check) => check.state === 'skipped')) return 'skipped'
  if (members.some((check) => check.state === 'warn')) return 'warn'
  return 'pass'
}

function doctorResult(drafts: readonly DoctorCheckDraft[]): DoctorResult {
  const checks = drafts.map(withGroup)
  return {
    // A skipped check reports an unproven step, not a broken one, so it leaves
    // the overall diagnosis alone while its group still refuses a pass.
    kind: checks.some((check) => check.state === 'fail' || check.state === 'warn') ? 'degraded' : 'ready',
    information: { localProviderEnvironment: computeTier() },
    groups: {
      discovery: groupState(checks, 'discovery'),
      quoting: groupState(checks, 'quoting'),
      purchase: groupState(checks, 'purchase'),
    },
    checks,
  }
}


export async function runDoctorCommand(args: readonly string[], options: CliOptions): Promise<number> {
  // A business ID only ever scopes the provider check: `--provider` is the sole way to
  // request it, so a bare positional without `--provider` is a usage error rather than
  // a silently-ignored argument.
  const businessId = args[0]?.trim()
  if (args.length > 1 || (businessId !== undefined && (businessId.length === 0 || options.provider !== true))) {
    throw usageFailure('doctor', 'doctor-usage')
  }
  const checks: DoctorCheckDraft[] = [{
    id: 'origin', state: 'pass', summary: `Configured origin is ${new URL(options.baseUrl).origin}.`,
  }]
  const server = await checkServer(options)
  checks.push(server)
  if (server.state === 'fail') {
    checks.push(
      { id: 'mcp', state: 'warn', summary: 'MCP initialization was not checked because server identity is unavailable.' },
      { id: 'buyer', state: 'warn', summary: 'Buyer credential was not sent because server identity is unavailable.' },
      { id: 'balance', state: 'warn', summary: 'Balance was not checked because server identity is unavailable.' },
      { id: 'call', state: 'warn', summary: 'Call recovery was not checked because server identity is unavailable.' },
      ...(options.provider === true
        ? [
            { id: 'provider', state: 'warn' as const, summary: 'Provider credential was not sent because server identity is unavailable.' },
            { id: 'provider.readiness', state: 'warn' as const, summary: 'Provider readiness was not checked because server identity is unavailable.' },
          ]
        : []),
    )
    renderDoctor(doctorResult(checks), options)
    return 1
  }
  checks.push(await checkMcp(options.baseUrl))
  checks.push(...await checkDeployment(options.baseUrl))
  const buyer = resolveAgentAccessCredential(options.baseUrl)
  if (buyer === undefined) {
    const connect = connectNextCommand(options)
    checks.push({
      id: 'buyer', state: 'warn',
      summary: 'No buyer credential is selected for this origin; anonymous search and describe remain available.',
      ...(connect === undefined ? {} : { nextCommand: connect }),
    })
    checks.push(
      skippedQuoteCheck('no buyer credential for this origin', connect, 'no_buyer_credential'),
      {
        id: 'balance', state: 'warn',
        summary: 'Balance is unavailable until a buyer credential is connected.',
      },
      {
        id: 'call', state: 'warn',
        summary: 'Call recovery is unavailable until a buyer credential is connected.',
      },
    )
  } else {
    checks.push(...await checkBuyer(options, buyer))
  }
  if (options.provider === true) {
    checks.push(...await checkProvider(options, businessId))
  }

  const result = doctorResult(checks)
  renderDoctor(result, options)
  return result.kind === 'degraded' ? 1 : 0
}


function renderDoctor(result: DoctorResult, options: CliOptions): void {
  if (options.json) {
    printJson(result)
    return
  }
  line(`AE doctor: ${result.kind}`)
  for (const check of result.checks) {
    const marker = check.state === 'pass' ? '✓' : check.state === 'warn' ? '!' : check.state === 'skipped' ? '-' : '✗'
    line(`${marker} ${check.summary}`)
  }
  const environment = result.information.localProviderEnvironment
  line(`Local provider environment (informational): tier ${environment.level}${environment.missing.length === 0 ? '' : `; ${environment.missing.length} missing settings`}.`)
  line(`discovery: ${result.groups.discovery} | quoting: ${result.groups.quoting} | purchase: ${result.groups.purchase}`)
  const firstFailure = result.checks.find((check) => check.state === 'fail')
  const nextCommand = firstFailure === undefined
    ? result.checks.find((check) => check.state === 'warn' && check.nextCommand !== undefined)?.nextCommand
      ?? result.checks.find((check) => check.state === 'pass' && check.nextCommand !== undefined)?.nextCommand
    : firstFailure.nextCommand
  if (nextCommand !== undefined) line(`Next: ${nextCommand}`)
}
