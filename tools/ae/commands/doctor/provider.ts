import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT, agentAccountSelfResultSchema } from '@/modules/agent-access/account.actions'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { SUPPLY_ACTION_ROUTE_CONTRACTS, supplyConnectionListAction, supplyToolsListAction } from '@/modules/capability-supply/supply-actions'
import type { CliOptions } from '../../lib/args'
import { callJson } from '../../lib/output'
import { resolveAgentAccessCredential } from '../../lib/config'
import { connectCommand, credentialOriginFailure, credentialRefusedChecks } from './credential'
import { doctorContinuation, type DoctorCheckDraft } from './shared'

export async function checkProvider(options: CliOptions, businessId: string | undefined): Promise<readonly DoctorCheckDraft[]> {
  const { baseUrl } = options
  const connect = connectCommand(options, 'provider')
  const credential = resolveAgentAccessCredential(baseUrl, MARKET_SUPPLY_MANAGE_SCOPE)
  if (credential === undefined) {
    return [
      {
        id: 'provider', state: 'warn',
        summary: 'No provider credential is configured for this origin.',
        ...(connect === undefined ? {} : { nextCommand: connect }),
      },
      { id: 'provider.readiness', state: 'warn', summary: 'Provider readiness is unavailable until provider access is connected.' },
    ]
  }
  const originFailure = credentialOriginFailure(options, credential.origin, 'provider')
  if (originFailure !== undefined) {
    return [originFailure, { id: 'provider.readiness', state: 'warn', summary: 'Provider readiness was not checked because origin binding failed.' }]
  }
  const headers = { Authorization: `Bearer ${credential.accessToken}` }
  try {
    const accountOutcome = await callJson(baseUrl, AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.path, {
      method: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.method,
      headers,
    })
    const account = agentAccountSelfResultSchema.safeParse(accountOutcome.body)
    if (!accountOutcome.ok || !account.success) {
      return [
        ...credentialRefusedChecks(options, 'provider'),
        { id: 'provider.readiness', state: 'warn', summary: 'Provider readiness was not checked because authentication failed.' },
      ]
    }
    if (!account.data.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)) {
      return [
        {
          id: 'provider', state: 'fail',
          summary: `Provider credential is missing ${MARKET_SUPPLY_MANAGE_SCOPE}.`,
          ...(connect === undefined ? {} : { nextCommand: connect }),
        },
        { id: 'provider.readiness', state: 'warn', summary: 'Provider readiness was not checked because provider scope is missing.' },
      ]
    }
    const provider: DoctorCheckDraft = {
      id: 'provider', state: 'pass',
      summary: `Provider credential is origin-bound, authenticated, and has ${MARKET_SUPPLY_MANAGE_SCOPE}.`,
    }
    if (businessId === undefined) {
      return [provider, {
        id: 'provider.readiness', state: 'warn',
        summary: 'Provider access is ready; add a business ID to check Tool and provider readiness.',
      }]
    }
    return [provider, await checkProviderReadiness(options, headers, businessId)]
  } catch {
    return [
      ...credentialRefusedChecks(options, 'provider'),
      { id: 'provider.readiness', state: 'warn', summary: 'Provider readiness could not be read.' },
    ]
  }
}

async function checkProviderReadiness(
  options: CliOptions,
  headers: Readonly<Record<string, string>>,
  businessId: string,
): Promise<DoctorCheckDraft> {
  const { baseUrl } = options
  try {
    const [statusOutcome, connectionsOutcome] = await Promise.all([
      callJson(baseUrl, SUPPLY_ACTION_ROUTE_CONTRACTS.toolsList.path, {
        method: SUPPLY_ACTION_ROUTE_CONTRACTS.toolsList.method,
        headers,
        body: JSON.stringify({ businessRef: businessId, limit: 100 }),
      }),
      callJson(baseUrl, SUPPLY_ACTION_ROUTE_CONTRACTS.connectionList.path, {
        method: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionList.method,
        headers,
        body: JSON.stringify({ businessId, limit: 100 }),
      }),
    ])
    const status = supplyToolsListAction.outputSchema.safeParse(statusOutcome.body)
    const connections = supplyConnectionListAction.outputSchema.safeParse(connectionsOutcome.body)
    if (!statusOutcome.ok || !connectionsOutcome.ok || !status.success || !connections.success
      || status.data.kind !== 'available' || connections.data.kind !== 'available') {
      return {
        id: 'provider.readiness', state: 'fail',
        summary: 'Provider Tool or provider readiness is unavailable.',
        nextCommand: doctorContinuation(options, ['ae', 'supply', 'tools', businessId]),
      }
    }
    const toolCount = status.data.page.length
    const liveCount = status.data.page.filter((tool) => tool.routeability.available).length
    const connectionCount = connections.data.connections.length
    const readyConnectionCount = connections.data.connections.filter((connection) => connection.available).length
    const unreadyCount = toolCount - liveCount
    const attentionCount = connectionCount - readyConnectionCount
    const summary = `Provider business has ${toolCount} Tools (${liveCount} live, ${unreadyCount} unready) and ${connectionCount} provider connections (${readyConnectionCount} ready, ${attentionCount} needing attention).`
    if (unreadyCount === 0 && attentionCount === 0) {
      return { id: 'provider.readiness', state: 'pass', summary }
    }
    return {
      id: 'provider.readiness', state: 'warn', summary,
      nextCommand: doctorContinuation(options, ['ae', 'supply', 'tools', businessId]),
    }
  } catch {
    return {
      id: 'provider.readiness', state: 'fail',
      summary: 'Provider Tool or provider readiness could not be read.',
      nextCommand: doctorContinuation(options, ['ae', 'supply', 'tools', businessId]),
    }
  }
}

