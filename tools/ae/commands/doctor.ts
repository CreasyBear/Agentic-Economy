import { SiteDiscoveryManifestSchemaVersion } from '@/modules/discovery/public'
import { isRecord } from '@/modules/common/is-record'
import { listMcpActions, mcpToolName } from '@/modules/actions'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
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
import { operationChoiceDescribeOutputSchema } from '@/modules/registry/operation-choice-contracts'
import {
  MARKET_REQUEST_ROUTE_CONTRACTS,
  marketRequestListAction,
  marketRequestStatusAction,
} from '@/modules/market-demand/market-demand.actions'
import { OPERATION_MARKET_DESCRIBE_PATH } from '@/modules/registry/operation-entry'
import {
  SUPPLY_ACTION_ROUTE_CONTRACTS,
  supplyConnectionListAction,
  supplyStatusAction,
} from '@/modules/capability-supply/supply-actions'

import {
  HOSTED_DEFAULT_BASE_URL,
  isLoopbackCliBaseUrl,
  safeOriginForDiagnostics,
  type CliOptions,
} from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { continuationCommand } from '../lib/continuation-command'
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

type InvocationDoctorResult = Readonly<{
  check: DoctorCheck
  recentCompletedOperationRef?: string
}>

const MARKET_REQUEST_REENTRY_LIMIT = 5
const MCP_CHECK_TIMEOUT_MS = 5_000

export async function runDoctorCommand(args: readonly string[], options: CliOptions): Promise<number> {
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
      { id: 'mcp', state: 'warn', summary: 'MCP initialization was not checked because server identity is unavailable.' },
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
    return options.json ? 0 : 1
  }
  checks.push(await checkMcp(options.baseUrl))
  checks.push(...await checkDeployment(options.baseUrl))
  const buyer = resolveAgentAccessCredential(options.baseUrl)
  if (buyer === undefined) {
    checks.push(
      {
        id: 'buyer', state: 'warn',
        summary: 'No buyer credential is selected for this origin; anonymous search and inspection remain available.',
        nextCommand: connectCommand(options.baseUrl, 'buyer'),
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

  const result: DoctorResult = {
    kind: checks.every((check) => check.state === 'pass') ? 'ready' : 'degraded',
    checks,
  }
  renderDoctor(result, options)
  return !options.json && result.kind === 'degraded' ? 1 : 0
}

async function checkSupplier(baseUrl: string, businessId: string | undefined): Promise<readonly DoctorCheck[]> {
  const credential = resolveAgentAccessCredential(baseUrl, MARKET_SUPPLY_MANAGE_SCOPE)
  if (credential === undefined) {
    return [
      {
        id: 'supplier', state: 'warn',
        summary: 'No supplier credential is configured for this origin.',
        nextCommand: connectCommand(baseUrl, 'supplier'),
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
        ...credentialRefusedChecks(baseUrl, 'supplier'),
        { id: 'supplier.readiness', state: 'warn', summary: 'Supplier readiness was not checked because authentication failed.' },
      ]
    }
    if (!account.data.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)) {
      return [
        {
          id: 'supplier', state: 'fail',
          summary: `Supplier credential is missing ${MARKET_SUPPLY_MANAGE_SCOPE}.`,
          nextCommand: connectCommand(baseUrl, 'supplier'),
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
      ...credentialRefusedChecks(baseUrl, 'supplier'),
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
      return credentialRefusedChecks(baseUrl, 'buyer')
    }
    if (!account.data.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)) {
      return [
        {
          id: 'buyer', state: 'fail',
          summary: `Buyer credential is missing ${MARKET_OPERATIONS_INVOKE_SCOPE}.`,
          nextCommand: connectCommand(baseUrl, 'buyer'),
        },
        { id: 'balance', state: 'warn', summary: 'Balance was not checked because buyer scope is missing.' },
        { id: 'invocation', state: 'warn', summary: 'Invocation recovery was not checked because buyer scope is missing.' },
      ]
    }
    const balance = await checkBalance(baseUrl, headers)
    const invocation = await checkInvocation(baseUrl, headers)
    const marketRequests = await checkMarketRequests(baseUrl, headers)
    const repeatUse = invocation.recentCompletedOperationRef === undefined
      ? undefined
      : await checkRepeatUse(baseUrl, invocation.recentCompletedOperationRef)
    return [
      {
        id: 'buyer', state: 'pass',
        summary: `Buyer credential is origin-bound, authenticated, and has ${MARKET_OPERATIONS_INVOKE_SCOPE}.`,
      },
      balance,
      invocation.check,
      marketRequests,
      ...(repeatUse === undefined ? [] : [repeatUse]),
    ]
  } catch {
    return credentialRefusedChecks(baseUrl, 'buyer')
  }
}

async function checkMarketRequests(
  baseUrl: string,
  headers: Readonly<Record<string, string>>,
): Promise<DoctorCheck> {
  try {
    const listOutcome = await callJson(baseUrl, MARKET_REQUEST_ROUTE_CONTRACTS.list.path, {
      method: MARKET_REQUEST_ROUTE_CONTRACTS.list.method,
      headers,
      body: JSON.stringify({ limit: MARKET_REQUEST_REENTRY_LIMIT }),
    })
    const list = marketRequestListAction.outputSchema.safeParse(listOutcome.body)
    if (!listOutcome.ok || !list.success || list.data.kind !== 'available') {
      return marketRequestUnavailable('Private market request matches are unavailable.')
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
    const firstOperation = matched[0]?.operations[0]
    if (firstOperation !== undefined) {
      const checked = list.data.items.length
      return {
        id: 'market_requests', state: 'pass',
        summary: `${matched.length} of ${checked} recent private market ${checked === 1 ? 'request now has' : 'requests now have'} matching Operations.`,
        nextCommand: continuationCommand(['ae', 'inspect', firstOperation.operationRef]),
      }
    }
    if (statuses.some((status) => status === undefined || status.kind === 'error' || status.kind === 'not_found')) {
      return marketRequestUnavailable('Some recent private market requests could not be rechecked.')
    }
    const checked = list.data.items.length
    return {
      id: 'market_requests', state: 'pass',
      summary: `No current Operation matches the ${checked} most recent private market ${checked === 1 ? 'request' : 'requests'} yet.`,
    }
  } catch {
    return marketRequestUnavailable('Private market request matches could not be rechecked.')
  }
}

function marketRequestUnavailable(summary: string): DoctorCheck {
  return {
    id: 'market_requests', state: 'warn', summary,
    nextCommand: 'ae request list',
  }
}

function credentialRefusedChecks(baseUrl: string, profile: 'buyer' | 'supplier'): readonly DoctorCheck[] {
  const connect = connectCommand(baseUrl, profile)
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
    nextCommand: connectCommand(baseUrl, profile),
  }
}

function connectCommand(baseUrl: string, profile: 'buyer' | 'supplier'): string {
  return continuationCommand([
    'ae',
    'connect',
    ...(profile === 'supplier' ? ['--supplier'] : []),
    '--base-url',
    new URL(baseUrl).origin,
  ])
}

async function checkBalance(
  baseUrl: string,
  headers: Readonly<Record<string, string>>,
): Promise<DoctorCheck> {
  try {
    const outcome = await callJson(baseUrl, AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.path, {
      method: AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.method,
      headers,
      body: JSON.stringify({ currency: 'AUD' }),
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
): Promise<InvocationDoctorResult> {
  try {
    const path = `${OPERATION_INVOKE_ROUTE_CONTRACT.list.path}?limit=100`
    const outcome = await callJson(baseUrl, path, {
      method: OPERATION_INVOKE_ROUTE_CONTRACT.list.method,
      headers,
    })
    const parsed = operationListResultSchema.safeParse(outcome.body)
    if (!outcome.ok || !parsed.success) {
      return {
        check: { id: 'invocation', state: 'fail', summary: 'Invocation recovery state is unavailable.', nextCommand: 'ae history' },
      }
    }
    const attention = parsed.data.items.find((item) => item.state === 'reconciliation_required' || item.state === 'pending')
    if (attention === undefined) {
      const recentCompletedOperationRef = parsed.data.items.find((item) => item.state === 'completed')?.operationRef
      return {
        check: { id: 'invocation', state: 'pass', summary: 'No pending or reconciliation-required invocation needs attention.' },
        ...(recentCompletedOperationRef === undefined ? {} : { recentCompletedOperationRef }),
      }
    }
    return {
      check: {
        id: 'invocation', state: 'warn',
        summary: attention.state === 'reconciliation_required'
          ? 'A reconciliation-required invocation needs attention.'
          : 'A nonterminal invocation is still pending.',
        nextCommand: attention.state === 'reconciliation_required'
          ? `ae status ${attention.invocationRef}`
          : `ae wait ${attention.invocationRef}`,
      },
    }
  } catch {
    return {
      check: { id: 'invocation', state: 'fail', summary: 'Invocation recovery state could not be read.', nextCommand: 'ae history' },
    }
  }
}

async function checkRepeatUse(baseUrl: string, operationRef: string): Promise<DoctorCheck | undefined> {
  try {
    const outcome = await callJson(baseUrl, OPERATION_MARKET_DESCRIBE_PATH, {
      method: 'POST',
      body: JSON.stringify({ operationRef }),
    })
    const parsed = operationChoiceDescribeOutputSchema.safeParse(outcome.body)
    if (!outcome.ok || !parsed.success || parsed.data.kind !== 'found') return undefined
    return {
      id: 'repeat_use', state: 'pass',
      summary: 'A previously successful Operation is still in the current catalog.',
      nextCommand: continuationCommand(['ae', 'describe', parsed.data.operation.operationRef]),
    }
  } catch {
    return undefined
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

async function checkMcp(baseUrl: string): Promise<DoctorCheck> {
  const expected = listMcpActions()
    .filter((action) => action.readOnly && action.credentialAdmission === undefined)
    .map(mcpToolName)
    .sort()
  const client = new Client({ name: 'ae-doctor', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseUrl), {
    requestInit: { signal: AbortSignal.timeout(MCP_CHECK_TIMEOUT_MS) },
  })
  try {
    // SDK 1.30.0's declarations disagree only on the optional sessionId spelling.
    await client.connect(transport as unknown as Parameters<Client['connect']>[0])
    const actual = (await client.listTools()).tools.map(({ name }) => name).sort()
    if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
      return {
        id: 'mcp', state: 'fail',
        summary: 'MCP initialized, but its public tool set does not match this CLI.',
      }
    }
    return {
      id: 'mcp', state: 'pass',
      summary: `MCP initialization and ${actual.length} public tools passed.`,
    }
  } catch {
    return {
      id: 'mcp', state: 'fail',
      summary: 'MCP initialization or public tool discovery failed.',
    }
  } finally {
    await client.close().catch(() => undefined)
  }
}

async function checkDeployment(baseUrl: string): Promise<readonly DoctorCheck[]> {
  const [readiness, release] = await Promise.all([
    checkOperationalReadiness(baseUrl),
    checkReleaseIdentity(baseUrl),
  ])
  return [readiness, release]
}

async function checkOperationalReadiness(baseUrl: string): Promise<DoctorCheck> {
  try {
    const outcome = await callJson(baseUrl, '/api/ready')
    if (outcome.ok && isRecord(outcome.body) && outcome.body.status === 'ready') {
      return {
        id: 'readiness', state: 'pass',
        summary: 'Server operational readiness passed.',
      }
    }
    const code = readinessFailureCode(outcome.body)
    return {
      id: 'readiness', state: 'fail',
      summary: code === undefined
        ? 'Server is reachable but operational readiness failed. The service operator must restore operational readiness before calls proceed; the caller should not continue or retry.'
        : `Server is reachable but operational readiness failed (${code}). The service operator must restore operational readiness before calls proceed; the caller should not continue or retry.`,
    }
  } catch {
    return {
      id: 'readiness', state: 'fail',
      summary: 'Server manifest was reachable, but operational readiness could not be checked. The service operator must restore the readiness check before calls proceed; the caller should not continue or retry.',
    }
  }
}

function readinessFailureCode(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined
  if (isRecord(body.checks)) {
    for (const check of Object.values(body.checks)) {
      if (isRecord(check) && safeDiagnosticCode(check.code) !== undefined) {
        return safeDiagnosticCode(check.code)
      }
    }
  }
  return safeDiagnosticCode(body.code)
}

function safeDiagnosticCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(value)
    ? value
    : undefined
}

async function checkReleaseIdentity(baseUrl: string): Promise<DoctorCheck> {
  try {
    const outcome = await callJson(baseUrl, '/api/v1/release')
    if (
      outcome.ok
      && isRecord(outcome.body)
      && outcome.body.kind === 'ok'
      && typeof outcome.body.sourceRevision === 'string'
      && /^[a-f0-9]{40}$/u.test(outcome.body.sourceRevision)
    ) {
      return {
        id: 'release', state: 'pass',
        summary: `Release identity is ${outcome.body.sourceRevision}.`,
      }
    }
    const reason = isRecord(outcome.body) ? safeDiagnosticCode(outcome.body.reason) : undefined
    return {
      id: 'release', state: 'fail',
      summary: reason === undefined
        ? 'Release identity is unavailable. The service operator must configure a valid release identity before calls proceed; the caller should not continue or retry.'
        : `Release identity is unavailable (${reason}). The service operator must configure a valid release identity before calls proceed; the caller should not continue or retry.`,
    }
  } catch {
    return {
      id: 'release', state: 'fail',
      summary: 'Release identity could not be checked. The service operator must restore the release identity check before calls proceed; the caller should not continue or retry.',
    }
  }
}

function serverFailure(baseUrl: string, summary: string): DoctorCheck {
  const safeOrigin = safeOriginForDiagnostics(baseUrl)
  return {
    id: 'server', state: 'fail', summary,
    nextCommand: isLoopbackCliBaseUrl(baseUrl)
      ? `ae doctor --base-url ${HOSTED_DEFAULT_BASE_URL}`
      : continuationCommand(['ae', 'config', '--base-url', safeOrigin, '--json']),
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
  const firstFailure = result.checks.find((check) => check.state === 'fail')
  const nextCommand = firstFailure === undefined
    ? result.checks.find((check) => check.state === 'warn' && check.nextCommand !== undefined)?.nextCommand
      ?? result.checks.find((check) => check.state === 'pass' && check.nextCommand !== undefined)?.nextCommand
    : firstFailure.nextCommand
  if (nextCommand !== undefined) line(`Next: ${nextCommand}`)
}
