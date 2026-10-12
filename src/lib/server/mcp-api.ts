/**
 * MCP host adapter over the registered action registry. Anonymous requests
 * remain read-only; authenticated projections admit only explicitly surfaced
 * actions whose declared authority requirement fits the caller's mode.
 */
import { createMcpHandler, isJsonContentType, isLegacyRequest, ProtocolError, ProtocolErrorCode, Server, SERVER_INFO_META_KEY, specTypeSchemas, type StandardSchemaV1, type Tool } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { preserveJsonSchemaTupleArity } from '@/modules/common/action'

import { degrade } from '@/lib/observability/degrade'
import { base64Codec, tryDecodeBase64Url } from '@/modules/common/base64-codec'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { parseCallableRef } from '@/modules/common/tool-ref'
import { toolQuoteAction } from '@/modules/capability-execution/quote.actions'
import { buildProblem, gatewayFailureToProblem, type ProblemDetails, type ProblemKind } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { resolveCanonicalOrigin } from '@/lib/server/canonical-url'
import { package5SupplyActionRolloutDecision } from '@/lib/server/package5-rollout'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { assertHttpAdmission, rateLimitedResponse } from '@/lib/server/rate-limit'
import { readBoundedRequestJson, readBoundedRequestText, type BoundedRequestTextResult } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { TOOL_READ_UNAVAILABLE_PROBLEM } from '@/modules/registry/public'
import {
  authRefusalProblem,
  authenticateAgentAccess,
  verifyApiKeyCandidate,
  resolveAgentAccessPrincipal,
  type AgentAccessApiKeyAuth,
  type AgentAccessPrincipalResolver,
} from '@/lib/server/agent-access-auth'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { recordGatewayTelemetry, type GatewayTelemetryEvent } from '@/lib/server/gateway-telemetry'
import { recordRefusal, recordSearchOutcome } from '@/lib/observability/refusal-event'
import { isRecord } from '@/modules/common/is-record'
import { describeActionMcpMetadata, journeyProblemSchema, mcpActionNextSchema, isToolMarketReadAction, listMcpActions, mcpToolName, mcpToolsetAdmitted, projectMcpActionNext, projectMcpJourneyProblem, type AnyAction } from '@/modules/actions'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { searchSignalsSchema, toolCatalogSearchInputSchema, toolChoiceSearchOutputSchema, withAuthorizedSaveNeed } from '@/modules/registry/tool-choice-contracts'
import { formatSearchSignals } from '@/modules/registry/public'
import {
  agentAuthorityScopeForMode,
  type AgentAccessAuthorityMode,
} from '@/modules/agent-access/contract'
import type { ActionAgentAccessPrincipal, ActionTimingSink } from '@/modules/common/action'
import type { CallService } from '@/modules/capability-execution/call-authority'
import { createCallService } from '@/lib/server/call-api'
import { createSupplyManagementService, type SupplyManagementService } from '@/modules/capability-supply/supply-actions'
import { createAccountManagementService, type AccountManagementService } from '@/modules/agent-access/account.actions'
import { createMarketDemandService, marketRequestCreateAction, type MarketDemandService } from '@/modules/market-demand/market-demand.actions'
import type { SavedToolsService } from '@/modules/market/saved-tools.contracts'
import { createSavedToolsService } from '@/lib/server/saved-tools-api'
import { createFundingHandoffService } from '@/lib/server/funding-handoff-api'
import type { FundingHandoffService } from '@/modules/money/funding-handoff.actions'
import type { ToolCatalogSearcher } from '@/modules/capability-execution/procure-engine'
const MAX_MCP_REQUEST_BODY_BYTES = 320 * 1024
const AE_MCP_INSTRUCTIONS = [
  'Agentic Economy supplies bounded outside services while your current harness retains the task. First use succeeds when a real Tool result and receipt are returned, not when setup is configured.',
  'Call tools/list before tools/call, follow every tools/list nextCursor, and use only listed tools. Public discovery needs no account. If protected tools are absent, use the host’s native connection prompt; /for-agents documents setup. Retain the selected Tool and intended input in the task, never in a login URL; use the host’s secure authentication flow.',
  'Search with `ae_registry_tools_search`, inspect one Tool with `ae_registry_tools_describe`, or compare exact references with `ae_registry_tools_compare`.',
  'No suitable Tool is different from an unavailable catalogue read. Respect returned search scope and filters; do not invent supply or relax Customer limits. Ask for missing required input before purchase.',
  'A successful `ae_agentAccess_whoami` diagnoses the exact Account, Agent and authority; it is optional and never a purchase. Connection does not establish spending authority. Use `ae_tool_quote` with the exact toolRef and input, inspect its current price, data recipients, effects and authority, then `ae_tool_call` with the committed quoteRef and one stable idempotencyKey. Existing authority needs no extra approval; a free price still requires authority.',
  'When the authorization request exists, share its exact verification link. The owner can open Follow live onboarding there to observe that request before access is issued. Once authenticated, use /agent-access?caller=<principalRef returned by ae_agentAccess_whoami> to follow this exact Agent. It follows recorded access, authentication and Calls automatically while this task continues. Include resumeTool=<selected toolRef> when known. Once a Call is accepted, include callRef=<original Call reference> to keep following that attempt through renewal and recovery. Never put credentials or private input in that URL, and never claim unrecorded planning or discovery is visible there.',
  'When human action is required, follow the returned owner handoff. For insufficient credit use the returned `funding.handoff.create` action, retain the session reference, share its hosted Checkout URL, and check `funding.handoff.status`. If a Call already exists, recover that same Call and return any delivered result and receipt. If no Call exists, re-quote after confirmed funding before explicitly resubmitting. Funding never grants authority or makes a purchase.',
  'Retain callRef before continuing. For pending, timeout or outcome_unknown use `ae_call_status` and only offered `ae_call_reconcile` or `ae_call_cancel` actions. Honour retry timing. A lost response is not permission to buy again with a fresh key. After a client restart, recover the original Call before purchasing again. Read structuredContent.result and structuredContent.next; return the actual output and receipt and distinguish delivery, payment and purchase status.',
  'Account tools show identity, balance and activity. Provider tools appear only for credentials with provider authority.',
  'Select `/mcp?readonly=1` for discover and read-only account tools, without buying or other writes.',
  'Operations are returned as data, not registered as individual MCP tools. See `/glossary.md` for AE vocabulary.',
  'When AE gets in your way, lacks needed functionality, or the user has product feedback, optionally call the listed `ae_feedback_submit` tool. Send specific expected versus actual behaviour and relevant product tools/errors, without credentials, personal information, Customer business data or copied Tool payloads. The text goes to the AE team through PostHog. Send when the issue occurs, then continue working; feedback is not an end-of-task requirement. Tell the user only after acceptance and summarize the report in one sentence. Skip disabled or unavailable feedback; do not automatically retry.',
  'The server’s /SKILL.md contains the full maintained operating contract. Never send credentials or private task input to an alternate server or public support issue.',
].join(' ')
const MCP_READ_ONLY_FIX = 'This connection is read-only (?readonly=1). Reconnect at /mcp without readonly=1 to allow purchases.'

export type McpAccessTier = Readonly<{
  tier: 'anonymous' | 'authenticated'
  authorityMode?: AgentAccessAuthorityMode
  readOnly?: boolean
  principalId?: string
  principal?: ActionAgentAccessPrincipal
  correlationId?: string
  timing?: ActionTimingSink
  callService?: CallService
  supplyManagementService?: SupplyManagementService
  accountManagementService?: AccountManagementService
  marketDemandService?: MarketDemandService
  savedToolsService?: SavedToolsService
  fundingHandoffService?: FundingHandoffService
  catalogSearcher?: ToolCatalogSearcher
  rolloutEnvironment?: StringEnvironment
  /** Test-only override for the tools/list page size (default: MCP_TOOLS_LIST_PAGE_SIZE). */
  toolsListPageSize?: number
}>

/** Invalid Tool arguments are recoverable tool errors, never action dispatches. */
const INVALID_MCP_REQUEST_PARAMETERS_MESSAGE = 'Invalid MCP request parameters.'
const TOOL_REF_PATTERN = '^operation:v1:[0-9a-f]{64}$'

function mcpRequestValidationMessage(error: StandardSchemaV1.FailureResult): string {
  const issue = error.issues[0]
  if (issue === undefined) return INVALID_MCP_REQUEST_PARAMETERS_MESSAGE
  const path = (issue.path ?? []).map((segment) => String(typeof segment === 'object' ? segment.key : segment)).join('.')
  const named = path.length > 0 ? `${path}: ${issue.message}` : issue.message
  return path === 'toolRef' || path.endsWith('.toolRef')
    ? `${INVALID_MCP_REQUEST_PARAMETERS_MESSAGE} ${named}. Expected pattern: ${TOOL_REF_PATTERN}.`
    : `${INVALID_MCP_REQUEST_PARAMETERS_MESSAGE} ${named}.`
}

type McpToolFailure = ProblemDetails

function mcpToolFailure(action: AnyAction, error: unknown, correlationId?: string): McpToolFailure {
  const toolReadFailure = isToolMarketReadAction(action)
  const failure = toolReadFailure
    ? TOOL_READ_UNAVAILABLE_PROBLEM
    : error instanceof ConvexSourceError
      ? gatewayFailureToProblem({
        code: error.code === 'missing_auth' ? 'authentication_required' : 'source_unavailable',
        retryable: error.status >= 500 || error.status === 429,
        kind: 'error',
      })
      : {
        kind: 'INTERNAL' as const,
        code: 'action_execution_failed',
        retryable: false,
      }
  return buildProblem({
    ...failure,
    detail: toolReadFailure
      ? TOOL_READ_UNAVAILABLE_PROBLEM.detail
      : safeMcpFailureDetail(failure.kind),
    ...(correlationId === undefined ? {} : { extras: { correlationId } }),
  })
}

function safeMcpFailureDetail(kind: ProblemKind): string {
  switch (kind) {
    case 'UNAVAILABLE':
      return 'Action source is temporarily unavailable.'
    case 'UNAUTHENTICATED':
      return 'Action execution requires authentication.'
    case 'PERMISSION_DENIED':
      return 'Action execution is not permitted.'
    case 'NOT_FOUND':
      return 'Action target was not found.'
    default:
      return 'Action execution failed.'
  }
}

function mcpToolError(failure: McpToolFailure, origin: string) {
  const requestId = typeof failure.correlationId === 'string' ? failure.correlationId : undefined
  const projected = projectMcpJourneyProblem(
    { ...failure, retryable: failure.retryable === true, ...(requestId === undefined ? {} : { requestId }) },
    { origin, source: requestId === undefined ? 'local' : 'remote' },
  )
  return { ...projected, content: [...projected.content] }
}
type McpToolRefusal = Readonly<{ code: string; reason?: string; retryable?: boolean }>
/** Every result `kind` the Tool-catalogue reads (`registry.tools.*`) use to mean "did not resolve". */
const TOOL_MARKET_READ_NEGATIVE_KINDS = new Set(['not_found', 'unavailable'])

/**
 * MCP spec: a tool-level refusal is a normal `CallToolResult` with
 * `isError: true`, not a JSON-RPC error (those stay reserved for
 * protocol-level failures, e.g. bad params — see `ConciseMcpRequestError`
 * above). Every action that deliberately declines to proceed uses
 * `kind: 'refused'` (see `quote.ts`, `call-authority.ts`, `supply-actions.ts`,
 * `market-demand.actions.ts`, `funding-handoff.actions.ts`). Non-search
 * catalogue reads may return `not_found`/`unavailable`. Search `match`,
 * `scoped`, `noMatch`, and `unavailable` are validated outcomes carrying
 * their complete typed continuations.
 */
function mcpToolRefusal(action: AnyAction, result: unknown): McpToolRefusal | undefined {
  if (!isRecord(result) || typeof result.kind !== 'string') return undefined
  const isRefusal = result.kind === 'refused'
    || (isToolMarketReadAction(action) && action.id !== 'registry.tools.search' && TOOL_MARKET_READ_NEGATIVE_KINDS.has(result.kind))
  if (!isRefusal) return undefined
  const explicitCode = typeof result.code === 'string' ? result.code : undefined
  const reasonText = typeof result.reason === 'string' ? result.reason : undefined
  const code = explicitCode ?? reasonText ?? result.kind
  const retryable = typeof result.retryable === 'boolean' ? result.retryable : undefined
  return {
    code,
    // Only surface `reason` when it is distinct from `code` (some actions
    // carry both a stable code and free-text detail; others only have one
    // field, already promoted to `code` above).
    ...(explicitCode !== undefined && reasonText !== undefined ? { reason: reasonText } : {}),
    ...(retryable === undefined ? {} : { retryable }),
  }
}

/** Reuses the reason-copy catalogue for the human sentence where the code maps; falls back to the action's own free-text reason, then the generic sentence. */
function mcpRefusalSentence(refusal: McpToolRefusal): string {
  return REASON_COPY[refusal.code] ?? refusal.reason ?? REASON_COPY_FALLBACK
}

function mcpToolRefusalResult(action: AnyAction, result: unknown, refusal: McpToolRefusal, origin: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: mcpRefusalSentence(refusal) }],
    structuredContent: { result, next: projectMcpActionNext(action.id, result, origin) },
  }
}
/** The search's validated actions stay legible without requiring clients to parse structuredContent. */
function mcpSearchActionLine(next: unknown, _origin: string): string | undefined {
  if (!isRecord(next) || typeof next.action !== 'string' || !isRecord(next.args)) return undefined
  const args = JSON.stringify(next.args)
  const call = next.action === 'registry.tools.describe' ? `ae_registry_tools_describe(${args})`
    : next.action === 'registry.tools.search' ? `ae_registry_tools_search(${args})` : undefined
  return `  ${JSON.stringify(next)}${call === undefined ? '' : ` · ${call}`}`
}

/** Search text exposes the same typed decisions, arguments and scope as the structured payload. */
function mcpSuccessSummary(action: AnyAction, result: unknown, origin: string): string {
  if (!isRecord(result)) return `${action.name} completed.`
  if (action.id === 'tool.procure' && result.status === 'needs_input') {
    const reasons = Array.isArray(result.reasons)
      ? result.reasons.filter((reason): reason is string => typeof reason === 'string')
      : []
    const alternates = Array.isArray(result.alternates)
      ? result.alternates.filter(isRecord).map((alternate) => {
        const title = typeof alternate.title === 'string' ? alternate.title : 'Tool'
        const alternateReasons = Array.isArray(alternate.reasons)
          ? alternate.reasons.filter((reason): reason is string => typeof reason === 'string')
          : []
        return `- ${title} (${alternateReasons.join(' · ')})`
      })
      : []
    return [
      `Selected ${result.toolName} (${result.toolRef})${reasons.length === 0 ? '' : ` · ${reasons.join(' · ')}`}.`,
      'Alternates:',
      ...alternates,
      `Required input: ${JSON.stringify(result.requiredFields)}. Input JSON Schema: ${JSON.stringify(result.inputJsonSchema)}.`,
      `Next: ${JSON.stringify(result.next)}; supply caller-owned input, maxSpendAud and a new idempotencyKey. No Quote or Call has occurred.`,
    ].join('\n')
  }
  const stale = isRecord(result.freshness) && result.freshness.state !== 'fresh'
    ? ` Catalogue freshness: ${String(result.freshness.state)}; results may be out of date.`
    : ''
  if (action.id !== 'registry.tools.search') {
    return `${action.name}: ${typeof result.kind === 'string' ? result.kind : 'completed'}.${action.id === 'registry.tools.list' ? stale : ''}`
  }
  const tools = Array.isArray(result.results) ? result.results : []
  const assessed = isRecord(result.assessed)
    ? ` · scope: ${result.assessed.source}/${result.assessed.scope} · ${result.assessed.coverage} coverage (${result.assessed.examined} examined)`
    : ''
  const summary = result.kind === 'noMatch' ? 'No suitable Tools found'
    : result.kind === 'unavailable' ? `Search unavailable: ${result.reason}`
      : result.kind === 'scoped' ? `${tools.length} Tools in assessed supply; more may exist`
        : `${tools.length} matching Tools`
  const recipient = isRecord(result.recipient) && typeof result.recipient.label === 'string' && typeof result.recipient.host === 'string'
    ? ` Ranking: ${result.recipient.label} (${result.recipient.host}) receives query and candidate summaries.`
    : ''
  const lines = [`${summary}${assessed}.${stale}${recipient}`]
  for (const tool of tools) {
    if (!isRecord(tool)) continue
    if (tool.access === 'ae_callable' && parseCallableRef(tool.toolRef)?.kind === 'listing') {
      lines.push(`  Quote ${tool.title}: ${mcpToolName(toolQuoteAction)}(${JSON.stringify({ toolRef: tool.toolRef })}) with caller-owned input.`)
    }
    if (tool.access === 'unavailable' && typeof tool.reason === 'string') {
      lines.push(`  ${tool.title} is unavailable: ${REASON_COPY[tool.reason] ?? REASON_COPY_FALLBACK}`)
    }
    const signals = searchSignalsSchema.safeParse(tool.signals)
    if (signals.success) lines.push(`  ${tool.title}: ${formatSearchSignals(signals.data)}`)
    const itemActions = Array.isArray(tool.next) ? tool.next : []
    for (const next of itemActions) {
      const text = mcpSearchActionLine(next, origin)
      if (text !== undefined) lines.push(text)
    }
  }
  if (Array.isArray(result.next)) {
    for (const next of result.next) {
      const text = mcpSearchActionLine(next, origin)
      if (text !== undefined) lines.push(text)
    }
  }
  if (isRecord(result.saveNeed)) {
    lines.push(`  Save this need: ${mcpToolName(marketRequestCreateAction)}(${JSON.stringify(result.saveNeed.args)}); generate and reuse one idempotencyKey for this Save intent.`)
  }
  return lines.join('\n')
}

function mcpGatewayEvent(
  actionId: string,
  data: unknown,
  result: unknown,
): Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'> | undefined {
  if (!['tool.quote', 'tool.call', 'call.status', 'call.list', 'call.cancel', 'call.reconcile'].includes(actionId)) return undefined
  const input = isRecord(data) ? data : {}
  const output = isRecord(result) ? result : {}
  const callRef = typeof output.callRef === 'string'
    ? output.callRef
    : typeof input.callRef === 'string' ? input.callRef : undefined
  const toolRef = typeof output.toolRef === 'string'
    ? output.toolRef
    : typeof input.toolRef === 'string' ? input.toolRef : undefined
  if (output.kind === 'needs_authority' || (output.kind === 'refused' && output.code === 'authority_required')) {
    return { ...(callRef === undefined ? {} : { invocationRef: callRef }), ...(toolRef === undefined ? {} : { operationRef: toolRef }), outcome: 'needs_authority', approval: 'required' }
  }
  if (output.kind === 'refused') {
    return {
      ...(callRef === undefined ? {} : { invocationRef:callRef }),
      ...(toolRef === undefined ? {} : { operationRef:toolRef }),
      outcome: 'refused',
      refusalCode: typeof output.code === 'string' ? output.code : 'action_execution_failed',
      ...(typeof output.retryable === 'boolean' ? { retryable: output.retryable } : {}),
    }
  }
  if (output.kind === 'reconciliation_required' || output.kind === 'outcome_unknown') {
    return {
      ...(callRef === undefined ? {} : { invocationRef:callRef }),
      ...(toolRef === undefined ? {} : { operationRef:toolRef }),
      outcome: 'reconciliation_required',
      unknown: true,
    }
  }
  if (output.kind === 'pending' || output.kind === 'unchanged') {
    return {
      ...(callRef === undefined ? {} : { invocationRef:callRef }),
      ...(toolRef === undefined ? {} : { operationRef:toolRef }),
      outcome: 'pending',
    }
  }
  if (output.kind === 'found') {
    const terminal = isRecord(output.result) ? output.result : undefined
    const usage = terminal !== undefined && isRecord(terminal.usage) ? terminal.usage : undefined
    const conclusive = terminal?.kind === 'refused' || (terminal?.kind === 'completed' && usage !== undefined && usage.chargeState !== 'outcome_unknown')
    const unknown = output.state === 'reconciliation_required' || (output.state === 'terminal' && !conclusive)
    const outcome = unknown ? 'unknown' : output.state === 'cancelled' ? 'cancelled' : output.state === 'invalidated' ? 'refused'
      : output.state === 'terminal' && terminal?.kind === 'refused' ? 'refused'
        : output.state === 'terminal' && terminal?.kind === 'completed' ? actionId === 'call.reconcile' ? 'reconciled' : 'completed' : 'pending'
    return {
      ...(callRef === undefined ? {} : { invocationRef: callRef }),
      ...(toolRef === undefined ? {} : { operationRef: toolRef }),
      outcome,
      ...(unknown ? { unknown: true } : {}),
      ...(outcome === 'refused' && typeof terminal?.code === 'string' ? { refusalCode: terminal.code } : {}),
    }
  }
  if (output.kind === 'completed' || output.kind === 'committed' || output.kind === 'ok' || (actionId === 'call.list' && output.kind === 'available')) {
    return {
      ...(callRef === undefined ? {} : { invocationRef:callRef }),
      ...(toolRef === undefined ? {} : { operationRef:toolRef }),
      outcome: isRecord(output.usage) && output.usage.chargeState === 'outcome_unknown' ? 'unknown' : 'completed',
      ...(isRecord(output.usage) && output.usage.chargeState === 'outcome_unknown' ? { unknown: true } : {}),
    }
  }
  return {
    ...(callRef === undefined ? {} : { invocationRef:callRef }),
    ...(toolRef === undefined ? {} : { operationRef:toolRef }),
    outcome: 'failed',
    refusalCode: 'action_execution_failed',
  }
}
function recordMcpGatewayTelemetry(
  actionId: string,
  data: unknown,
  result: unknown,
  access: McpAccessTier,
  startedAt: number,
): void {
  if (access.principal === undefined) return
  const event = mcpGatewayEvent(actionId, data, result)
  if (event === undefined) return
  recordGatewayTelemetry(access.timing, {
    ...event,
    credentialId: access.principal.credentialId,
    principalId: access.principal.principalId,
    applicationRef: access.principal.applicationRef,
    ...(access.correlationId === undefined ? {} : { correlationId: access.correlationId }),
    durationMs: Date.now() - startedAt,
    transport:'mcp',operation:actionId==='tool.quote'?'quote':actionId==='tool.call'?'call':actionId==='call.cancel'?'cancel':actionId==='call.reconcile'?'reconcile':actionId==='call.list'?'list':'status',stage:actionId.startsWith('call.')?'recovery':'execution',
  })
}


/** The action registry owns Tool projection and pagination; the SDK owns wire encoding. */
const AE_MCP_SERVER_INFO = { name: 'agentic-economy', version: '1.0.0' } as const
const MCP_TOOLS_LIST_PAGE_SIZE = 50
const MCP_TOOLS_LIST_MAX_BYTES = 40_000
const mcpToolDescriptors = new WeakMap<AnyAction, Tool>()
const jsonBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length

/** Compact output-schema boilerplate while preserving every accepted value and keyword constraint. */
function compactPrimitiveDefs(schema: Record<string, unknown>): Record<string, unknown> {
  // Literal and string-enum values already exclude every non-string. An empty
  // array cannot contain an item, so its item schema adds no constraint.
  const simplify = (value: unknown, schemaMap = false): unknown => {
    if (Array.isArray(value)) return value.map(item => simplify(item))
    if (!isRecord(value)) return value
    const record = Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, !schemaMap && ['const', 'enum', 'default', 'examples'].includes(key) ? item : simplify(item, !schemaMap && ['properties', 'patternProperties', '$defs', 'dependentSchemas'].includes(key))]))
    if (!schemaMap && record.type === 'string' && (typeof record.const === 'string'
      || (Array.isArray(record.enum) && record.enum.length > 0 && record.enum.every(item => typeof item === 'string')))) delete record.type
    if (!schemaMap && record.type === 'array' && record.maxItems === 0) delete record.items
    return record
  }
  let compact = simplify(schema) as Record<string, unknown>
  if (!isRecord(compact.$defs)) return compact
  for (const name of Object.keys(compact.$defs)) {
    if (!isRecord(compact.$defs)) break
    const definition = compact.$defs[name]
    if (!isRecord(definition) || (!['string', 'number', 'integer', 'boolean', 'null'].includes(String(definition.type))
      && typeof definition.const !== 'string'
      && !(Array.isArray(definition.enum) && definition.enum.length > 0 && definition.enum.every(item => typeof item === 'string'))
      && !(definition.type === 'array' && definition.maxItems === 0))) continue
    const ref = `#/$defs/${name}`
    let siblingRef = false
    const replace = (value: unknown, schemaMap = false): unknown => {
      if (Array.isArray(value)) return value.map(item => replace(item))
      if (!isRecord(value)) return value
      if (!schemaMap && value.$ref === ref) {
        if (Object.keys(value).length !== 1) { siblingRef = true; return value }
        return definition
      }
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, !schemaMap && ['const', 'enum', 'default', 'examples'].includes(key) ? item : replace(item, !schemaMap && ['properties', 'patternProperties', '$defs', 'dependentSchemas'].includes(key))]))
    }
    const candidate = replace(compact)
    if (siblingRef || !isRecord(candidate) || !isRecord(candidate.$defs)) continue
    delete candidate.$defs[name]
    if (Object.keys(candidate.$defs).length === 0) delete candidate.$defs
    if (JSON.stringify(candidate).includes(JSON.stringify(ref))) continue
    if (jsonBytes(candidate) < jsonBytes(compact)) compact = candidate
  }
  if (!isRecord(compact.$defs)) return compact
  const names = new Map(Object.keys(compact.$defs).map((name, index) => [name, `s${index}`]))
  const shortenRefs = (value: unknown, schemaMap = false): unknown => {
    if (Array.isArray(value)) return value.map(item => shortenRefs(item))
    if (!isRecord(value)) return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const name = !schemaMap && key === '$ref' && typeof item === 'string' && item.startsWith('#/$defs/') ? names.get(item.slice(8)) : undefined
      return [key, name === undefined ? !schemaMap && ['const', 'enum', 'default', 'examples'].includes(key) ? item : shortenRefs(item, !schemaMap && ['properties', 'patternProperties', '$defs', 'dependentSchemas'].includes(key)) : `#/$defs/${name}`]
    }))
  }
  const renamed = shortenRefs(compact) as Record<string, unknown>
  const definitions = renamed.$defs as Record<string, unknown>
  renamed.$defs = Object.fromEntries(Object.entries(definitions).map(([name, definition]) => [names.get(name) ?? name, definition]))
  return jsonBytes(renamed) < jsonBytes(compact) ? renamed : compact
}

/** Advertise exact action results and factor the common Problem fields without changing either wire form. */
function mcpOutputSchema(action: AnyAction) {
  const nextSchema = mcpActionNextSchema(action.id)
  const problemSchema = journeyProblemSchema.options[0].extend({
    next: nextSchema, source: z.enum(['local', 'remote']),
    requestId: journeyProblemSchema.options[1].shape.requestId.exactOptional(),
  })
  const schema = z.union([z.strictObject({ result: action.outputSchema, next: nextSchema }), problemSchema])
  const jsonSchema = z.toJSONSchema(schema, {
    io: 'output', reused: 'ref',
    override: ({ zodSchema, jsonSchema: fragment }) => {
      preserveJsonSchemaTupleArity(zodSchema, fragment, 'output')
      if (zodSchema !== problemSchema) return
      fragment.oneOf = [
        { properties: { source: { const: 'local' } }, not: { required: ['requestId'] } },
        { properties: { source: { const: 'remote' } }, required: ['requestId'] },
      ]
    },
  })
  return { ...compactPrimitiveDefs(jsonSchema), type: 'object' as const }
}

function encodeMcpToolsListCursor(offset: number): string {
  return base64Codec.toBase64Url(new TextEncoder().encode(String(offset)))
}

/** Returns undefined for any cursor the server could not have issued itself. */
function decodeMcpToolsListCursor(cursor: string, toolCount: number): number | undefined {
  const bytes = tryDecodeBase64Url(cursor)
  if (bytes === undefined) return undefined
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (cause) {
    return degrade(cause, undefined, {
      site: 'decodeMcpToolsListCursor',
      reason: 'invalid_response',
    })
  }
  if (!/^\d+$/u.test(text)) return undefined
  const offset = Number.parseInt(text, 10)
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= toolCount ? offset : undefined
}

function mcpInputSchema(action: AnyAction) {
  const schema = z.toJSONSchema(action.schema, {
    io: 'input', unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema }) => preserveJsonSchemaTupleArity(zodSchema, jsonSchema, 'input'),
  })
  if (schema.type === 'object') return { ...schema, type: 'object' as const }
  const variants = 'anyOf' in schema ? schema.anyOf : 'oneOf' in schema ? schema.oneOf : undefined
  if (!Array.isArray(variants)) throw new Error(`MCP input schema for ${action.id} is not an object union`)
  const properties: Record<string, unknown> = {}
  let commonRequired: Set<string> | undefined
  const pending: unknown[] = [...variants]
  while (pending.length > 0) {
    const variant = pending.pop()
    if (!isRecord(variant)) throw new Error(`MCP input schema for ${action.id} has a non-object variant`)
    if (!isRecord(variant.properties)) {
      const nested = Array.isArray(variant.anyOf) ? variant.anyOf : variant.oneOf
      if (!Array.isArray(nested)) throw new Error(`MCP input schema for ${action.id} has a variant without fields`)
      pending.push(...nested)
      continue
    }
    const required = Array.isArray(variant.required) ? variant.required : []
    if (commonRequired === undefined) {
      commonRequired = new Set(required)
    } else {
      for (const field of commonRequired) if (!required.includes(field)) commonRequired.delete(field)
    }
    for (const [key, value] of Object.entries(variant.properties)) {
      const existing = properties[key]
      properties[key] = existing === undefined || JSON.stringify(existing) === JSON.stringify(value)
        ? value : { anyOf: [existing, value] }
    }
  }
  return { ...schema, type: 'object' as const, properties, ...(commonRequired?.size ? { required: [...commonRequired] } : {}) }
}

function mcpToolListEntry(action: AnyAction): Tool {
  const cached = mcpToolDescriptors.get(action)
  if (cached !== undefined) return cached
  const metadata = describeActionMcpMetadata(action)
  const inputSchema = mcpInputSchema(action)
  const entry = specTypeSchemas.Tool['~standard'].validate({
    name: mcpToolName(action),
    title: action.name,
    description: mcpToolDescription(action),
    inputSchema,
    outputSchema: mcpOutputSchema(action),
    annotations: {
      readOnlyHint: action.readOnly,
      destructiveHint: action.readOnly ? false : metadata.destructive,
      idempotentHint: metadata.idempotent,
      openWorldHint: metadata.openWorld,
    },
  })
  if (entry.issues !== undefined) throw new Error(`Invalid MCP Tool contract: ${action.id}`)
  mcpToolDescriptors.set(action, entry.value)
  return entry.value
}


function registerPaginatedToolsList(
  sdkServer: Server,
  admittedActions: readonly AnyAction[],
  pageSize: number,
): void {
  sdkServer.setRequestHandler('tools/list', (toolsListRequest) => {
    const cursor = toolsListRequest.params?.cursor
    const offset = cursor === undefined ? 0 : decodeMcpToolsListCursor(cursor, admittedActions.length)
    if (offset === undefined) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `${INVALID_MCP_REQUEST_PARAMETERS_MESSAGE} cursor: does not decode to a valid tools/list page offset.`)
    }
    const page: Tool[] = []
    // Reserve the complete current-protocol envelope stamped by the SDK, including server metadata.
    let pageBytes = jsonBytes({
      tools: [], nextCursor: encodeMcpToolsListCursor(admittedActions.length),
      resultType: 'complete', ttlMs: 0, cacheScope: 'private',
      _meta: { [SERVER_INFO_META_KEY]: AE_MCP_SERVER_INFO },
    })
    for (const action of admittedActions.slice(offset, offset + pageSize)) {
      const descriptor = mcpToolListEntry(action)
      const descriptorBytes = jsonBytes(descriptor) + (page.length === 0 ? 0 : 1)
      if (pageBytes + descriptorBytes > MCP_TOOLS_LIST_MAX_BYTES) {
        if (page.length === 0) throw new ProtocolError(ProtocolErrorCode.InternalError, 'MCP Tool descriptor exceeds the tools/list page budget.')
        break
      }
      page.push(descriptor)
      pageBytes += descriptorBytes
    }
    const nextOffset = offset + page.length
    return {
      tools: page,
      ...(nextOffset < admittedActions.length ? { nextCursor: encodeMcpToolsListCursor(nextOffset) } : {}),
    }
  })
}

export function createAeMcpServer(
  request: Request,
  actions: readonly AnyAction[] = listMcpActions(),
  access: McpAccessTier = { tier: 'anonymous' },
): Server {
  const selectedAccess = {
    scopes: access.principal?.scopes ?? [],
    authenticated: access.tier === 'authenticated',
    readOnly: access.readOnly === true || new URL(request.url).searchParams.get('readonly') === '1',
  }
  const admittedActions = actions.filter((action) => mcpToolsetAdmitted(action, selectedAccess))
  const admittedIds = new Set(admittedActions.map((action) => action.id))
  // Public continuations use the deployment's trusted origin, including when
  // an HTTPS proxy forwards an HTTP request. Missing production configuration
  // retains the canonical resolver's explicit failure; forwarded hosts are not trusted.
  const origin = resolveCanonicalOrigin(request)

  // Requires: one validated request and its authenticated principal. Ensures:
  // only admitted actions run, with validated input and output. Invariant:
  // no instance or authority is shared between requests. Violations return
  // protocol or tool errors; disconnecting never buys again or cancels a Call.
  const server = new Server(
    AE_MCP_SERVER_INFO,
    { instructions: AE_MCP_INSTRUCTIONS, capabilities: { tools: { listChanged: false } } },
  )
  server.setRequestHandler('tools/call', async (callRequest, context) => {
    const action = actions.find((candidate) => mcpToolName(candidate) === callRequest.params.name)
    if (action === undefined) return mcpToolError(buildProblem({
      kind: 'INVALID_ARGUMENT', code: 'mcp_tool_not_found', retryable: false,
      detail: 'Unknown MCP tool. Call tools/list and select a listed tool.',
    }), origin)
    const input = await action.schema.safeParseAsync(callRequest.params.arguments ?? {})
    if (!input.success) return mcpToolError(buildProblem({
      kind: 'INVALID_ARGUMENT', code: 'input_invalid', retryable: false,
      detail: mcpRequestValidationMessage(input.error),
    }), origin)
    context.mcpReq.signal.throwIfAborted()
    const data: unknown = input.data
    const startedAt = Date.now()
    if (!admittedIds.has(action.id)) return mcpToolError(buildProblem({
      kind: 'PERMISSION_DENIED',
      code: 'mcp_toolset_required',
      retryable: false,
      detail: `This action is not available in the current MCP toolset.${selectedAccess.readOnly ? ` ${MCP_READ_ONLY_FIX}` : ''}`,
      extras: { next: [], ...(access.correlationId === undefined ? {} : { correlationId: access.correlationId }) },
    }), origin)
    try {
      const rollout = package5SupplyActionRolloutDecision(action.id, data, access.rolloutEnvironment)
      if (!rollout.enabled) {
        return mcpToolError(buildProblem({
          kind: 'UNAVAILABLE',
          code: rollout.code,
          retryable: false,
          detail: 'This Provider capability is not enabled for the current deployment.',
          ...(access.correlationId === undefined ? {} : { extras: { correlationId: access.correlationId } }),
        }), origin)
      }
      const result = await action.run({
        data,
        context: {
          caller: 'mcp',
          request,
          ...(access.principal === undefined ? {} : { agentAccessPrincipal: access.principal }),
          ...(access.correlationId === undefined ? {} : { correlationId: access.correlationId }),
          ...(access.timing === undefined ? {} : { timing: access.timing }),
          ...(access.supplyManagementService === undefined ? {} : { supplyManagementService: access.supplyManagementService }),
          ...(access.accountManagementService === undefined ? {} : { accountManagementService: access.accountManagementService }),
          ...(access.marketDemandService === undefined ? {} : { marketDemandService: access.marketDemandService }),
          ...(access.savedToolsService === undefined ? {} : { savedToolsService: access.savedToolsService }),
          ...(access.fundingHandoffService === undefined ? {} : { fundingHandoffService: access.fundingHandoffService }),
          ...(access.callService === undefined ? {} : { callService: access.callService }),
          ...(access.catalogSearcher === undefined ? {} : { catalogSearcher: access.catalogSearcher }),
        },
      })
      const outputValidation = await action.outputSchema.safeParseAsync(result)
      if (!outputValidation.success) {
        recordMcpGatewayTelemetry(action.id, data, { kind: 'error' }, access, startedAt)
        return mcpToolError(buildProblem({
          kind: 'INTERNAL',
          code: 'action_output_invalid',
          detail: 'Action returned an invalid result.',
          ...(access.correlationId === undefined ? {} : { extras: { correlationId: access.correlationId } }),
        }), origin)
      }
      const searchInput = action.id === 'registry.tools.search' ? toolCatalogSearchInputSchema.safeParse(data) : undefined
      const searchResult = action.id === 'registry.tools.search' ? toolChoiceSearchOutputSchema.safeParse(outputValidation.data) : undefined
      const output = searchInput?.success && searchResult?.success
        ? withAuthorizedSaveNeed(searchResult.data, searchInput.data,
            selectedAccess.authenticated && !selectedAccess.readOnly && access.principal?.scopes.includes(MARKET_TOOLS_CALL_SCOPE) === true)
        : outputValidation.data
      recordMcpGatewayTelemetry(action.id, data, result, access, startedAt)
      if (action.id === 'registry.tools.search' && isRecord(output) && typeof output.kind === 'string') {
        const found = Array.isArray(output.results) ? output.results.filter(isRecord) : []
        recordSearchOutcome({
          surface: 'mcp',
          ...(access.principal === undefined ? {} : { actor: access.principal.principalId }),
          resultKind: output.kind,
          resultCount: found.length,
          callableCount: found.filter(item => item.access === 'ae_callable').length,
          externalListingCount: found.filter(item => item.access === 'external_listing').length,
        })
      }
      const refusal = mcpToolRefusal(action, output)
      if (refusal !== undefined) {
        // Gateway-classified actions are already counted by recordMcpGatewayTelemetry; this covers market reads only.
        if (mcpGatewayEvent(action.id, data, result) === undefined) {
          recordRefusal({
            surface: 'mcp',
            code: refusal.code,
            operation: action.id,
            ...(refusal.retryable === undefined ? {} : { retryable: refusal.retryable }),
            // Correlation ids are per request, so they never stand in for an actor.
            ...(access.principal === undefined ? {} : { actor: access.principal.principalId }),
          })
        }
        return mcpToolRefusalResult(action, output, refusal, origin)
      }
      return {
        content: [{ type: 'text' as const, text: mcpSuccessSummary(action, output, origin) }],
        structuredContent: { result: output, next: projectMcpActionNext(action.id, output, origin) },
      }
    } catch (error) {
      recordMcpGatewayTelemetry(action.id, data, undefined, access, startedAt)
      return mcpToolError(mcpToolFailure(action, error, access.correlationId), origin)
    }
  })

  registerPaginatedToolsList(server, admittedActions, access.toolsListPageSize ?? MCP_TOOLS_LIST_PAGE_SIZE)

  return server
}


type McpRequestOptions = Readonly<{
  actions?: readonly AnyAction[]
  authenticate?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['authenticate']
  /** Set by the route handler after it verified the credential, so it is not verified twice. */
  verifiedCandidate?: Awaited<ReturnType<typeof verifyApiKeyCandidate>>
  resolvePrincipal?: AgentAccessPrincipalResolver
  supplyManagementService?: SupplyManagementService
  accountManagementService?: AccountManagementService
  marketDemandService?: MarketDemandService
  fundingHandoffService?: FundingHandoffService
  savedToolsService?: SavedToolsService
  timing?: ActionTimingSink
  callService?: CallService
  catalogSearcher?: ToolCatalogSearcher
  rolloutEnvironment?: StringEnvironment
  /** Test-only override for the tools/list page size (default: MCP_TOOLS_LIST_PAGE_SIZE). */
  toolsListPageSize?: number
}>

/**
 * MCP route boundary. Request admission is infrastructure, so an admission
 * outage must not escape as an opaque framework 500. Keep the failure outside
 * JSON-RPC (like authentication and media-type failures), but make it a
 * truthful, retryable HTTP problem with the same request correlation reference.
 */
/** Header presence selects only a bounded verification attempt, never authenticated authority. */
function isAnonymousMcpRequest(request: Request): boolean {
  return !request.headers.has('x-api-key') && !request.headers.has('authorization')
}

export async function handleMcpRouteRequest(
  request: Request,
  options: McpRequestOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let admission
    let verifiedCandidate: Awaited<ReturnType<typeof verifyApiKeyCandidate>> | undefined
    try {
      // Requires: trusted per-IP admission before verification. Ensures: only verified
      // credentials reach public-read; anonymous exhaustion cannot block native setup.
      // Invariant: no header grants authority and no failed admission dispatches a Call.
      // On violation: return 429 with Retry-After, or a correlated retryable 503; never retry a debit.
      admission = await assertHttpAdmission(request, isAnonymousMcpRequest(request) ? 'mcp-anonymous' : 'mcp-authentication')
      if (admission.ok && !isAnonymousMcpRequest(request)) {
        verifiedCandidate = await verifyApiKeyCandidate(request, options.authenticate)
        admission = await assertHttpAdmission(request, verifiedCandidate === null ? 'mcp-anonymous' : 'public-read')
      }
    } catch (cause) {
      recordGatewayTelemetry(options.timing,{correlationId,transport:'mcp',operation:'admission',stage:'pre_admission',durationMs:0,outcome:'failed',refusalCode:'mcp_admission_unavailable',retryable:true})
      return degrade(
        cause,
        withRequestCorrelationHeader(problem({
          status: 503,
          kind: 'UNAVAILABLE',
          code: 'mcp_admission_unavailable',
          retryable: true,
          detail: 'The MCP endpoint is temporarily unavailable. Retry later.',
          extras: { correlationId },
        }, { 'Retry-After': '5' }), correlationId),
        { site: 'handleMcpRouteRequest', reason: 'source_unavailable' },
      )
    }
    if (!admission.ok) {
      recordGatewayTelemetry(options.timing,{correlationId,transport:'mcp',operation:'admission',stage:'pre_admission',durationMs:0,outcome:'refused',refusalCode:'rate_limited',rateLimited:true})
      return withRequestCorrelationHeader(rateLimitedResponse(admission.retryAfter), correlationId)
    }
    return withRequestCorrelationHeader(await handleMcpRequest(request, verifiedCandidate === undefined ? options : { ...options, verifiedCandidate }), correlationId)
  })
}

function mcpActionConsequenceResource(action: AnyAction): string {
  const canonicalActionId = action.id.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
  return `surface:mcp:${canonicalActionId}`
}

export async function handleMcpRequest(request: Request, options: McpRequestOptions = {}): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const origin = request.headers.get('origin')
    if (origin !== null && origin !== resolveCanonicalOrigin(request)) {
      return withRequestCorrelationHeader(problem({
        status: 403, kind: 'PERMISSION_DENIED', code: 'mcp_origin_not_allowed',
        detail: 'The request Origin is not allowed for this MCP endpoint.',
      }), correlationId)
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      recordGatewayTelemetry(options.timing,{correlationId,transport:'mcp',operation:'admission',stage:'pre_admission',durationMs:0,outcome:'refused',refusalCode:'method_not_allowed'})
      return withRequestCorrelationHeader(methodNotAllowed(['POST', 'DELETE']), correlationId)
    }
    const actions = options.actions ?? listMcpActions()
    const bounded = await boundedMcpRequest(request)
    if (!bounded.ok) {
      recordGatewayTelemetry(options.timing,{correlationId,transport:'mcp',operation:'admission',stage:'pre_admission',durationMs:0,outcome:'refused',refusalCode:'payload_too_large'})
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The MCP request body is too large.',
      }), correlationId)
    }
    const boundedRequest = bounded.request
    const legacyFailure = await legacyMcpParameterFailure(boundedRequest)
    if (legacyFailure !== undefined) return withRequestCorrelationHeader(legacyFailure, correlationId)
    const protectedTarget = await actionRequiringAuthenticationForRequest(boundedRequest, actions)
    if (protectedTarget !== undefined) {
      const protectedAction = protectedTarget.action
      const requiredMode = requiredModeForAction(protectedAction)
      const genericAdmission = protectedTarget.generic || !isAnonymousMcpRequest(boundedRequest)
      const credentialAdmission = genericAdmission ? undefined : protectedAction.credentialAdmission
      const requiredAnyScopes = credentialAdmission?.anyScopes ?? []
      const requiredScope = requiredAnyScopes.length > 0 ? null : credentialAdmission?.scope
      const resolverRequiredScopes = genericAdmission || requiredAnyScopes.length > 0
        ? []
        : [credentialAdmission?.scope ?? agentAuthorityScopeForMode(requiredMode)]
      const resolvePrincipal = options.resolvePrincipal
        ?? (options.authenticate === undefined
          ? resolveAgentAccessPrincipal(boundedRequest, bounded.bodyText, correlationId)
          : undefined)
      const verifiedCandidate = options.verifiedCandidate
      const authenticate = verifiedCandidate === undefined ? options.authenticate : async () => verifiedCandidate ?? ({ isAuthenticated: false } as AgentAccessApiKeyAuth)
      const admitted = await authenticateAgentAccess({
        request: boundedRequest,
        ...(authenticate === undefined ? {} : { authenticate }),
        ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
        consequenceResource: genericAdmission
          ? 'surface:mcp:tools-list'
          : mcpActionConsequenceResource(protectedAction),
        ...(requiredScope === undefined ? {} : { requiredScope }),
        requiredScopes: resolverRequiredScopes,
        requiredAnyScopes,
        requiredMode: genericAdmission ? 'read_only' : requiredMode,
      })
      if (admitted.kind === 'refused') {
        recordGatewayTelemetry(options.timing,{correlationId,transport:'mcp',operation:'admission',stage:'pre_admission',durationMs:0,outcome:'refused',refusalCode:admitted.reason,retryable:admitted.reason==='source_unavailable'})
        return withRequestCorrelationHeader(authRefusalProblem(
          request,
          admitted,
          requiredScope === null ? undefined : requiredScope,
          requiredScope == null ? requiredMode : undefined,
          correlationId,
          !protectedTarget.generic && !protectedAction.readOnly && new URL(request.url).searchParams.get('readonly') === '1'
            ? MCP_READ_ONLY_FIX
            : undefined,
        ), correlationId)
      }
      const server = createAeMcpServer(boundedRequest, actions, {
        tier: 'authenticated',
        authorityMode: admitted.principal.authorityMode,
        principalId: admitted.principal.principalId,
        principal: admitted.principal,
        ...(options.timing===undefined?{}:{timing:options.timing}),
        correlationId,
        callService: options.callService
          ?? createCallService(boundedRequest, bounded.bodyText),
        ...(options.catalogSearcher === undefined ? {} : { catalogSearcher: options.catalogSearcher }),
        supplyManagementService: options.supplyManagementService
          ?? createSupplyManagementService(boundedRequest, bounded.bodyText),
        accountManagementService: options.accountManagementService
          ?? createAccountManagementService(boundedRequest, bounded.bodyText),
        marketDemandService: options.marketDemandService
          ?? createMarketDemandService(boundedRequest, bounded.bodyText),
        savedToolsService: options.savedToolsService
          ?? createSavedToolsService(boundedRequest, bounded.bodyText),
        fundingHandoffService: options.fundingHandoffService
          ?? createFundingHandoffService(boundedRequest, bounded.bodyText),
        ...(options.rolloutEnvironment === undefined ? {} : { rolloutEnvironment: options.rolloutEnvironment }),
        ...(options.toolsListPageSize === undefined ? {} : { toolsListPageSize: options.toolsListPageSize }),
      })
      return withRequestCorrelationHeader(await serveMcp(server, boundedRequest), correlationId)
    }
    const server = createAeMcpServer(boundedRequest, actions, {
      tier: 'anonymous',
      correlationId,
      ...(options.toolsListPageSize === undefined ? {} : { toolsListPageSize: options.toolsListPageSize }),
    })
    return withRequestCorrelationHeader(await serveMcp(server, boundedRequest), correlationId)
  })
}

type BoundedMcpRequest =
  | Readonly<{ ok: true; request: Request; bodyText: string }>
  | Extract<BoundedRequestTextResult, { ok: false }>

async function boundedMcpRequest(request: Request): Promise<BoundedMcpRequest> {
  if (request.method !== 'POST') return { ok: true, request, bodyText: '' }
  const init = {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
  }
  const boundedBody = await readBoundedRequestText(request, MAX_MCP_REQUEST_BODY_BYTES)
  if (!boundedBody.ok) return boundedBody
  return {
    ok: true,
    bodyText: boundedBody.text,
    request: new Request(request.url, { ...init, body: boundedBody.text }),
  }
}

/** SDK 2.3's legacy dispatch still wraps schema failures as internal errors.
 * Keep AE's concise Invalid Params contract through its public validators;
 * the SDK's classifier and codec retain every modern envelope/header check.
 */
async function legacyMcpParameterFailure(request: Request): Promise<Response | undefined> {
  if (request.method !== 'POST' || !isJsonContentType(request.headers.get('content-type'))) return undefined
  const parsed = await readBoundedRequestJson(request.clone(), MAX_MCP_REQUEST_BODY_BYTES)
  if (!parsed.ok || !isRecord(parsed.value)) return undefined
  const body = parsed.value
  if (body.jsonrpc !== '2.0' || (typeof body.id !== 'number' && typeof body.id !== 'string')) return undefined
  if (!await isLegacyRequest(request, body)) return undefined
  const schema = body.method === 'initialize' ? specTypeSchemas.InitializeRequest
    : body.method === 'tools/call' ? specTypeSchemas.CallToolRequest
      : body.method === 'tools/list' ? specTypeSchemas.ListToolsRequest : undefined
  if (schema === undefined) return undefined
  const validation = schema['~standard'].validate(body)
  if (validation.issues === undefined) return undefined
  return Response.json({
    jsonrpc: '2.0', id: body.id,
    error: { code: ProtocolErrorCode.InvalidParams, message: mcpRequestValidationMessage(validation) },
  })
}

async function serveMcp(server: Server, request: Request): Promise<Response> {
  const handler = createMcpHandler(() => server, {
    legacy: 'stateless',
    responseMode: 'auto',
    maxRequestBodySize: MAX_MCP_REQUEST_BODY_BYTES,
  })
  return await handler.fetch(request)
}

type McpAuthenticationTarget = Readonly<{
  action: AnyAction
  generic: boolean
}>

async function actionRequiringAuthenticationForRequest(
  request: Request,
  actions: readonly AnyAction[],
): Promise<McpAuthenticationTarget | undefined> {
  if (request.method !== 'POST') return undefined
  try {
    const boundedBody = await readBoundedRequestJson(request.clone(), MAX_MCP_REQUEST_BODY_BYTES)
    if (!boundedBody.ok || !isRecord(boundedBody.value)) return undefined
    const body = boundedBody.value
    const params = isRecord(body.params) ? body.params : undefined
    if (typeof params?.name === 'string') {
      const action = actions.find((candidate) => mcpToolName(candidate) === params.name)
      if (action !== undefined && (action.credentialAdmission !== undefined || !action.readOnly
        || (action.id === 'registry.tools.search' && !isAnonymousMcpRequest(request)))) {
        return { action, generic: false }
      }
    }
    if (
      (body.method === 'tools/list' || body.method === 'server/discover')
      && !isAnonymousMcpRequest(request)
    ) {
      const action = actions.find((candidate) => candidate.credentialAdmission !== undefined)
      return action === undefined ? undefined : { action, generic: true }
    }
    return undefined
  } catch (cause) {
    return degrade(cause, undefined, {
      site: 'actionRequiringAuthenticationForRequest',
      reason: 'invalid_response',
    })
  }
}

function mcpToolDescription(action: AnyAction): string {
  const boundaries = `Boundaries:\n${action.boundaries.map((boundary) => `- ${boundary}`).join('\n')}`
  return `${action.summary}\n\n${boundaries}`
}

function requiredModeForAction(action: AnyAction): AgentAccessAuthorityMode {
  if (action.credentialAdmission?.authority === 'descriptor_classified' || action.readOnly) return 'read_only'
  const requirement = action.invocationContract?.authorityRequirement
  if (requirement === 'principal' || requirement === 'caller') return 'approval_required'
  if (requirement === 'owner' || requirement === 'admin') return 'spending_policy'
  return 'approval_required'
}
