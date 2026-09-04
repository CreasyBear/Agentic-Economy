import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'
import {
  AE_MCP_WHOAMI_TOOL_NAME,
  aeMcpAuthenticateInstruction,
  aeMcpInstallCommand,
} from '@/lib/cli-distribution'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { operationInvokeResultKindValues } from '@/modules/capability-execution/operation-invoke-contracts'
import { operationInvokeStatusStateValues } from '@/modules/capability-execution/operation-recovery-contracts'
import { OPERATION_INSPECT_ACTION_ID } from '@/modules/capability-execution/operation-commitment'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { operationRouteExamples } from './operation-contract'
import {
  OperationMarketAnonymousBoundaryLine,
  OperationMarketIdempotencyLine,
  OperationMarketInvokeScopeLine,
} from './offering-discovery-file'
import { listMcpActions, mcpToolName } from '@/modules/actions'
import {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DESCRIBE_PATH,
  OPERATION_MARKET_LIST_PATH,
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
  const inspect = routeFor(OPERATION_INSPECT_ACTION_ID)
  const status = routeFor(OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId)
  const reconcile = routeFor(OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId)
  const authenticatedToolNames = new Set(routes.map(({ route }) => route.mcpToolName).filter((name): name is string => name !== undefined))
  const anonymousToolNames = listMcpActions().flatMap((action) =>
    action.readOnly && action.credentialAdmission === undefined ? [mcpToolName(action)] : [],
  )
  const searchAction = listMcpActions().find((action) => action.id === 'registry.operations.search')
  if (searchAction === undefined) throw new Error('Operation search action is not registered')
  const searchToolName = mcpToolName(searchAction)
  const operationMcpToolNames = [...authenticatedToolNames]
  const invokeHttpExample = JSON.stringify(invoke.example.http.body ?? {})
  const operationOutcomes = operationInvokeResultKindValues.join(' | ')
  const operationStatusStates = operationInvokeStatusStateValues.join(' | ')
  const cli = 'ae'
  return [
    '---',
    'name: agentic-economy',
    'description: Search public Operations, inspect exact caller-specific terms, then invoke with a Commitment.',
    '---',
    '',
    '# Agentic Economy — Operation market loop',
    '',
    '## 1. Search first — no connection required',
    '',
    `Use \`${searchToolName}\` or:`,
    '```sh',
    `${cli} search "weather forecast" --json`,
    '```',
    '',
    'Optional browse and detail:',
    '```sh',
    `${cli} list --json`,
    `${cli} describe "$AE_OPERATION_REF" --json`,
    '```',
    `Catalog health and price are indicative. HTTP: \`POST ${base}${OPERATION_MARKET_SEARCH_PATH}\`, \`POST ${base}${OPERATION_MARKET_LIST_PATH}\`, \`POST ${base}${OPERATION_MARKET_DESCRIBE_PATH}\`, and \`POST ${base}${OPERATION_MARKET_COMPARE_PATH}\`.`,
    '',
    '## 2. Inspect exact terms',
    '',
    `Call \`${inspect.route.mcpToolName}\` with the exact Operation and input, or \`${inspect.route.method} ${base}${inspect.route.path}\`. If challenged, use the native entry for the current client, then repeat the same inspection.`,
    '',
    'Codex:',
    '```sh',
    aeMcpInstallCommand(base, 'codex'),
    '```',
    aeMcpAuthenticateInstruction('codex'),
    '',
    'Claude Code:',
    '```sh',
    aeMcpInstallCommand(base, 'claude-code'),
    '```',
    aeMcpAuthenticateInstruction('claude-code'),
    '',
    'Cursor:',
    '```sh',
    aeMcpInstallCommand(base, 'cursor'),
    '```',
    aeMcpAuthenticateInstruction('cursor'),
    '',
    `OAuth returns to the same task. Then call \`${AE_MCP_WHOAMI_TOOL_NAME}\`; this authenticated account read confirms the connection. Report the connected Agent Principal and Account. Do not request or paste an AE API key.`,
    '',
    '## Supplier path',
    '',
    `Owner setup starts at \`${base}/for-providers\`. Preview a native source, select one candidate, submit once, then read its durable status:`,
    '```sh',
    `${cli} connect --supplier --json`,
    `${cli} supply preview --input "$AE_SOURCE_JSON" --json`,
    `${cli} supply publish --input "$AE_PUBLICATION_JSON" --json`,
    `${cli} supply status "$AE_BUSINESS_REF" "$AE_OPERATION_REF" --json`,
    '```',
    'Never put Provider credentials in MCP fields or CLI arguments. A required action opens the no-store owner handoff.',
    '',
    '## 3. Review and invoke',
    '',
    'A committed inspection contains the exact price, normalized input, current authority and balance, and an expiring Commitment. State the price and required input to the human before a paid call.',
    'Price may be zero; consequential Operations still require explicit authority approval.',
    OperationMarketAnonymousBoundaryLine,
    '',
    '```sh',
    `${cli} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --json`,
    '```',
    '',
    `The CLI command is a composite that inspects, then invokes with the returned Commitment. Direct CLI callers run \`${cli} connect --json\` only when challenged.`,
    'The AE key identifies the caller. It never contains or grants a provider credential, endpoint override, payment approval, or silent consequential authority.',
    '## 4. Gateway details',
    '',
    `HTTP: \`${invoke.route.method} ${base}${invoke.route.path}\` with \`Authorization: Bearer $AE_API_KEY\`, \`Content-Type: ${OPERATION_INVOKE_ROUTE_CONTRACT.media.request}\`, and only schema-valid material in the body.`,
    OperationMarketInvokeScopeLine,
    `Body example: \`${invokeHttpExample}\`. The canonical input schema ships in Operation describe.`,
    `The request JSON body field \`idempotencyKey\` is required. ${OperationMarketIdempotencyLine} The same key with identical material replays the original state; changed material is refused.`,
    'Never send a provider, URL, method, credential, price, payment recipient, or approval.',
    '',
    '## 5. Wait for the recorded result',
    '',
    '```sh',
    `${cli} wait "$AE_INVOCATION_REF" --json`,
    '```',
    '',
    `\`${cli} wait\` reads \`${status.route.method} ${base}${status.route.path}\` until a result or timeout; it cannot call, retry, or grant authority. \`${cli} status "$AE_INVOCATION_REF" --json\` reads once. Outcomes (\`result.kind\`): \`${operationOutcomes}\`. Diagnostics (\`found.state\`): \`${operationStatusStates}\`.`,
    '',
    '## 6. Recover uncertain work',
    '',
    '```sh',
    `${cli} recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json`,
    '```',
    '',
    `Recovery submits bounded evidence through \`${reconcile.route.method} ${base}${reconcile.route.path}\`. Use the same invocation and original stable key.`,
    '',
    '## If credit runs short',
    '',
    'Follow the returned `funding.handoff.create` continuation, send its Stripe Checkout URL to the payer, persist the funding session ID, and poll `funding.handoff.status`. When it is `ready`, inspect again and explicitly resubmit the original Operation.',
    '',
    '## Problem responses and retry rules',
    '',
    '- Errors are `application/problem+json` with `type`, `title`, `status`, `kind`, `code`, and optional `retryable`.',
    '- `operation_read_unavailable` means no catalogue read completed. It is retryable, never proof that an Operation is absent, and never permission to reuse stale terms.',
    '- If `retryable` is true, respect `Retry-After` when present and retry only the same material command identity.',
    '- A timeout, `outcome_unknown`, or `reconciliation_required` is not a terminal success and is not permission to create a new invocation; read status, then recover.',
    '- Do not retry authentication, validation, authority, or idempotency-conflict problems without changing the invalid input or authority state.',
    '',
    '## MCP projection',
    '',
    `Endpoint: \`${base}/mcp\`. Anonymous tools: ${anonymousToolNames.map((name) => `\`${name}\``).join(', ') || 'none'}. Authenticated tools: ${operationMcpToolNames.map((name) => `\`${name}\``).join(', ') || 'none'}.`,
    'Static tool names do not enumerate live Operations.',
    `Official SDK protocol \`${MCP_LATEST_PROTOCOL_VERSION}\`: the client performs initialization at \`${base}/mcp\`; the stateless server may omit \`Mcp-Session-Id\`; call \`tools/list\` before \`tools/call\`, then close.`,
    `Cold-start discovery: \`${base}/.well-known/ucp\`. Full references: \`${base}/llms.txt\` and \`${base}/for-agents\`.`,
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
