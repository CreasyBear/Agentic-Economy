import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST } from '@/modules/agent-access/contract'
import {
  AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS,
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
} from '@/modules/agent-access/account.actions'
import {
  findAction,
  listOperationRouteDescriptors,
  mcpToolName,
} from '@/modules/actions'
import {
  AGENT_ACCESS_OAUTH_ERROR_VALUES,
  AGENT_ACCESS_OAUTH_PATHS,
  AGENT_ACCESS_POLL_INTERVAL_SECONDS,
} from '@/modules/agent-access/oauth-state'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  operationInvokeReceiptAsset,
  operationInvokeResultKindValues,
} from '@/modules/capability-execution/operation-invoke-contracts'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { SUPPLY_ACTION_ROUTE_CONTRACTS } from '@/modules/capability-supply/supply-actions'
import { describeActionForAgent } from '@/modules/common/action'
import {
  OPERATION_MARKET_ACTION_ENTRIES,
} from '@/modules/registry/operation-entry'

import type { CliOptions } from '../lib/args'
import { printJson } from '../lib/output'

const RECOVERY_EVIDENCE_MATERIAL = {
  kind: 'action_invocation_reconciliation' as const,
  version: 1 as const,
  evidenceRef: 'evidence:v1:example',
  source: 'provider-operation:v1:example-observer',
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
  guidance?: readonly string[]
  commands?: Readonly<Record<string, CommandManifestEntry>>
}>

export const COMMANDS: Readonly<Record<string, CommandManifestEntry>> = {
  manifest: { summary: 'Read this machine-readable Operation terminal contract.', args: '', json: true },
  search: { summary: 'Search current public Market Operations for a job.', args: '"<job>" [--limit <1-20>] [--cursor <cursor>] [--filters \'<json>\']', json: true },
  inspect: { summary: 'Read one exact current Market Operation before connecting or invoking.', args: '<operation-ref>', json: true },
  compare: { summary: 'Compare one to four exact current Operation references.', args: '<operation-ref> [<operation-ref> ...]', json: true },
  'inspect-plan': { summary: 'Inspect a bounded operation plan from one to four exact current Operation references.', args: '<operation-ref> [<operation-ref> ...]', json: true },
  connect: {
    summary: 'Register a public device client or validate one separately stored AE credential profile.',
    args: '[--mcp] [--supplier]',
    json: true,
    guidance: [
      'Without --supplier, request buyer Operation access. With --supplier, request a separate owner-approved market_supply:manage credential.',
      'Pass --mcp to write the matching Streamable HTTP MCP connection after the credential is validated.',
      'Buyer and supplier credentials are stored independently for the exact server origin.',
    ],
  },
  doctor: {
    summary: 'Check this CLI connection across the Operation market loop without changing server or local state.',
    args: '[businessId] [--supplier]',
    json: true,
    guidance: [
      'Uses existing read-only surfaces only; it never connects, funds, retries, reconciles, or changes supplier state.',
      'Pass --supplier to validate separately stored supplier access; add a business ID to include Operation and provider readiness.',
    ],
  },
  account: {
    summary: 'Inspect current agent identity, exact buyer credit, credential activity, or local origin-bound connections.',
    args: '[status [market|supplier]|balance [currency]|activity [currency]|connections|disconnect [market|supplier]]',
    json: true,
    commands: {
      status: { summary: 'Read one buyer or supplier credential profile’s principal, owner account, scopes, and authority mode.', args: '[market|supplier]', json: true },
      balance: { summary: 'Read exact buyer credit and the owner-browser funding continuation.', args: '[currency]', json: true },
      activity: { summary: 'List this credential profile’s bounded charge activity, newest first.', args: '[currency] [--limit <1-100>] [--cursor <cursor>]', json: true },
      connections: { summary: 'List locally stored origin-bound AE connections without revealing bearer material.', args: '', json: true },
      disconnect: { summary: 'Remove one local credential profile, or all profiles for the selected origin; server-side revocation remains owner-controlled.', args: '[market|supplier]', json: true },
    },
  },
  supply: {
    summary: 'Inspect and manage owner-bound supplier Operations, provider connections, earnings, and recovery with an owner-issued supplier credential.',
    args: '<status|publish|withdraw|recheck|republish|earnings|connections|connection|connect|reconnect|revoke|retry-cleanup>',
    json: true,
    guidance: [
      'Requires a separately owner-approved credential with market_supply:manage; obtain it with ae connect --supplier.',
      'Use status before lifecycle writes and preserve the exact offering and publication revisions it returns.',
    ],
    commands: {
      status: { summary: 'List supplier Operations or inspect one exact offering lifecycle.', args: '<businessId> [offeringRef]', json: true },
      publish: { summary: 'Publish one admitted supplier Operation artifact.', args: "--input '<json>' [--idempotency-key <key>]", json: true },
      withdraw: { summary: 'Withdraw one exact current supplier publication.', args: "--input '<json>' [--idempotency-key <key>]", json: true },
      recheck: { summary: 'Schedule readiness revalidation for one exact publication.', args: "--input '<json>' [--idempotency-key <key>]", json: true },
      republish: { summary: 'Republish one exact withdrawn publication.', args: "--input '<json>' [--idempotency-key <key>]", json: true },
      earnings: { summary: 'Read exact supplier earnings and payout status for one currency.', args: '<currency>', json: true },
      connections: { summary: 'List the bounded provider-connection projection for one supplier business, including non-active recovery states.', args: '<businessId> [lifecycle]', json: true },
      connection: { summary: 'Inspect one exact provider connection and its current concurrency identity.', args: '<connectionRef>', json: true },
      connect: { summary: 'Connect one public credentialless x402 endpoint.', args: "--input '<json>' [--idempotency-key <key>]", json: true },
      reconnect: { summary: 'Refresh one exact provider connection using its current generation and digest.', args: "--input '<json>' [--idempotency-key <key>]", json: true },
      revoke: { summary: 'Begin revocation and cleanup for one exact provider connection.', args: "--input '<json>' [--idempotency-key <key>]", json: true },
      'retry-cleanup': { summary: 'Resume eligible cleanup after persisted callback grace expires.', args: "--input '<json>' [--idempotency-key <key>]", json: true },
    },
  },
  fund: {
    summary: 'Continue to owner funding controls in the authenticated browser surface; this command never funds.',
    args: '',
    json: true,
    guidance: ['Open the returned /owner/credit#fund continuation as the owner. No agent credential is used.'],
  },
  call: { summary: 'Call one capability: anonymous MCP for eligible free keyless reads, otherwise the connected AE gateway.', args: "<operation-ref> --input '<json>' [--wait]", json: true },
  history: {
    summary: 'List this credential profile’s own invocation summaries, newest first.',
    args: '[--limit <1-100>] [--cursor <cursor>] [--state <state>]',
    json: true,
    guidance: ['Use the returned invocationRef with status for exact result, receipt, and recovery detail.'],
  },
  status: { summary: 'Read one authenticated invocation status and evidence projection.', args: '<invocation-ref>', json: true },
  cancel: { summary: 'Cancel one authenticated invocation explicitly.', args: '<invocation-ref> --idempotency-key <key>', json: true },
  recover: {
    summary: 'Reconcile a genuinely uncertain invocation with canonical evidence after a real uncertain outcome; this is not a replay.',
    args: "<invocation-ref> '<evidence-json>' --idempotency-key <key>",
    json: true,
    guidance: [
      'Inspect status first and use this only when the invocation outcome remains genuinely uncertain.',
      'Provide canonical evidence for the same invocation and stable idempotency key; recover reconciles the outcome and does not replay a known result.',
    ],
  },
  revoke: {
    summary: 'Continue to owner access revocation in the authenticated browser surface; this command never revokes.',
    args: '',
    json: true,
    guidance: ['Open the returned /agent-access#revoke continuation as the owner. No agent credential is used.'],
  },
} as const

function describedAction(actionId: string) {
  const action = findAction(actionId)
  if (action === undefined) throw new Error(`Manifest action is not registered: ${actionId}`)
  const described = describeActionForAgent(action)
  return {
    ...described,
    mcpToolName: mcpToolName(action),
    invocationContract: action.invocationContract,
  }
}


/**
 * `ae manifest [--json]` — the external-agent handshake. The front door is the
 * canonical Operation search/inspection/invocation/recovery contract, not a
 * second legacy catalog or generic action inventory.
 */
export async function runManifestCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const operationReads = OPERATION_MARKET_ACTION_ENTRIES.map((route) => ({
    route,
    action: describedAction(route.actionId),
  }))
  const gateway = listOperationRouteDescriptors().map((route) => ({
    route,
    action: describedAction(route.actionId),
  }))

  const manifest = {
    $schema: 'https://agentic-economy/market-terminal/manifest:v3',
    protocol: 'agentic-economy.operation-terminal.v1',
    about: 'Discover exact current work, inspect terms, connect one agent key, call idempotently, preserve the receipt, and reuse successful work.',
    commands: COMMANDS,
    coldLoop: ['search', 'inspect', 'connect', 'call', 'history', 'receipt', 'reuse'],
    payment: {
      providerQuotedAmount: {
        field: 'commercial.priceBreakdown.providerQuotedAmount',
        exact: true,
        meaning: 'The exact provider quote for the admitted invocation.',
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
        address: operationInvokeReceiptAsset,
      },
    },
    approval: {
      owner: 'Owner approval is completed in the authenticated /agent-access browser surface; an agent credential cannot fund or revoke owner authority.',
      deviceFlow: 'Open verification_uri and approve the displayed user_code before polling the token endpoint.',
      invocation: 'When invoke returns needs_authority, wait for the owner decision in /agent-access before retrying the same invocation identity.',
    },
    polling: {
      oauth: {
        intervalSeconds: AGENT_ACCESS_POLL_INTERVAL_SECONDS,
        waitOn: ['authorization_pending'],
        increaseIntervalOn: ['slow_down'],
        stopOn: AGENT_ACCESS_OAUTH_ERROR_VALUES.filter((error) => error !== 'authorization_pending' && error !== 'slow_down'),
      },
      invokeWait: 'invoke --wait polls status using the gateway retryAfterMs value until a terminal result or bounded timeout; a timeout preserves invocationRef for status.',
    },
    recovery: {
      history: 'Use root history to recover invocation references owned by the current credential profile before reading exact status.',
      statusFirst: true,
      cancel: 'Use root cancel with the same invocationRef and a stable idempotency key when cancellation is supported and the invocation should stop.',
      reconcile: 'Use root recover only after a genuinely uncertain outcome, with canonical evidence for the same invocationRef and the same idempotency identity; recover never replays a known result.',
    },
    receipt: {
      location: ['invoke.receipt', 'status.receipt', 'status.result.receipt', 'recover.receipt'],
      referenceField: 'receipt.receiptRef',
      identityFields: ['providerQuotedAmount', 'agenticEconomyFee', 'totalBuyerAuthorization', 'network', 'asset'],
    },
    ownerContinuations: OWNER_BROWSER_CONTINUATIONS,
    anonymous: {
      authentication: 'none',
      routes: operationReads.map(({ route, action }) => ({
        method: route.method,
        path: route.pathTemplate,
        actionId: action.id,
        contractVersion: action.invocationContract.version,
        ...(action.inputJsonSchema === undefined ? {} : { inputJsonSchema: action.inputJsonSchema }),
        ...(action.outputJsonSchema === undefined ? {} : { outputJsonSchema: action.outputJsonSchema }),
      })),
      operationReads,
    },
    gateway: {
      authentication: 'Bearer AE_API_KEY (bound to AE_API_KEY_ORIGIN)',
      scope: OPERATION_INVOKE_ROUTE_CONTRACT.scope,
      media: OPERATION_INVOKE_ROUTE_CONTRACT.media,
      headers: OPERATION_INVOKE_ROUTE_CONTRACT.headers,
      routes: gateway,
      idempotency: {
        commandField: 'idempotencyKey',
        commandFieldRequired: true,
        location: 'body.idempotencyKey',
        requiredFor: ['operation.invoke', 'operation.cancel', 'operation.reconcile'],
        replay: 'same_material_returns_exact_original_result',
        conflict: 'changed_material_refused_as_idempotency_conflict',
        uncertain: 'recover_only_after_a_real_uncertain_outcome',
      },
      outcomes: {
        action: describedAction(OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId).outputJsonSchema,
        values: operationInvokeResultKindValues,
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
          usage: 'The CLI sends the stored origin-bound key for call, status, cancel, and recover. AE_API_KEY remains an explicit automation override.',
        },
        revocation: 'Root revoke emits the owner-browser continuation /agent-access#revoke; it does not revoke through an agent credential or an API route.',
        oneTimeSecretDelivery: false,
      },
      credentialBoundary: 'AE resolves provider, endpoint, connection, supplier credential, price, authority, and evidence server-side.',
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
      connectCommand: 'ae connect --supplier',
      issuanceBoundary: 'Supplier authority is a separate owner-approved credential profile; the ordinary ae connect buyer flow remains buyer-only.',
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
      status: 'Durable status may return exact usage and evidence projections admitted by the operation runtime.',
      recovery: {
        actionId: OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId,
        example: RECOVERY_EVIDENCE_EXAMPLE,
        digestMaterialRule: 'Compute canonicalDigest over all evidence fields except digest; include every other present field, including optional fields, exactly once and do not include the outer command wrapper.',
        invocationRefIdentityRule: 'The recover command invocationRef argument, evidence.invocationRef, and canonical invocationRef returned by invoke/status must be byte-for-byte identical; operationRef, attemptRef, and idempotencyKey are not substitutes.',
      },
      unknown: 'A transport timeout is not a terminal outcome; inspect status and use recover only when the outcome remains genuinely uncertain, supplying canonical evidence and the same invocation and idempotency references. Recover reconciles evidence; it does not replay a known result.',
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
    coldLoop: ['search', 'inspect', 'call', 'receipt', 'reuse'],
    access: {
      anonymous: 'Search, inspect, and compare current Operations without connecting.',
      connected: 'Run ae connect once; authenticated invocation covers free and paid operations, and consequential operations require approval.',
    },
    account: {
      command: 'ae account status [market|supplier]',
      balance: 'ae account balance [currency]',
      activity: 'ae account activity [currency] [--limit <1-100>] [--cursor <cursor>]',
      connections: 'ae account connections',
      disconnect: 'ae account disconnect',
    },
    supply: {
      connect: 'ae connect --supplier',
      status: 'ae supply status <businessId> [offeringRef]',
      connections: 'ae supply connections <businessId>',
      connection: 'ae supply connection <connectionRef>',
      authority: 'Requires a separately owner-approved market_supply:manage credential; buyer and supplier profiles remain independent.',
    },
    routes: operationReads.map(({ route, action }) => ({
      relation: route.relation,
      method: route.method,
      path: route.pathTemplate,
      actionId: action.id,
    })),
    call: {
      command: "ae call <operationRef> --input '<json>'",
      connected: {
        command: 'ae connect',
        transport: 'operation.invoke:v1',
        authentication: 'Bearer AE_API_KEY (bound to AE_API_KEY_ORIGIN)',
        receipt: 'Every accepted gateway call returns or progresses toward one invocation receipt.',
      },
    },
    recovery: {
      history: 'ae history [--state <state>]',
      status: 'ae status <invocationRef>',
      rule: 'If the outcome is uncertain, read status before any retry and preserve the same identity.',
    },
    fullContract: 'ae manifest --technical --json',
  })
}
