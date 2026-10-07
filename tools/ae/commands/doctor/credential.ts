import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT, agentAccountSelfResultSchema } from '@/modules/agent-access/account.actions'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import type { CliOptions } from '../../lib/args'
import { isLoopbackCliBaseUrl } from '../../lib/args'
import { continuationCommand } from '../../lib/continuation-command'
import { callJson } from '../../lib/output'
import { checkBalance, checkCall, checkFunding, checkMarketRequests, checkRepeatUse } from './activity'
import { checkQuote } from './quote'
import { doctorContinuation, type DoctorCheckDraft } from './shared'

export async function checkBuyer(
  options: CliOptions,
  credential: Readonly<{ accessToken: string; origin: string }>,
): Promise<readonly DoctorCheckDraft[]> {
  const { baseUrl } = options
  const originFailure = credentialOriginFailure(options, credential.origin, 'buyer')
  if (originFailure !== undefined) {
    return [
      originFailure,
      { id: 'balance', state: 'warn', summary: 'Balance was not checked because buyer origin binding failed.' },
      { id: 'call', state: 'warn', summary: 'Call recovery was not checked because buyer origin binding failed.' },
    ]
  }
  const headers = { Authorization: `Bearer ${credential.accessToken}` }
  try {
    const accountOutcome = await callJson(baseUrl, AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.path, {
      method: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.method,
      headers,
    })
    const account = agentAccountSelfResultSchema.safeParse(accountOutcome.body)
    if (!accountOutcome.ok || !account.success) {
      return credentialRefusedChecks(options, 'buyer')
    }
    if (!account.data.scopes.includes(MARKET_TOOLS_CALL_SCOPE)) {
      const nextCommand = connectCommand(options, 'buyer')
      return [
        {
          id: 'buyer', state: 'fail',
          summary: `Buyer credential is missing ${MARKET_TOOLS_CALL_SCOPE}.`,
          ...(nextCommand === undefined ? {} : { nextCommand }),
        },
        { id: 'balance', state: 'warn', summary: 'Balance was not checked because buyer scope is missing.' },
        { id: 'call', state: 'warn', summary: 'Call recovery was not checked because buyer scope is missing.' },
      ]
    }
    const quote = await checkQuote(options, headers)
    const balance = await checkBalance(options, headers)
    const funding = checkFunding(options, balance)
    const call = await checkCall(options, headers)
    const marketRequests = await checkMarketRequests(options, headers)
    const repeatUse = call.recentCompletedToolRef === undefined
      ? undefined
      : await checkRepeatUse(options, call.recentCompletedToolRef)
    return [
      {
        id: 'buyer', state: 'pass',
        summary: `Buyer credential is origin-bound, authenticated, and has ${MARKET_TOOLS_CALL_SCOPE}.`,
      },
      quote,
      balance.check,
      funding,
      call.check,
      marketRequests,
      ...(repeatUse === undefined ? [] : [repeatUse]),
    ]
  } catch {
    return credentialRefusedChecks(options, 'buyer')
  }
}
export function credentialRefusedChecks(options: CliOptions, profile: 'buyer' | 'provider'): readonly DoctorCheckDraft[] {
  const connect = connectCommand(options, profile)
  if (profile === 'provider') {
    return [{
      id: 'provider', state: 'fail',
      summary: 'Provider credential could not be authenticated for this origin.',
      ...(connect === undefined ? {} : { nextCommand: connect }),
    }]
  }
  return [
    {
      id: 'buyer', state: 'fail',
      summary: 'Buyer credential could not be authenticated for this origin.',
      ...(connect === undefined ? {} : { nextCommand: connect }),
    },
    { id: 'balance', state: 'warn', summary: 'Balance was not checked because buyer authentication failed.' },
    { id: 'call', state: 'warn', summary: 'Call recovery was not checked because buyer authentication failed.' },
  ]
}

export function credentialOriginFailure(
  options: CliOptions,
  credentialOrigin: string,
  profile: 'buyer' | 'provider',
): DoctorCheckDraft | undefined {
  const { baseUrl } = options
  try {
    const selected = new URL(baseUrl)
    const bound = new URL(credentialOrigin)
    const exactOrigin = bound.origin === selected.origin
      && bound.username === '' && bound.password === ''
      && (bound.pathname === '' || bound.pathname === '/')
      && bound.search === '' && bound.hash === ''
    const loopback = selected.hostname === 'localhost' || selected.hostname === '127.0.0.1' || selected.hostname === '::1'
    const secure = selected.protocol === 'https:' || (selected.protocol === 'http:' && loopback)
    if (exactOrigin && secure) return undefined
  } catch {
    // Project the failure below without echoing the supplied origin.
  }
  const nextCommand = connectCommand(options, profile)
  return {
    id: profile, state: 'fail',
    summary: `${profile === 'buyer' ? 'Buyer' : 'Provider'} credential is not safely bound to the configured origin.`,
    ...(nextCommand === undefined ? {} : { nextCommand }),
  }
}

export function connectCommand(options: CliOptions, profile: 'buyer' | 'provider'): string | undefined {
  if (profile === 'buyer') {
    return doctorContinuation(options, ['ae', 'connect'])
  }
  // The generic journey connect action cannot express provider scope.
  return doctorContinuation(options, ['ae', 'connect', '--provider'])
}

/**
 * A loopback origin can approve its own device code through the local Clerk
 * bypass, so the buyer-missing and quote-unconnected next steps route through
 * that wrapper instead of the browser-driven `ae connect`.
 */
export function connectNextCommand(options: CliOptions): string | undefined {
  return isLoopbackCliBaseUrl(options.baseUrl)
    ? continuationCommand(['npm', 'run', 'connect:local', '--', '--base-url', options.baseUrl])
    : connectCommand(options, 'buyer')
}

