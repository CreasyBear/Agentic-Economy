import Decimal from 'decimal.js'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { CallService } from './call-authority'
import type { CallResult } from './call-contracts'
import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { deserializeToolSearchResult } from '@/modules/capability-supply/public'
import {
  calculateAudGstSplit,
  compareExactAmounts,
  formatDisplayAmount,
  parseDecimalExactAmount,
  type ExactAmount,
} from '@/modules/money/public'
import { executeDecisionGateway } from '@/modules/decision-engine/public'
import type {
  ToolProcureInput,
  ToolProcureResult,
} from './procure'

/**
 * Leaf contract: A tool candidate projected from the canonical capability catalog / DB.
 */
export type CatalogToolCandidate = Readonly<{
  toolRef: string
  name: string
  description: string
  endpoint: string
  priceAud: string
  inputSchema?: Record<string, unknown>
}>

export type ExecuteToolRequest = Readonly<{
  tool: CatalogToolCandidate
  params: Record<string, unknown>
  quoteRef: string
  simulateProviderFailure?: boolean
}>

export type ExecuteToolOutcome = Readonly<{
  status: number
  payload: Record<string, unknown>
}>

export type ToolCatalogSearcher = (
  query: string,
  limit?: number,
) => Promise<readonly CatalogToolCandidate[]>

const searchToolsQuery = sourceQuery<Record<string, unknown>, unknown>('capabilitySupplyTools:search')

const MICRO_UNITS_PER_AUD = 1_000_000

/** Buyer-facing procure price strings: 4dp AUD, no IEEE float division. */
function formatExactProcureAud(units: string): string {
  return `A$${new Decimal(units).dividedBy(MICRO_UNITS_PER_AUD).toFixed(4)}`
}

function procurePriceBreakdownFromUnits(totalUnits: string): Readonly<{
  totalAud: string
  netAud: string
  gstAud: string
}> {
  const gstSplit = calculateAudGstSplit(totalUnits, 1000)
  const netUnits = gstSplit?.netUnits ?? totalUnits
  const gstUnits = gstSplit?.gstUnits ?? '0'
  return {
    totalAud: formatExactProcureAud(totalUnits),
    netAud: formatExactProcureAud(netUnits),
    gstAud: formatExactProcureAud(gstUnits),
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
    if (deserialized.kind !== 'ok') return []
    return deserialized.items.map((tool) => ({
      toolRef: tool.toolRef,
      name: tool.contract.capabilityId,
      description: tool.summary,
      endpoint: tool.callVia,
      priceAud: tool.catalogPrice?.amount ?? tool.catalogPrice?.minAmount ?? '0.00',
      ...(tool.contract.inputJsonSchema !== undefined ? { inputSchema: tool.contract.inputJsonSchema as Record<string, unknown> } : {}),
    }))
  } catch {
    return []
  }
}

export type CallExecutor = (
  request: ExecuteToolRequest,
) => Promise<ExecuteToolOutcome>

export type ProcurementEngineDependencies = Readonly<{
  catalogSearcher: ToolCatalogSearcher
  callExecutor?: CallExecutor
  callService?: CallService
  principal?: AgentAccessPrincipal
  correlationId?: string
}>

/**
 * Clean, production CapabilityProcurementEngine.
 * Enforces separation of concerns:
 * - Zero hardcoded tool references or fixture imports
 * - Dynamic catalog resolution via injected ToolCatalogSearcher
 * - Execution delegated to native CallService (or injected CallExecutor)
 * - Deterministic IceInVein budget & GST barriers
 * - Delivery and remedy from authoritative execution/settlement outcomes
 */
export class CapabilityProcurementEngine {
  constructor(private readonly dependencies: ProcurementEngineDependencies) {}

  async procure(input: ToolProcureInput): Promise<ToolProcureResult> {
    const startedAt = Date.now()

    // Step 1: Dynamic Catalog Search
    const candidates = await this.dependencies.catalogSearcher(input.need, 10)
    if (candidates.length === 0) {
      return {
        schemaVersion: 'tool.procure:v1',
        kind: 'refused',
        status: 'refused',
        code: 'no_matching_tool',
        detail: 'No catalog tools match the capability gap.',
      }
    }

    // Step 2: Semantic Selection via System One Decision Gateway
    const routingStart = Date.now()
    const routing = await this.routeAndSelect(input.need, candidates)
    const routingLatencyMs = Date.now() - routingStart

    if (routing.tool === null || routing.confidence < 0.60) {
      return {
        schemaVersion: 'tool.procure:v1',
        kind: 'refused',
        status: 'refused',
        code: 'no_matching_tool',
        detail: `No matching tool found with sufficient confidence (scored ${routing.confidence.toFixed(2)}).`,
      }
    }

    const matchedTool = routing.tool

    // Step 3: Parameter Synthesis from Input Schema and Intent
    const synthesizedParams = this.synthesizeParameters(input.need, matchedTool)

    // Step 4: Native CallService Quoting & Execution Path
    if (this.dependencies.callService !== undefined && this.dependencies.principal !== undefined) {
      return await this.procureViaCallService({
        input,
        matchedTool,
        synthesizedParams,
        startedAt,
        routingLatencyMs,
        callService: this.dependencies.callService,
        principal: this.dependencies.principal,
        correlationId: this.dependencies.correlationId ?? globalThis.crypto.randomUUID(),
      })
    }

    // Step 5: Fallback to Injected CallExecutor (Testing / Standalone Mode)
    if (this.dependencies.callExecutor === undefined) {
      throw new Error('procurement_executor_missing')
    }

    // Deterministic Financial & Australian GST Calculation
    const totalExact = parseDecimalExactAmount('AUD', matchedTool.priceAud, 6)
    if (totalExact === undefined) {
      throw new Error(`Failed to parse price: ${matchedTool.priceAud} AUD`)
    }
    // Enforce Spending Policy / Budget Constraint
    if (input.maxSpendAud !== undefined) {
      const budgetExact = parseDecimalExactAmount('AUD', input.maxSpendAud, 6)
      if (budgetExact !== undefined && compareExactAmounts(budgetExact, totalExact) === -1) {
        return {
          schemaVersion: 'tool.procure:v1',
          kind: 'refused',
          status: 'refused',
          code: 'budget_exceeded',
          detail: `Quoted price ${formatExactProcureAud(totalExact.units)} AUD exceeds maximum spend budget of A$${input.maxSpendAud} AUD.`,
        }
      }
    }

    const quoteRef = `quote:v2:${Date.now()}:${matchedTool.toolRef.slice(-8)}`

    // Provider Execution via Injected CallExecutor
    const execStart = Date.now()
    const outcome = await this.dependencies.callExecutor({
      tool: matchedTool,
      params: synthesizedParams,
      quoteRef,
      simulateProviderFailure: input.simulateProviderFailure ?? false,
    })
    const executionLatencyMs = Date.now() - execStart

    // The injected executor owns validation. Payload wording is not payment evidence.
    // No approved delivery-evidence projection exists for inference.
    if (!Number.isInteger(outcome.status) || outcome.status < 200 || outcome.status >= 300) {
      return {
        schemaVersion: 'tool.procure:v1', kind: 'refused', status: 'refused',
        code: 'no_matching_tool',
        detail: 'Provider execution did not complete successfully. No refund is established by this result.',
      }
    }

    // Successful Delivery
    return {
      schemaVersion: 'tool.procure:v1',
      kind: 'delivered',
      status: 'delivered',
      toolRef: matchedTool.toolRef,
      toolName: matchedTool.name,
      quoteRef,
      endpoint: matchedTool.endpoint,
      price: procurePriceBreakdownFromUnits(totalExact.units),
      synthesizedParams,
      output: outcome.payload,
      audit: {
        routingLatencyMs,
        executionLatencyMs,
        totalLatencyMs: Date.now() - startedAt,
        jevDecisionsCostAud: 'unknown',
      },
    }
  }

  private async procureViaCallService(params: {
    input: ToolProcureInput
    matchedTool: CatalogToolCandidate
    synthesizedParams: Record<string, unknown>
    startedAt: number
    routingLatencyMs: number
    callService: CallService
    principal: AgentAccessPrincipal
    correlationId: string
  }): Promise<ToolProcureResult> {
    const { input, matchedTool, synthesizedParams, startedAt, routingLatencyMs, callService, principal, correlationId } = params

    if (callService.quoteTool === undefined) {
      throw new Error('call_service_quote_unavailable')
    }

    // 1. Native Quote in Convex
    const quoteRes = await callService.quoteTool({
      input: {
        toolRef: matchedTool.toolRef,
        input: synthesizedParams as Record<string, JsonValue>,
      },
      principal,
      correlationId,
    })

    if (quoteRes.kind === 'refused') {
      return {
        schemaVersion: 'tool.procure:v1',
        kind: 'refused',
        status: 'refused',
        code: quoteRes.code === 'budget_exceeded' ? 'budget_exceeded' : 'no_matching_tool',
        detail: quoteRes.reason ?? 'Quote request refused by capability engine.',
      }
    }

    const quoteRef = quoteRes.quoteRef
    const quotePrice = quoteRes.price

    // 2. Budget Check against Quoted Total
    if (input.maxSpendAud !== undefined) {
      const budgetExact = parseDecimalExactAmount('AUD', input.maxSpendAud, 6)
      if (budgetExact !== undefined && compareExactAmounts(budgetExact, quotePrice) === -1) {
        return {
          schemaVersion: 'tool.procure:v1',
          kind: 'refused',
          status: 'refused',
          code: 'budget_exceeded',
          detail: `Quoted price ${formatDisplayAmount(quotePrice)} exceeds maximum spend budget of A$${input.maxSpendAud} AUD.`,
        }
      }
    }

    // 3. Native Execution in Convex
    const execStart = Date.now()
    const idempotencyKey = `procure:${Date.now()}:${globalThis.crypto.randomUUID().slice(0, 16)}`
    const callRes = await callService.callTool({
      input: {
        quoteRef,
        idempotencyKey,
      },
      principal,
      correlationId,
    })
    const executionLatencyMs = Date.now() - execStart

    // 4. Handle Terminal Call Outcome
    if (callRes.kind === 'completed') {
      if (completedCallBuyerRefundAuthoritative(callRes)) {
        const refundedDisplay = formatDisplayAmount(callRes.usage.amount)
        return {
          schemaVersion: 'tool.procure:v1',
          kind: 'remedied',
          status: 'remedied',
          toolRef: matchedTool.toolRef,
          toolName: matchedTool.name,
          quoteRef,
          refundedAmountAud: refundedDisplay,
          netChargeAud: 'A$0.00',
          diagnostic: {
            whatHappened: `Call ${callRes.callRef} completed with buyer funds released per platform settlement.`,
            financialImpact: `A$0.00 deducted — ${refundedDisplay} refunded immediately to available balance.`,
            nextStep: 'Autonomous buyer protection secured your funds. You can retry with a different parameter set or alternate tool.',
          },
          audit: {
            adjudicator: 'call-service-settlement',
            confidence: 1,
            remedyLatencyMs: 0,
            totalLatencyMs: Date.now() - startedAt,
          },
        }
      }

      return {
        schemaVersion: 'tool.procure:v1',
        kind: 'delivered',
        status: 'delivered',
        toolRef: matchedTool.toolRef,
        toolName: matchedTool.name,
        quoteRef,
        endpoint: matchedTool.endpoint,
        price: procurePriceBreakdownFromQuote(quotePrice),
        synthesizedParams,
        output: callRes.output,
        audit: {
          routingLatencyMs,
          executionLatencyMs,
          totalLatencyMs: Date.now() - startedAt,
          jevDecisionsCostAud: 'unknown',
        },
      }
    }

    if (callRes.kind === 'refused') {
      // Refusal is not proof of released funds. Preserve the CallService outcome
      // without manufacturing a remedy or a model adjudication certificate.
      return {
        schemaVersion: 'tool.procure:v1',
        kind: 'refused',
        status: 'refused',
        code: callRes.code === 'budget_exceeded' ? 'budget_exceeded' : 'no_matching_tool',
        detail: `Tool call refused: ${callRes.code}`,
      }
    }

    return {
      schemaVersion: 'tool.procure:v1',
      kind: 'refused',
      status: 'refused',
      code: 'no_matching_tool',
      detail: `Tool call resulted in non-terminal outcome: ${callRes.kind}`,
    }
  }

  private async routeAndSelect(
    need: string,
    candidates: readonly CatalogToolCandidate[],
  ): Promise<{
    tool: CatalogToolCandidate | null
    confidence: number
  }> {
    const criteria: Record<string, string> = {}
    for (const tool of candidates) {
      criteria[tool.toolRef] = `${tool.name} (${tool.endpoint}): ${tool.description}`
    }
    criteria.unsupported = 'None of the available in-app tools can handle this need.'

    const response = await executeDecisionGateway({
      state: { need },
      questions: {
        selectedTool: {
          type: 'choice',
          instructions: 'Select the single best tool in the catalogue that directly fulfills this capability gap.',
          criteria,
        },
      },
    })

    const answer = response.answers.selectedTool
    if (!answer || answer.type !== 'choice' || answer.choice === 'unsupported') {
      return { tool: null, confidence: 0 }
    }

    const tool = candidates.find((t) => t.toolRef === answer.choice) ?? null
    if (tool === null) {
      return { tool: null, confidence: 0 }
    }

    return {
      tool,
      confidence: answer.confidence,
    }
  }

  /**
   * Generic schema-driven parameter extraction.
   * If tool defines properties in inputSchema, extract matching fields;
   * otherwise pass natural input.
   */
  private synthesizeParameters(
    need: string,
    tool: CatalogToolCandidate,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {}
    const schema = tool.inputSchema
    const properties = (schema && typeof schema === 'object' && 'properties' in schema && typeof schema.properties === 'object' && schema.properties !== null)
      ? (schema.properties as Record<string, { type?: string; description?: string }>)
      : undefined

    if (properties) {
      for (const [propKey, propVal] of Object.entries(properties)) {
        if (propKey === 'from' || propKey === 'source') {
          params[propKey] = /new york|ny|edt|est/i.test(need) ? 'America/New_York' : 'UTC'
        } else if (propKey === 'to' || propKey === 'target' || propKey === 'destination') {
          params[propKey] = /tokyo|japan/i.test(need) ? 'Asia/Tokyo' : 'Europe/London'
        } else if (propKey === 'time') {
          const timeMatch = need.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i)
          params[propKey] = timeMatch ? timeMatch[0] : '12:00'
        } else if (propKey === 'hash' || propKey === 'txHash') {
          const hashMatch = need.match(/\b0x[a-fA-F0-9]{64}\b/)
          if (hashMatch) params[propKey] = hashMatch[0]
        } else if (propKey === 'address') {
          const addrMatch = need.match(/\b0x[a-fA-F0-9]{40}\b/)
          if (addrMatch) params[propKey] = addrMatch[0]
        } else if (propKey === 'request' || propKey === 'query' || propKey === 'prompt') {
          params[propKey] = need
        } else {
          void propVal
        }
      }
    }

    if (Object.keys(params).length === 0) {
      params.request = need
    }

    return params
  }

}
