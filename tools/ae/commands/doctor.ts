import { SiteDiscoveryManifestSchemaVersion } from '@/modules/discovery/public'
import { isRecord } from '@/modules/common/is-record'
import {
  AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS,
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
  agentAccountBalanceAction,
  agentAccountSelfResultSchema,
} from '@/modules/agent-access/account.actions'
import { MARKET_OPERATIONS_INVOKE_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import {
  operationListResultSchema,
} from '@/modules/capability-execution/operation-history.actions'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  SUPPLY_ACTION_ROUTE_CONTRACTS,
  supplyConnectionListAction,
  supplyStatusAction,
} from '@/modules/capability-supply/supply-actions'

import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { callJson, line, printJson } from '../lib/output'
import { usageFailure } from '../lib/help'

export type DoctorResult = Readonly<{
  kind: 'ready' | 'degraded'
  checks: readonly DoctorCheck[]
}>

type DoctorCheck = Readonly<{
  id: string
  state: 'pass' | 'warn' | 'fail'
  summary: string
  nextCommand?: string
}>

export async function runDoctorCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const businessId = args[0]?.trim()
  if (args.length > 1 || (businessId !== undefined && (businessId.length === 0 || options.supplier !== true))) {
    throw usageFailure('doctor', 'doctor-usage')
  }
  const checks: DoctorCheck[] = [{
    id: 'origin',
    state: 'pass',
    summary: `Configured origin is ${new URL(options.baseUrl).origin}.`,
  }]

  const server = await checkServer(options.baseUrl)
  checks.push(server)
  if (server.state === 'fail') {
    checks.push(
      { id: 'buyer', state: 'warn', summary: 'Buyer credential was not sent because server identity is unavailable.' },
      { id: 'balance', state: 'warn', summary: 'Balance was not checked because server identity is unavailable.' },
      { id: 'invocation', state: 'warn', summary: 'Invocation recovery was not checked because server identity is unavailable.' },
      ...(options.supplier === true
        ? [
            { id: 'supplier', state: 'warn' as const, summary: 'Supplier credential was not sent because server identity is unavailable.' },
            { id: 'supplier.readiness', state: 'warn' as const, summary: 'Supplier readiness was not checked because server identity is unavailable.' },
          ]
        : []),
    )
    renderDoctor({ kind: 'degraded', checks }, options)
    return
  }
  const buyer = resolveAgentAccessCredential(options.baseUrl)
  if (buyer === undefined) {
    checks.push(
      {
        id: 'buyer', state: 'warn',
        summary: 'No buyer credential is selected for this origin; anonymous search and inspection remain available.',
        nextCommand: 'ae account connections',
      },
      {
        id: 'balance', state: 'warn',
        summary: 'Balance is unavailable until a buyer credential is connected.',
      },
      {
        id: 'invocation', state: 'warn',
        summary: 'Invocation recovery is unavailable until a buyer credential is connected.',
      },
    )
  } else {
    checks.push(...await checkBuyer(options.baseUrl, buyer))
  }
  if (options.supplier === true) {
    checks.push(...await checkSupplier(options.baseUrl, businessId))
  }

  renderDoctor({
    kind: checks.every((check) => check.state === 'pass') ? 'ready' : 'degraded',
    checks,
  }, options)
}

async function checkSupplier(baseUrl: string, businessId: string | undefined): Promise<readonly DoctorCheck[]> {
  const credential = resolveAgentAccessCredential(baseUrl, MARKET_SUPPLY_MANAGE_SCOPE)
  if (credential === undefined) {
    return [
      {
        id: 'supplier', state: 'warn',
        summary: 'No supplier credential is configured for this origin.',
        nextCommand: 'ae account connections',
      },
      { id: 'supplier.readiness', state: 'warn', summary: 'Supplier readiness is unavailable until supplier access is connected.' },
    ]
  }
  const originFailure = credentialOriginFailure(baseUrl, credential.origin, 'supplier')
  if (originFailure !== undefined) {
    return [originFailure, { id: 'supplier.readiness', state: 'warn', summary: 'Supplier readiness was not checked because origin binding failed.' }]
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
        ...credentialRefusedChecks('supplier'),
        { id: 'supplier.readiness', state: 'warn', summary: 'Supplier readiness was not checked because authentication failed.' },
      ]
    }
    if (!account.data.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)) {
      return [
        {
          id: 'supplier', state: 'fail',
          summary: `Supplier credential is missing ${MARKET_SUPPLY_MANAGE_SCOPE}.`,
          nextCommand: 'ae connect --supplier',
        },
        { id: 'supplier.readiness', state: 'warn', summary: 'Supplier readiness was not checked because supplier scope is missing.' },
      ]
    }
    const supplier: DoctorCheck = {
      id: 'supplier', state: 'pass',
      summary: `Supplier credential is origin-bound, authenticated, and has ${MARKET_SUPPLY_MANAGE_SCOPE}.`,
    }
    if (businessId === undefined) {
      return [supplier, {
        id: 'supplier.readiness', state: 'warn',
        summary: 'Supplier access is ready; add a business ID to check Operation and provider readiness.',
      }]
    }
    return [supplier, await checkSupplierReadiness(baseUrl, headers, businessId)]
  } catch {
    return [
      ...credentialRefusedChecks('supplier'),
      { id: 'supplier.readiness', state: 'warn', summary: 'Supplier readiness could not be read.' },
    ]
  }
}

async function checkSupplierReadiness(
  baseUrl: string,
  headers: Readonly<Record<string, string>>,
  businessId: string,
): Promise<DoctorCheck> {
  try {
    const [statusOutcome, connectionsOutcome] = await Promise.all([
      callJson(baseUrl, SUPPLY_ACTION_ROUTE_CONTRACTS.status.path, {
        method: SUPPLY_ACTION_ROUTE_CONTRACTS.status.method,
        headers,
        body: JSON.stringify({ businessId }),
      }),
      callJson(baseUrl, SUPPLY_ACTION_ROUTE_CONTRACTS.connectionList.path, {
        method: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionList.method,
        headers,
        body: JSON.stringify({ businessId, limit: 100 }),
      }),
    ])
    const status = supplyStatusAction.outputSchema.safeParse(statusOutcome.body)
    const connections = supplyConnectionListAction.outputSchema.safeParse(connectionsOutcome.body)
    if (!statusOutcome.ok || !connectionsOutcome.ok || !status.success || !connections.success
      || status.data.kind !== 'available' || connections.data.kind !== 'available') {
      return {
        id: 'supplier.readiness', state: 'fail',
        summary: 'Supplier Operation or provider readiness is unavailable.',
        nextCommand: `ae supply status ${businessId}`,
      }
    }
    const operationCount = status.data.operations.length
    const liveCount = status.data.operations.filter((operation) => operation.live.available).length
    const connectionCount = connections.data.connections.length
    const readyConnectionCount = connections.data.connections.filter((connection) => connection.available).length
    const unreadyCount = operationCount - liveCount
    const attentionCount = connectionCount - readyConnectionCount
    const summary = `Supplier business has ${operationCount} Operations (${liveCount} live, ${unreadyCount} unready) and ${connectionCount} provider connections (${readyConnectionCount} ready, ${attentionCount} needing attention).`
    if (unreadyCount === 0 && attentionCount === 0) {
      return { id: 'supplier.readiness', state: 'pass', summary }
    }
    return {
      id: 'supplier.readiness', state: 'warn', summary,
      nextCommand: `ae supply status ${businessId}`,
    }
  } catch {
    return {
      id: 'supplier.readiness', state: 'fail',
      summary: 'Supplier Operation or provider readiness could not be read.',
      nextCommand: `ae supply status ${businessId}`,
    }
  }
}

async function checkBuyer(
  baseUrl: string,
  credential: Readonly<{ accessToken: string; origin: string }>,
): Promise<readonly DoctorCheck[]> {
  const originFailure = credentialOriginFailure(baseUrl, credential.origin, 'buyer')
  if (originFailure !== undefined) {
    return [
      originFailure,
      { id: 'balance', state: 'warn', summary: 'Balance was not checked because buyer origin binding failed.' },
      { id: 'invocation', state: 'warn', summary: 'Invocation recovery was not checked because buyer origin binding failed.' },
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
      return credentialRefusedChecks('buyer')
    }
    if (!account.data.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)) {
      return [
        {
          id: 'buyer', state: 'fail',
          summary: `Buyer credential is missing ${MARKET_OPERATIONS_INVOKE_SCOPE}.`,
          nextCommand: 'ae connect',
        },
        { id: 'balance', state: 'warn', summary: 'Balance was not checked because buyer scope is missing.' },
        { id: 'invocation', state: 'warn', summary: 'Invocation recovery was not checked because buyer scope is missing.' },
      ]
    }
    return [
      {
        id: 'buyer', state: 'pass',
        summary: `Buyer credential is origin-bound, authenticated, and has ${MARKET_OPERATIONS_INVOKE_SCOPE}.`,
      },
      await checkBalance(baseUrl, headers),
      await checkInvocation(baseUrl, headers),
    ]
  } catch {
    return credentialRefusedChecks('buyer')
  }
}

function credentialRefusedChecks(profile: 'buyer' | 'supplier'): readonly DoctorCheck[] {
  const connect = profile === 'buyer' ? 'ae connect' : 'ae connect --supplier'
  if (profile === 'supplier') {
    return [{
      id: 'supplier', state: 'fail',
      summary: 'Supplier credential could not be authenticated for this origin.',
      nextCommand: connect,
    }]
  }
  return [
    {
      id: 'buyer', state: 'fail',
      summary: 'Buyer credential could not be authenticated for this origin.',
      nextCommand: connect,
    },
    { id: 'balance', state: 'warn', summary: 'Balance was not checked because buyer authentication failed.' },
    { id: 'invocation', state: 'warn', summary: 'Invocation recovery was not checked because buyer authentication failed.' },
  ]
}

function credentialOriginFailure(
  baseUrl: string,
  credentialOrigin: string,
  profile: 'buyer' | 'supplier',
): DoctorCheck | undefined {
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
  return {
    id: profile, state: 'fail',
    summary: `${profile === 'buyer' ? 'Buyer' : 'Supplier'} credential is not safely bound to the configured origin.`,
    nextCommand: 'ae account connections',
  }
}

async function checkBalance(
  baseUrl: string,
  headers: Readonly<Record<string, string>>,
): Promise<DoctorCheck> {
  try {
    const outcome = await callJson(baseUrl, AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.path, {
      method: AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.method,
      headers,
      body: JSON.stringify({ currency: 'USD' }),
    })
    const parsed = agentAccountBalanceAction.outputSchema.safeParse(outcome.body)
    if (!outcome.ok || !parsed.success || parsed.data.kind !== 'available') {
      return { id: 'balance', state: 'fail', summary: 'Buyer balance is not available.', nextCommand: 'ae account balance' }
    }
    if (parsed.data.accountState !== 'active') {
      return { id: 'balance', state: 'fail', summary: 'Buyer account is locked.' }
    }
    if (parsed.data.balance.units === '0') {
      return { id: 'balance', state: 'warn', summary: 'Buyer balance is empty.', nextCommand: 'ae fund' }
    }
    return { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' }
  } catch {
    return { id: 'balance', state: 'fail', summary: 'Buyer balance could not be read.', nextCommand: 'ae account balance' }
  }
}

async function checkInvocation(
  baseUrl: string,
  headers: Readonly<Record<string, string>>,
): Promise<DoctorCheck> {
  try {
    const path = `${OPERATION_INVOKE_ROUTE_CONTRACT.list.path}?limit=100`
    const outcome = await callJson(baseUrl, path, {
      method: OPERATION_INVOKE_ROUTE_CONTRACT.list.method,
      headers,
    })
    const parsed = operationListResultSchema.safeParse(outcome.body)
    if (!outcome.ok || !parsed.success) {
      return { id: 'invocation', state: 'fail', summary: 'Invocation recovery state is unavailable.', nextCommand: 'ae history' }
    }
    const attention = parsed.data.items.find((item) => item.state === 'reconciliation_required' || item.state === 'pending')
    if (attention === undefined) {
      return { id: 'invocation', state: 'pass', summary: 'No pending or reconciliation-required invocation needs attention.' }
    }
    return {
      id: 'invocation', state: 'warn',
      summary: attention.state === 'reconciliation_required'
        ? 'A reconciliation-required invocation needs attention.'
        : 'A nonterminal invocation is still pending.',
      nextCommand: attention.state === 'reconciliation_required'
        ? `ae status ${attention.invocationRef}`
        : `ae wait ${attention.invocationRef}`,
    }
  } catch {
    return { id: 'invocation', state: 'fail', summary: 'Invocation recovery state could not be read.', nextCommand: 'ae history' }
  }
}

async function checkServer(baseUrl: string): Promise<DoctorCheck> {
  try {
    const outcome = await callJson(baseUrl, '/.well-known/ucp')
    if (!outcome.ok || !isRecord(outcome.body)) {
      return serverFailure(baseUrl, 'AE server did not return its discovery manifest.')
    }
    if (outcome.body.schemaVersion !== SiteDiscoveryManifestSchemaVersion) {
      return serverFailure(baseUrl, 'AE server manifest is not compatible with this CLI.')
    }
    if (outcome.body.origin !== new URL(baseUrl).origin) {
      return serverFailure(baseUrl, 'AE server manifest origin does not match the configured origin.')
    }
    return {
      id: 'server', state: 'pass',
      summary: `AE server is reachable and manifest ${SiteDiscoveryManifestSchemaVersion} is compatible.`,
    }
  } catch {
    return serverFailure(baseUrl, 'AE server is not reachable.')
  }
}

function serverFailure(baseUrl: string, summary: string): DoctorCheck {
  const origin = new URL(baseUrl)
  const loopback = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1' || origin.hostname === '::1'
  return {
    id: 'server', state: 'fail', summary,
    nextCommand: loopback ? 'npm run dev' : 'ae doctor',
  }
}

function renderDoctor(result: DoctorResult, options: CliOptions): void {
  if (options.json) {
    printJson(result)
    return
  }
  line(`AE doctor: ${result.kind}`)
  for (const check of result.checks) {
    const marker = check.state === 'pass' ? '✓' : check.state === 'warn' ? '!' : '✗'
    line(`${marker} ${check.summary}`)
  }
  const nextCommand = result.checks.find((check) => check.state === 'fail' && check.nextCommand !== undefined)?.nextCommand
    ?? result.checks.find((check) => check.state === 'warn' && check.nextCommand !== undefined)?.nextCommand
  if (nextCommand !== undefined) line(`Next: ${nextCommand}`)
}
