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
import { operationInvokeResultKindValues } from '@/modules/capability-execution/operation-invoke'
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

const COMMANDS = {
  manifest: { summary: 'Read this machine-readable Operation terminal contract.', args: '', json: true },
  search: { summary: 'Search current public Market Operations for a job.', args: '<job>', json: true },
  inspect: { summary: 'Read one exact current Market Operation before connecting or invoking.', args: '<operationRef>', json: true },
  compare: { summary: 'Compare two to four exact current Operation references.', args: '<operationRef> <operationRef> [operationRef ...]', json: true },
  connect: { summary: 'Register a public device client or validate the configured AE key.', args: '', json: true },
  invoke: { summary: 'Invoke an admitted Market Operation through the authenticated AE gateway.', args: "<operationRef> '<json>' --idempotency-key <key> [--wait]", json: true },
  status: { summary: 'Read one authenticated invocation status and evidence projection.', args: '<invocationRef>', json: true },
  recover: { summary: 'Recover one uncertain invocation with evidence and a stable key.', args: "<invocationRef> '<evidence-json>' --idempotency-key <key>", json: true },
  advanced: {
    summary: 'Operator-only actions; not part of the root cold path.',
    commands: {
      cancel: { summary: 'Cancel one authenticated invocation explicitly.', args: '<invocationRef> --idempotency-key <key>', json: true },
    },
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
    action: action.id,
    mcpTool: mcpToolName(action),
    authentication: 'none' as const,
    requiresOperationRef: true as const,
    ...(described.inputJsonSchema === undefined ? {} : { inputJsonSchema: described.inputJsonSchema }),
    invocationContract: action.invocationContract,
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
    about: 'AE-native Operation loop: discover exact current work, inspect terms, compare or inspect a plan, connect one AE key, invoke idempotently, observe durable status, and recover uncertain outcomes.',
    commands: COMMANDS,
    coldLoop: ['manifest', 'search', 'inspect', 'compare', 'connect', 'invoke', 'status', 'recover'],
    anonymous: {
      authentication: 'none',
      routes: operationReads.map(({ route }) => ({
        method: route.method,
        path: route.pathTemplate,
        actionId: route.actionId,
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
        replay: 'same_material_returns_original_state',
        conflict: 'changed_material_refused',
        uncertain: 'recover_before_retry',
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
          { order: 5, action: 'Set AE_API_KEY to access_token and AE_API_KEY_ORIGIN to the exact server origin printed by connect.' },
        ],
        existingKey: 'When AE_API_KEY is already set, connect validates it before issuing another credential; AE_API_KEY_ORIGIN must parse and exactly match the configured server origin before Authorization is sent.',
        apiKey: {
          environmentVariable: 'AE_API_KEY',
          originEnvironmentVariable: 'AE_API_KEY_ORIGIN',
          originBinding: 'AE_API_KEY_ORIGIN must equal new URL(--base-url).origin; credentialed calls require HTTPS except loopback HTTP development.',
          result: 'OAuth token.access_token',
          usage: 'Send Authorization: Bearer <AE_API_KEY> for invoke, status, and recover only after validating AE_API_KEY_ORIGIN.',
        },
        revocation: 'Revocation is not currently a CLI action.',
        oneTimeSecretDelivery: true,
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
      unknown: 'A transport timeout is not a terminal outcome; inspect status and recover with the same invocation and idempotency references.',
    },
  })
}
