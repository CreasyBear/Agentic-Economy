import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST } from '@/modules/agent-access/contract'
import {
  findAction,
  listMcpActions,
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
    path: '/agent-access',
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
  search: { summary: 'Search current public Market Operations for a job.', args: '<job> [--limit <1-20>] [--cursor <cursor>] [--filters \'<json>\'>', json: true },
  inspect: { summary: 'Read one exact current Market Operation before connecting or invoking.', args: '<operationRef>', json: true },
  compare: { summary: 'Compare one to four exact current Operation references.', args: '<operationRef> [<operationRef> ...]', json: true },
  'inspect-plan': { summary: 'Inspect a bounded operation plan from one to four exact current Operation references.', args: '<operationRef> [operationRef ...]', json: true },
  connect: { summary: 'Register a public device client or validate the configured AE key.', args: '', json: true },
  fund: {
    summary: 'Continue to owner funding controls in the authenticated browser surface; this command never funds.',
    args: '',
    json: true,
    guidance: ['Open the returned /agent-access#fund continuation as the owner. No agent credential is used.'],
  },
  call: { summary: 'Call one available capability through the authenticated AE gateway.', args: "<operationRef> --input '<json>' [--wait]", json: true },
  status: { summary: 'Read one authenticated invocation status and evidence projection.', args: '<invocationRef>', json: true },
  cancel: { summary: 'Cancel one authenticated invocation explicitly.', args: '<invocationRef> --idempotency-key <key>', json: true },
  recover: {
    summary: 'Reconcile a genuinely uncertain invocation with canonical evidence after a real uncertain outcome; this is not a replay.',
    args: "<invocationRef> '<evidence-json>' --idempotency-key <key>",
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

function directKeylessManifest() {
  const action = listMcpActions().find((candidate) => candidate.id === 'operation.execute')
  if (action === undefined) throw new Error('Manifest action is not registered on the anonymous MCP surface: operation.execute')
  if (!action.readOnly || action.credentialAdmission !== undefined) {
    throw new Error('Manifest operation.execute action is not anonymous and read-only')
  }
  const described = describeActionForAgent(action)
  return {
    action: described.id,
    contractVersion: action.invocationContract.version,
    invocationContract: action.invocationContract,
    mcpTool: mcpToolName(action),
    authentication: 'none' as const,
    requiresOperationRef: true as const,
    ...(described.inputJsonSchema === undefined ? {} : { inputJsonSchema: described.inputJsonSchema }),
    ...(described.outputJsonSchema === undefined ? {} : { outputJsonSchema: described.outputJsonSchema }),
  }
}

/**
 * `npm run -s ae -- manifest [--json]` — the external-agent handshake. The front door is the
 * canonical Operation search/inspection/invocation/recovery contract, not a
 * second legacy catalog or generic action inventory.
 */
export async function runManifestCommand(_args: readonly string[], _options: CliOptions): Promise<void> {
  const operationReads = OPERATION_MARKET_ACTION_ENTRIES.map((route) => ({
    route,
    action: describedAction(route.actionId),
  }))
  const gateway = listOperationRouteDescriptors().map((route) => ({
    route,
    action: describedAction(route.actionId),
  }))
  const directKeyless = directKeylessManifest()

  printJson({
    $schema: 'https://agentic-economy/market-terminal/manifest:v3',
    protocol: 'agentic-economy.operation-terminal.v1',
    about: 'Discover exact current work, inspect terms, connect one agent key, call idempotently, preserve the receipt, and reuse successful work.',
    commands: COMMANDS,
    coldLoop: ['search', 'inspect', 'connect', 'call', 'receipt', 'reuse'],
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
    directKeyless,
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
  })
}
