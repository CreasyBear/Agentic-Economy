import { z } from 'zod'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { CallService } from './call-authority'
import type { CallResult } from './call-contracts'
import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  createConvexServerFunctionAssertion,
  sourceMutation,
  sourceQuery,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { deserializeToolSearchResult } from '@/modules/capability-supply/public'
import {
  compareExactAmounts,
  formatDisplayAmount,
  parseDecimalExactAmount,
  type ExactAmount,
} from '@/modules/money/public'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { rankToolsForSelection, type ToolSelectionEvidence } from '@/modules/common/tool-selection-score'
import { toolProcureResultSchema, type ToolProcureInput, type ToolProcureResult } from './procure'
import { MIN_MODEL_CONFIDENCE, routeSelection } from './route-selection'
import { recordSelectionDecision } from './selection-decision-recorder'

/**
 * Leaf contract: A tool candidate projected from the canonical capability catalog / DB.
 */
export type CatalogToolCandidate = Readonly<{
  toolRef: string
  name: string
  description: string
  endpoint: string
  priceAud: string
  payers30d?: number
  minimumUsdPrice?: number
  inputSchema?: Record<string, unknown>
}>

export type ToolCatalogSearcher = (
  query: string,
  limit?: number,
) => Promise<readonly CatalogToolCandidate[]>

const searchToolsQuery = sourceQuery<Record<string, unknown>, unknown>('capabilitySupplyTools:search')
type SelectionEvidenceRow = Readonly<{
  toolRef: string
  aeCompleted: number
  aeFailed: number
  reportedByBuyers30d?: number
  usedBefore: boolean
}>
const selectionEvidenceQuery = sourceQuery<{
  toolRefs: string[]
  accountRef?: string
  serviceAuth: ConvexServerFunctionAssertion
}, readonly SelectionEvidenceRow[]>('marketListingEvidence:selectionEvidence')

const identityMutation = {
  reserve: sourceMutation<Record<string, unknown>, unknown>('capabilityProcure:reserve'),
  checkpoint: sourceMutation<Record<string, unknown>, unknown>('capabilityProcure:checkpointQuote'),
  complete: sourceMutation<Record<string, unknown>, unknown>('capabilityProcure:complete'),
}
const identityResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('reserved') }),
  z.strictObject({ kind: z.literal('replay'), resultJson: z.string().nullable(), quoteRef: z.string().nullable() }),
  z.strictObject({ kind: z.literal('conflict') }),
  z.strictObject({ kind: z.literal('unauthorized') }),
])
const quoteSnapshotSchema = z.strictObject({
  quoteRef: z.string().min(1),
  price: z.strictObject({ currency: z.literal('AUD'), units: z.string(), exponent: z.number() }),
  toolRef: z.string(),
  input: z.record(z.string(), z.unknown()),
  toolName: z.string().optional(),
  endpoint: z.string().optional(),
  routingLatencyMs: z.number(),
})
type IdentityResult = z.infer<typeof identityResultSchema>
export class ProcureConflictError extends Error {}
export class ProcureInProgressError extends Error {}
export class ProcureAuthorityError extends Error {}
export class ProcureSelectionUnavailableError extends Error {}
type ExactProcureInput = Extract<ToolProcureInput, { kind: 'exact' }>
export type ProcureIdentityPort = Readonly<{
  reserve(input: ExactProcureInput, principal: AgentAccessPrincipal): Promise<IdentityResult>
  checkpoint(input: ExactProcureInput, principal: AgentAccessPrincipal, quote: z.infer<typeof quoteSnapshotSchema>): Promise<IdentityResult>
  complete(input: ExactProcureInput, principal: AgentAccessPrincipal, result: ToolProcureResult): Promise<IdentityResult>
}>

export function createProcureIdentityPort(request: Request, bodyText: string, correlationId: string): ProcureIdentityPort {
  async function invoke(phase: keyof typeof identityMutation, input: ExactProcureInput, principal: AgentAccessPrincipal, extra: Record<string, unknown> = {}) {
    const operationKey = canonicalDigest({ phase, principalId: principal.principalId, key: input.idempotencyKey })
    const command = {
      principal, idempotencyKey: input.idempotencyKey,
      inputJson: JSON.stringify(input), operationKey, correlationId, ...extra,
    }
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request, command, body: bodyText, scope: 'protected_action', operationKey, correlationId,
    })
    return identityResultSchema.parse(await callPublicSourceMutation(identityMutation[phase], {
      ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    }))
  }
  return {
    reserve: async (input, principal) => await invoke('reserve', input, principal),
    checkpoint: async (input, principal, quote) => await invoke('checkpoint', input, principal, {
      quoteRef: quote.quoteRef, quoteJson: JSON.stringify(quote),
    }),
    complete: async (input, principal, result) => await invoke('complete', input, principal, {
      resultJson: JSON.stringify(result),
    }),
  }
}

function acceptedIdentity(result: IdentityResult): Extract<IdentityResult, { kind: 'reserved' | 'replay' }> {
  if (result.kind === 'conflict') throw new ProcureConflictError('The procurement key is bound to different material.')
  if (result.kind === 'unauthorized') throw new ProcureAuthorityError('Procurement principal is not authorised.')
  return result
}

/** Buyer display amounts never determine Quote, budget or ledger arithmetic. */
function procurePriceBreakdownFromUnits(totalUnits: string): Readonly<{
  totalAud: string
  netAud: string
  gstAud: string
}> {
  const totalAud = formatDisplayAmount({ currency: 'AUD', exponent: 6, units: totalUnits })
  return {
    totalAud,
    netAud: totalAud,
    gstAud: formatDisplayAmount({ currency: 'AUD', exponent: 6, units: '0' }),
  }
}

function procurePriceBreakdownFromQuote(quotePrice: ExactAmount): Readonly<{
  totalAud: string
  netAud: string
  gstAud: string
}> {
  return procurePriceBreakdownFromUnits(quotePrice.units)
}

function completedCallBuyerRefundAuthoritative(
  callRes: Extract<CallResult, { kind: 'completed' }>,
): boolean {
  if (callRes.usage.chargeState === 'refunded') return true
  if (callRes.receipt?.state === 'refunded') return true
  if (callRes.receipt?.refundState === 'released') return true
  return false
}

export const defaultProductionCatalogSearcher: ToolCatalogSearcher = async (
  query: string,
  limit = 10,
): Promise<readonly CatalogToolCandidate[]> => {
  try {
    const raw = await callPublicSourceQuery(searchToolsQuery, { query, limit })
    const deserialized = deserializeToolSearchResult(raw as Parameters<typeof deserializeToolSearchResult>[0])
    if (deserialized.kind === 'no_candidates' && deserialized.partialResults !== true) return []
    if (deserialized.kind !== 'ok' || deserialized.partialResults === true) throw new ProcureSelectionUnavailableError('The Tool catalog is unavailable.')
    return deserialized.items.map((tool) => ({
      toolRef: tool.toolRef,
      name: tool.contract.capabilityId,
      description: tool.summary,
      endpoint: tool.callVia,
      priceAud: tool.catalogPrice?.currency === 'AUD'
        ? tool.catalogPrice.amount ?? tool.catalogPrice.maxAmount ?? ''
        : '',
      ...(tool.contract.inputJsonSchema !== undefined ? { inputSchema: tool.contract.inputJsonSchema as Record<string, unknown> } : {}),
    }))
  } catch (cause) {
    throw new ProcureSelectionUnavailableError('The Tool catalog is unavailable.', { cause })
  }
}

export type ProcurementEngineDependencies = Readonly<{
  catalogSearcher: ToolCatalogSearcher
  callService: CallService
  principal: AgentAccessPrincipal
  identity: ProcureIdentityPort
  correlationId?: string
}>

/** One caller key is bound before the Quote and reused through Call recovery. */
export class CapabilityProcurementEngine {
  constructor(private readonly dependencies: ProcurementEngineDependencies) {}

  private async select(input: Extract<ToolProcureInput, { kind: 'need' }>): Promise<ToolProcureResult> {
    const common = { schemaVersion: 'tool.procure:v1' as const }
    let candidates: readonly CatalogToolCandidate[]
    try {
      candidates = await this.dependencies.catalogSearcher(input.need, 10)
    } catch (cause) {
      if (!(cause instanceof ProcureSelectionUnavailableError)) throw cause
      return { ...common, kind: 'refused', status: 'refused', code: 'selection_unavailable', retryable: true, detail: 'Tool selection is unavailable; retry the need.' }
    }
    if (candidates.length === 0) {
      return { ...common, kind: 'refused', status: 'refused', code: 'no_matching_tool', retryable: false, detail: 'No matching published Tool was found.' }
    }
    let evidenceRows: readonly SelectionEvidenceRow[]
    try {
      const command = {
        toolRefs: candidates.map((candidate) => candidate.toolRef),
        accountRef: this.dependencies.principal.ownerId,
      }
      const serviceAuth = await createConvexServerFunctionAssertion({
        operation: 'marketListingEvidence.selectionEvidence',
        scope: 'market_selection:evidence',
        command,
      })
      evidenceRows = await callPublicSourceQuery(selectionEvidenceQuery, { ...command, serviceAuth })
    } catch (cause) {
      evidenceRows = degradeBackend(cause, [], {
        site: 'CapabilityProcurementEngine.selectSelectionEvidence',
        reason: 'source_unavailable',
      })
    }
    const evidenceByToolRef = new Map(evidenceRows.map((row) => [row.toolRef, row] as const))
    const ranked = rankToolsForSelection(candidates, (candidate): ToolSelectionEvidence => {
      const evidence = evidenceByToolRef.get(candidate.toolRef)
      return {
        ...(candidate.payers30d === undefined ? {} : { payers30d: candidate.payers30d }),
        aeCompleted: evidence?.aeCompleted ?? 0,
        aeFailed: evidence?.aeFailed ?? 0,
        reportedByBuyers30d: evidence?.reportedByBuyers30d ?? 0,
        ...(candidate.minimumUsdPrice === undefined ? {} : { minimumUsdPrice: candidate.minimumUsdPrice }),
        usedBefore: evidence?.usedBefore ?? false,
      }
    }, input.prefer ?? 'balanced')
    const rankedCandidates = ranked.map((item) => item.candidate)
    const offered = ranked.map((item, rank) => ({
      toolRef: item.candidate.toolRef,
      rank,
      score: item.score,
    }))
    const correlationId = this.dependencies.correlationId ?? globalThis.crypto.randomUUID()
    const routing = await routeSelection(input.need, rankedCandidates, { disableSecondaryLlm: true })
    void recordSelectionDecision({
      kind: 'procure',
      accountRef: this.dependencies.principal.ownerId,
      correlationId,
      offered,
      pickedToolRef: routing.tool?.toolRef ?? null,
      tier: routing.tier,
      modelConfidence: routing.modelConfidence,
      fit: routing.fit.map(({ toolRef, noul }) => ({ toolRef, noul, score: null })),
      latencyMs: routing.latencyMs,
      costAud: routing.costAud,
    }).catch(() => {})
    if (routing.tool === null || (routing.modelConfidence !== null && routing.modelConfidence < MIN_MODEL_CONFIDENCE)) {
      return { ...common, kind: 'refused', status: 'refused', code: 'no_matching_tool', retryable: false, detail: 'No matching published Tool was found.' }
    }
    const schema = routing.tool.inputSchema
    if (schema?.type !== 'object' || typeof schema.properties !== 'object' || schema.properties === null || Array.isArray(schema.properties)) {
      return { ...common, kind: 'refused', status: 'refused', code: 'input_invalid', retryable: false, detail: 'The selected Tool has no complete input contract.' }
    }
    const requiredFields: string[] = []
    const visit = (object: Record<string, unknown>, prefix = ''): boolean => {
      if (object.type === 'object' && (typeof object.properties !== 'object' || object.properties === null || Array.isArray(object.properties))) return false
      if (!Array.isArray(object.required)) return true
      const properties = object.properties as Record<string, unknown>
      for (const name of object.required) {
        if (typeof name !== 'string' || !Object.hasOwn(properties, name)) return false
        const path = prefix ? `${prefix}.${name}` : name
        requiredFields.push(path)
        const child = properties[name]
        if (typeof child !== 'object' || child === null || Array.isArray(child) || !visit(child as Record<string, unknown>, path)) return false
      }
      return true
    }
    if (!visit(schema)) {
      return { ...common, kind: 'refused', status: 'refused', code: 'input_invalid', retryable: false, detail: 'The selected Tool has no complete input contract.' }
    }
    const selectedScore = ranked.find((item) => item.candidate.toolRef === routing.tool?.toolRef)
    const alternates = ranked
      .filter((item) => item.candidate.toolRef !== routing.tool?.toolRef)
      .slice(0, 2)
      .map((item) => ({
        toolRef: item.candidate.toolRef,
        title: item.candidate.name,
        reasons: [...item.reasons],
      }))
    const selected = {
      ...common, kind: 'needs_input' as const, status: 'needs_input' as const,
      toolRef: routing.tool.toolRef, toolName: routing.tool.name,
      reasons: [...(selectedScore?.reasons ?? [])],
      alternates,
      inputJsonSchema: schema, requiredFields,
      next: { kind: 'exact' as const, toolRef: routing.tool.toolRef },
    }
    return toolProcureResultSchema.parse(selected)
  }

  async procure(input: ToolProcureInput): Promise<ToolProcureResult> {
    if (input.kind === 'need') return await this.select(input)
    const startedAt = Date.now()
    const { principal, callService, identity } = this.dependencies
    const correlationId = this.dependencies.correlationId ?? globalThis.crypto.randomUUID()
    const reserved = acceptedIdentity(await identity.reserve(input, principal))
    if (reserved.kind === 'replay' && reserved.resultJson !== null) {
      const completed = toolProcureResultSchema.safeParse(JSON.parse(reserved.resultJson))
      if (completed.success && completed.data.status !== 'pending' && completed.data.status !== 'outcome_unknown') return completed.data
    }
    if (reserved.kind === 'replay' && reserved.quoteRef === null) {
      // A concurrent request may still be obtaining its Quote. The caller must
      // retry the SAME key; starting a second Quote here would race the owner.
      throw new ProcureInProgressError('Procurement is preparing its Quote; retry with the same key.')
    }
    const common = { schemaVersion: 'tool.procure:v1' as const, idempotencyKey: input.idempotencyKey }
    const finish = async (result: ToolProcureResult): Promise<ToolProcureResult> => {
      const saved = acceptedIdentity(await identity.complete(input, principal, result))
      if (saved.kind !== 'replay' || saved.resultJson === null) throw new Error('procurement_result_not_persisted')
      return toolProcureResultSchema.parse(JSON.parse(saved.resultJson))
    }

    const toolRef = input.toolRef
    const suppliedInput = input.input
    let quote = reserved.kind === 'replay' && reserved.resultJson !== null
      ? quoteSnapshotSchema.safeParse(JSON.parse(reserved.resultJson)).data
      : undefined
    if (quote === undefined) {
      if (callService.quoteTool === undefined) throw new Error('call_service_quote_unavailable')
      const quoteRes = await callService.quoteTool({
        input: { toolRef, input: suppliedInput },
        principal, correlationId,
      })
      if (quoteRes.kind === 'refused') {
        return await finish({
          ...common, kind: 'refused', status: 'refused',
          code: quoteRes.code,
          retryable: quoteRes.retryable,
          detail: quoteRes.reason ?? 'Quote request refused by capability engine.',
        })
      }
      quote = quoteSnapshotSchema.parse({
        quoteRef: quoteRes.quoteRef, price: quoteRes.price,
        toolRef, input: suppliedInput,
        routingLatencyMs: 0,
      })
      const checkpoint = acceptedIdentity(await identity.checkpoint(input, principal, quote))
      if (checkpoint.kind !== 'replay' || checkpoint.quoteRef !== quote.quoteRef) {
        throw new Error('procurement_quote_not_persisted')
      }
      if (checkpoint.resultJson !== null) {
        const completed = toolProcureResultSchema.safeParse(JSON.parse(checkpoint.resultJson))
        if (completed.success && completed.data.status !== 'pending' && completed.data.status !== 'outcome_unknown') return completed.data
      }
    }
    const { quoteRef, price: quotePrice } = quote
    const budgetExact = input.maxSpendAud === undefined
      ? undefined
      : parseDecimalExactAmount('AUD', input.maxSpendAud, 6)
    if (budgetExact !== undefined && compareExactAmounts(budgetExact, quotePrice) === -1) {
      return await finish({
        ...common, kind: 'refused', status: 'refused', quoteRef,
        code: 'budget_exceeded', retryable: false,
        detail: `Quoted price ${formatDisplayAmount(quotePrice)} exceeds maximum spend budget of ${formatDisplayAmount(budgetExact)}.`,
      })
    }

    const execStart = Date.now()
    const callRes = await callService.callTool({
      input: {
        quoteRef,
        idempotencyKey: canonicalDigest({
          contract: 'tool.procure.call', principalId: principal.principalId,
          key: input.idempotencyKey, quoteRef,
        }),
      },
      principal, correlationId,
    })
    const executionLatencyMs = Date.now() - execStart
    if (callRes.kind === 'refused') {
      // A refusal without a CallRef cannot prove whether reservation happened.
      // Return its actual refusal, but do not terminalise our own key: replay
      // must re-enter CallService with the same derived Call key to recover it.
      return {
        ...common, kind: 'refused', status: 'refused', quoteRef,
        code: callRes.code, retryable: callRes.retryable,
        detail: `Tool call refused: ${callRes.code}`,
      }
    }
    const committed = { ...common, quoteRef, callRef: callRes.callRef }
    if (callRes.kind === 'pending' || callRes.kind === 'needs_authority') {
      return await finish({
        ...committed, kind: 'pending', status: 'pending',
        ...(callRes.kind === 'pending' ? { retryAfterMs: callRes.retryAfterMs } : {}),
      })
    }
    if (callRes.kind === 'reconciliation_required') {
      return await finish({ ...committed, kind: 'outcome_unknown', status: 'outcome_unknown' })
    }
    if (completedCallBuyerRefundAuthoritative(callRes)) {
      const refundedDisplay = formatDisplayAmount(callRes.usage.amount)
      return await finish({
        ...committed, kind: 'remedied', status: 'remedied',
        toolRef: callRes.toolRef,
        ...(quote.toolName === undefined ? {} : { toolName: quote.toolName }),
        refundedAmountAud: refundedDisplay, netChargeAud: 'A$0.00',
        diagnostic: {
          whatHappened: `Call ${callRes.callRef} completed with buyer funds released per platform settlement.`,
          financialImpact: `A$0.00 deducted — ${refundedDisplay} refunded immediately to available balance.`,
          nextStep: 'Buyer funds were released. Check the original Call status before another purchase.',
        },
        audit: {
          adjudicator: 'call-service-settlement', confidence: 1,
          remedyLatencyMs: 0, totalLatencyMs: Date.now() - startedAt,
        },
      })
    }
    return await finish({
      ...committed, kind: 'delivered', status: 'delivered',
      toolRef: callRes.toolRef,
      ...(quote.toolName === undefined ? {} : { toolName: quote.toolName }),
      ...(quote.endpoint === undefined ? {} : { endpoint: quote.endpoint }),
      price: procurePriceBreakdownFromQuote(quotePrice),
      input: quote.input as Record<string, JsonValue>,
      output: callRes.output,
      audit: {
        routingLatencyMs: quote.routingLatencyMs, executionLatencyMs, totalLatencyMs: Date.now() - startedAt,
        jevDecisionsCostAud: 'unknown',
      },
    })
  }

}


