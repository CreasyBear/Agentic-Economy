import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { operationInvokeResultKindValues } from '@/modules/capability-execution/operation-invoke-contracts'
import { operationInvokeStatusStateValues } from '@/modules/capability-execution/operation-recovery-contracts'
import {
  AGENT_ACCESS_OAUTH_PATHS,
} from '@/modules/agent-access/oauth-state'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { operationRouteExamples } from './operation-contract'
import {
  OperationMarketAnonymousBoundaryLine,
  OperationMarketIdempotencyLine,
  OperationMarketInvokeScopeLine,
} from './offering-discovery-file'
import { findAction, listMcpActions, mcpToolName } from '@/modules/actions'
import {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/registry/operation-entry'

export const PublicAgentSkillPath = '/SKILL.md' as const

export function buildPublicAgentSkillMarkdown(options: {
  canonicalBaseUrl: string
  routingBaseUrl?: string
}): string {
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  const routes = operationRouteExamples()
  const routeFor = (actionId: string) => {
    const route = routes.find((candidate) => candidate.route.actionId === actionId)
    if (route === undefined) throw new Error(`Operation route is not registered: ${actionId}`)
    return route
  }
  const invoke = routeFor(OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId)
  const status = routeFor(OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId)
  const reconcile = routeFor(OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId)
  const authenticatedToolNames = new Set(routes.map(({ route }) => route.mcpToolName).filter((name): name is string => name !== undefined))
  const anonymousToolNames = listMcpActions()
    .filter((action) => action.readOnly && action.credentialAdmission === undefined)
    .map(mcpToolName)
  const operationMcpToolNames = [...authenticatedToolNames]
  const invokeInputExample = JSON.stringify(invoke.example.actionInput)
  const invokeHttpExample = JSON.stringify(invoke.example.http.body ?? {})
  const invokeInputSchema = JSON.stringify(invoke.route.inputJsonSchema ?? {})
  const operationOutcomes = operationInvokeResultKindValues.join(' | ')
  const operationStatusStates = operationInvokeStatusStateValues.join(' | ')
  const cli = 'npm run -s ae --'
  return [
    '---',
    'name: agentic-economy',
    'description: Read the raw AE handshake, search and inspect current Market Operations anonymously, then invoke and recover work through one authenticated caller boundary.',
    '---',
    '',
    '# Agentic Economy — Operation market loop',
    '',
    '## 1. Read the raw handshake (no install)',
    '',
    `\`curl -fsSL ${base}/.well-known/ucp\``,
    '',
    'Install the repository package only when local execution is needed, then inspect the same contract with:',
    '```sh',
    `${cli} manifest --json`,
    '```',
    '',
    '',
    '## 2. Search by job — anonymous',
    '',
    '```sh',
    `${cli} search "extract line items from a supplier invoice" --json`,
    '```',
    '',
    `HTTP: \`POST ${base}${OPERATION_MARKET_SEARCH_PATH}\`. This read needs no account or caller key.`,
    '',
    '## 3. Inspect one exact Operation — anonymous',
    '',
    '```sh',
    `${cli} inspect "$AE_OPERATION_REF" --json`,
    '```',
    '',
    `HTTP detail: \`POST ${base}${OPERATION_MARKET_DETAIL_PATH}\`. Read the current input schema, terms, price, effects, availability, and evidence before connecting or invoking.`,
    `Optional anonymous reads: \`${cli} compare "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json\` or \`POST ${base}${OPERATION_MARKET_COMPARE_PATH}\`; inspect a proposed plan with \`${cli} inspect-plan "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json\` or \`POST ${base}${OPERATION_MARKET_INSPECT_PLAN_PATH}\`.`,

    'After exact detail, choose one execution mode: the global `executionModes.directKeyless` entry describes an optional capability, not a guarantee for every Operation. Use the anonymous MCP tool `ae_operation_execute` (action `operation.execute`) only when that exact current detail includes a navigation relation with `relation: "execute"`, `actionId: "operation.execute"`, `authentication: "none"`, and routeable availability; then pass the exact `operationRef` and only the published `input` fields. Otherwise continue to connect and use the authenticated `operation.invoke` path below for the controlled market flow. Never substitute one path for the other.',
    OperationMarketAnonymousBoundaryLine,
    '',
    '## 4. Connect one AE caller key',
    '',
    '```sh',
    `${cli} connect --json`,
    '```',
    '',
    `The command registers a public device client at \`POST ${base}${AGENT_ACCESS_OAUTH_PATHS.register}\`, starts the device flow at \`POST ${base}${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization}\`, sends the owner to \`${base}${AGENT_ACCESS_OAUTH_PATHS.deviceVerification}?user_code=...\`, and polls \`POST ${base}${AGENT_ACCESS_OAUTH_PATHS.token}\`. If \`AE_API_KEY\` is already present, the command validates it against the authenticated gateway before reporting connected; a nonempty string alone is never proof.`,
    '',
    'The AE key identifies the caller. It never contains or grants a provider credential, endpoint override, payment approval, or silent consequential authority.',
    '',
    '## 5. Invoke with one required stable idempotency key',
    '',
    '```sh',
    'export AE_IDEMPOTENCY_KEY="invoice-extract-2026-08-11-001"',
    `${cli} invoke "$AE_OPERATION_REF" "$AE_INPUT_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json`,
    '```',
    '',
    `HTTP: \`${invoke.route.method} ${base}${invoke.route.path}\` with \`Authorization: Bearer $AE_API_KEY\`, \`Content-Type: ${OPERATION_INVOKE_ROUTE_CONTRACT.media.request}\`, and only schema-valid material in the body.`,
    OperationMarketInvokeScopeLine,
    `Canonical action input schema: \`${invokeInputSchema}\`. Schema-valid action input example: \`${invokeInputExample}\`. HTTP POST body example: \`${invokeHttpExample}\`.`,
    `The request JSON body field \`idempotencyKey\` is required. ${OperationMarketIdempotencyLine} The same key with identical material replays the original state; changed material is refused.`,
    'Never send a provider, URL, method, credential, price, payment recipient, or approval.',
    '',
    '## 6. Read status',
    '',
    '```sh',
    `${cli} status "$AE_INVOCATION_REF" --json`,
    '```',
    '',
    `HTTP: \`${status.route.method} ${base}${status.route.path}\`. Only \`result.kind\` is the operation outcome when present: \`${operationOutcomes}\`. A status response's \`found.state\` is a recovery diagnostic, not an extra operation outcome: \`${operationStatusStates}\`. Usage or evidence fields are authoritative only when present on this invocation's recorded result.`,
    '',
    '## 7. Recover uncertain work',
    '',
    '```sh',
    `${cli} recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json`,
    '```',
    '',
    `Recovery submits bounded evidence through \`${reconcile.route.method} ${base}${reconcile.route.path}\`. Use the same invocation and original stable key. Never create a replacement invocation or retry automatically while release may have started.`,
    '',
    '## Problem responses and retry rules',
    '',
    '- Errors are `application/problem+json` with `type`, `title`, `status`, `kind`, `code`, and optional `retryable`.',
    '- If `retryable` is true, respect `Retry-After` when present and retry only the same material command identity.',
    '- A timeout, `outcome_unknown`, or `reconciliation_required` is not a terminal success and is not permission to create a new invocation; read status, then recover.',
    '- Do not retry authentication, validation, authority, or idempotency-conflict problems without changing the invalid input or authority state.',
    '',
    '## Advanced only',
    '',
    `Cancellation is an advanced operator action; use \`${cli} advanced cancel\` only when the manifest and current status direct you there. Use the root \`${cli} recover\` command for reconciliation.`,
    '',
    '## MCP projection',
    '',
    `Endpoint: \`${base}/mcp\`. Anonymous tools: ${anonymousToolNames.map((name) => `\`${name}\``).join(', ') || 'none'}. Authenticated tools: ${operationMcpToolNames.map((name) => `\`${name}\``).join(', ') || 'none'}.`,
    'MCP follows the same order and boundaries. Static tool names do not enumerate live Operations.',
    `Installed MCP SDK lifecycle (protocol \`${MCP_LATEST_PROTOCOL_VERSION}\`): connect to \`${base}/mcp\`; complete \`initialize\` then \`notifications/initialized\`; call \`tools/list\` before \`tools/call\`; close the transport.`,
    '',
    '## Business catalog is business-only',
    '',
    `\`${registeredActionId('registry.search')}\` and \`${registeredActionId('registry.detail')}\` read published businesses and offering portfolios; they neither authorize execution nor create an Agent Service. One admitted Market Operation is one Agent Service; inspect those through \`registry.operations.*\`.`,
    '',
    '## Stop rules',
    '',
    '- Stop when an exact current Operation is unavailable or its terms, required input, price, effects, or evidence are unclear.',
    '- Stop on `needs_authority`; only the owner-controlled flow can grant the requested authority.',
    '- On `pending`, read status. On `reconciliation_required`, recover the same invocation before any retry.',
    '- Never infer fulfilment, payment, deployment, or a receipt from discovery, a key, a balance, or a request accepted for processing.',
    '',
  ].join('\n')
}


function registeredActionId(actionId: string): string {
  const action = findAction(actionId)
  if (action === undefined) throw new Error(`Action is not registered: ${actionId}`)
  return action.id
}
