import { statusRefSchema, type JourneyNext } from '@/modules/actions/contract'
import { AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS, agentAccountBalanceAction } from '@/modules/agent-access/account.actions'
import { callListResultSchema } from '@/modules/capability-execution/call-history.actions'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { MARKET_REQUEST_ROUTE_CONTRACTS, marketRequestListAction, marketRequestStatusAction } from '@/modules/market-demand/market-demand.actions'
import { toolChoiceDescribeOutputSchema } from '@/modules/registry/tool-choice-contracts'
import { TOOL_MARKET_DESCRIBE_PATH } from '@/modules/registry/tool-entry'
import type { CliOptions } from '../../lib/args'
import { isLoopbackCliBaseUrl } from '../../lib/args'
import { callJson } from '../../lib/output'
import { cliContinuation } from '../../lib/continuation-command'
import { journeyNextCommand } from '../../lib/journey-next-command'
import { doctorContinuation, stripeTestModeConfigured, type CallDoctorResult, type DoctorCheckDraft } from './shared'

const MARKET_REQUEST_REENTRY_LIMIT = 5

export async function checkMarketRequests(
  options: CliOptions,
  headers: Readonly<Record<string, string>>,
): Promise<DoctorCheckDraft> {
  const { baseUrl } = options
  try {
    const listOutcome = await callJson(baseUrl, MARKET_REQUEST_ROUTE_CONTRACTS.list.path, {
      method: MARKET_REQUEST_ROUTE_CONTRACTS.list.method,
      headers,
      body: JSON.stringify({ limit: MARKET_REQUEST_REENTRY_LIMIT }),
    })
    const list = marketRequestListAction.outputSchema.safeParse(listOutcome.body)
    if (!listOutcome.ok || !list.success || list.data.kind !== 'available') {
      return marketRequestUnavailable(options, 'Private market request matches are unavailable.')
    }
    if (list.data.items.length === 0) {
      return {
        id: 'market_requests', state: 'pass',
        summary: 'No private market requests need rechecking.',
      }
    }

    const statuses = await Promise.all(list.data.items.map(async (item) => {
      try {
        const outcome = await callJson(baseUrl, MARKET_REQUEST_ROUTE_CONTRACTS.status.path, {
          method: MARKET_REQUEST_ROUTE_CONTRACTS.status.method,
          headers,
          body: JSON.stringify({ requestRef: item.requestRef }),
        })
        const parsed = marketRequestStatusAction.outputSchema.safeParse(outcome.body)
        return outcome.ok && parsed.success ? parsed.data : undefined
      } catch {
        return undefined
      }
    }))
    const matched = statuses.filter((status) => status?.kind === 'matched')
    const firstTool = matched[0]?.tools[0]
    if (firstTool !== undefined) {
      const nextCommand = journeyNextCommand({ action: 'registry.tools.describe', args: { toolRef: firstTool.toolRef }, authority: 'public' }, options)
      const checked = list.data.items.length
      return {
        id: 'market_requests', state: 'pass',
        summary: `${matched.length} of ${checked} recent private market ${checked === 1 ? 'request now has' : 'requests now have'} matching Tools.`,
        ...(nextCommand === undefined ? {} : { nextCommand }),
      }
    }
    if (statuses.some((status) => status === undefined || status.kind === 'error' || status.kind === 'not_found')) {
      return marketRequestUnavailable(options, 'Some recent private market requests could not be rechecked.')
    }
    const checked = list.data.items.length
    return {
      id: 'market_requests', state: 'warn',
      summary: `No current Tool matches the ${checked} most recent private market ${checked === 1 ? 'request' : 'requests'} yet.`,
    }
  } catch {
    return marketRequestUnavailable(options, 'Private market request matches could not be rechecked.')
  }
}

function marketRequestUnavailable(options: CliOptions, summary: string): DoctorCheckDraft {
  return {
    id: 'market_requests', state: 'warn', summary,
    nextCommand: doctorContinuation(options, ['ae', 'request', 'list']),
  }
}

export type BalanceAmount = Readonly<{ currency: string; units: string; exponent: number }>

export type BalanceDoctorResult = Readonly<{
  check: DoctorCheckDraft
  balance?: BalanceAmount
}>

export async function checkBalance(
  options: CliOptions,
  headers: Readonly<Record<string, string>>,
): Promise<BalanceDoctorResult> {
  const { baseUrl } = options
  try {
    const outcome = await callJson(baseUrl, AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.path, {
      method: AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.method,
      headers,
      body: JSON.stringify({ currency: 'AUD' }),
    })
    const parsed = agentAccountBalanceAction.outputSchema.safeParse(outcome.body)
    if (!outcome.ok || !parsed.success || parsed.data.kind !== 'available') {
      return { check: { id: 'balance', state: 'fail', summary: 'Buyer balance is not available.', nextCommand: doctorContinuation(options, ['ae', 'account', 'balance']) } }
    }
    if (parsed.data.accountState !== 'active') {
      return { check: { id: 'balance', state: 'fail', summary: 'Buyer account is locked.' } }
    }
    if (parsed.data.balance.units === '0') {
      const nextCommand = cliContinuation(options, ['ae', 'fund'])
      return { check: { id: 'balance', state: 'warn', summary: 'Buyer balance is empty.', ...(nextCommand === undefined ? {} : { nextCommand }) } }
    }
    return {
      check: { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
      balance: parsed.data.balance,
    }
  } catch {
    return { check: { id: 'balance', state: 'fail', summary: 'Buyer balance could not be read.', nextCommand: doctorContinuation(options, ['ae', 'account', 'balance']) } }
  }
}

export function checkFunding(options: CliOptions, balance: BalanceDoctorResult): DoctorCheckDraft {
  const loopback = isLoopbackCliBaseUrl(options.baseUrl)
  if (!stripeTestModeConfigured()) {
    return {
      id: 'funding', state: 'skipped',
      summary: 'Local Stripe test mode is not configured; remote funding readiness cannot be inferred from this CLI environment.',
    }
  }
  if (balance.check.state === 'pass' && balance.balance !== undefined) {
    const { units, exponent, currency } = balance.balance
    return {
      id: 'funding', state: 'pass',
      summary: `Account funding is available; buyer balance is ${units} × 10^-${exponent} ${currency}.`,
    }
  }
  if (balance.check.state === 'warn') {
    const origin = new URL(options.baseUrl).origin
    const nextCommand = cliContinuation(options, ['ae', 'fund'])
    return {
      id: 'funding', state: 'warn',
      summary: loopback
        ? `Buyer balance is empty; fund the Account as the owner at ${origin}/owner/credit (Stripe test mode).`
        : 'Buyer balance is empty; fund the Account (Stripe test mode).',
      ...(nextCommand === undefined ? {} : { nextCommand }),
    }
  }
  return {
    id: 'funding', state: 'fail',
    summary: 'Account funding could not be verified because the buyer balance could not be read.',
    nextCommand: doctorContinuation(options, ['ae', 'account', 'balance']),
  }
}

export async function checkCall(
  options: CliOptions,
  headers: Readonly<Record<string, string>>,
): Promise<CallDoctorResult> {
  const { baseUrl } = options
  try {
    const path = `${CALL_ROUTE_CONTRACT.list.path}?limit=100`
    const outcome = await callJson(baseUrl, path, {
      method: CALL_ROUTE_CONTRACT.list.method,
      headers,
    })
    const parsed = callListResultSchema.safeParse(outcome.body)
    if (!outcome.ok || !parsed.success) {
      return {
        check: { id: 'call', state: 'fail', summary: 'Call recovery state is unavailable.', nextCommand: doctorContinuation(options, ['ae', 'history']) },
      }
    }
    const attention = parsed.data.items.find((item) => item.state === 'reconciliation_required' || item.state === 'pending')
    if (attention === undefined) {
      const recentCompletedToolRef = parsed.data.items.find((item) => item.state === 'completed')?.toolRef
      return {
        check: { id: 'call', state: 'pass', summary: 'No pending or reconciliation-required Call needs attention.' },
        ...(recentCompletedToolRef === undefined ? {} : { recentCompletedToolRef }),
      }
    }
    const callRef = statusRefSchema.safeParse({ kind: 'call', ref: attention.callRef })
    const nextCommand = callRef.success && callRef.data.kind === 'call'
      ? attention.state === 'reconciliation_required'
        ? journeyNextCommand({ action: 'call.status', args: { callRef: callRef.data.ref }, authority: 'same_principal' } satisfies JourneyNext, options)
        : cliContinuation(options, ['ae', 'wait', callRef.data.ref])
      : undefined
    return {
      check: {
        id: 'call', state: 'warn',
        summary: attention.state === 'reconciliation_required'
          ? 'A reconciliation-required Call needs attention.'
          : 'A nonterminal Call is still pending.',
        ...(nextCommand === undefined ? {} : { nextCommand }),
      },
    }
  } catch {
    return {
      check: { id: 'call', state: 'fail', summary: 'Call recovery state could not be read.', nextCommand: doctorContinuation(options, ['ae', 'history']) },
    }
  }
}

export async function checkRepeatUse(options: CliOptions, toolRef: string): Promise<DoctorCheckDraft | undefined> {
  const { baseUrl } = options
  try {
    const outcome = await callJson(baseUrl, TOOL_MARKET_DESCRIBE_PATH, {
      method: 'POST',
      body: JSON.stringify({ toolRef }),
    })
    const parsed = toolChoiceDescribeOutputSchema.safeParse(outcome.body)
    if (!outcome.ok || !parsed.success || parsed.data.kind !== 'found') return undefined
    const nextCommand = journeyNextCommand({ action: 'registry.tools.describe', args: { toolRef: parsed.data.tool.toolRef }, authority: 'public' }, options)
    return {
      id: 'repeat_use', state: 'pass',
      summary: 'A previously successful Tool is still in the current catalog.',
      ...(nextCommand === undefined ? {} : { nextCommand }),
    }
  } catch {
    return undefined
  }
}

