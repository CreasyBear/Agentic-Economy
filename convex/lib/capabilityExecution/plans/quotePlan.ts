import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { brandNonEmpty } from '@/modules/common/ids'
import { isBoundedJsonValue } from '@/modules/common/bounded-json'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { checkPlanReferences } from '@/modules/capability-execution/plan/references'
import { parsePlan } from '@/modules/capability-execution/plan/parse'
import { buildCardinalityProbeInput } from '@/modules/capability-execution/plan/pricing'
import { resolvePlanInput } from '@/modules/capability-execution/plan/resolve'
import { collectPlanFlowRefs, topologicalStages } from '@/modules/capability-execution/plan/graph'
import type {
  JsonValue,
  NoCallOutcome,
  PlanNodeId,
  PlanValidationRefusal,
} from '@/modules/capability-execution/plan/contracts'
import { normalizePricingConfig, pricingConfigDigest } from '@/modules/money/public'
import type { CapabilityInputExample } from '@/modules/capability-contract/public'
import type { LiveX402RequirementActionResult } from '../liveX402Requirement/requirementRef'

import { env, type ActionCtx, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { readCurrentPublishedTool } from '../../capabilitySupply/currentTool/reads'
import { readManagedX402InspectionTarget } from '../../capabilitySupply/currentTool/inspection'
import { toolProviderRouteabilityIsFrozen } from '../../capabilitySupply/providerOffboarding/freeze'
import { readCommercialPolicyGate } from '../../../moneyCommercialPolicy'
import { liveX402RequirementValue } from '../quotes/contracts'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { principalValue, type CallPrincipal, type CurrentAgentAuthority } from '../callLifecycle/contracts'
import { resolveCurrentAgentAuthority } from '../callLifecycle/agentCallAuthority'
import { trustedChatAuthorityValue } from '../../chat/turns/contracts'
import { resolveTrustedChatAuthority } from '../callLifecycle/chatCallAuthority'
import { bindPersistedManagedX402RequirementRef, inspectLiveX402RequirementRef } from '../liveX402Requirement/requirementRef'
import { pricePlanNodes, type LiveX402Observation } from './priceQuote'

const planRefusalCodeValue = v.union(
  v.literal('plan_empty'), v.literal('plan_too_large'), v.literal('duplicate_node_id'),
  v.literal('unknown_dependency'), v.literal('cycle'), v.literal('duplicate_dependency'),
  v.literal('plan_too_deep'), v.literal('ref_not_in_depends_on'), v.literal('bad_pointer'),
  v.literal('tool_not_admitted'), v.literal('input_schema_mismatch'), v.literal('ref_type_mismatch'),
  v.literal('deferred_node_dynamic_price'), v.literal('bound_missing_for_cardinality_price'),
  v.literal('probe_failed'), v.literal('ceiling_exceeds_per_call_cap'), v.literal('total_exceeds_available'),
)
export const planValidationRefusalValue = v.object({
  kind: v.literal('refused'), code: planRefusalCodeValue, nodeId: v.optional(v.string()),
})
const planRateEvidenceValue = v.object({ source: v.string(), observedAt: v.number(), digest: v.string() })
const planNodeQuoteValue = v.object({
  nodeId: v.string(), toolRef: v.string(), inputMode: v.union(v.literal('literal'), v.literal('deferred')),
  priceClass: v.union(v.literal('fixed'), v.literal('cardinality_bounded'), v.literal('upto_bounded'), v.literal('unknown')),
  pricingDigest: v.string(), bounds: v.optional(v.record(v.string(), v.object({ maxItems: v.number() }))),
  ceilingAudUnits: v.string(), rateEvidence: v.optional(planRateEvidenceValue),
  rateToleranceBps: v.optional(v.number()),
  validation: v.union(v.literal('typed'), v.literal('untyped_ref')), dependsOn: v.array(v.string()),
})
export const planQuoteResultValue = v.union(planValidationRefusalValue, v.object({
  kind: v.literal('quoted'), planRef: v.string(), planDigest: v.string(), nodes: v.array(planNodeQuoteValue),
  stages: v.array(v.array(v.string())), approvedTotalAudUnits: v.string(), currency: v.literal('AUD'),
  exponent: v.literal(6), expiresAt: v.number(), rateEvidence: v.optional(planRateEvidenceValue),
  dataFlows: v.array(v.object({ from: v.string(), to: v.string(), destinationProviderHost: v.string() })),
}))
type PlanRefusalValue = Infer<typeof planValidationRefusalValue>
function normalizePlanRefusal(value: PlanRefusalValue): PlanValidationRefusal {
  return {
    kind: 'refused',
    code: value.code,
    ...(value.nodeId === undefined ? {} : { nodeId: brandNonEmpty(value.nodeId, 'PlanNodeId') }),
  }
}


const quotePlanActionArgsValue = v.object({
  operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
  principal: principalValue, planJson: v.string(),
})
export const quotePlanActionArgs = quotePlanActionArgsValue.fields
export type QuotePlanActionArgs = Infer<typeof quotePlanActionArgsValue>

const planQuoteAuthenticationValue = v.union(planValidationRefusalValue, v.object({
  kind: v.literal('ready'), principal: principalValue, grantRef: v.string(),
  grantGeneration: v.number(), grantExpiresAt: v.number(),
}))
export const authenticatePlanQuoteArgs = quotePlanActionArgs
export const authenticatePlanQuoteResult = planQuoteAuthenticationValue

type QuoteToolMaterial = Readonly<{
  toolRef: string
  materialDigest: string
  inspectionTargetDigest?: string
  pricingDigest: string
  pricingConfig: unknown
  inputSchema: unknown
  outputSchema?: unknown
  inputExamples?: unknown
  providerHost: string
  expiresAt: number
}>
const quoteToolMaterialValue = v.object({
  toolRef: v.string(), materialDigest: v.string(), pricingDigest: v.string(), pricingConfigJson: v.string(),
  inspectionTargetDigest: v.optional(v.string()),
  inputSchemaJson: v.string(), outputSchemaJson: v.optional(v.string()), inputExamplesJson: v.optional(v.string()),
  providerHost: v.string(), expiresAt: v.number(),
})
const readPlanQuoteMaterialArgsValue = v.object({
  principal: principalValue, grantRef: v.string(), grantGeneration: v.number(), toolRefs: v.array(v.string()),
})
export const readPlanQuoteMaterialArgs = readPlanQuoteMaterialArgsValue.fields
type ReadPlanQuoteMaterialArgs = Infer<typeof readPlanQuoteMaterialArgsValue>
export const readPlanQuoteMaterialResult = v.union(planValidationRefusalValue, v.object({
  kind: v.literal('ready'), materials: v.array(quoteToolMaterialValue),
}))

const edgeValidationValue = v.object({
  from: v.string(), to: v.string(), sourcePointer: v.string(), targetPointer: v.string(),
  validation: v.union(v.literal('typed'), v.literal('untyped_ref')),
})
const expectedMaterialValue = v.object({ toolRef: v.string(), materialDigest: v.string(), pricingDigest: v.string(), providerHost: v.string(), inspectionTargetDigest: v.optional(v.string()) })
const observedRequirementValue = v.object({ kind: v.literal('observed'), requirement: liveX402RequirementValue })
const quotePlanHandlerArgsValue = v.object({
  planJson: v.string(), stages: v.array(v.array(v.string())), principal: principalValue,
  grantRef: v.string(), grantGeneration: v.number(), grantExpiresAt: v.number(),
  expectedMaterials: v.array(expectedMaterialValue), edgeValidations: v.array(edgeValidationValue),
  observations: v.array(v.object({ nodeId: v.string(), observation: observedRequirementValue })),
  chatAuthority: v.optional(trustedChatAuthorityValue),
})
export const quotePlanHandlerArgs = quotePlanHandlerArgsValue.fields
export type QuotePlanHandlerArgs = Infer<typeof quotePlanHandlerArgsValue>

const authenticatePlanQuoteRef = makeFunctionReference<'mutation', QuotePlanActionArgs, Infer<typeof planQuoteAuthenticationValue>>(
  'capabilityPlans:authenticateQuote',
)
const readPlanQuoteMaterialRef = makeFunctionReference<'query', ReadPlanQuoteMaterialArgs, Infer<typeof readPlanQuoteMaterialResult>>(
  'capabilityPlans:readQuoteMaterial',
)
const quotePlanMutationRef = makeFunctionReference<'mutation', QuotePlanHandlerArgs, Infer<typeof planQuoteResultValue>>(
  'capabilityPlans:quotePlanHandler',
)


// Convex objects reserve $ keys; Plans and JSON schemas retain those keys as JSON.
function parsePlanJson(json: string): ReturnType<typeof parsePlan> {
  let value: unknown
  try { value = JSON.parse(json) } catch { return { kind: 'refused', code: 'input_schema_mismatch' } }
  return parsePlan(value)
}

function sameAgent(left: CallPrincipal, right: CallPrincipal): boolean {
  return left.principalId === right.principalId
    && left.ownerId === right.ownerId
    && left.credentialId === right.credentialId
    && left.applicationRef === right.applicationRef
    && left.environment === right.environment
    && left.authorityMode === right.authorityMode
    && left.scopes.length === right.scopes.length
    && left.scopes.every((scope, index) => scope === right.scopes[index])
}

export async function authorizePlanTools(
  ctx: Pick<QueryCtx, 'db'>,
  principal: CallPrincipal,
  toolRefs: readonly string[],
  now: number,
  purpose: 'new_operation' | 'persisted_invocation' = 'new_operation',
): Promise<CurrentAgentAuthority | undefined> {
  let first: CurrentAgentAuthority | undefined
  for (const toolRef of toolRefs) {
    const authority = await resolveCurrentAgentAuthority(ctx, principal, now, { kind: purpose, toolRef })
    if (authority === null) return undefined
    if (first === undefined) first = authority
    else if (!sameAgent(first.principal, authority.principal)
      || first.grantRef !== authority.grantRef || first.grantGeneration !== authority.grantGeneration) return undefined
  }
  return first
}

export async function readAdmittedPlanTools(
  ctx: Pick<QueryCtx, 'db'>,
  principal: CallPrincipal,
  toolRefs: readonly string[],
  now: number,
  allowInspection = false,
): Promise<readonly QuoteToolMaterial[] | undefined> {
  const deploymentEnvironment = deploymentPaymentEnvironment(env)
  if (deploymentEnvironment === undefined || deploymentEnvironment !== principal.environment) return undefined
  const materials: QuoteToolMaterial[] = []
  for (const toolRef of toolRefs) {
    if (await toolProviderRouteabilityIsFrozen(ctx, toolRef)) return undefined
    const operation = await readCurrentPublishedTool(ctx, toolRef, now)
    if (operation === undefined) {
      const target = allowInspection ? await readManagedX402InspectionTarget(ctx, toolRef, now) : undefined
      if (target === undefined || target.runtimeEnvironment !== principal.environment) return undefined
      materials.push({ toolRef, materialDigest: target.targetDigest, inspectionTargetDigest: target.targetDigest,
        pricingDigest: pricingConfigDigest(target.pricingConfig), pricingConfig: target.pricingConfig,
        inputSchema: target.contract.inputSchema, outputSchema: target.contract.outputSchema,
        ...(target.contract.inputExamples === undefined ? {} : { inputExamples: target.contract.inputExamples }),
        providerHost: new URL(target.identity.endpoint.url).hostname.toLowerCase(), expiresAt: now,
      })
      continue
    }
    if (operation.runtimeEnvironment !== principal.environment) return undefined
    materials.push({
      toolRef,
      materialDigest: operation.materialDigest,
      pricingDigest: operation.priceDigest,
      pricingConfig: operation.pricingConfig,
      inputSchema: operation.contract.inputSchema,
      outputSchema: operation.contract.outputSchema,
      ...(operation.contract.inputExamples === undefined ? {} : { inputExamples: operation.contract.inputExamples }),
      providerHost: new URL(operation.identity.endpoint.url).hostname.toLowerCase(),
      expiresAt: operation.readiness.validUntil,
    })
  }
  return materials
}


export async function authenticatePlanQuoteHandler(
  ctx: MutationCtx,
  args: QuotePlanActionArgs,
): Promise<Infer<typeof planQuoteAuthenticationValue>> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'protected_action')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', code: 'tool_not_admitted' }
  return authenticatePlanPrincipal(ctx, args)
}

export async function authenticatePlanPrincipal(
  ctx: Pick<QueryCtx, 'db'>, args: { principal: CallPrincipal; planJson: string },
): Promise<Infer<typeof planQuoteAuthenticationValue>> {
  const plan = parsePlanJson(args.planJson)
  if ('kind' in plan) return plan
  const authority = await authorizePlanTools(ctx, args.principal, [...new Set(plan.nodes.map(({ toolRef }) => toolRef))], Date.now())
  if (authority === undefined) return { kind: 'refused', code: 'tool_not_admitted' }
  return {
    kind: 'ready', principal: authority.principal, grantRef: authority.grantRef,
    grantGeneration: authority.grantGeneration, grantExpiresAt: authority.expiresAt,
  }
}

export async function readPlanQuoteMaterialHandler(
  ctx: QueryCtx,
  args: ReadPlanQuoteMaterialArgs,
): Promise<Infer<typeof readPlanQuoteMaterialResult>> {
  const now = Date.now()
  const authority = await authorizePlanTools(ctx, args.principal, args.toolRefs, now)
  if (authority === undefined || authority.grantRef !== args.grantRef
    || authority.grantGeneration !== args.grantGeneration) return { kind: 'refused', code: 'tool_not_admitted' }
  const materials = await readAdmittedPlanTools(ctx, args.principal, args.toolRefs, now,
    args.principal.authorityMode === 'spending_policy' || args.principal.authorityMode === 'unrestricted_test_only')
  if (materials === undefined) return { kind: 'refused', code: 'tool_not_admitted' }
  return {
    kind: 'ready', materials: materials.map(({ pricingConfig, inputSchema, outputSchema, inputExamples, ...material }) => ({
      ...material, pricingConfigJson: JSON.stringify(pricingConfig), inputSchemaJson: JSON.stringify(inputSchema),
      ...(outputSchema === undefined ? {} : { outputSchemaJson: JSON.stringify(outputSchema) }),
      ...(inputExamples === undefined ? {} : { inputExamplesJson: JSON.stringify(inputExamples) }),
    })),
  }
}

function mapInputFailure(nodeId: PlanNodeId, code: NoCallOutcome): PlanValidationRefusal {
  return {
    kind: 'refused',
    code: code === 'ref_type_mismatch' ? 'ref_type_mismatch' : code === 'input_invalid' ? 'input_schema_mismatch' : 'probe_failed',
    nodeId,
  }
}

export async function quotePlanActionHandler(
  ctx: ActionCtx,
  args: QuotePlanActionArgs,
): Promise<Infer<typeof planQuoteResultValue>> {
  const authentication = await ctx.runMutation(authenticatePlanQuoteRef, args)
  if (authentication.kind === 'refused') return normalizePlanRefusal(authentication)
  return quotePlanCore(ctx, args.planJson, authentication)
}

export async function quotePlanCore(
  ctx: ActionCtx, planJson: string,
  authentication: Extract<Infer<typeof planQuoteAuthenticationValue>, { kind: 'ready' }>,
  chatAuthority?: Infer<typeof trustedChatAuthorityValue>,
): Promise<Infer<typeof planQuoteResultValue>> {
  const plan = parsePlanJson(planJson)
  if ('kind' in plan) return plan
  const stages = topologicalStages(plan)
  if ('kind' in stages) return stages
  const toolRefs = [...new Set(plan.nodes.map(({ toolRef }) => toolRef))]
  const loaded = await ctx.runQuery(readPlanQuoteMaterialRef, {
    principal: authentication.principal,
    grantRef: authentication.grantRef,
    grantGeneration: authentication.grantGeneration,
    toolRefs,
  })
  if (loaded.kind === 'refused') return normalizePlanRefusal(loaded)

  const decoded: QuoteToolMaterial[] = loaded.materials.map(({ pricingConfigJson, inputSchemaJson, outputSchemaJson, inputExamplesJson, ...material }) => ({
    ...material, pricingConfig: JSON.parse(pricingConfigJson), inputSchema: JSON.parse(inputSchemaJson),
    ...(outputSchemaJson === undefined ? {} : { outputSchema: JSON.parse(outputSchemaJson) }),
    ...(inputExamplesJson === undefined ? {} : { inputExamples: JSON.parse(inputExamplesJson) }),
  }))
  const schemas = Object.fromEntries(decoded.map(({ toolRef, inputSchema, outputSchema }) => (
    [toolRef, { inputSchema, ...(outputSchema === undefined ? {} : { outputSchema }) }]
  )))
  const edgeValidations = checkPlanReferences(plan, schemas)
  if ('kind' in edgeValidations) return edgeValidations
  const materials = new Map(decoded.map((material) => [material.toolRef, material] as const))
  const observations: Array<{ nodeId: string; observation: Extract<LiveX402RequirementActionResult, { kind: 'observed' }> }> = []
  for (const node of plan.nodes) {
    const material = materials.get(node.toolRef)
    if (material === undefined) return { kind: 'refused', code: 'tool_not_admitted', nodeId: node.id }
    const pricing = normalizePricingConfig(material.pricingConfig)
    if (pricing.kind !== 'valid') return { kind: 'refused', code: 'tool_not_admitted', nodeId: node.id }
    if (pricing.config.kind !== 'managed_x402') continue

    const deferred = Object.values(node.input).some((input) => collectPlanFlowRefs(input).length > 0)
    let input: Record<string, JsonValue>
    if (deferred) {
      const probe = buildCardinalityProbeInput(
        node,
        material.inputSchema as Readonly<Record<string, JsonValue>>,
        material.inputExamples as readonly CapabilityInputExample[] | undefined,
      )
      if (probe.kind === 'refused') return { kind: 'refused', code: probe.code, nodeId: node.id }
      input = probe.input as Record<string, JsonValue>
    } else {
      const resolved = resolvePlanInput(node, {}, material.inputSchema as Readonly<Record<string, unknown>>)
      if (resolved.kind === 'failed') return mapInputFailure(node.id, resolved.code)
      if (!isBoundedJsonValue(resolved.input)) return { kind: 'refused', code: 'input_schema_mismatch', nodeId: node.id }
      input = resolved.input as Record<string, JsonValue>
    }
    const inspected = authentication.principal.authorityMode === 'approval_required'
      ? await ctx.runAction(bindPersistedManagedX402RequirementRef, { toolRef: node.toolRef, input })
      : await ctx.runAction(inspectLiveX402RequirementRef, { principal: authentication.principal, toolRef: node.toolRef, input })
    if (inspected.kind === 'operation_not_found' || inspected.kind === 'operation_unsupported') {
      return { kind: 'refused', code: 'tool_not_admitted', nodeId: node.id }
    }
    if (inspected.kind !== 'observed') return { kind: 'refused', code: 'probe_failed', nodeId: node.id }
    observations.push({ nodeId: node.id, observation: inspected })
  }

  return await ctx.runMutation(quotePlanMutationRef, {
    planJson: JSON.stringify(plan),
    stages: stages.map((stage) => [...stage]),
    principal: authentication.principal,
    grantRef: authentication.grantRef,
    grantGeneration: authentication.grantGeneration,
    grantExpiresAt: authentication.grantExpiresAt,
    expectedMaterials: loaded.materials.map(({ toolRef, materialDigest, pricingDigest, providerHost, inspectionTargetDigest }) => (
      { toolRef, materialDigest, pricingDigest, providerHost, ...(inspectionTargetDigest === undefined ? {} : { inspectionTargetDigest }) }
    )),
    edgeValidations: edgeValidations.map((edge) => ({ ...edge })),
    observations: observations.map((item) => ({ ...item })),
    ...(chatAuthority === undefined ? {} : { chatAuthority }),
  })
}

export async function quotePlanHandler(
  ctx: MutationCtx,
  args: QuotePlanHandlerArgs,
): Promise<Infer<typeof planQuoteResultValue>> {
  const parsed = parsePlanJson(args.planJson)
  if ('kind' in parsed) return parsed
  const stages = topologicalStages(parsed)
  if ('kind' in stages) return stages
  if (canonicalDigest(stages) !== canonicalDigest(args.stages)) return { kind: 'refused', code: 'ref_type_mismatch' }

  const now = Date.now()
  if (args.chatAuthority !== undefined) {
    for (const node of parsed.nodes) {
      const principal = await resolveTrustedChatAuthority(ctx, args.chatAuthority, node.toolRef)
      if (principal === null || !sameAgent(principal, args.principal)) return { kind: 'refused', code: 'tool_not_admitted' }
    }
  }
  const authority = await authorizePlanTools(ctx, args.principal, [...new Set(parsed.nodes.map(({ toolRef }) => toolRef))], now)
  if (authority === undefined || authority.grantRef !== args.grantRef
    || authority.grantGeneration !== args.grantGeneration || authority.expiresAt !== args.grantExpiresAt
    || !sameAgent(authority.principal, args.principal)) {
    return { kind: 'refused', code: 'tool_not_admitted' }
  }
  const toolRefs = [...new Set(parsed.nodes.map(({ toolRef }) => toolRef))]
  const materials = await readAdmittedPlanTools(ctx, args.principal, toolRefs, now)
  if (materials === undefined) return { kind: 'refused', code: 'tool_not_admitted' }
  const materialByRef = new Map(materials.map((material) => [material.toolRef, material] as const))
  const expectedByRef = new Map(args.expectedMaterials.map((material) => [material.toolRef, material] as const))
  for (const material of materials) {
    const expected = expectedByRef.get(material.toolRef)
    const inspected = expected?.inspectionTargetDigest === undefined ? undefined : await readManagedX402InspectionTarget(ctx, material.toolRef, now)
    if (expected === undefined || (expected.inspectionTargetDigest === undefined
      ? expected.materialDigest !== material.materialDigest : inspected?.targetDigest !== expected.inspectionTargetDigest)
      || expected.pricingDigest !== material.pricingDigest || expected.providerHost !== material.providerHost) {
      return { kind: 'refused', code: 'tool_not_admitted' }
    }
  }
  const schemas = Object.fromEntries(materials.map(({ toolRef, inputSchema, outputSchema }) => (
    [toolRef, { inputSchema, ...(outputSchema === undefined ? {} : { outputSchema }) }]
  )))
  const currentEdges = checkPlanReferences(parsed, schemas)
  if ('kind' in currentEdges) return currentEdges
  if (canonicalDigest(currentEdges) !== canonicalDigest(args.edgeValidations)) return { kind: 'refused', code: 'ref_type_mismatch' }

  const policy = await readCommercialPolicyGate(ctx.db, {
    environment: args.principal.environment,
    now,
    ...(args.principal.environment === 'sandbox' ? { sandboxFixture: 'managed_x402_deterministic_v1' as const } : {}),
  })
  if (policy.kind !== 'admitted') return { kind: 'refused', code: 'probe_failed' }
  const observationMap = new Map<PlanNodeId, LiveX402Observation>()
  for (const item of args.observations) {
    const node = parsed.nodes.find(({ id }) => id === item.nodeId)
    if (node === undefined || observationMap.has(node.id)) return { kind: 'refused', code: 'probe_failed' }
    observationMap.set(node.id, item.observation)
  }
  const priced = await pricePlanNodes(ctx, parsed.nodes, observationMap, policy.controls, currentEdges)
  if ('kind' in priced) {
    return priced.kind === 'refused' ? priced : { kind: 'refused', code: 'probe_failed' }
  }

  const quotesByNode = new Map(priced.map((quote) => [quote.nodeId, quote] as const))
  const persistedNodes = parsed.nodes.map((node) => {
    const quote = quotesByNode.get(node.id)
    const material = materialByRef.get(node.toolRef)
    if (quote === undefined || material === undefined) return undefined
    return {
      nodeId: node.id,
      inputMode: quote.inputMode,
      validation: quote.validation,
      toolRef: node.toolRef,
      toolMaterialDigest: material.materialDigest,
      inputTemplateDigest: canonicalDigest(node.input),
      pricingDigest: quote.pricingDigest,
      providerHost: material.providerHost,
      priceClass: quote.priceClass,
      ...(quote.bounds === undefined ? {} : { bounds: quote.bounds }),
      ceilingAudUnits: quote.ceilingAudUnits,
      ...(quote.rateToleranceBps === undefined ? {} : { rateToleranceBps: quote.rateToleranceBps }),
      dependsOn: [...node.dependsOn],
    }
  })
  if (persistedNodes.some((node) => node === undefined)) return { kind: 'refused', code: 'tool_not_admitted' }
  const nodes = persistedNodes as NonNullable<(typeof persistedNodes)[number]>[]
  const approvedTotalAudUnits = priced.reduce((total, quote) => total + BigInt(quote.ceilingAudUnits), 0n).toString()
  const dataFlows = [...new Map(currentEdges.map((edge) => {
    const material = materialByRef.get(parsed.nodes.find(({ id }) => id === edge.to)?.toolRef ?? '')
    return [`${edge.from}\u0000${edge.to}`, {
      from: edge.from, to: edge.to, destinationProviderHost: material?.providerHost ?? '',
    }] as const
  })).values()]
  if (dataFlows.some(({ destinationProviderHost }) => destinationProviderHost.length === 0)) {
    return { kind: 'refused', code: 'tool_not_admitted' }
  }
  const rateEvidenceValues = priced.flatMap(({ rateEvidence }) => rateEvidence === undefined ? [] : [rateEvidence])
  const distinctRateEvidence = [...new Map(rateEvidenceValues.map((evidence) => [evidence.digest, evidence] as const)).values()]
  const rateEvidence = distinctRateEvidence.length === 1 ? distinctRateEvidence[0] : undefined
  const rateEvidenceDigest = rateEvidenceValues.length === 0 ? undefined : canonicalDigest(rateEvidenceValues)
  const expiresAt = Math.min(
    now + policy.controls.operations.commitmentTtlMs,
    authority.expiresAt,
    ...materials.map(({ expiresAt: materialExpiresAt }) => materialExpiresAt),
  )
  // The unpaid probe must be fresh when this maximum is quoted. The approved
  // maximum then lasts through the policy's review window; every node obtains
  // a fresh ordinary Quote within its frozen ceiling before any purchase.
  if (expiresAt <= now) return { kind: 'refused', code: 'probe_failed' }

  const planRef = brandNonEmpty(globalThis.crypto.randomUUID(), 'PlanRef')
  const data = {
    plan: parsed,
    nodes,
    stages,
    dataFlows,
    approvedTotalAudUnits,
    grantRef: authority.grantRef,
    grantGeneration: authority.grantGeneration,
    grantDigest: authority.policyDigest,
    environment: args.principal.environment,
    policyDigest: policy.policyDigest,
    expiresAt,
  }
  const planDigest = canonicalDigest({ format: 'ae.plan-quote:v1', ...data })
  await ctx.db.insert('capabilityPlans', {
    planRef,
    principalId: authority.principal.principalId,
    ownerId: authority.principal.ownerId,
    accountRef: authority.principal.ownerId,
    credentialId: authority.principal.credentialId,
    grantRef: authority.grantRef,
    grantGeneration: authority.grantGeneration,
    environment: authority.principal.environment,
    grantDigest: authority.policyDigest,
    commercialPolicyDigest: policy.policyDigest,
    applicationRef: authority.principal.applicationRef,
    principalScopes: authority.principal.scopes,
    authorityMode: authority.principal.authorityMode,
    ...(args.chatAuthority === undefined ? {} : { chatTurnRef: args.chatAuthority.turnRef }),
    planJson: JSON.stringify(parsed),
    planDigest,
    nodes,
    stages: stages.map((stage) => [...stage]),
    dataFlows,
    approvedTotalAudUnits,
    ...(rateEvidenceDigest === undefined ? {} : { rateEvidenceDigest }),
    state: 'quoted',
    nodeOutcomes: [],
    expiresAt,
    runDeadlineAt: expiresAt,
    createdAt: now,
    updatedAt: now,
  })
  const result: Extract<Infer<typeof planQuoteResultValue>, { kind: 'quoted' }> = {
    kind: 'quoted',
    planRef,
    planDigest,
    nodes: priced.map((quote) => ({
      ...quote,
      ...(quote.bounds === undefined ? {} : {
        bounds: Object.fromEntries(Object.entries(quote.bounds as Readonly<Record<string, { maxItems: number }>>).map(([pointer, bound]) => [pointer, { ...bound }])),
      }),
      ...(quote.rateEvidence === undefined ? {} : { rateEvidence: { ...quote.rateEvidence } }),
      dependsOn: [...quote.dependsOn],
    })),
    stages: stages.map((stage) => [...stage]),
    approvedTotalAudUnits,
    currency: 'AUD',
    exponent: 6,
    expiresAt,
    ...(rateEvidence === undefined ? {} : {
      rateEvidence: {
        source: rateEvidence.source,
        observedAt: rateEvidence.observedAt,
        digest: rateEvidence.digest,
      },
    }),
    dataFlows: dataFlows.map((flow) => ({ ...flow })),
  }
  return result
}
