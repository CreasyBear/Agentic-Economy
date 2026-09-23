import { z } from 'zod'
import { PROBLEM_KINDS, type ProblemDetails } from '@/lib/errors'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import { parseCallRef, parseQuoteRef, type CallRef, type QuoteRef } from '@/modules/capability-execution/call-contracts'
import type { CallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'
import { toolProcureInputSchema, type ToolProcureInput, type ToolProcureResult } from '@/modules/capability-execution/procure'
import { idempotencyKeySchema } from '@/modules/common/action'
import type { Brand } from '@/modules/common/ids'
import type { PublicToolRef } from '@/modules/common/tool-ref'
import type { PrincipalRef } from '@/modules/principal-account/principal/public'
import { registryNextActionSchema, type RegistryNextAction, type SearchResult } from '@/modules/registry/tool-choice-contracts'

import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { AccountManagementService } from '@/modules/agent-access/account.actions'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import type { CallService } from '@/modules/capability-execution/call-authority'
import type { ToolCatalogSearcher } from '@/modules/capability-execution/procure-engine'
import type { ToolProjectionNavigationContract } from '@/modules/capability-supply/tool-projection'
import type { SupplyManagementService } from '@/modules/capability-supply/supply-actions'
import { toolMarketNavigation } from '@/modules/registry/tool-entry'
import type { SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import type { MarketDemandService } from '@/modules/market-demand/market-demand.actions'
import type { FundingHandoffService } from '@/modules/money/funding-handoff.actions'

export const CURRENT_TOOL_PROJECTION_NAVIGATION = Object.freeze({
  market: Object.freeze({
    list: toolMarketNavigation('list'),
    search: toolMarketNavigation('search'),
    describe: toolMarketNavigation('describe'),
    compare: toolMarketNavigation('compare'),
  }),
  call: Object.freeze({
    relation: 'call',
    pathTemplate: CALL_ROUTE_CONTRACT.call.path,
    method: CALL_ROUTE_CONTRACT.call.method,
    actionId: CALL_ROUTE_CONTRACT.call.actionId,
    authentication: 'required',
    surfaces: ['http', 'cli', 'mcp', 'chat'] as const,
  }),
}) satisfies ToolProjectionNavigationContract

declare module '@/modules/common/action' {
  interface ActionContextComposition {
    /** Admission context for writes; built from the calling surface's request. */
    sourceWriteRequest?: SourceWriteAdmissionRequest
    /** Full server-derived agent-access principal; never caller-supplied authority. */
    agentAccessPrincipal?: AgentAccessPrincipal
    /** One injected Call application service shared by HTTP and MCP adapters. */
    callService?: CallService
    /** One injected supply-management service shared by authenticated MCP and CLI adapters. */
    supplyManagementService?: SupplyManagementService
    /** Injected catalog searcher for capability procurement. */
    catalogSearcher?: ToolCatalogSearcher
    /** One injected account read service shared by authenticated HTTP, MCP, and CLI adapters. */
    accountManagementService?: AccountManagementService
    /** Private market-demand memory shared by authenticated HTTP, MCP, and CLI adapters. */
    marketDemandService?: MarketDemandService
    /** Agent-native hosted funding session service shared by HTTP and MCP. */
    fundingHandoffService?: FundingHandoffService
  }
}

export type ThreadRef = Brand<string, 'ThreadRef'>
export type TurnRef = Brand<string, 'TurnRef'>
export type JourneyRef =
  | Readonly<{ kind: 'tool'; ref: PublicToolRef }>
  | Readonly<{ kind: 'quote'; ref: QuoteRef }>
  | Readonly<{ kind: 'call'; ref: CallRef }>
  | Readonly<{ kind: 'turn'; ref: TurnRef }>

export type WorkState =
  | 'submitted' | 'working' | 'input-required' | 'auth-required'
  | 'completed' | 'failed' | 'canceled' | 'rejected'

type EventBase = Readonly<{
  eventId: string
  correlationId: string
  sequence: number
  state: WorkState
}>
export type TurnEvent = EventBase & Readonly<{
  kind: 'turn'
  turnRef: TurnRef
  contextId: ThreadRef
  callRef?: never
  payment?: never
}>
export type CallEvent = EventBase & Readonly<{
  kind: 'call'
  callRef: CallRef
  contextId?: ThreadRef
  payment: 'not_requested' | 'pending' | 'paid' | 'refunded' | 'outcome_unknown'
  receiptArtifactRef?: string
  turnRef?: never
}>
export type JourneyEvent = TurnEvent | CallEvent

export type JourneyNext =
  | RegistryNextAction
  | Readonly<{ action: 'quote'; args: { toolRef: PublicToolRef; input: Record<string, JsonValue> }; authority: 'agent_key' }>
  | Readonly<{ action: 'call'; args: { quoteRef: QuoteRef; idempotencyKey: string }; authority: 'agent_key' }>
  | Readonly<{ action: 'procure'; args: ToolProcureInput; authority: 'agent_key' }>
  | Readonly<{ action: 'status'; args: { ref: JourneyRef }; authority: 'same_principal' }>
  | Readonly<{ action: 'wait'; args: { callRef: CallRef; afterVersion?: number }; authority: 'same_principal' }>
  | Readonly<{ action: 'fund'; args: Record<string, never>; authority: 'agent_key' }>
  | Readonly<{ action: 'describe'; args: { toolRef: PublicToolRef }; authority: 'public' }>
  | Readonly<{ action: 'connect'; args: { via: 'cli'; command: 'ae connect' }; authority: 'human_owner' }>
  | Readonly<{ action: 'connect'; args: { via: 'oauth_device'; url: string; pollHandle?: string }; authority: 'human_owner' }>
  | Readonly<{ action: 'approve'; args: { callRef: CallRef; url: string }; authority: 'human_owner' }>
  | Readonly<{ action: 'provide-input'; args: { taskId: TurnRef; fields: readonly string[] }; authority: 'same_principal' }>

export type JourneyStatus =
  | Readonly<{ kind: 'tool'; ref: PublicToolRef; readiness: SearchResult['readiness']; next: readonly JourneyNext[]; workState?: never }>
  | Readonly<{ kind: 'quote'; ref: QuoteRef; principalRef: PrincipalRef; commitment: 'committed' | 'refused' | 'expired' | 'consumed'; next: readonly JourneyNext[]; workState?: never }>
  | Readonly<{ kind: 'call'; ref: CallRef; principalRef: PrincipalRef; recovery: CallStatusResult; workState: WorkState; next: readonly JourneyNext[] }>
  | Readonly<{ kind: 'turn'; ref: TurnRef; principalRef: PrincipalRef; workState: WorkState; next: readonly JourneyNext[] }>

type JourneyProblemBase = Pick<ProblemDetails,
  'type' | 'title' | 'status' | 'detail' | 'instance' | 'kind' | 'code' | 'invalid-params'
> & Readonly<{
  retryable: boolean
  next: readonly JourneyNext[]
  refs?: Readonly<{
    callRef?: CallRef
    quoteRef?: QuoteRef
    recoveryRef?: string
    toolRef?: PublicToolRef
    idempotencyKey?: string
    identityPreserved?: boolean
  }>
}>
export type JourneyProblem = JourneyProblemBase & (
  | Readonly<{ source: 'remote'; requestId: string }>
  | Readonly<{ source: 'local'; requestId?: never }>
)

export type JourneyProjectionOptions = Readonly<{
  origin: string
  allowedOrigins?: readonly string[]
  source?: 'remote' | 'local'
}>

const toolRefSchema = z.string().regex(/^operation:v1:[0-9a-f]{64}$/u).transform((value) => value as PublicToolRef)
const quoteRefSchema = z.string().regex(/^operation-commitment:v1:[0-9a-f]{64}$/u).transform((value) => value as QuoteRef)
const callRefSchema = z.string().regex(/^operation-invocation:v1:[0-9a-f]{64}$/u).transform((value) => value as CallRef)
const taskRefSchema = z.string().regex(/^turn_[0-9a-f-]{36}$/u).transform((value) => value as TurnRef)
export const statusRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tool'), ref: toolRefSchema }),
  z.strictObject({ kind: z.literal('quote'), ref: quoteRefSchema }),
  z.strictObject({ kind: z.literal('call'), ref: callRefSchema }),
  z.strictObject({ kind: z.literal('turn'), ref: taskRefSchema }),
])
const safeContinuationUrlSchema = z.union([
  z.url(),
  z.string().startsWith('/').refine((url) => !url.startsWith('//') && !url.includes('\\')),
])
export const journeyNextSchema = z.union([
  registryNextActionSchema,
  z.strictObject({ action: z.literal('quote'), args: z.strictObject({ toolRef: toolRefSchema, input: z.record(z.string(), jsonValueSchema) }), authority: z.literal('agent_key') }),
  z.strictObject({ action: z.literal('call'), args: z.strictObject({ quoteRef: quoteRefSchema, idempotencyKey: idempotencyKeySchema }), authority: z.literal('agent_key') }),
  z.strictObject({ action: z.literal('procure'), args: toolProcureInputSchema, authority: z.literal('agent_key') }),
  z.strictObject({ action: z.literal('status'), args: z.strictObject({ ref: statusRefSchema }), authority: z.literal('same_principal') }),
  z.strictObject({ action: z.literal('wait'), args: z.strictObject({ callRef: callRefSchema, afterVersion: z.number().int().nonnegative().optional() }), authority: z.literal('same_principal') }),
  z.strictObject({ action: z.literal('fund'), args: z.strictObject({}), authority: z.literal('agent_key') }),
  z.strictObject({ action: z.literal('describe'), args: z.strictObject({ toolRef: toolRefSchema }), authority: z.literal('public') }),
  z.strictObject({ action: z.literal('connect'), args: z.strictObject({ via: z.literal('cli'), command: z.literal('ae connect') }), authority: z.literal('human_owner') }),
  z.strictObject({ action: z.literal('connect'), args: z.strictObject({ via: z.literal('oauth_device'), url: safeContinuationUrlSchema, pollHandle: z.string().min(1).optional() }), authority: z.literal('human_owner') }),
  z.strictObject({ action: z.literal('approve'), args: z.strictObject({ callRef: callRefSchema, url: safeContinuationUrlSchema }), authority: z.literal('human_owner') }),
  z.strictObject({ action: z.literal('provide-input'), args: z.strictObject({ taskId: taskRefSchema, fields: z.array(z.string()) }), authority: z.literal('same_principal') }),
])
const problemSchema = z.object({
  type: z.literal('about:blank'),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().exactOptional(),
  instance: z.string().exactOptional(),
  kind: z.enum(PROBLEM_KINDS).exclude(['NO_DATA']),
  code: z.string().regex(/^[a-z][a-z0-9_:-]{0,95}$/u),
  retryable: z.boolean(),
  'invalid-params': z.array(z.strictObject({ name: z.string(), reason: z.string() })).exactOptional(),
})
const refsSchema = z.strictObject({
  callRef: callRefSchema.exactOptional(),
  quoteRef: quoteRefSchema.exactOptional(),
  recoveryRef: z.uuid().exactOptional(),
  toolRef: toolRefSchema.exactOptional(),
  idempotencyKey: idempotencyKeySchema.exactOptional(),
  identityPreserved: z.boolean().exactOptional(),
})

/** Parse action facts from a trusted result; reject remote extensions and off-origin URLs. */
export function validateJourneyNext(value: unknown, options: JourneyProjectionOptions): readonly JourneyNext[] {
  if (!Array.isArray(value)) return []
  const origins = new Set([new URL(options.origin).origin, ...(options.allowedOrigins ?? []).map((url) => new URL(url).origin)])
  return value.flatMap((candidate): JourneyNext[] => {
    const parsed = journeyNextSchema.safeParse(candidate)
    if (!parsed.success) return []
    const next = parsed.data
    const target = next.action === 'approve' ? next.args.url
      : next.action === 'connect' && next.args.via === 'oauth_device' ? next.args.url
      : undefined
    if (target !== undefined) {
      if (!URL.canParse(target, options.origin)) return []
      const url = new URL(target, options.origin)
      if (!origins.has(url.origin) || url.username !== '' || url.password !== '' ||
        (url.protocol !== 'https:' && url.protocol !== 'http:')) return []
    }
    return [next as JourneyNext]
  })
}

/** Whitelist canonical RFC 9457 fields before projecting the one continuation channel. */
export function projectJourneyProblem(input: unknown, options: JourneyProjectionOptions): JourneyProblem {
  const problem = problemSchema.parse(input)
  const record = input as Record<string, unknown>
  const next = validateJourneyNext(record.next, options)
  const refs = refsSchema.safeParse(record.refs)
  const base = { ...problem, next, ...(refs.success ? { refs: refs.data } : {}) }
  if (options.source === 'local') return { ...base, source: 'local' }
  const requestId = z.string().min(1).parse(record.requestId)
  return { ...base, source: 'remote', requestId }
}

/** Recovery and remedial actions are derived only from validated refs and refusal facts. */
export function projectProcureNext(result: ToolProcureResult): readonly JourneyNext[] {
  if (result.status === 'refused') {
    const next: JourneyNext[] = result.code === 'budget_exceeded'
      ? [{ action: 'fund', args: {}, authority: 'agent_key' }]
      : []
    if (result.quoteRef === undefined) return next
    const quote = parseQuoteRef(result.quoteRef)
    if (quote.kind !== 'valid') throw new Error('procure_result_quote_ref_invalid')
    return [...next, { action: 'status', args: { ref: { kind: 'quote', ref: quote.ref } }, authority: 'same_principal' }]
  }
  const call = parseCallRef(result.callRef)
  if (call.kind !== 'valid') throw new Error('procure_result_call_ref_invalid')
  return [{ action: 'status', args: { ref: { kind: 'call', ref: call.ref } }, authority: 'same_principal' }]
}

/** Recovery remains pinned to the same Call; no continuation creates a fresh purchase. */
export function projectCallStatusNext(ref: CallRef, recovery: CallStatusResult): readonly JourneyNext[] {
  return recovery.kind === 'found' && (recovery.state === 'terminal' || recovery.state === 'cancelled')
    ? []
    : [
        { action: 'status', args: { ref: { kind: 'call', ref } }, authority: 'same_principal' },
        { action: 'wait', args: { callRef: ref, ...(recovery.kind === 'found' ? { afterVersion: recovery.version } : {}) }, authority: 'same_principal' },
      ]
}

export function projectCliJourneyProblem(
  input: unknown,
  options: JourneyProjectionOptions & Readonly<{ exitCode: number }>,
): JourneyProblem & Readonly<{ exitCode: number }> {
  return { ...projectJourneyProblem(input, options), exitCode: options.exitCode }
}

export function projectMcpJourneyProblem(input: unknown, options: JourneyProjectionOptions): Readonly<{
  isError: true
  structuredContent: JourneyProblem
  content: readonly [{ type: 'text'; text: string }]
}> {
  const problem = projectJourneyProblem(input, options)
  return { isError: true, structuredContent: problem, content: [{ type: 'text', text: problem.title }] }
}

export function projectStreamJourneyProblem(input: unknown, options: JourneyProjectionOptions): Readonly<{
  type: 'data-ae-problem'
  value: JourneyProblem
}> {
  return { type: 'data-ae-problem', value: projectJourneyProblem(input, options) }
}
