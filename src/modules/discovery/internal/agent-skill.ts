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
  const operationOutcomes = operationInvokeResultKindValues.join(' | ')
  const operationStatusStates = operationInvokeStatusStateValues.join(' | ')
  const cli = 'ae'
  return [
    '---',
    'name: agentic-economy',
    'description: Pick your entry, search and inspect live Operations, call eligible keyless reads free, and connect only when the selected capability requires it.',
    '---',
    '',
    '# Agentic Economy — Operation market loop',
    '',
    '## 1. Pick your path',
    '',
    '**AE tools visible in your harness?** Their names begin with `ae_` — registry search, detail, and compare read Operations anonymously and free, so call them directly; invoke/status tools work after one connection.',
    '',
    '**Not connected yet?**',
    '',
    '```sh',
    `curl -fsSL ${base}/.well-known/ucp`,
    '```',
    '',
    `Read \`${base}/llms.txt\`, then \`${base}/for-agents\`. Install the CLI only for local execution:`,
    '```sh',
    'npm install --global @agentic-economy/cli',
    `export AE_CLI_BASE_URL="${base}"`,
    `${cli} manifest --json`,
    '```',
    '',
    'If neither entry fits your job, tell your human what you needed.',
    '',
    '## Supplier path',
    '',
    `Owner setup starts at \`${base}/for-providers\`, then:`,
    '```sh',
    `${cli} connect --supplier --json`,
    `${cli} doctor "$AE_BUSINESS_ID" --supplier --json`,
    '```',
    'Operation: one job. Preserve identity and revisions; never submit provider keys or count setup tests as earnings.',
    '',
    '## 2. Price rule — before any paid call',
    '',
    'Inspect the Operation, state the total price and the required inputs to your human, and wait for their approval.',
    '',
    '## 3. Search by job — anonymous',
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
    `HTTP: \`POST ${base}${OPERATION_MARKET_SEARCH_PATH}\`. No account or key.`,
    `No candidates? If connected: \`${cli} request create "<job>"\`, then \`${cli} request status <ref>\`. This gap is not a task, tender, message, or Operation.`,
    '',
    '## 4. Inspect one exact Operation — anonymous',
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
    `Optional anonymous reads: \`${cli} compare\` / \`${cli} inspect-plan\` mirror \`POST ${base}${OPERATION_MARKET_COMPARE_PATH}\` and \`POST ${base}${OPERATION_MARKET_INSPECT_PLAN_PATH}\`.`,

    '`operation.invoke` runs through the authenticated gateway only. Connect once with AE, then invoke; price may be zero, and consequential Operations require explicit authority approval.',
    OperationMarketAnonymousBoundaryLine,
    '',
    '## 5. Try the capability; connect only when required',
    '',
    '```sh',
    `${cli} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --json`,
    '```',
    '',
    'Eligible free keyless reads run anonymously through official MCP and return literal output plus an `evidenceHash`. On `agent_access_key_required`, connect once:',
    '',
    '```sh',
    `${cli} connect --json`,
    '```',
    '',
    `Device flow: \`POST ${base}${AGENT_ACCESS_OAUTH_PATHS.register}\` → \`POST ${base}${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization}\` → approve \`${base}${AGENT_ACCESS_OAUTH_PATHS.deviceVerification}?user_code=...\` → \`POST ${base}${AGENT_ACCESS_OAUTH_PATHS.token}\`. Existing \`AE_API_KEY\` values are validated; nonempty is not proof.`,
    '',
    'The AE key identifies the caller. It never contains or grants a provider credential, endpoint override, payment approval, or silent consequential authority.',
    `Use \`${cli} connect --mcp\` to write an importable Streamable HTTP MCP connection alongside the origin-bound key.`,
    '',
    '## 6. Authenticated gateway details',
    '',
    `HTTP: \`${invoke.route.method} ${base}${invoke.route.path}\` with \`Authorization: Bearer $AE_API_KEY\`, \`Content-Type: ${OPERATION_INVOKE_ROUTE_CONTRACT.media.request}\`, and only schema-valid material in the body.`,
    OperationMarketInvokeScopeLine,
    `Schema-valid action input example: \`${invokeInputExample}\`. HTTP POST body example: \`${invokeHttpExample}\`. The canonical input JSON schema ships in every Operation detail response.`,
    `The request JSON body field \`idempotencyKey\` is required. ${OperationMarketIdempotencyLine} The same key with identical material replays the original state; changed material is refused.`,
    'Never send a provider, URL, method, credential, price, payment recipient, or approval.',
    '',
    '## 7. Wait for the recorded result',
    '',
    '```sh',
    `${cli} wait "$AE_INVOCATION_REF" --json`,
    '```',
    '',
    `\`${cli} wait\` reads \`${status.route.method} ${base}${status.route.path}\` until a result or timeout; it cannot call, retry, or grant authority. \`${cli} status "$AE_INVOCATION_REF" --json\` reads once. Outcomes (\`result.kind\`): \`${operationOutcomes}\`. Diagnostics (\`found.state\`): \`${operationStatusStates}\`.`,
    '',
    '## 8. Recover uncertain work',
    '',
    '```sh',
    `${cli} recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json`,
    '```',
    '',
    `Recovery submits bounded evidence through \`${reconcile.route.method} ${base}${reconcile.route.path}\`. Use the same invocation and original stable key.`,
    '',
    '## If credit runs short',
    '',
    `A paid invocation refused with \`insufficient_credit\` (\`retryable: false\`) ran nothing; never auto-retry it. Tell your human the balance is short and direct them to add credit at ${base}/owner/credit, then resubmit the same inputs once funded.`,
    '',
    '## Problem responses and retry rules',
    '',
    '- Errors are `application/problem+json` with `type`, `title`, `status`, `kind`, `code`, and optional `retryable`.',
    '- If `retryable` is true, respect `Retry-After` when present and retry only the same material command identity.',
    '- A timeout, `outcome_unknown`, or `reconciliation_required` is not a terminal success and is not permission to create a new invocation; read status, then recover.',
    '- Do not retry authentication, validation, authority, or idempotency-conflict problems without changing the invalid input or authority state.',
    '',
    '## MCP projection',
    '',
    `Endpoint: \`${base}/mcp\`. Anonymous tools: ${anonymousToolNames.map((name) => `\`${name}\``).join(', ') || 'none'}. Authenticated tools: ${operationMcpToolNames.map((name) => `\`${name}\``).join(', ') || 'none'}.`,
    'Static tool names do not enumerate live Operations.',
    `Official MCP SDK lifecycle (protocol \`${MCP_LATEST_PROTOCOL_VERSION}\`): connect to \`${base}/mcp\` (the client performs initialization); the server is stateless and may omit \`Mcp-Session-Id\`; call \`tools/list\` before \`tools/call\`; close the client transport.`,
    '',
    '## Business catalog is business-only',
    '',
    `\`${registeredActionId('registry.search')}\` and \`${registeredActionId('registry.detail')}\` read published businesses; they do not authorize execution. Only an admitted, published Operation is callable.`,
    '',
    '## Stop rules',
    '',
    '- Stop when an exact current Operation is unavailable or its terms, required input, price, effects, or evidence are unclear.',
    '- Stop on `needs_authority`; only the owner-controlled flow can grant the requested authority.',
    '- On `pending`, wait on the recorded invocation or read one status snapshot. On `reconciliation_required`, recover the same invocation before any retry.',
    '- Never infer fulfilment, payment, deployment, or a receipt from discovery, a key, a balance, or a request accepted for processing.',
    '- Cancel only when the receipt offers cancellation; recover only when it requires reconciliation.',
    '',
    '## What counts as proof',
    '',
    'A job closes only on evidence a response actually returned: anonymous reads carry literal output plus an `evidenceHash`, and invocation results expose usage or evidence fields only when recorded for that result.',
    'Without that evidence the job stays unproven — say so rather than claiming success.',
  ].join('\n')
}


function registeredActionId(actionId: string): string {
  const action = findAction(actionId)
  if (action === undefined) throw new Error(`Action is not registered: ${actionId}`)
  return action.id
}
