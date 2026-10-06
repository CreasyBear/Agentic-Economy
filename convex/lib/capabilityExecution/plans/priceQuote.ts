import {
  classifyPlanNodePrice,
  MAX_PLAN_CARDINALITY,
  planNodeUsesCardinalityTransform,
} from '@/modules/capability-execution/plan/pricing'
import { resolvePointedSchema } from '@/modules/capability-contract/public'
import { collectPlanFlowRefs } from '@/modules/capability-execution/plan/graph'
import type {
  AudUnits,
  PlanNode,
  PlanNodeId,
  PlanNodeQuote,
  PlanQuoteResult,
} from '@/modules/capability-execution/plan/contracts'
import type { CommercialPolicyControls } from '@/modules/money/public'
import { DEFAULT_PLAN_RATE_TOLERANCE_BPS, normalizePricingConfig } from '@/modules/money/public'
import type { LiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'

import type { QueryCtx } from '../../../_generated/server'
import { readCurrentPublishedTool } from '../../capabilitySupply/currentTool/reads'
import { readReferenceRate } from '../../money/referenceRate/store'
import { quoteLiveX402IsCurrent, toolPricing } from '../quotes/quoteValuation'
import type { LiveX402RequirementActionResult } from '../liveX402Requirement/requirementRef'
import type { PlanEdgeValidation } from '@/modules/capability-execution/plan/references'


const BPS_DENOMINATOR = 10_000n
const MAX_RATE_TOLERANCE_BPS = 10_000

export type LiveX402Observation = LiveX402RequirementActionResult

/** Price only the frozen current publication; unpaid observations are supplied by the quote Action. */
export async function pricePlanNodes(
  ctx: QueryCtx,
  nodes: readonly PlanNode[],
  observations: ReadonlyMap<PlanNodeId, LiveX402Observation>,
  policy: CommercialPolicyControls,
  edgeValidations: readonly PlanEdgeValidation[],
): Promise<readonly PlanNodeQuote[] | PlanQuoteResult> {
  if (nodes.length === 0) return { kind: 'refused', code: 'plan_empty' }
  const now = Date.now()
  const toolRefs = [...new Set(nodes.map(({ toolRef }) => toolRef))]
  const publications = await Promise.all(toolRefs.map(async (toolRef) => (
    [toolRef, await readCurrentPublishedTool(ctx, toolRef, now)] as const
  )))
  const operationByRef = new Map(publications)

  for (const node of nodes) {
    if (operationByRef.get(node.toolRef) === undefined) {
      return { kind: 'refused', code: 'tool_not_admitted', nodeId: node.id }
    }
  }

  const needsRate = nodes.some((node) => operationByRef.get(node.toolRef)?.pricingConfig.kind === 'managed_x402')
  const referenceRate = needsRate ? await readReferenceRate(ctx.db, now) : undefined
  if (needsRate && referenceRate === null) return { kind: 'refused', code: 'probe_failed' }

  const quotes: PlanNodeQuote[] = []
  for (const node of nodes) {
    const operation = operationByRef.get(node.toolRef)
    if (operation === undefined) return { kind: 'refused', code: 'tool_not_admitted', nodeId: node.id }
    const normalized = normalizePricingConfig(operation.pricingConfig)
    if (normalized.kind !== 'valid') return { kind: 'refused', code: 'tool_not_admitted', nodeId: node.id }

    const references = Object.values(node.input).flatMap((input) => collectPlanFlowRefs(input))
    const deferred = references.length > 0
    const incomingEdges = edgeValidations.filter((edge) => edge.to === node.id)
    if (incomingEdges.length !== references.length) {
      return { kind: 'refused', code: 'ref_type_mismatch', nodeId: node.id }
    }
    const validation = incomingEdges.some((edge) => edge.validation === 'untyped_ref')
      ? 'untyped_ref'
      : 'typed'
    let priceClass = classifyPlanNodePrice(operation.pricingConfig, deferred)
    let requirement: LiveX402Requirement | undefined

    if (normalized.config.kind === 'managed_x402') {
      if (deferred) {
        const bounds = Object.entries(node.bounds ?? {})
        const uncoveredEdges = incomingEdges.filter(({ targetPointer }) => (
          !bounds.some(([pointer]) => targetPointer === pointer || targetPointer.startsWith(`${pointer}/`))
        ))
        const arrayTargetWithoutBound = uncoveredEdges.some(({ targetPointer }) => {
          const schema = resolvePointedSchema(operation.contract.inputSchema, targetPointer)
          return schema?.type === 'array' || (Array.isArray(schema?.type) && schema.type.includes('array'))
        })
        if (bounds.length === 0 || bounds.some(([, bound]) => (
          !Number.isSafeInteger(bound.maxItems) || bound.maxItems < 0
            || bound.maxItems > MAX_PLAN_CARDINALITY
        )) || uncoveredEdges.length > 0) {
          return {
            kind: 'refused',
            code: arrayTargetWithoutBound || planNodeUsesCardinalityTransform(node)
              ? 'bound_missing_for_cardinality_price'
              : 'deferred_node_dynamic_price',
            nodeId: node.id,
          }
        }
      }
      const observation = observations.get(node.id)
      if (observation?.kind !== 'observed') {
        return { kind: 'refused', code: 'probe_failed', nodeId: node.id }
      }
      requirement = observation.requirement
      const liveRefusal = quoteLiveX402IsCurrent(
        { toolRef: node.toolRef, input: {}, correlationId: 'tool.plan.quote' },
        { sourceRequirement: { units: normalized.config.sourceRequirement.atomicUnits } },
        requirement,
        now,
      )
      if (liveRefusal !== undefined) return { kind: 'refused', code: 'probe_failed', nodeId: node.id }
    }

    const valuation = toolPricing(operation, now, requirement, referenceRate ?? undefined)
    if (valuation === undefined || valuation.kind !== 'ready'
      || !/^(?:0|[1-9]\d*)$/u.test(valuation.price.units)) {
      return { kind: 'refused', code: 'probe_failed', nodeId: node.id }
    }

    let ceilingUnits = valuation.price.units
    let rateEvidence: PlanNodeQuote['rateEvidence']
    let rateToleranceBps: number | undefined
    if (valuation.rateEvidence !== undefined) {
      const toleranceBps = policy.operations.planRateToleranceBps ?? DEFAULT_PLAN_RATE_TOLERANCE_BPS
      if (typeof toleranceBps !== 'number' || !Number.isSafeInteger(toleranceBps)
        || toleranceBps < 0 || toleranceBps > MAX_RATE_TOLERANCE_BPS) {
        return { kind: 'refused', code: 'probe_failed', nodeId: node.id }
      }
      const amount = BigInt(ceilingUnits)
      rateToleranceBps = toleranceBps
      const numerator = amount * (BPS_DENOMINATOR + BigInt(toleranceBps))
      ceilingUnits = ((numerator + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR).toString()
      rateEvidence = {
        source: valuation.rateEvidence.source,
        observedAt: valuation.rateEvidence.observedAt,
        digest: valuation.rateEvidence.evidenceDigest,
      }
    }

    quotes.push({
      nodeId: node.id,
      toolRef: node.toolRef,
      inputMode: deferred ? 'deferred' : 'literal',
      priceClass,
      pricingDigest: operation.priceDigest,
      ...(node.bounds === undefined ? {} : { bounds: node.bounds }),
      ceilingAudUnits: ceilingUnits as AudUnits,
      ...(rateEvidence === undefined ? {} : { rateEvidence }),
      ...(rateToleranceBps === undefined ? {} : { rateToleranceBps }),
      validation,
      dependsOn: [...node.dependsOn],
    })
  }
  return quotes
}
