/**
 * MCP host adapter over the registered action registry. Anonymous requests
 * remain read-only; authenticated projections admit only explicitly surfaced
 * actions whose declared authority requirement fits the caller's mode.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Protocol } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { normalizeObjectSchema, safeParse, safeParseAsync } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { getMethodLiteral, toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'
import { ErrorCode, ListToolsRequestSchema, McpError, type Notification, type Request as SdkRequest, type Result, type ServerNotification, type ServerRequest, type ServerResult } from '@modelcontextprotocol/sdk/types.js'
import type { AnyObjectSchema, SchemaOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { z } from 'zod'

import { base64Codec, tryDecodeBase64Url } from '@/modules/common/base64-codec'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { bearerChallenge, bearerModeChallenge } from '@/lib/http/oauth-challenge'
import { buildProblem, gatewayFailureToProblem, type ProblemDetails, type ProblemKind } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { package5SupplyActionRolloutDecision } from '@/lib/server/package5-rollout'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { assertHttpAdmission, rateLimitedResponse } from '@/lib/server/rate-limit'
import { readBoundedRequestJson, readBoundedRequestText, type BoundedRequestTextResult } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { TOOL_READ_UNAVAILABLE_PROBLEM } from '@/modules/registry/public'
import { toolChoiceSearchOutputSchema } from '@/modules/registry/tool-choice-contracts'
import { nextAction as toolSearchNextAction } from '@/modules/registry/next-action'
import {
  authenticateAgentAccess,
  resolveAgentAccessPrincipal,
  type AgentAccessPrincipalResolver,
} from '@/lib/server/agent-access-auth'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { recordGatewayTelemetry, type GatewayTelemetryEvent } from '@/lib/server/gateway-telemetry'
import { isRecord } from '@/modules/common/is-record'
import { describeActionMcpMetadata, isToolMarketReadAction, listMcpActions, mcpToolName, type AnyAction } from '@/modules/actions'
import {
  agentAuthorityModeAllows,
  agentAuthorityScopeForMode,
  type AgentAccessAuthorityMode,
} from '@/modules/agent-access/contract'
import type { ActionAgentAccessPrincipal, ActionTimingSink } from '@/modules/common/action'
import type { CallService } from '@/modules/capability-execution/call-authority'
import { createCallService } from '@/lib/server/call-api'
import { createSupplyManagementService, type SupplyManagementService } from '@/modules/capability-supply/supply-actions'
import { createAccountManagementService, type AccountManagementService } from '@/modules/agent-access/account.actions'
import { createMarketDemandService, type MarketDemandService } from '@/modules/market-demand/market-demand.actions'
import { createFundingHandoffService } from '@/lib/server/funding-handoff-api'
import type { FundingHandoffService } from '@/modules/money/funding-handoff.actions'
const MAX_MCP_REQUEST_BODY_BYTES = 320 * 1024
const AE_MCP_INSTRUCTIONS = [
  'Use Agentic Economy to acquire one bounded outside contribution when your current harness lacks a capability.',
  'Search with `ae_registry_tools_search` and what you need.',
  'Use `ae_registry_tools_list` to browse, `ae_registry_tools_describe` for one exact input contract, and `ae_registry_tools_compare` for up to four exact references.',
  '`ae_tool_quote` and `ae_tool_call` are protected Tools: they appear in `tools/list` only after the agent connects. Connect through the OAuth device flow via `ae connect` (CLI), or, for MCP clients that support authorization, through the `/.well-known/oauth-protected-resource` metadata.',
  'Call `ae_tool_quote` with the exact Tool and input. Complete its one continuation or required action, then request a fresh Quote if the input or authority changes.',
  'Call only with the Quote returned by `ae_tool_quote`.',
  'If Account credit is insufficient, use `ae_funding_handoff_create`, give only its Stripe checkoutUrl to the payer, persist fundingSessionId, poll `ae_funding_handoff_status`, then explicitly retry the original Tool only after ready.',
  'If effects are uncertain, use `ae_call_status` or `ae_call_reconcile` before retrying.',
  'Agentic Economy returns the contribution or receipt; your existing harness keeps project planning and execution.',
  'See `/glossary.md` for the vocabulary used above, such as Tool, Quote and Call.',
].join(' ')
export type McpAccessTier = Readonly<{
  tier: 'anonymous' | 'authenticated'
  authorityMode?: AgentAccessAuthorityMode
  principalId?: string
  principal?: ActionAgentAccessPrincipal
  correlationId?: string
  timing?: ActionTimingSink
  callService?: CallService
  supplyManagementService?: SupplyManagementService
  accountManagementService?: AccountManagementService
  marketDemandService?: MarketDemandService
  fundingHandoffService?: FundingHandoffService
  rolloutEnvironment?: StringEnvironment
  /** Test-only override for the tools/list page size (default: MCP_TOOLS_LIST_PAGE_SIZE). */
  toolsListPageSize?: number
}>

type AeServerHandler<T extends AnyObjectSchema> = (
  request: SchemaOutput<T>,
  extra: RequestHandlerExtra<ServerRequest | SdkRequest, ServerNotification | Notification>,
) => ServerResult | Result | Promise<ServerResult | Result>

/**
 * Keep request validation in the installed SDK while converting its raw
 * schema-parse throw into the JSON-RPC Invalid params error the SDK already
 * defines. McpError prefixes its message for local diagnostics, so this
 * adapter restores the concise wire-level message without changing the
 * SDK-owned error code or protocol handling. The offending field (and, for a
 * `toolRef`, the expected reference pattern) is appended when the schema
 * failure names one, so a caller can self-correct without guessing.
 */
const INVALID_MCP_REQUEST_PARAMETERS_MESSAGE = 'Invalid MCP request parameters.'
/** Same Tool reference shape enforced by every `toolRef` schema (e.g. `@/modules/capability-execution/quote.ts`). */
const TOOL_REF_PATTERN = '^operation:v1:[0-9a-f]{64}$'

class ConciseMcpRequestError extends McpError {
  constructor(message: string = INVALID_MCP_REQUEST_PARAMETERS_MESSAGE) {
    super(ErrorCode.InvalidParams, message)
    this.message = message
  }
}

/** First zod-shaped issue on an unknown schema-parse failure, duck-typed since the SDK's `safeParse` types its error as `unknown`. */
function mcpValidationIssue(error: unknown): { path: string; message: string } | undefined {
  const issues = isRecord(error) && Array.isArray(error.issues) ? error.issues : undefined
  const issue = issues?.[0]
  if (!isRecord(issue) || typeof issue.message !== 'string') return undefined
  const path = Array.isArray(issue.path) ? issue.path.map(String).join('.') : ''
  return { path, message: issue.message }
}

/** Names the offending field for a request-schema failure; a `toolRef` field also gets the expected pattern. */
function mcpRequestValidationMessage(error: unknown): string {
  const issue = mcpValidationIssue(error)
  if (issue === undefined) return INVALID_MCP_REQUEST_PARAMETERS_MESSAGE
  const named = issue.path.length > 0 ? `${issue.path}: ${issue.message}` : issue.message
  const isToolRef = issue.path === 'toolRef' || issue.path.endsWith('.toolRef')
  return isToolRef
    ? `${INVALID_MCP_REQUEST_PARAMETERS_MESSAGE} ${named}. Expected pattern: ${TOOL_REF_PATTERN}.`
    : `${INVALID_MCP_REQUEST_PARAMETERS_MESSAGE} ${named}.`
}
class SafeMcpSdkServer extends Server {
  constructor() {
    super(
      { name: 'agentic-economy', version: '1.0.0' },
      { instructions: AE_MCP_INSTRUCTIONS },
    )
  }

  override setRequestHandler<T extends AnyObjectSchema>(
    requestSchema: T,
    handler: AeServerHandler<T>,
  ): void {
    const method = getMethodLiteral(requestSchema)
    const safeRequestSchema = z.looseObject({ method: z.literal(method) })
    const safeHandler = async (
      request: unknown,
      extra: RequestHandlerExtra<ServerRequest | SdkRequest, ServerNotification | Notification>,
    ): Promise<ServerResult | Result> => {
      const parsed = safeParse(requestSchema, request)
      if (!parsed.success) {
        throw new ConciseMcpRequestError(mcpRequestValidationMessage(parsed.error))
      }
      return await handler(parsed.data, extra)
    }

    Reflect.apply(Protocol.prototype.setRequestHandler, this, [safeRequestSchema, safeHandler])
  }
}

const REGISTRY_TOOLS_SEARCH_ACTION_ID = 'registry.tools.search'

/**
 * Additive structured field for the search tool only: the one next step
 * (page, remember the missing job, broaden a filtered search, or stop),
 * decided by the same registry-owned rule the CLI renders into a shell
 * continuation. Never a shell string here — MCP callers are not a shell.
 */
function toolSearchNextActionField(actionId: string, data: unknown, result: unknown): Record<string, unknown> {
  if (actionId !== REGISTRY_TOOLS_SEARCH_ACTION_ID) return {}
  const parsed = toolChoiceSearchOutputSchema.safeParse(result)
  if (!parsed.success || parsed.data.kind === 'unavailable') return {}
  return {
    nextAction: toolSearchNextAction({
      kind: parsed.data.kind,
      query: parsed.data.query,
      pagination: parsed.data.pagination,
      hasFilters: isRecord(data) && data.filters !== undefined,
    }),
  }
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

function mcpToolError(failure: McpToolFailure): {
  isError: true
  content: [{ type: 'text'; text: string }]
  structuredContent: McpToolFailure
} {
  return {
    isError: true,
    structuredContent: failure,
    content: [{
      type: 'text',
      text: JSON.stringify(failure),
    }],
  }
}

type McpToolRefusal = Readonly<{ code: string; reason?: string; nextAction?: unknown; retryable?: boolean }>

/** Every result `kind` the Tool-catalogue reads (`registry.tools.*`) use to mean "did not resolve". */
const TOOL_MARKET_READ_NEGATIVE_KINDS = new Set(['not_found', 'unavailable'])

/**
 * MCP spec: a tool-level refusal is a normal `CallToolResult` with
 * `isError: true`, not a JSON-RPC error (those stay reserved for
 * protocol-level failures, e.g. bad params — see `ConciseMcpRequestError`
 * above). Every action that deliberately declines to proceed uses
 * `kind: 'refused'` (see `quote.ts`, `call-authority.ts`, `supply-actions.ts`,
 * `market-demand.actions.ts`, `funding-handoff.actions.ts`). The Tool-catalogue
 * reads have no separate `refused` variant; they use `not_found` /
 * `unavailable` for the same purpose. Every other kind (`no_candidates`,
 * `reconciliation_required`, `pending`, …) is a legitimate non-error outcome
 * and is returned as a normal result, unchanged.
 */
function mcpToolRefusal(action: AnyAction, result: unknown): McpToolRefusal | undefined {
  if (!isRecord(result) || typeof result.kind !== 'string') return undefined
  const isRefusal = result.kind === 'refused'
    || (isToolMarketReadAction(action) && TOOL_MARKET_READ_NEGATIVE_KINDS.has(result.kind))
  if (!isRefusal) return undefined
  const explicitCode = typeof result.code === 'string' ? result.code : undefined
  const reasonText = typeof result.reason === 'string' ? result.reason : undefined
  const code = explicitCode ?? reasonText ?? result.kind
  const nextAction = result.nextAction ?? result.continuation
  const retryable = typeof result.retryable === 'boolean' ? result.retryable : undefined
  return {
    code,
    // Only surface `reason` when it is distinct from `code` (some actions
    // carry both a stable code and free-text detail; others only have one
    // field, already promoted to `code` above).
    ...(explicitCode !== undefined && reasonText !== undefined ? { reason: reasonText } : {}),
    ...(nextAction === undefined ? {} : { nextAction }),
    ...(retryable === undefined ? {} : { retryable }),
  }
}

/** Reuses the reason-copy catalogue for the human sentence where the code maps; falls back to the action's own free-text reason, then the generic sentence. */
function mcpRefusalSentence(refusal: McpToolRefusal): string {
  return REASON_COPY[refusal.code] ?? refusal.reason ?? REASON_COPY_FALLBACK
}

function mcpToolRefusalResult(refusal: McpToolRefusal): {
  isError: true
  content: [{ type: 'text'; text: string }]
  structuredContent: McpToolRefusal
} {
  return {
    isError: true,
    content: [{ type: 'text', text: mcpRefusalSentence(refusal) }],
    structuredContent: refusal,
  }
}

function mcpGatewayEvent(
  actionId: string,
  data: unknown,
  result: unknown,
): Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'> | undefined {
  if (!actionId.startsWith('tool.') && !actionId.startsWith('call.')) return undefined
  const input = isRecord(data) ? data : {}
  const output = isRecord(result) ? result : {}
  const callRef = typeof output.callRef === 'string'
    ? output.callRef
    : typeof input.callRef === 'string' ? input.callRef : undefined
  const toolRef = typeof output.toolRef === 'string'
    ? output.toolRef
    : typeof input.toolRef === 'string' ? input.toolRef : undefined
  if (output.kind === 'refused') {
    return {
      ...(callRef === undefined ? {} : { callRef }),
      ...(toolRef === undefined ? {} : { toolRef }),
      outcome: 'refused',
      refusalCode: typeof output.code === 'string' ? output.code : 'action_execution_failed',
      ...(typeof output.retryable === 'boolean' ? { retryable: output.retryable } : {}),
    }
  }
  if (output.kind === 'reconciliation_required') {
    return {
      ...(callRef === undefined ? {} : { callRef }),
      ...(toolRef === undefined ? {} : { toolRef }),
      outcome: 'reconciliation_required',
      unknown: true,
    }
  }
  if (output.kind === 'needs_authority') {
    return {
      ...(callRef === undefined ? {} : { callRef }),
      ...(toolRef === undefined ? {} : { toolRef }),
      outcome: 'needs_authority',
      approval: 'required',
    }
  }
  if (output.kind === 'pending') {
    return {
      ...(callRef === undefined ? {} : { callRef }),
      ...(toolRef === undefined ? {} : { toolRef }),
      outcome: 'pending',
    }
  }
  if (output.kind === 'found') {
    const state = output.state
    return {
      ...(callRef === undefined ? {} : { callRef }),
      ...(toolRef === undefined ? {} : { toolRef }),
      outcome: state === 'cancelled'
        ? 'cancelled'
        : state === 'reconciliation_required'
          ? 'reconciliation_required'
          : state === 'terminal'
            ? actionId === 'call.reconcile' ? 'reconciled' : 'completed'
            : 'pending',
    }
  }
  if (output.kind === 'completed' || output.kind === 'ok') {
    return {
      ...(callRef === undefined ? {} : { callRef }),
      ...(toolRef === undefined ? {} : { toolRef }),
      outcome: 'completed',
    }
  }
  return {
    ...(callRef === undefined ? {} : { callRef }),
    ...(toolRef === undefined ? {} : { toolRef }),
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
  if (access.timing === undefined || access.principal === undefined) return
  const event = mcpGatewayEvent(actionId, data, result)
  if (event === undefined) return
  recordGatewayTelemetry(access.timing, {
    ...event,
    credentialId: access.principal.credentialId,
    principalId: access.principal.principalId,
    applicationRef: access.principal.applicationRef,
    ...(access.correlationId === undefined ? {} : { correlationId: access.correlationId }),
    durationMs: Date.now() - startedAt,
  })
}


/**
 * `tools/list` is spec-paginated (`ListToolsRequestSchema` params `cursor?`,
 * `ListToolsResultSchema.nextCursor?`), but the SDK's high-level `McpServer`
 * installs a single fixed all-tools handler
 * (`@modelcontextprotocol/sdk/server/mcp.js` `setToolRequestHandlers`). Its own
 * class doc directs advanced overrides at the underlying low-level `Server`:
 * "For advanced usage (like sending notifications or setting custom request
 * handlers), use the underlying Server instance available via the `server`
 * property." `Protocol.setRequestHandler` explicitly supports this: "Note
 * that this will replace any previous request handler for the same method."
 * So the paginated handler below is installed on `sdkServer` after every
 * `registerTool` call has run (which is what lazily installs the SDK's
 * default handler), replacing it while leaving per-tool call handling and
 * the tier filter untouched.
 */
const MCP_TOOLS_LIST_PAGE_SIZE = 50
const EMPTY_MCP_TOOL_INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false } as const

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
  } catch {
    return undefined
  }
  if (!/^\d+$/u.test(text)) return undefined
  const offset = Number.parseInt(text, 10)
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= toolCount ? offset : undefined
}

function mcpToolListEntry(action: AnyAction): Record<string, unknown> {
  const metadata = describeActionMcpMetadata(action)
  const inputObjectSchema = normalizeObjectSchema(action.schema)
  return {
    name: mcpToolName(action),
    title: action.name,
    description: mcpToolDescription(action),
    inputSchema: inputObjectSchema === undefined
      ? EMPTY_MCP_TOOL_INPUT_SCHEMA
      : toJsonSchemaCompat(inputObjectSchema, { strictUnions: true, pipeStrategy: 'input' }),
    annotations: {
      readOnlyHint: action.readOnly,
      destructiveHint: action.readOnly ? false : metadata.destructive,
      idempotentHint: metadata.idempotent,
      openWorldHint: metadata.openWorld,
    },
  }
}

/**
 * `structuredContent`'s actual on-the-wire shape is `{ result: <action
 * output>, nextAction? }` (built in the tool handler below), not the
 * action's raw `outputSchema` directly — declaring the raw schema would fail
 * the SDK's own output validation (`validateToolOutput`) on every successful
 * call. Wrap it in that same envelope and only declare it when the SDK's
 * supported conversion path (`toJsonSchemaCompat`, the same one `tools/list`
 * already uses for input schemas; backed by `z.toJSONSchema` on zod 4) can
 * actually render it, so an unconvertible action output schema never breaks
 * tool registration — it just leaves that one tool without a declared
 * `outputSchema`, exactly as today.
 */
function mcpToolOutputSchema(action: AnyAction): AnyObjectSchema | undefined {
  const wrapped = z.object({ result: action.outputSchema, nextAction: z.unknown().optional() })
  try {
    toJsonSchemaCompat(wrapped, { strictUnions: true, pipeStrategy: 'output' })
    return wrapped
  } catch {
    return undefined
  }
}

function registerPaginatedToolsList(
  sdkServer: Server,
  admittedActions: readonly AnyAction[],
  pageSize: number,
): void {
  sdkServer.setRequestHandler(ListToolsRequestSchema, (toolsListRequest) => {
    const cursor = toolsListRequest.params?.cursor
    const offset = cursor === undefined ? 0 : decodeMcpToolsListCursor(cursor, admittedActions.length)
    if (offset === undefined) {
      throw new ConciseMcpRequestError(`${INVALID_MCP_REQUEST_PARAMETERS_MESSAGE} cursor: does not decode to a valid tools/list page offset.`)
    }
    const page = admittedActions.slice(offset, offset + pageSize)
    const nextOffset = offset + page.length
    return {
      tools: page.map(mcpToolListEntry),
      ...(nextOffset < admittedActions.length ? { nextCursor: encodeMcpToolsListCursor(nextOffset) } : {}),
    }
  })
}

export function createAeMcpServer(
  request: Request,
  actions: readonly AnyAction[] = listMcpActions(),
  access: McpAccessTier = { tier: 'anonymous' },
): McpServer {
  const admittedActions = access.tier === 'anonymous'
    ? actions.filter((action) => action.surfaces.includes('mcp') && action.readOnly && action.credentialAdmission === undefined)
    : actions.filter((action) => action.surfaces.includes('mcp') && (
      (action.credentialAdmission === undefined && action.readOnly)
      || (action.credentialAdmission !== undefined
        && actionCredentialAdmitted(access.principal?.scopes ?? [], action.credentialAdmission))
      || (action.credentialAdmission === undefined
        && access.authorityMode !== undefined
        && agentAuthorityModeAllows(access.authorityMode, requiredModeForAction(action)))
    ))

  const server = new McpServer(
    { name: 'agentic-economy', version: '1.0.0' },
    { instructions: AE_MCP_INSTRUCTIONS },
  )
  const sdkServer = new SafeMcpSdkServer()
  const serverWithSdk = server as { server: Server }
  serverWithSdk.server = sdkServer
  for (const action of admittedActions) {
    const metadata = describeActionMcpMetadata(action)
    const outputSchema = mcpToolOutputSchema(action)
    server.registerTool(
      mcpToolName(action),
      {
        title: action.name,
        description: mcpToolDescription(action),
        inputSchema: action.schema,
        ...(outputSchema === undefined ? {} : { outputSchema }),
        annotations: {
          readOnlyHint: action.readOnly,
          destructiveHint: action.readOnly ? false : metadata.destructive,
          idempotentHint: metadata.idempotent,
          openWorldHint: metadata.openWorld,
        },
      },
      async (data: unknown) => {
        const startedAt = Date.now()
        try {
          const rollout = package5SupplyActionRolloutDecision(action.id, data, access.rolloutEnvironment)
          if (!rollout.enabled) {
            return mcpToolError(buildProblem({
              kind: 'UNAVAILABLE',
              code: rollout.code,
              retryable: false,
              detail: 'This Provider capability is not enabled for the current deployment.',
              ...(access.correlationId === undefined ? {} : { extras: { correlationId: access.correlationId } }),
            }))
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
              ...(access.fundingHandoffService === undefined ? {} : { fundingHandoffService: access.fundingHandoffService }),
              ...(access.callService === undefined ? {} : { callService: access.callService }),
            },
          })
          const outputValidation = await safeParseAsync(action.outputSchema, result)
          if (!outputValidation.success) {
            recordMcpGatewayTelemetry(action.id, data, { kind: 'error' }, access, startedAt)
            return mcpToolError(buildProblem({
              kind: 'INTERNAL',
              code: 'action_output_invalid',
              detail: 'Action returned an invalid result.',
              ...(access.correlationId === undefined ? {} : { extras: { correlationId: access.correlationId } }),
            }))
          }
          recordMcpGatewayTelemetry(action.id, data, result, access, startedAt)
          const refusal = mcpToolRefusal(action, outputValidation.data)
          if (refusal !== undefined) return mcpToolRefusalResult(refusal)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(outputValidation.data) }],
            structuredContent: {
              result: outputValidation.data,
              ...toolSearchNextActionField(action.id, data, outputValidation.data),
            },
          }
        } catch (error) {
          recordMcpGatewayTelemetry(action.id, data, undefined, access, startedAt)
          return mcpToolError(mcpToolFailure(action, error, access.correlationId))
        }
      },
    )
  }

  registerPaginatedToolsList(sdkServer, admittedActions, access.toolsListPageSize ?? MCP_TOOLS_LIST_PAGE_SIZE)

  return server
}

function actionCredentialAdmitted(
  scopes: readonly string[],
  admission: NonNullable<AnyAction['credentialAdmission']>,
): boolean {
  return admission.anyScopes === undefined
    ? scopes.includes(admission.scope)
    : admission.anyScopes.some((scope) => scopes.includes(scope))
}

type McpRequestOptions = Readonly<{
  actions?: readonly AnyAction[]
  authenticate?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['authenticate']
  resolvePrincipal?: AgentAccessPrincipalResolver
  supplyManagementService?: SupplyManagementService
  accountManagementService?: AccountManagementService
  marketDemandService?: MarketDemandService
  fundingHandoffService?: FundingHandoffService
  timing?: ActionTimingSink
  callService?: CallService
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
export async function handleMcpRouteRequest(
  request: Request,
  options: McpRequestOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let admission
    try {
      admission = await assertHttpAdmission(request, 'public-read')
    } catch {
      return withRequestCorrelationHeader(problem({
        status: 503,
        kind: 'UNAVAILABLE',
        code: 'mcp_admission_unavailable',
        retryable: true,
        detail: 'The MCP endpoint is temporarily unavailable. Retry later.',
        extras: { correlationId },
      }), correlationId)
    }
    if (!admission.ok) {
      return withRequestCorrelationHeader(rateLimitedResponse(admission.retryAfter), correlationId)
    }
    return withRequestCorrelationHeader(await handleMcpRequest(request, options), correlationId)
  })
}

function mcpActionConsequenceResource(action: AnyAction): string {
  const canonicalActionId = action.id.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
  return `surface:mcp:${canonicalActionId}`
}

export async function handleMcpRequest(request: Request, options: McpRequestOptions = {}): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return withRequestCorrelationHeader(methodNotAllowed(['POST', 'DELETE']), correlationId)
    }
    const actions = options.actions ?? listMcpActions()
    const bounded = await boundedMcpRequest(request)
    if (!bounded.ok) {
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The MCP request body is too large.',
      }), correlationId)
    }
    const boundedRequest = bounded.request
    const protectedTarget = await actionRequiringAuthenticationForRequest(boundedRequest, actions)
    if (protectedTarget !== undefined) {
      const protectedAction = protectedTarget.action
      const requiredMode = requiredModeForAction(protectedAction)
      const credentialAdmission = protectedTarget.generic ? undefined : protectedAction.credentialAdmission
      const requiredAnyScopes = credentialAdmission?.anyScopes ?? []
      const requiredScope = requiredAnyScopes.length > 0 ? null : credentialAdmission?.scope
      const resolverRequiredScopes = protectedTarget.generic || requiredAnyScopes.length > 0
        ? []
        : [credentialAdmission?.scope ?? agentAuthorityScopeForMode(requiredMode)]
      const resolvePrincipal = options.resolvePrincipal
        ?? (options.authenticate === undefined
          ? resolveAgentAccessPrincipal(boundedRequest, bounded.bodyText, correlationId)
          : undefined)
      const admitted = await authenticateAgentAccess({
        ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
        ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
        consequenceResource: protectedTarget.generic
          ? 'surface:mcp:tools-list'
          : mcpActionConsequenceResource(protectedAction),
        ...(requiredScope === undefined ? {} : { requiredScope }),
        requiredScopes: resolverRequiredScopes,
        requiredAnyScopes,
        requiredMode,
      })
      if (admitted.kind === 'refused') {
        const base = resolveCanonicalBaseUrl(request).baseUrl
        const challenge = requiredScope !== undefined && requiredScope !== null
          ? bearerChallenge(base, requiredScope)
          : requiredMode === 'read_only'
            ? bearerChallenge(base)
            : bearerModeChallenge(base, requiredMode)
        const failure = gatewayFailureToProblem({ kind: 'refused', code: admitted.reason, retryable: false })
        return withRequestCorrelationHeader(problem(
          {
            ...failure,
            status: admitted.status,
            detail: admitted.reason === 'authentication_required'
              ? 'Authentication required.'
              : 'The provided API key does not carry the required scope.',
          },
          { Vary: 'Authorization', 'WWW-Authenticate': challenge },
        ), correlationId)
      }
      const server = createAeMcpServer(boundedRequest, actions, {
        tier: 'authenticated',
        authorityMode: admitted.principal.authorityMode,
        principalId: admitted.principal.principalId,
        principal: admitted.principal,
        correlationId,
        callService: options.callService
          ?? createCallService(boundedRequest, bounded.bodyText),
        supplyManagementService: options.supplyManagementService
          ?? createSupplyManagementService(boundedRequest, bounded.bodyText),
        accountManagementService: options.accountManagementService
          ?? createAccountManagementService(boundedRequest, bounded.bodyText),
        marketDemandService: options.marketDemandService
          ?? createMarketDemandService(boundedRequest, bounded.bodyText),
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
  }
  const boundedBody = await readBoundedRequestText(request, MAX_MCP_REQUEST_BODY_BYTES)
  if (!boundedBody.ok) return boundedBody
  return {
    ok: true,
    bodyText: boundedBody.text,
    request: new Request(request.url, { ...init, body: boundedBody.text }),
  }
}

async function serveMcp(server: McpServer, request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  return await transport.handleRequest(request)
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
      if (action !== undefined && (action.credentialAdmission !== undefined || !action.readOnly)) {
        return { action, generic: false }
      }
    }
    if (
      body.method === 'tools/list'
      && (request.headers.get('authorization')?.trim().length ?? 0) > 0
    ) {
      const action = actions.find((candidate) => candidate.credentialAdmission !== undefined)
      return action === undefined ? undefined : { action, generic: true }
    }
    return undefined
  } catch {
    return undefined
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
