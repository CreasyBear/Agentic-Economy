import { SiteDiscoveryManifestSchemaVersion } from '@/modules/discovery/site-manifest-version'
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
import { MARKET_TOOLS_CALL_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import {
  callListResultSchema,
} from '@/modules/capability-execution/call-history.actions'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { toolChoiceDescribeOutputSchema } from '@/modules/registry/tool-choice-contracts'
import {
  MARKET_REQUEST_ROUTE_CONTRACTS,
  marketRequestListAction,
  marketRequestStatusAction,
} from '@/modules/market-demand/market-demand.actions'
import { TOOL_MARKET_DESCRIBE_PATH } from '@/modules/registry/tool-entry'
import { TOOL_QUOTE_PATH, toolQuoteResultSchema } from '@/modules/capability-execution/quote'
import {
  SUPPLY_ACTION_ROUTE_CONTRACTS,
  supplyConnectionListAction,
  supplyToolsListAction,
} from '@/modules/capability-supply/supply-actions'
import {
  X402_CUSTODY_ENV_NAMES,
  cdpX402CustodyConfigurationFromEnvironment,
} from '@/modules/capability-supply/internal/x402-custody-configuration'
import { isMoneyRefusal } from '@/modules/money/public'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { readStripeMoneyProviderConfig, STRIPE_MONEY_ENV_NAMES } from '@/lib/server/stripe-money-provider-config'

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
import { searchCommandDescriptor } from './search'

type DoctorGroup = 'discovery' | 'quoting' | 'purchase'
type GroupState = 'pass' | 'warn' | 'fail' | 'skipped'

export type DoctorTier = Readonly<{ level: 0 | 1; missing: readonly string[] }>

export type DoctorResult = Readonly<{
  kind: 'ready' | 'degraded'
  tier: DoctorTier
  groups: Readonly<Record<DoctorGroup, GroupState>>
  checks: readonly DoctorCheck[]
}>

type DoctorCheck = Readonly<{
  id: string
  group: DoctorGroup
  state: 'pass' | 'warn' | 'fail' | 'skipped'
  summary: string
  reason?: string
  nextCommand?: string
  /** Machine-readable discriminator for a skip reason, so CI can gate on it instead of matching free text. */
  code?: string
}>

/** Checks stay group-free so one table owns the discovery/quoting/purchase split. */
type DoctorCheckDraft = Omit<DoctorCheck, 'group'>

type CallDoctorResult = Readonly<{
  check: DoctorCheckDraft
  recentCompletedToolRef?: string
}>

const CHECK_GROUPS: Readonly<Record<string, DoctorGroup>> = {
  origin: 'discovery', server: 'discovery', mcp: 'discovery',
  readiness: 'discovery', release: 'discovery', catalogue: 'discovery',
  buyer: 'quoting', quote: 'quoting',
  balance: 'purchase', funding: 'purchase', call: 'purchase', market_requests: 'purchase',
  repeat_use: 'purchase', provider: 'purchase', 'provider.readiness': 'purchase',
}
const LOCAL_STRIPE_TEST_MODE_DOC = 'docs/operations/local-stripe-test-mode.md'

function stripeTestModeConfigured(): boolean {
  return !isMoneyRefusal(readStripeMoneyProviderConfig(process.env))
}

function x402SandboxConfigured(): boolean {
  return cdpX402CustodyConfigurationFromEnvironment(process.env) !== undefined
}

function missingEnvNames(names: readonly string[]): readonly string[] {
  return names.filter((name) => readTrimmedEnv(process.env, name) === undefined)
}

/**
 * Tier 0 proves discovery/quoting refusal shape with no credentials; tier 1 proves the
 * full loop once Stripe test mode and the CDP/x402 sandbox bundle are both configured.
 * This reads the CLI's own local environment, which is what a swarm operator running
 * the local stack against `ae doctor` actually controls.
 */
function computeTier(): DoctorTier {
  const stripeReady = stripeTestModeConfigured()
  const x402Ready = x402SandboxConfigured()
  if (stripeReady && x402Ready) return { level: 1, missing: [] }
  return {
    level: 0,
    missing: [
      ...(stripeReady ? [] : missingEnvNames(STRIPE_MONEY_ENV_NAMES)),
      ...(x402Ready ? [] : missingEnvNames(X402_CUSTODY_ENV_NAMES)),
    ],
  }
}
/** Skipping one of these proves nothing about its group, so it cannot roll up as a pass. */
const REQUIRED_CHECK_IDS: readonly string[] = ['quote']

const MARKET_REQUEST_REENTRY_LIMIT = 5
const MCP_CHECK_TIMEOUT_MS = 5_000
const QUOTE_CHECK_TIMEOUT_MS = 5_000
const CATALOGUE_STATUS_PATH = '/api/v1/catalogue-status'
// The Tool `npm run dev:local` (stage sandbox-tool) seeds and publishes.
const SANDBOX_TOOL_BUSINESS_SLUG = 'sandbox-aecon-reference'
const SANDBOX_TOOL_CAPABILITY_ID = 'sandbox.aecon-reference'
const SANDBOX_TOOL_QUOTE_INPUT = { request: 'ae doctor quote inspection' }
const LOCAL_DEV_COMMAND = continuationCommand(['npm', 'run', 'dev:local'])
const QUOTE_AUTHORITY_REFUSAL_CODES: readonly string[] = ['grant_not_found', 'budget_exceeded']
// A funding refusal means authority and commercial policy already admitted the sale, so it
// only proves purchase is unfunded: quoting warns instead of failing on these codes.
const QUOTE_FUNDING_REFUSAL_PATTERN = /^(insufficient_|funding_|balance_)/

function originFlags(options: Pick<CliOptions, 'baseUrl' | 'baseUrlSource'>): readonly string[] {
  return options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
    ? []
    : ['--base-url', options.baseUrl]
}

/**
 * A next command is always the machine-readable (`--json`) invocation, so the
 * human renderer and the JSON `nextCommand` field print the identical string:
 * one source of truth regardless of which mode this run itself used.
 */
function continuationFlags(options: Pick<CliOptions, 'baseUrl' | 'baseUrlSource'>): readonly string[] {
  return [...originFlags(options), '--json']
}

function doctorContinuation(
  options: Pick<CliOptions, 'baseUrl' | 'baseUrlSource'>,
  tokens: readonly (string | number | undefined)[],
): string {
  return continuationCommand([...tokens, ...continuationFlags(options)])
}

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
    tier: computeTier(),
    groups: {
      discovery: groupState(checks, 'discovery'),
      quoting: groupState(checks, 'quoting'),
      purchase: groupState(checks, 'purchase'),
    },
    checks,
  }
}

/** A skipped Quote states why it could not run and never reports a pass. */
function skippedQuoteCheck(reason: string, nextCommand?: string, code?: string): DoctorCheckDraft {
  const trimmedReason = reason.endsWith('.') ? reason.slice(0, -1) : reason
  return {
    id: 'quote', state: 'skipped', reason,
    summary: `Quote inspection was skipped: ${trimmedReason}.`,
    ...(nextCommand === undefined ? {} : { nextCommand }),
    ...(code === undefined ? {} : { code }),
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
    id: 'origin',
    state: 'pass',
    summary: `Configured origin is ${new URL(options.baseUrl).origin}.`,
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
    return options.json ? 0 : 1
  }
  checks.push(await checkMcp(options.baseUrl))
  checks.push(...await checkDeployment(options.baseUrl))
  const buyer = resolveAgentAccessCredential(options.baseUrl)
  if (buyer === undefined) {
    checks.push(
      {
        id: 'buyer', state: 'warn',
        summary: 'No buyer credential is selected for this origin; anonymous search and describe remain available.',
        nextCommand: connectNextCommand(options),
      },
      skippedQuoteCheck('no buyer credential for this origin', connectNextCommand(options)),
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
  return !options.json && result.kind === 'degraded' ? 1 : 0
}

async function checkProvider(options: CliOptions, businessId: string | undefined): Promise<readonly DoctorCheckDraft[]> {
  const { baseUrl } = options
  const credential = resolveAgentAccessCredential(baseUrl, MARKET_SUPPLY_MANAGE_SCOPE)
  if (credential === undefined) {
    return [
      {
        id: 'provider', state: 'warn',
        summary: 'No provider credential is configured for this origin.',
        nextCommand: connectCommand(options, 'provider'),
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
          nextCommand: connectCommand(options, 'provider'),
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

async function checkBuyer(
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
      return [
        {
          id: 'buyer', state: 'fail',
          summary: `Buyer credential is missing ${MARKET_TOOLS_CALL_SCOPE}.`,
          nextCommand: connectCommand(options, 'buyer'),
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

/**
 * Quote is the only check that proves a sale would be admitted. It runs the real
 * tool.quote route with the credential the buyer check just origin-bound, so it
 * is reached only from that guarded branch and never echoes credential material.
 */
async function checkQuote(
  options: CliOptions,
  headers: Readonly<Record<string, string>>,
): Promise<DoctorCheckDraft> {
  const sandbox = await resolveSandboxTool(options.baseUrl)
  if (sandbox.kind === 'unavailable') return skippedQuoteCheck('quote inspection timed out')
  if (sandbox.kind === 'absent') {
    if (isLoopbackCliBaseUrl(options.baseUrl)) {
      return skippedQuoteCheck(
        'no routeable sandbox Tool on this loopback origin. The readiness probe only reaches public HTTPS endpoints, so the seeded sandbox Tool is listed on hosted origins (preview or production), not on 127.0.0.1. Discover and connect are provable here; Quote is provable on a hosted origin.',
        'ae doctor --base-url <hosted origin> --json',
        'loopback_readiness_unprovable',
      )
    }
    return skippedQuoteCheck('no sandbox Tool is published; run npm run dev:local (stage sandbox-tool)', LOCAL_DEV_COMMAND)
  }
  try {
    const outcome = await callJson(options.baseUrl, TOOL_QUOTE_PATH, {
      method: 'POST',
      headers,
      body: JSON.stringify({ toolRef: sandbox.toolRef, input: SANDBOX_TOOL_QUOTE_INPUT }),
      signal: AbortSignal.timeout(QUOTE_CHECK_TIMEOUT_MS),
    })
    const parsed = toolQuoteResultSchema.safeParse(outcome.body)
    // An unreadable Quote proves nothing about a sale, so it skips instead of passing.
    if (!outcome.ok || !parsed.success) return skippedQuoteCheck('quote inspection timed out')
    if (parsed.data.kind === 'refused') {
      const { code } = parsed.data
      const nextCommand = quoteRefusalCommand(options, code)
      if (QUOTE_FUNDING_REFUSAL_PATTERN.test(code)) {
        return {
          id: 'quote', state: 'warn',
          summary: `Quote reached the funding gate (${code}); authority and commercial policy are ready.`,
          nextCommand,
        }
      }
      return {
        id: 'quote', state: 'fail',
        summary: `Quote for the sandbox Tool was refused (${code}).`,
        nextCommand,
      }
    }
    const { price } = parsed.data
    return {
      id: 'quote', state: 'pass',
      summary: `Quote for the sandbox Tool was admitted at ${price.units} × 10^-${price.exponent} ${price.currency}.`,
    }
  } catch {
    return skippedQuoteCheck('quote inspection timed out')
  }
}

function quoteRefusalCommand(options: CliOptions, code: string): string {
  // Sandbox authority is what a local refusal usually lacks: `ae connect` first,
  // then reseed the grant the Quote path resolves.
  if (QUOTE_AUTHORITY_REFUSAL_CODES.includes(code)) return LOCAL_DEV_COMMAND
  if (QUOTE_FUNDING_REFUSAL_PATTERN.test(code)) return doctorContinuation(options, ['ae', 'fund'])
  return continuationCommand(['ae', 'doctor', ...originFlags(options), '--json'])
}

type SandboxToolLookup =
  | Readonly<{ kind: 'found'; toolRef: string }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable' }>

/** Resolves the seeded sandbox Tool through the CLI's own anonymous search contract. */
async function resolveSandboxTool(baseUrl: string): Promise<SandboxToolLookup> {
  const input = searchCommandDescriptor.inputSchema.safeParse({ query: SANDBOX_TOOL_BUSINESS_SLUG, limit: 10 })
  if (!input.success) return { kind: 'unavailable' }
  try {
    const outcome = await callJson(baseUrl, searchCommandDescriptor.path, {
      method: 'POST',
      body: JSON.stringify(input.data),
      signal: AbortSignal.timeout(QUOTE_CHECK_TIMEOUT_MS),
    })
    const parsed = searchCommandDescriptor.outputSchema.safeParse(outcome.body)
    if (!outcome.ok || !parsed.success) return { kind: 'unavailable' }
    if (parsed.data.kind !== 'ok') return parsed.data.kind === 'no_candidates' ? { kind: 'absent' } : { kind: 'unavailable' }
    const tool = parsed.data.items.find((item) =>
      item.provider.slug === SANDBOX_TOOL_BUSINESS_SLUG || item.capabilityId === SANDBOX_TOOL_CAPABILITY_ID)
    return tool === undefined ? { kind: 'absent' } : { kind: 'found', toolRef: tool.toolRef }
  } catch {
    return { kind: 'unavailable' }
  }
}

async function checkMarketRequests(
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
      const checked = list.data.items.length
      return {
        id: 'market_requests', state: 'pass',
        summary: `${matched.length} of ${checked} recent private market ${checked === 1 ? 'request now has' : 'requests now have'} matching Tools.`,
        nextCommand: doctorContinuation(options, ['ae', 'describe', firstTool.toolRef]),
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

function credentialRefusedChecks(options: CliOptions, profile: 'buyer' | 'provider'): readonly DoctorCheckDraft[] {
  const connect = connectCommand(options, profile)
  if (profile === 'provider') {
    return [{
      id: 'provider', state: 'fail',
      summary: 'Provider credential could not be authenticated for this origin.',
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
    { id: 'call', state: 'warn', summary: 'Call recovery was not checked because buyer authentication failed.' },
  ]
}

function credentialOriginFailure(
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
  return {
    id: profile, state: 'fail',
    summary: `${profile === 'buyer' ? 'Buyer' : 'Provider'} credential is not safely bound to the configured origin.`,
    nextCommand: connectCommand(options, profile),
  }
}

function connectCommand(options: CliOptions, profile: 'buyer' | 'provider'): string {
  return doctorContinuation(options, [
    'ae',
    'connect',
    ...(profile === 'provider' ? ['--provider'] : []),
  ])
}

/**
 * A loopback origin can approve its own device code through the local Clerk
 * bypass, so the buyer-missing and quote-unconnected next steps route through
 * that wrapper instead of the browser-driven `ae connect`.
 */
function connectNextCommand(options: CliOptions): string {
  return isLoopbackCliBaseUrl(options.baseUrl)
    ? continuationCommand(['npm', 'run', 'connect:local', '--', '--base-url', options.baseUrl])
    : connectCommand(options, 'buyer')
}

export type BalanceAmount = Readonly<{ currency: string; units: string; exponent: number }>

export type BalanceDoctorResult = Readonly<{
  check: DoctorCheckDraft
  balance?: BalanceAmount
}>

async function checkBalance(
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
      return { check: { id: 'balance', state: 'warn', summary: 'Buyer balance is empty.', nextCommand: doctorContinuation(options, ['ae', 'fund']) } }
    }
    return {
      check: { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
      balance: parsed.data.balance,
    }
  } catch {
    return { check: { id: 'balance', state: 'fail', summary: 'Buyer balance could not be read.', nextCommand: doctorContinuation(options, ['ae', 'account', 'balance']) } }
  }
}

/**
 * Balance alone cannot tell a swarm operator whether an empty Account is a Stripe
 * test-mode gap (tier 0) or a fundable Account that simply has not been funded yet
 * (tier 1): funding names that difference explicitly instead of leaving `insufficient_
 * balance` to stand for both.
 */
export function checkFunding(options: CliOptions, balance: BalanceDoctorResult): DoctorCheckDraft {
  const loopback = isLoopbackCliBaseUrl(options.baseUrl)
  if (!stripeTestModeConfigured()) {
    const missing = missingEnvNames(STRIPE_MONEY_ENV_NAMES)
    return {
      id: 'funding', state: 'fail',
      summary: `Account funding is unavailable: Stripe test mode is not configured (missing: ${missing.join(', ')}).`,
      ...(loopback ? { nextCommand: LOCAL_STRIPE_TEST_MODE_DOC } : {}),
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
    return loopback
      ? {
          id: 'funding', state: 'warn',
          summary: `Buyer balance is empty; fund the Account as the owner at ${origin}/owner/credit (Stripe test mode).`,
          nextCommand: `${origin}/owner/credit`,
        }
      : {
          id: 'funding', state: 'warn',
          summary: 'Buyer balance is empty; fund the Account (Stripe test mode).',
          nextCommand: doctorContinuation(options, ['ae', 'fund']),
        }
  }
  return {
    id: 'funding', state: 'fail',
    summary: 'Account funding could not be verified because the buyer balance could not be read.',
    nextCommand: doctorContinuation(options, ['ae', 'account', 'balance']),
  }
}

async function checkCall(
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
    return {
      check: {
        id: 'call', state: 'warn',
        summary: attention.state === 'reconciliation_required'
          ? 'A reconciliation-required Call needs attention.'
          : 'A nonterminal Call is still pending.',
        nextCommand: attention.state === 'reconciliation_required'
          ? doctorContinuation(options, ['ae', 'status', attention.callRef])
          : doctorContinuation(options, ['ae', 'wait', attention.callRef]),
      },
    }
  } catch {
    return {
      check: { id: 'call', state: 'fail', summary: 'Call recovery state could not be read.', nextCommand: doctorContinuation(options, ['ae', 'history']) },
    }
  }
}

async function checkRepeatUse(options: CliOptions, toolRef: string): Promise<DoctorCheckDraft | undefined> {
  const { baseUrl } = options
  try {
    const outcome = await callJson(baseUrl, TOOL_MARKET_DESCRIBE_PATH, {
      method: 'POST',
      body: JSON.stringify({ toolRef }),
    })
    const parsed = toolChoiceDescribeOutputSchema.safeParse(outcome.body)
    if (!outcome.ok || !parsed.success || parsed.data.kind !== 'found') return undefined
    return {
      id: 'repeat_use', state: 'pass',
      summary: 'A previously successful Tool is still in the current catalog.',
      nextCommand: doctorContinuation(options, ['ae', 'describe', parsed.data.tool.toolRef]),
    }
  } catch {
    return undefined
  }
}

async function checkServer(options: CliOptions): Promise<DoctorCheckDraft> {
  const { baseUrl } = options
  try {
    const outcome = await callJson(baseUrl, '/.well-known/ucp')
    if (!outcome.ok || !isRecord(outcome.body)) {
      return serverFailure(options, 'AE server did not return its discovery manifest.')
    }
    if (outcome.body.schemaVersion !== SiteDiscoveryManifestSchemaVersion) {
      return serverFailure(options, 'AE server manifest is not compatible with this CLI.')
    }
    if (outcome.body.origin !== new URL(baseUrl).origin) {
      return serverFailure(options, 'AE server manifest origin does not match the configured origin.')
    }
    return {
      id: 'server', state: 'pass',
      summary: `AE server is reachable and manifest ${SiteDiscoveryManifestSchemaVersion} is compatible.`,
    }
  } catch {
    return serverUnreachableFailure(options)
  }
}

/**
 * A loopback origin that refuses the connection has nothing to point `ae
 * config` or the hosted fallback at: the operator's own local stack is the
 * fix, so this names the probed URL and starts it instead of routing away
 * from the box the operator is actually sitting at.
 */
function serverUnreachableFailure(options: CliOptions): DoctorCheckDraft {
  const { baseUrl } = options
  if (!isLoopbackCliBaseUrl(baseUrl)) return serverFailure(options, 'AE server is not reachable.')
  const safeOrigin = safeOriginForDiagnostics(baseUrl)
  return {
    id: 'server', state: 'fail',
    summary: `AE server is not reachable: nothing is listening at ${safeOrigin}; start the local stack or fix --base-url.`,
    nextCommand: LOCAL_DEV_COMMAND,
  }
}

async function checkMcp(baseUrl: string): Promise<DoctorCheckDraft> {
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

async function checkDeployment(baseUrl: string): Promise<readonly DoctorCheckDraft[]> {
  return await Promise.all([
    checkToolalReadiness(baseUrl),
    checkReleaseIdentity(baseUrl),
    checkCatalogue(baseUrl),
  ])
}

const CATALOGUE_CHECK_STATES: Readonly<Record<string, DoctorCheckDraft>> = {
  fresh: { id: 'catalogue', state: 'pass', summary: 'Market catalogue coverage is fresh.' },
  stale: { id: 'catalogue', state: 'warn', summary: 'Market catalogue coverage is stale.' },
  failed: { id: 'catalogue', state: 'fail', summary: 'Market catalogue refresh failed.' },
  absent: { id: 'catalogue', state: 'warn', summary: 'Market catalogue coverage is absent.' },
}
const CATALOGUE_UNREADABLE: DoctorCheckDraft = {
  id: 'catalogue', state: 'warn', summary: 'Market catalogue coverage could not be read.',
}

async function checkCatalogue(baseUrl: string): Promise<DoctorCheckDraft> {
  try {
    const outcome = await callJson(baseUrl, CATALOGUE_STATUS_PATH)
    const status = isRecord(outcome.body) && typeof outcome.body.status === 'string' ? outcome.body.status : ''
    return (outcome.ok ? CATALOGUE_CHECK_STATES[status] : undefined) ?? CATALOGUE_UNREADABLE
  } catch {
    return CATALOGUE_UNREADABLE
  }
}

async function checkToolalReadiness(baseUrl: string): Promise<DoctorCheckDraft> {
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

async function checkReleaseIdentity(baseUrl: string): Promise<DoctorCheckDraft> {
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

function serverFailure(options: CliOptions, summary: string): DoctorCheckDraft {
  const { baseUrl } = options
  const safeOrigin = safeOriginForDiagnostics(baseUrl)
  return {
    id: 'server', state: 'fail', summary,
    nextCommand: isLoopbackCliBaseUrl(baseUrl)
      ? continuationCommand(['ae', 'doctor', '--base-url', HOSTED_DEFAULT_BASE_URL, '--json'])
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
    const marker = check.state === 'pass' ? '✓' : check.state === 'warn' ? '!' : check.state === 'skipped' ? '-' : '✗'
    line(`${marker} ${check.summary}`)
  }
  line(result.tier.level === 1 ? 'tier: 1' : `tier: 0 (missing: ${result.tier.missing.join(', ')})`)
  line(`discovery: ${result.groups.discovery} | quoting: ${result.groups.quoting} | purchase: ${result.groups.purchase}`)
  const firstFailure = result.checks.find((check) => check.state === 'fail')
  const nextCommand = firstFailure === undefined
    ? result.checks.find((check) => check.state === 'warn' && check.nextCommand !== undefined)?.nextCommand
      ?? result.checks.find((check) => check.state === 'pass' && check.nextCommand !== undefined)?.nextCommand
    : firstFailure.nextCommand
  if (nextCommand !== undefined) line(`Next: ${nextCommand}`)
}
