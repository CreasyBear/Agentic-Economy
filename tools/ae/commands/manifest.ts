import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST } from '@/modules/agent-access/contract'
import {
  AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS,
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
} from '@/modules/agent-access/account.actions'
import {
  findAction,
  listActions,
  listCallRouteDescriptors,
  mcpToolName,
} from '@/modules/actions'
import {
  AGENT_ACCESS_OAUTH_ERROR_VALUES,
  AGENT_ACCESS_OAUTH_PATHS,
  AGENT_ACCESS_POLL_INTERVAL_SECONDS,
} from '@/modules/agent-access/oauth-state'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  callReceiptAsset,
  callResultKindValues,
} from '@/modules/capability-execution/call-contracts'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import {
  SUPPLY_ACTION_ROUTE_CONTRACTS,
  supplyConnectionConnectAction,
  supplyConnectionReconnectAction,
  supplyConnectionRevokeAction,
  supplyPublishAction,
  supplyRecheckAction,
  supplyRepublishAction,
  supplySourcePreviewAction,
  supplyWithdrawAction,
} from '@/modules/capability-supply/supply-actions'
import { describeActionForAgent, type ActionParameter } from '@/modules/common/action'
import {
  TOOL_MARKET_ACTION_ENTRIES,
} from '@/modules/registry/tool-entry'
import { MARKET_REQUEST_ROUTE_CONTRACTS } from '@/modules/market-demand/market-demand.actions'

import { TOOL_QUOTE_ACTION_ID } from '@/modules/capability-execution/quote'

import type { CliOptions } from '../lib/args'
import { printJson } from '../lib/output'
import { requiredInputFieldsGuidance } from './supply-input-help'
import { toolCallCommand } from '../lib/tool-format'

/** The exact quote tool an MCP client sees, taken from the server's own naming. */
export const QUOTE_MCP_TOOL_NAME = mcpToolName(requireRegisteredAction(TOOL_QUOTE_ACTION_ID))

const RECOVERY_EVIDENCE_MATERIAL = {
  kind: 'action_invocation_reconciliation' as const,
  version: 1 as const,
  evidenceRef: 'evidence:v1:example',
  source: 'provider-tool:v1:example-observer',
  invocationRef: 'invocation:v1:example',
  attemptRef: 'attempt:v1:example',
  effectGeneration: 1,
  resolution: 'not_released' as const,
  observedAt: '2026-08-12T00:00:00.000Z',
}

const RECOVERY_EVIDENCE_EXAMPLE = {
  ...RECOVERY_EVIDENCE_MATERIAL,
  digest: canonicalDigest(RECOVERY_EVIDENCE_MATERIAL),
}

const OWNER_BROWSER_CONTINUATIONS = {
  fund: {
    command: 'fund',
    surface: 'owner_browser',
    authentication: 'owner_session',
    path: '/owner/credit',
    anchor: '#fund',
    agentCredential: 'not_used',
  },
  revoke: {
    command: 'revoke',
    surface: 'owner_browser',
    authentication: 'owner_session',
    path: '/agent-access',
    anchor: '#revoke',
    agentCredential: 'not_used',
  },
} as const

export type CommandManifestEntry = Readonly<{
  summary: string
  args: string
  json: boolean
  authentication?: 'buyer'
  guidance?: readonly string[]
  commands?: Readonly<Record<string, CommandManifestEntry>>
}>

function kebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * One CLI argument syntax per action parameter: `idempotencyKey` is always a
 * flag (every write command in this CLI takes it that way, see
 * `JSON_HELP_FLAGS['--idempotency-key']` in cli.ts); an object-typed
 * parameter becomes a `--flag '<json>'` flag, matching `--input` on `call`,
 * `quote`, and `supply`; every other parameter is a positional when required
 * and a flag when optional. This is the literal one-line fallback formatter
 * the manifest derivation allows when no richer one exists — it is not a fit
 * for every action (see the explicit `args` overrides in `COMMANDS` where
 * the CLI's real argument surface has diverged from the action's own
 * parameter list, each with a comment explaining why).
 */
function formatCliArgs(parameters: readonly ActionParameter[]): string {
  return parameters.map((parameter) => {
    const kebab = kebabCase(parameter.name)
    if (parameter.name === 'idempotencyKey') {
      return parameter.required ? '--idempotency-key <key>' : '[--idempotency-key <key>]'
    }
    if (parameter.type === 'object') {
      const flag = `--${kebab} '<json>'`
      return parameter.required ? flag : `[${flag}]`
    }
    if (parameter.required) return `<${kebab}>`
    const placeholder = parameter.enum !== undefined ? parameter.enum.join('|') : kebab
    return `[--${kebab} <${placeholder}>]`
  }).join(' ')
}

/** The exact set `src/lib/server/mcp-api.ts` and the CLI both read: every action that declares the 'cli' surface. */
const CLI_SURFACE_ACTION_IDS = new Set(
  listActions().filter((action) => action.surfaces.includes('cli')).map((action) => action.id),
)

/**
 * One derived base for every action-backed CLI command: `summary`, `json`,
 * and `authentication` come straight from the action (every action currently
 * on the 'cli' surface declares `credentialAdmission`, so this always
 * resolves to `'buyer'`); `args` comes from `formatCliArgs`. Callers override
 * `args` (and only `args`) where the CLI's real argument surface has
 * diverged from the action's own parameter list.
 */
function deriveCliCommand(actionId: string): Pick<CommandManifestEntry, 'summary' | 'args' | 'json' | 'authentication'> {
  const action = requireRegisteredAction(actionId)
  if (!CLI_SURFACE_ACTION_IDS.has(actionId)) {
    throw new Error(`Manifest command derivation requires the 'cli' surface: ${actionId}`)
  }
  return {
    summary: action.summary,
    args: formatCliArgs(action.parameters),
    json: true,
    ...(action.credentialAdmission === undefined ? {} : { authentication: 'buyer' as const }),
  }
}

export const ROOT_COMMAND_GROUPS = [
  { id: 'discover_compare', title: 'Discover and compare' },
  { id: 'connect_account', title: 'Connect and account' },
  { id: 'call_recover', title: 'Call and recover' },
  { id: 'supply', title: 'Supply' },
  { id: 'reference', title: 'Reference' },
] as const

export const ROOT_HELP_START = [
  'ae search "<job>"',
  'ae describe <tool-ref>',
  'ae connect',
  'ae help call',
] as const

export type RootCommandGroupId = (typeof ROOT_COMMAND_GROUPS)[number]['id']
type RootCommandManifestEntry = CommandManifestEntry & Readonly<{
  group: RootCommandGroupId
  rootOrder: number
}>

export const COMMANDS: Readonly<Record<string, RootCommandManifestEntry>> = {
  manifest: { summary: 'Read this machine-readable Tool terminal contract.', args: '', json: true, group: 'reference', rootOrder: 1 },
  config: {
    summary: 'Inspect effective local CLI origin, paths, overrides, and redacted connection state without changing anything.',
    args: '',
    json: true,
    group: 'reference',
    rootOrder: 2,
    guidance: [
      'Works even when the stored connection document is malformed; reports the structural reason without file contents or credential values.',
    ],
  },
  search: {
    summary: 'Search current public Tools for what you need.',
    args: '"<what you need>" [--limit <1-20>] [--cursor <cursor>] [--filters \'<json>\']',
    json: true,
    group: 'discover_compare',
    rootOrder: 1,
    guidance: [
      'Filters: networkId, location, effects, dataUse, healthStatus, currency, and maximumPrice.',
      'Exact price example for at most USD 0.50: --filters \'{"currency":"USD","maximumPrice":{"currency":"USD","units":"50","exponent":2}}\'',
      `Search returns compact catalog facts. Exact payable price and caller readiness are confirmed by ${toolCallCommand()}, or by ${QUOTE_MCP_TOOL_NAME} from an MCP client.`,
    ],
  },
  list: {
    summary: 'Browse current public Tools.',
    args: '[--limit <1-100>] [--cursor <cursor>] [--filters \'<json>\']',
    json: true,
    group: 'discover_compare',
    rootOrder: 1,
  },
  request: {
    summary: 'Remember and revisit a private missing job after current Tools return no match.',
    args: '<create|list|status>',
    json: true,
    group: 'discover_compare',
    rootOrder: 5,
    authentication: 'buyer',
    guidance: [
      'A request is private market memory for this exact credential profile, not a project, tender, provider message, or callable Tool.',
      'Create refuses when a current canonical Tool already matches; search and describe that Tool instead.',
    ],
    commands: {
      // marketRequestCreateAction.parameters marks idempotencyKey required, but the CLI generates one when --idempotency-key is omitted; args keeps the CLI-observed shape.
      create: { ...deriveCliCommand(MARKET_REQUEST_ROUTE_CONTRACTS.create.actionId), args: '"<job>" [--idempotency-key <key>]' },
      list: { ...deriveCliCommand(MARKET_REQUEST_ROUTE_CONTRACTS.list.actionId) },
      status: { ...deriveCliCommand(MARKET_REQUEST_ROUTE_CONTRACTS.status.actionId) },
    },
  },
  describe: {
    summary: 'Describe one exact current Market Tool before quoting or calling.',
    args: '<tool-ref> [--technical]',
    json: true,
    group: 'discover_compare',
    rootOrder: 2,
    guidance: [
      `Catalog health and price are indicative. Run ${toolCallCommand()} for caller-specific readiness and exact terms, or ${QUOTE_MCP_TOOL_NAME} from an MCP client.`,
    ],
  },
  compare: { summary: 'Compare two to four exact current Tool references.', args: '<tool-ref> <tool-ref> [<tool-ref> ...]', json: true, group: 'discover_compare', rootOrder: 3 },
  connect: {
    summary: 'Register a public device client or validate one separately stored AE credential profile.',
    args: '[--provider] [--environment sandbox|production]',
    json: true,
    group: 'connect_account',
    rootOrder: 1,
    guidance: [
      'Without --provider, request buyer access. With --provider, request a separate owner-approved market_supply:manage credential.',
      'Buyer and provider credentials are stored independently for the exact server origin.',
      'Use --environment production for live-network Tools. The owner approves access; production spending defaults to zero.',
    ],
  },
  doctor: {
    summary: 'Check this CLI connection across the Tool market loop without changing server or local state.',
    args: '[--provider [businessId]]',
    json: true,
    group: 'reference',
    rootOrder: 3,
    guidance: [
      'Uses existing read-only surfaces only; it never connects, funds, retries, reconciles, or changes provider state.',
      'Rechecks the five newest private market requests and points directly to the first current matching Tool without revealing the saved job phrase.',
      'When recovery is clear, confirms the newest previously successful Tool is still current and offers description without replaying prior inputs or effects.',
      '--provider is the only way to check provider readiness; a business ID is only accepted alongside --provider. Without a business ID, only provider credential access is checked. With one, Tool and connection readiness are scoped to that exact business.',
    ],
  },
  account: {
    summary: 'Inspect current agent identity, exact buyer credit, credential activity, or local origin-bound connections.',
    args: '[status [market|provider]|balance [currency]|activity [currency]|connections|disconnect [market|provider]]',
    json: true,
    group: 'connect_account',
    rootOrder: 2,
    authentication: 'buyer',
    commands: {
      // agentAccountSelfAction takes no parameters; market|provider only selects which local credential scope the CLI sends, so args stays hand-specified.
      status: { ...deriveCliCommand(AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.actionId), args: '[market|provider]' },
      // currency is a positional CLI argument, not a flag; formatCliArgs's generic optional-scalar rule would render it as one.
      balance: { ...deriveCliCommand(AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.actionId), args: '[currency]' },
      activity: { ...deriveCliCommand(AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.activity.actionId), args: '[currency] [--limit <1-100>] [--cursor <cursor>]' },
      connections: { summary: 'List locally stored origin-bound AE connections without revealing bearer material.', args: '', json: true },
      disconnect: { summary: 'Remove one local credential profile (buyer by default; provider with `provider`). Server-side revocation stays with the owner.', args: '[market|provider]', json: true },
    },
  },
  supply: {
    summary: 'Manage your provider Tools, connections, earnings and recovery with an owner-issued provider credential.',
    args: '<preview|tools|status|publish|withdraw|recheck|republish|earnings|calls|connections|connection|connect|reconnect|revoke|offboarding>',
    json: true,
    group: 'supply',
    rootOrder: 1,
    guidance: [
      'Requires a separately owner-approved credential with market_supply:manage; obtain it with ae connect --provider.',
      'Use status before lifecycle writes and preserve the exact offering and publication revisions it returns.',
    ],
    commands: {
      preview: { summary: 'Discover candidate Tools from one native Provider source without publishing or calling.', args: "--input '<json>'", json: true, guidance: requiredInputFieldsGuidance(supplySourcePreviewAction.schema) },
      tools: { summary: 'Inventory the Provider’s admitted Tools for one business.', args: '<businessRef>', json: true },
      status: { summary: 'Read one exact Provider Tool lifecycle.', args: '<businessRef> <toolRef>', json: true },
      publish: { summary: 'Publish one admitted provider Tool artifact.', args: "--input '<json>' [--idempotency-key <key>]", json: true, guidance: requiredInputFieldsGuidance(supplyPublishAction.schema) },
      withdraw: { summary: 'Withdraw one exact current provider publication.', args: "--input '<json>' [--idempotency-key <key>]", json: true, guidance: requiredInputFieldsGuidance(supplyWithdrawAction.schema) },
      recheck: { summary: 'Schedule readiness revalidation for one exact publication.', args: "--input '<json>' [--idempotency-key <key>]", json: true, guidance: requiredInputFieldsGuidance(supplyRecheckAction.schema) },
      republish: { summary: 'Republish one exact withdrawn publication.', args: "--input '<json>' [--idempotency-key <key>]", json: true, guidance: requiredInputFieldsGuidance(supplyRepublishAction.schema) },
      earnings: { summary: 'Read exact provider earnings and payout status for one currency.', args: '<currency>', json: true },
      calls: { summary: 'Recent Calls across your Tools, newest first.', args: '[--limit <n>] [--cursor <c>] [--state <s>]', json: true },
      connections: { summary: 'List the bounded provider-connection projection for one provider business, including non-active recovery states.', args: '<businessId> [lifecycle]', json: true },
      connection: { summary: 'Inspect one exact provider connection and its current concurrency identity.', args: '<connectionRef>', json: true },
      connect: { summary: 'Connect one public credentialless x402 endpoint.', args: "--input '<json>' [--idempotency-key <key>]", json: true, guidance: requiredInputFieldsGuidance(supplyConnectionConnectAction.schema) },
      reconnect: { summary: 'Refresh one exact provider connection using its current generation and digest.', args: "--input '<json>' [--idempotency-key <key>]", json: true, guidance: requiredInputFieldsGuidance(supplyConnectionReconnectAction.schema) },
      revoke: { summary: 'Begin revocation and cleanup for one exact provider connection.', args: "--input '<json>' [--idempotency-key <key>]", json: true, guidance: requiredInputFieldsGuidance(supplyConnectionRevokeAction.schema) },
      offboarding: { summary: 'Read one durable Provider offboarding case. Starting and resuming remain owner-only.', args: '<businessRef>', json: true },
    },
  },
  fund: {
    summary: 'Continue to owner funding controls in the authenticated browser surface; this command never funds.',
    args: '',
    json: true,
    group: 'connect_account',
    rootOrder: 3,
    guidance: ['Open the returned /owner/credit#fund continuation as the owner. No agent credential is used.'],
  },
  quote: {
    ...deriveCliCommand(TOOL_QUOTE_ACTION_ID),
    group: 'call_recover',
    rootOrder: 0,
    guidance: [
      `${toolCallCommand()} performs quote and call together; run quote alone first to inspect price, budget, and readiness without calling.`,
    ],
  },
  // callAction.parameters are quoteRef and idempotencyKey (the internal purchase step); the CLI's `call` wraps tool.quote and tool.call together and takes tool-ref/--input/--wait, so summary and args stay hand-specified here.
  call: {
    summary: 'Call one capability: anonymous MCP for eligible free keyless reads, otherwise the connected AE gateway.',
    args: "<tool-ref> --input '<json>' [--wait]",
    json: true,
    group: 'call_recover',
    rootOrder: 1,
    authentication: 'buyer',
    guidance: [
      'Pass --input - to read one bounded JSON object from standard input; literal JSON remains supported.',
      'After an interrupted purchase, use ae call resume <recovery-ref> with the same --base-url. The saved Quote and idempotency key are reused; do not supply --input or a new key.',
    ],
    commands: {
      resume: { summary: 'Resume the exact saved purchase after an interrupted response.', args: '<recovery-ref> [--wait]', json: true,
        guidance: ['Use the recoveryRef returned by call. Requires the same origin, Account and Agent principal; replacement credentials for that Agent are supported. No --input or new --idempotency-key.'] },
    },
  },
  history: {
    ...deriveCliCommand(CALL_ROUTE_CONTRACT.list.actionId),
    group: 'call_recover',
    rootOrder: 2,
    guidance: ['Use the returned callRef with status for one snapshot or wait for a bounded recorded outcome.'],
  },
  status: {
    ...deriveCliCommand(CALL_ROUTE_CONTRACT.status.actionId),
    // callStatusAction also accepts afterVersion, but the CLI has no flag for it (COMMAND_OPTIONS['status'] is empty in cli.ts); args keeps the CLI-observed shape.
    args: '<call-ref>',
    group: 'call_recover',
    rootOrder: 3,
  },
  wait: {
    summary: 'Wait boundedly for one recorded Call to reach a durable outcome.',
    args: '<call-ref>',
    json: true,
    group: 'call_recover',
    rootOrder: 4,
    authentication: 'buyer',
    guidance: [
      'Read-only: observes the existing Call and never retries it, grants authority, or creates a replacement Call.',
      'A timeout preserves the Call identity and returns the exact wait command to continue later.',
    ],
  },
  cancel: {
    ...deriveCliCommand(CALL_ROUTE_CONTRACT.cancel.actionId),
    // callCancelAction.parameters also inherits afterVersion from statusParameters, but cancel.ts never reads it and the CLI has no flag for it (COMMAND_OPTIONS['cancel'] is idempotency-key only); args keeps the CLI-observed shape.
    args: '<call-ref> --idempotency-key <key>',
    group: 'call_recover',
    rootOrder: 5,
  },
  recover: {
    ...deriveCliCommand(CALL_ROUTE_CONTRACT.reconcile.actionId),
    // evidence is a positional JSON argument in the real CLI (recover.ts reads args[1]), not a --evidence flag; args keeps the CLI-observed shape.
    args: "<call-ref> '<evidence-json>' --idempotency-key <key>",
    group: 'call_recover',
    rootOrder: 6,
    guidance: [
      'Inspect status first and use this only when the Call outcome remains genuinely uncertain.',
      'Provide canonical evidence for the same Call and stable idempotency key; recover reconciles the outcome and does not replay a known result.',
    ],
  },
  revoke: {
    summary: 'Continue to owner access revocation in the authenticated browser surface; this command never revokes.',
    args: '',
    json: true,
    group: 'connect_account',
    rootOrder: 4,
    guidance: ['Open the returned /agent-access#revoke continuation as the owner. No agent credential is used.'],
  },
} as const

function requireRegisteredAction(actionId: string) {
  const action = findAction(actionId)
  if (action === undefined) throw new Error(`Manifest action is not registered: ${actionId}`)
  return action
}

function describedAction(actionId: string) {
  const action = requireRegisteredAction(actionId)
  const described = describeActionForAgent(action)
  return {
    ...described,
    mcpToolName: mcpToolName(action),
    invocationContract: action.invocationContract,
  }
}


/**
 * `ae manifest [--json]` — the external-agent handshake. The front door is the
 * canonical Tool discovery/quote/call/recovery contract, not a
 * second legacy catalog or generic action inventory.
 */
export async function runManifestCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const toolReads = TOOL_MARKET_ACTION_ENTRIES.map((route) => ({
    route,
    action: describedAction(route.actionId),
  }))
  const gateway = listCallRouteDescriptors().map((route) => ({
    route,
    action: describedAction(route.actionId),
  }))

  const manifest = {
    $schema: 'https://agentic-economy/market-terminal/manifest:v3',
    protocol: 'agentic-economy.tool-terminal.v1',
    about: 'Discover exact current Tools, inspect terms, connect one agent key, call idempotently, and recover each Call through durable history and status.',
    commands: COMMANDS,
    coldLoop: ['search', 'describe', 'connect', 'call', 'history', 'status', 'wait'],
    payment: {
      providerQuotedAmount: {
        field: 'commercial.priceBreakdown.providerQuotedAmount',
        exact: true,
        meaning: 'The exact provider quote for the admitted Call.',
      },
      agenticEconomyFee: {
        field: 'commercial.priceBreakdown.agenticEconomyFee',
        exact: true,
        rate: '10%',
        feeBps: 1_000,
        calculation: 'ceil(providerQuotedAmount * 1000 / 10000)',
      },
      totalBuyerAuthorization: {
        field: 'commercial.priceBreakdown.totalBuyerAuthorization',
        exact: true,
        calculation: 'providerQuotedAmount + agenticEconomyFee',
      },
      network: 'eip155:8453',
      asset: {
        symbol: 'USDC',
        name: 'Official USDC on Base',
        address: callReceiptAsset,
      },
    },
    approval: {
      owner: 'Owner approval is completed in the authenticated /agent-access browser surface; an agent credential cannot fund or revoke owner authority.',
      deviceFlow: 'Open verification_uri and approve the displayed user_code before polling the token endpoint.',
      call: 'When call returns needs_authority, wait for the owner decision in /agent-access before retrying the same Call identity.',
    },
    polling: {
      oauth: {
        intervalSeconds: AGENT_ACCESS_POLL_INTERVAL_SECONDS,
        waitOn: ['authorization_pending'],
        increaseIntervalOn: ['slow_down'],
        stopOn: AGENT_ACCESS_OAUTH_ERROR_VALUES.filter((error) => error !== 'authorization_pending' && error !== 'slow_down'),
      },
      callWait: 'call --wait polls status using the gateway retryAfterMs value until a terminal result or bounded timeout; a timeout preserves callRef for status.',
      recordedWait: 'wait observes one existing Call through the status route until a durable result or bounded timeout; it never creates or retries a Call.',
    },
    recovery: {
      history: 'Use root history to recover Call references owned by this Agent and Account, including earlier credentials, before reading exact status or waiting for a recorded result.',
      resume: 'If an interrupted call returns recoveryRef, run ae call resume <recovery-ref> at the same origin to resume its exact saved Quote and idempotency identity. Do not supply new input or a new key.',
      statusFirst: true,
      cancel: 'Use root cancel with the same callRef and a stable idempotency key when cancellation is supported and the Call should stop.',
      reconcile: 'Use root recover only after a genuinely uncertain outcome, with canonical evidence for the same Call and the same idempotency identity; recover never replays a known result.',
    },
    receipt: {
      location: ['call.receipt', 'status.receipt', 'status.result.receipt', 'recover.receipt'],
      referenceField: 'receipt.receiptRef',
      identityFields: ['providerQuotedAmount', 'agenticEconomyFee', 'totalBuyerAuthorization', 'network', 'asset'],
    },
    ownerContinuations: OWNER_BROWSER_CONTINUATIONS,
    anonymous: {
      authentication: 'none',
      routes: toolReads.map(({ route, action }) => ({
        method: route.method,
        path: route.pathTemplate,
        actionId: action.id,
        contractVersion: action.invocationContract.version,
        ...(action.inputJsonSchema === undefined ? {} : { inputJsonSchema: action.inputJsonSchema }),
        ...(action.outputJsonSchema === undefined ? {} : { outputJsonSchema: action.outputJsonSchema }),
      })),
      toolReads,
    },
    gateway: {
      authentication: 'Bearer AE_API_KEY (bound to AE_API_KEY_ORIGIN)',
      scope: CALL_ROUTE_CONTRACT.scope,
      media: CALL_ROUTE_CONTRACT.media,
      headers: CALL_ROUTE_CONTRACT.headers,
      routes: gateway,
      idempotency: {
        commandField: 'idempotencyKey',
        commandFieldRequired: true,
        location: 'body.idempotencyKey',
        requiredFor: ['tool.call', 'call.cancel', 'call.reconcile'],
        replay: 'same_material_returns_exact_original_result',
        conflict: 'changed_material_refused_as_idempotency_conflict',
        uncertain: 'recover_only_after_a_real_uncertain_outcome',
      },
      outcomes: {
        action: describedAction(CALL_ROUTE_CONTRACT.call.actionId).outputJsonSchema,
        values: callResultKindValues,
      },
      oauth: {
        authorizationServerMetadataPath: AGENT_ACCESS_OAUTH_PATHS.authorizationServerMetadata,
        protectedResourceMetadataPath: AGENT_ACCESS_OAUTH_PATHS.protectedResourceMetadata,
        registrationPath: AGENT_ACCESS_OAUTH_PATHS.register,
        deviceAuthorizationPath: AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization,
        authorizePath: AGENT_ACCESS_OAUTH_PATHS.authorize,
        tokenPath: AGENT_ACCESS_OAUTH_PATHS.token,
        grantType: AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.grant_types[0],
        requestedScope: AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.scope,
        deviceFlow: [
          {
            order: 1,
            method: 'POST',
            path: AGENT_ACCESS_OAUTH_PATHS.register,
            media: { request: 'application/json', response: 'application/json' },
            request: AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST,
            result: 'client_id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scope',
          },
          { order: 2, method: 'POST', path: AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization, request: 'Form client_id and scope=requestedScope.', result: 'device_code, user_code, verification_uri, expires_in, interval' },
          { order: 3, action: 'Approve verification_uri with user_code.' },
          {
            order: 4,
            method: 'POST',
            path: AGENT_ACCESS_OAUTH_PATHS.token,
            request: 'Form grant_type=grantType, client_id, and device_code.',
            polling: {
              intervalSeconds: AGENT_ACCESS_POLL_INTERVAL_SECONDS,
              waitOn: ['authorization_pending'],
              increaseIntervalOn: ['slow_down'],
              stopOn: AGENT_ACCESS_OAUTH_ERROR_VALUES.filter((error) => error !== 'authorization_pending' && error !== 'slow_down'),
            },
            result: 'access_token',
          },
          { order: 5, action: 'Validate the access token against the exact server origin, then store it with user-only file permissions.' },
        ],
        existingKey: 'When AE_API_KEY is already set, connect validates it before issuing another credential; AE_API_KEY_ORIGIN must parse and exactly match the configured server origin before Authorization is sent.',
        apiKey: {
          environmentVariable: 'AE_API_KEY',
          originEnvironmentVariable: 'AE_API_KEY_ORIGIN',
          originBinding: 'AE_API_KEY_ORIGIN must equal new URL(--base-url).origin; credentialed calls require HTTPS except loopback HTTP development.',
          result: 'OAuth token.access_token',
          usage: 'The CLI sends the stored origin-bound key for call, status, wait, cancel, and recover. AE_API_KEY remains an explicit automation override.',
        },
        revocation: 'Root revoke emits the owner-browser continuation /agent-access#revoke; it does not revoke through an agent credential or an API route.',
        oneTimeSecretDelivery: false,
      },
      credentialBoundary: 'AE resolves provider, endpoint, connection, provider credential, price, authority, and evidence server-side.',
    },
    account: {
      action: describedAction(AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.actionId),
      route: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
      moneyRoutes: Object.values(AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS).map((route) => ({
        ...route,
        action: describedAction(route.actionId),
      })),
      commands: COMMANDS.account,
      localConnectionLifecycle: ['connections', 'disconnect'],
    },
    supply: {
      authentication: 'Bearer owner-issued credential with market_supply:manage',
      connectCommand: 'ae connect --provider',
      issuanceBoundary: 'Provider authority is a separate owner-approved credential profile; the ordinary ae connect buyer flow remains buyer-only.',
      commands: COMMANDS.supply,
      routes: Object.values(SUPPLY_ACTION_ROUTE_CONTRACTS).map((route) => ({
        ...route,
        action: describedAction(route.actionId),
      })),
    },
    jsonOutput: {
      stdout: 'exactly_one_json_value',
      stderr: 'progress_and_errors',
      strict: true,
    },
    evidence: {
      status: 'Durable status may return exact usage and evidence projections admitted by the Call runtime.',
      recovery: {
        actionId: CALL_ROUTE_CONTRACT.reconcile.actionId,
        example: RECOVERY_EVIDENCE_EXAMPLE,
        digestMaterialRule: 'Compute canonicalDigest over all evidence fields except digest; include every other present field, including optional fields, exactly once and do not include the outer command wrapper.',
        callRefIdentityRule: 'The recover command callRef argument and canonical callRef returned by call/status must identify the same Call; historical evidence.invocationRef remains byte-for-byte identical to the invocation identity recorded by the runtime. toolRef, attemptRef, and idempotencyKey are not substitutes.',
      },
      unknown: 'A transport timeout is not a terminal outcome; inspect status and use recover only when the outcome remains genuinely uncertain, supplying canonical evidence and the same Call and idempotency references. Recover reconciles evidence; it does not replay a known result.',
    },
  }
  if (options.technical === true) {
    printJson(manifest)
    return
  }

  printJson({
    $schema: manifest.$schema,
    protocol: manifest.protocol,
    about: manifest.about,
    commands: manifest.commands,
    coldLoop: ['search', 'describe', 'call', 'history', 'status', 'wait'],
    access: {
      anonymous: 'List, search, describe, and compare current Tools without connecting.',
      connected: 'Run ae connect once; authenticated Calls cover free and paid Tools, and consequential Tools require approval.',
    },
    account: {
      command: 'ae account status [market|provider]',
      balance: 'ae account balance [currency]',
      activity: 'ae account activity [currency] [--limit <1-100>] [--cursor <cursor>]',
      connections: 'ae account connections',
      disconnect: 'ae account disconnect',
      disconnectDefaultProfile: 'market',
      disconnectProvider: 'ae account disconnect provider',
    },
    supply: {
      connect: 'ae connect --provider',
      tools: 'ae supply tools <businessRef>',
      status: 'ae supply status <businessRef> <toolRef>',
      connections: 'ae supply connections <businessId>',
      connection: 'ae supply connection <connectionRef>',
      authority: 'Requires a separately owner-approved market_supply:manage credential; buyer and provider profiles remain independent.',
    },
    routes: toolReads.map(({ route, action }) => ({
      relation: route.relation,
      method: route.method,
      path: route.pathTemplate,
      actionId: action.id,
    })),
    call: {
      command: "ae call <toolRef> --input '<json>'",
      connected: {
        command: 'ae connect',
        transport: 'tool.call:v1',
        authentication: 'Bearer AE_API_KEY (bound to AE_API_KEY_ORIGIN)',
        receipt: 'Every accepted gateway Call returns or progresses toward one Call receipt.',
      },
    },
    recovery: {
      history: 'ae history [--state <state>]',
      status: 'ae status <callRef>',
      wait: 'ae wait <callRef>',
      rule: 'If the outcome is uncertain, read status before any retry and preserve the same identity.',
    },
    fullContract: 'ae manifest --technical --json',
  })
}
