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
  const anonymousToolNames = listMcpActions().flatMap((action) =>
    action.readOnly && action.credentialAdmission === undefined ? [mcpToolName(action)] : [],
  )
  const operationMcpToolNames = [...authenticatedToolNames]
  const invokeInputExample = JSON.stringify(invoke.example.actionInput)
  const invokeHttpExample = JSON.stringify(invoke.example.http.body ?? {})
  const invokeInputSchema = JSON.stringify(invoke.route.inputJsonSchema ?? {})
  const operationOutcomes = operationInvokeResultKindValues.join(' | ')
  const operationStatusStates = operationInvokeStatusStateValues.join(' | ')
  const cli = 'ae'
  return [
    '---',
    'name: agentic-economy',
    'description: Read the compact AE handshake, search and inspect current Operations, call eligible free keyless reads anonymously, and connect only when the selected capability requires it.',
    '---',
    '',
    '# Agentic Economy — Operation market loop',
    '',
    '## 1. Read the raw handshake (no install)',
    '',
    `\`curl -fsSL ${base}/.well-known/ucp\``,
    '',
    'Install the compiled CLI only when local execution is needed, then inspect the same contract with:',
    '```sh',
    'npm install --global @agentic-economy/cli',
    `export AE_CLI_BASE_URL="${base}"`,
    `${cli} manifest --json`,
    '```',
    '',
    '',
    '## 2. Search by job — anonymous',
    '',
    '```sh',
    `curl -sS '${base}${OPERATION_MARKET_SEARCH_PATH}' -H 'content-type: application/json' --data '{"query":"weather forecast","limit":5}'`,
    '```',
    '',
    'CLI:',
    '```sh',
    `${cli} search "weather forecast" --json`,
    '```',
    '',
    `HTTP: \`POST ${base}${OPERATION_MARKET_SEARCH_PATH}\`. This read needs no account or caller key.`,
    '',
    '## 3. Inspect one exact Operation — anonymous',
    '',
    '```sh',
    `curl -sS '${base}${OPERATION_MARKET_DETAIL_PATH}' -H 'content-type: application/json' --data '{"operationRef":"operation:v1:…"}'`,
    '```',
    '',
    'Source-checkout helper:',
    '```sh',
    `${cli} inspect "$AE_OPERATION_REF" --json`,
    '```',
    '',
    `HTTP detail: \`POST ${base}${OPERATION_MARKET_DETAIL_PATH}\`. Read the current input schema, terms, price, effects, availability, and evidence before connecting or invoking.`,
    `Optional anonymous reads: \`${cli} compare "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json\` or \`POST ${base}${OPERATION_MARKET_COMPARE_PATH}\`; inspect a proposed plan with \`${cli} inspect-plan "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json\` or \`POST ${base}${OPERATION_MARKET_INSPECT_PLAN_PATH}\`.`,

    '`executionModes.directKeyless` is not a guarantee for every Operation. The compiled `ae call` command uses the official MCP client only when the server revalidates the Operation as free, keyless, read-only, and routeable. On `agent_access_key_required`, connect once and repeat the same call through `operation.invoke`.',
    OperationMarketAnonymousBoundaryLine,
    '',
    '## 4. Try the capability; connect only when required',
    '',
    '```sh',
    `${cli} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --json`,
    '```',
    '',
    'Eligible free keyless read Operations run anonymously through the official MCP client and return literal output plus an `evidenceHash`. If the CLI returns `agent_access_key_required`, connect once:',
    '',
    '```sh',
    `${cli} connect --json`,
    '```',
    '',
    `Device flow: \`POST ${base}${AGENT_ACCESS_OAUTH_PATHS.register}\` → \`POST ${base}${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization}\` → owner approval at \`${base}${AGENT_ACCESS_OAUTH_PATHS.deviceVerification}?user_code=...\` → \`POST ${base}${AGENT_ACCESS_OAUTH_PATHS.token}\`. An existing \`AE_API_KEY\` is validated; a nonempty string is not proof.`,
    '',
    'The AE key identifies the caller. It never contains or grants a provider credential, endpoint override, payment approval, or silent consequential authority.',
    `Use \`${cli} connect --mcp\` to write an importable Streamable HTTP MCP connection alongside the origin-bound key.`,
    '',
    '## 5. Authenticated gateway details',
    '',
    '```sh',
    `${cli} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --json`,
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
    '## Safe recovery',
    '',
    `Use \`${cli} cancel\` only when the current receipt offers cancellation. Use \`${cli} recover\` only when that receipt requires reconciliation.`,
    '',
    '## MCP projection',
    '',
    `Endpoint: \`${base}/mcp\`. Anonymous tools: ${anonymousToolNames.map((name) => `\`${name}\``).join(', ') || 'none'}. Authenticated tools: ${operationMcpToolNames.map((name) => `\`${name}\``).join(', ') || 'none'}.`,
    'MCP follows the same order and boundaries. Static tool names do not enumerate live Operations.',
    `Official MCP SDK lifecycle (protocol \`${MCP_LATEST_PROTOCOL_VERSION}\`): connect to \`${base}/mcp\` (the client performs initialization); the server is stateless and may omit \`Mcp-Session-Id\`; call \`tools/list\` before \`tools/call\`; close the client transport. Malformed JSON-RPC requests return protocol errors, while valid tool calls with invalid tool arguments return \`isError\` tool results.`,
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
