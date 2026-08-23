import { z } from 'zod'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { exactAmountSchema } from '@/modules/money/public'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { operationInvokeResultSchema } from '@/modules/capability-execution/operation-invoke-contracts'
import { operationInspectPlanOutputSchema } from '@/modules/registry/operation-action-contracts'
import { operationChoiceCompareOutputSchema } from '@/modules/registry/operation-choice-contracts'
import {
  publicOperationAuthenticationSchema,
  publicOperationParameterSchema,
  type InspectPlanResult,
  type OperationComparisonFact,
} from '@/modules/registry/public'
import type { AnswerSource } from './answer-synthesizer'
export const WebDiscoveryClaimSchema = z.strictObject({
  businessName: z.string(),
  suburb: z.string(),
  phone: z.string().exactOptional(),
  websiteUrl: z.string().exactOptional(),
  serviceSummary: z.string().exactOptional(),
  sourceUrl: z.string(),
})
export type WebDiscoveryClaim = z.infer<typeof WebDiscoveryClaimSchema>
const importedClaimSchema = WebDiscoveryClaimSchema
const operationRefSchema = z.string().regex(/^operation:v1:[0-9a-f]{64}$/)
const operationPriceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fixed'), amount: exactAmountSchema }),
  z.strictObject({ kind: z.literal('range'), minimum: exactAmountSchema, maximum: exactAmountSchema }),
  z.strictObject({ kind: z.literal('on_request') }),
])
const operationNavigationSchema = z.strictObject({
  relation: z.enum(['search', 'detail', 'compare', 'inspect_plan', 'execute', 'invoke', 'authenticate', 'create_customer_request', 'review_route', 'read_status', 'reconcile', 'cancel']),
  pathTemplate: z.string().exactOptional(),
  method: z.enum(['GET', 'POST']),
  actionId: z.string(),
  authentication: z.enum(['none', 'required']),
  inputSchema: z.record(z.string(), jsonValueSchema).exactOptional(),
  surfaces: z.array(z.enum(['ui', 'http', 'agentJson', 'answerThread', 'cli', 'mcp'])).exactOptional(),
  precondition: z.string().exactOptional(),
})
const operationCandidateSchema = z.strictObject({
  rank: z.number().int().min(1).max(4),
  operationRef: operationRefSchema,
  operationId: z.string(),
  descriptorDigest: z.string(),
  executionBindingDigest: z.string().exactOptional(),
  business: z.strictObject({ businessId: z.string(), slug: z.string(), name: z.string() }),
  offering: z.strictObject({ offeringRef: z.string(), revision: z.number().int().positive(), label: z.string(), summary: z.string() }),
  matchReason: z.string(),
  summary: z.string(),
  availability: z.strictObject({
    posture: z.enum(['integrated', 'routeable', 'unavailable']),
    observedAt: z.number().exactOptional(),
    validUntil: z.number().exactOptional(),
    reason: z.enum(['setup_required', 'temporarily_unavailable', 'readiness_expired', 'publisher_withdrew', 'under_review', 'updated_terms_require_review', 'not_supported_by_ae']).exactOptional(),
  }),
  commercial: z.strictObject({
    price: operationPriceSchema,
    priceEvidence: z.strictObject({
      priceDigest: z.string(),
      sourceRef: z.string().exactOptional(),
      evidenceRefs: z.array(z.string()),
      observedAt: z.number().exactOptional(),
      validUntil: z.number().exactOptional(),
    }).exactOptional(),
    materialTerms: z.array(z.strictObject({ label: z.string(), value: z.string() })),
    relationship: z.strictObject({ kind: z.enum(['none', 'direct', 'affiliate', 'ownership']), summary: z.string() }),
  }),
  requiredParameters: z.array(publicOperationParameterSchema.extend({ required: z.literal(true) })),
  optionalParameters: z.array(publicOperationParameterSchema.extend({ required: z.literal(false) })),
  inputSchemaDigest: z.string(),
  inputJsonSchema: z.record(z.string(), jsonValueSchema).exactOptional(),
  exactRebindRequired: z.boolean(),
  authority: z.strictObject({
    publisher: z.enum(['provider_owned', 'ae_curated_external', 'third_party_gateway', 'observed_external']),
    sourceKind: z.enum(['ae_envelope', 'openapi_http', 'mcp', 'agent_plugin_mcp', 'x402']),
    authentication: publicOperationAuthenticationSchema,
  }),
  dataUse: z.array(z.strictObject({
    effectId: z.string(), inputPointer: z.string(),
    classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
    phase: z.enum(['preparation', 'execution']),
    recipient: z.enum(['candidate_binding', 'selected_binding', 'named_recipient']),
    purposes: z.array(z.string()),
  })),
  effects: z.array(z.strictObject({
    effectId: z.string(), class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
    authority: z.enum(['none', 'explicit', 'mandate_or_explicit']),
    reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
  })),
  evidence: z.array(z.strictObject({ evidenceId: z.string(), outputPointer: z.string(), purpose: z.enum(['comparison', 'completion', 'recovery']) })),
  recovery: z.strictObject({ idempotency: z.enum(['not_applicable', 'required']), recovery: z.enum(['retry_safe', 'reconcile_required']) }),
  navigation: z.array(operationNavigationSchema),
})
const operationExecuteResultSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    operationRef: operationRefSchema,
    capabilityId: z.string(),
    name: z.string(),
    output: jsonValueSchema,
    evidenceHash: z.string(),
    composition: jsonValueSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    operationRef: z.string(),
    reason: z.enum(['operation_not_found', 'operation_not_keyless', 'operation_not_executable', 'input_invalid', 'endpoint_invalid']),
    composition: jsonValueSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    operationRef: z.string(),
    reason: z.literal('result_too_large'),
    resultHash: z.string(),
    composition: jsonValueSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('error'),
    operationRef: z.string(),
    code: z.enum(['fetch_failed', 'response_invalid', 'provider_error', 'source_unavailable']),
    retryable: z.boolean(),
    reason: z.string(),
    composition: jsonValueSchema.exactOptional(),
  }),
])
const operationPrivacyFailureSchema = z.strictObject({
  kind: z.literal('unsafe_output'),
  operationRef: operationRefSchema,
  resultHash: z.string().min(1),
  evidenceHash: z.string().min(1).exactOptional(),
  invocationRef: z.string().min(1).exactOptional(),
})
const operationOutcomeResultSchema = z.union([
  operationExecuteResultSchema,
  operationInvokeResultSchema,
  operationPrivacyFailureSchema,
])
const operationPresentationSchema = z.strictObject({
  descriptorDigest: z.string().min(1).max(128),
  operationLabel: z.string().min(1).max(200),
  sourceLabel: z.string().min(1).max(200),
  outputSchemaDigest: z.string().min(1).max(128),
  outputAnnotations: z.array(z.strictObject({
    pointer: z.string().max(1_024),
    label: z.string().min(1).max(200),
    role: z.enum(['request', 'constraint', 'comparison', 'commitment', 'result', 'completion_evidence', 'recovery']),
    semanticIdentity: z.string().max(256).exactOptional(),
  })).max(128),
  actor: z.literal('ae_runtime'),
  observedAt: z.number().int().nonnegative(),
})
const operationOutcomeSchema = z.strictObject({
  toolId: z.enum(['operation.execute', 'operation.invoke']),
  operationRef: operationRefSchema,
  resultDigest: z.string(),
  toolCallDigest: z.string(),
  presentation: operationPresentationSchema.exactOptional(),
  result: operationOutcomeResultSchema,
}).superRefine((outcome, context) => {
  if (canonicalDigest(outcome.result).toString() !== outcome.resultDigest) {
    context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'operation_result_digest_invalid' })
  }
  const resultMatchesTool =
    outcome.result.kind === 'unsafe_output'
    || (outcome.toolId === 'operation.execute'
      ? operationExecuteResultSchema.safeParse(outcome.result).success
      : operationInvokeResultSchema.safeParse(outcome.result).success)
  if (!resultMatchesTool) {
    context.addIssue({ code: 'custom', path: ['result'], message: 'operation_result_tool_mismatch' })
  }
  if ('operationRef' in outcome.result
    && outcome.result.operationRef !== undefined
    && outcome.result.operationRef !== outcome.operationRef) {
    context.addIssue({ code: 'custom', path: ['result', 'operationRef'], message: 'operation_result_ref_mismatch' })
  }
})
const operationSelectionSchema = z.strictObject({
  operationRef: operationRefSchema,
  toolId: z.enum(['operation.execute', 'operation.invoke']),
  descriptorDigest: z.string().exactOptional(),
  executionBindingDigest: z.string().exactOptional(),
  resultDigest: z.string().exactOptional(),
  candidateSetDigest: z.string().exactOptional(),
})
type AnswerOperationPlanSummary = Extract<InspectPlanResult, { kind: 'ok' }>['summary']
const MAX_OPERATION_COMPARISON_FACTS = 28
const MAX_OPERATION_ARTIFACT_BYTES = 64 * 1024
const operationComparisonFactsSchema = z.custom<readonly OperationComparisonFact[]>(
  (value) =>
    Array.isArray(value)
    && value.length <= MAX_OPERATION_COMPARISON_FACTS
    && operationChoiceCompareOutputSchema.safeParse({
      kind: 'ok',
      schemaVersion: 'registry-operations:v1',
      operations: [],
      facts: value,
      navigation: [],
    }).success,
)
const operationPlanSummarySchema = z.custom<AnswerOperationPlanSummary>(
  (value) =>
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && operationInspectPlanOutputSchema.safeParse({
      kind: 'ok',
      schemaVersion: 'registry-operations:v1',
      inspectPlanRef: 'inspect-plan:validation',
      operationRefs: [`operation:v1:${'0'.repeat(64)}`],
      mappingRefs: [],
      summary: value,
      navigation: [],
    }).success,
)
export const AnswerOperationComparisonSchema = z.strictObject({
  operationRefs: z.array(operationRefSchema).min(1).max(4),
  facts: operationComparisonFactsSchema,
}).superRefine((artifact, context) => {
  try {
    const json = JSON.stringify(artifact)
    if (json === undefined || new TextEncoder().encode(json).byteLength > MAX_OPERATION_ARTIFACT_BYTES) {
      context.addIssue({ code: 'custom', message: 'operation_comparison_too_large' })
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'operation_comparison_invalid' })
  }
})
export const AnswerOperationPlanSchema = z.strictObject({
  inspectPlanRef: z.string().min(1).max(256),
  operationRefs: z.array(operationRefSchema).min(1).max(4),
  mappingRefs: z.array(z.string().regex(/^mapping:v1:[0-9a-f]{64}$/)).max(32),
  summary: operationPlanSummarySchema,
}).superRefine((artifact, context) => {
  try {
    const json = JSON.stringify(artifact)
    if (json === undefined || new TextEncoder().encode(json).byteLength > MAX_OPERATION_ARTIFACT_BYTES) {
      context.addIssue({ code: 'custom', message: 'operation_plan_too_large' })
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'operation_plan_invalid' })
  }
})
export type AnswerOperationComparison = z.infer<typeof AnswerOperationComparisonSchema>
export type AnswerOperationPlan = z.infer<typeof AnswerOperationPlanSchema>


export function projectAnswerOperationComparison(
  value: unknown,
): AnswerOperationComparison | undefined {
  const parsed = operationChoiceCompareOutputSchema.safeParse(value)
  if (!parsed.success || parsed.data.kind !== 'ok') return undefined
  const operationRefs = [...new Set(parsed.data.operations.map((operation) => operation.operationRef))]
  const artifact = AnswerOperationComparisonSchema.safeParse({
    operationRefs,
    facts: parsed.data.facts,
  })
  return artifact.success ? artifact.data : undefined
}

export function projectAnswerOperationPlan(
  value: unknown,
): AnswerOperationPlan | undefined {
  const parsed = operationInspectPlanOutputSchema.safeParse(value)
  if (!parsed.success || parsed.data.kind !== 'ok') return undefined
  const artifact = AnswerOperationPlanSchema.safeParse({
    inspectPlanRef: parsed.data.inspectPlanRef,
    operationRefs: parsed.data.operationRefs,
    mappingRefs: parsed.data.mappingRefs,
    summary: parsed.data.summary,
  })
  return artifact.success ? artifact.data : undefined
}


export const AnswerOperationPrivacyFailureSchema = operationPrivacyFailureSchema
export type AnswerOperationPrivacyFailure = z.infer<typeof operationPrivacyFailureSchema>
export const AnswerOperationCandidateSchema = operationCandidateSchema
export const AnswerOperationOutcomeSchema = operationOutcomeSchema
export const AnswerOperationPresentationSchema = operationPresentationSchema
export const AnswerOperationSelectionSchema = operationSelectionSchema
export const AnswerOperationComparisonArtifactSchema = z.strictObject({
  kind: z.literal('operation-comparison'),
  ...AnswerOperationComparisonSchema.shape,
})
export const AnswerOperationPlanArtifactSchema = z.strictObject({
  kind: z.literal('operation-plan'),
  ...AnswerOperationPlanSchema.shape,
})
export const AnswerArtifactKindValues = [
  'one-line',
  'selected-provider',
  'provider-cards',
  'provider-compare-table',
  'operation-candidates',
  'operation-comparison',
  'operation-plan',
  'operation-outcome',
  'imported-claims',
  'recovery-prompts',
  'location-map',
  'prose',
  'what-to-do-now',
  'agent-json',
  'protected-by-ae',
] as const
export const AnswerSourceSchema = z.object({
  citationIndex: z.number().int().positive(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  suburb: z.string(),
  stateTerritory: z.string(),
  serviceArea: z.string(),
  hoursLabel: z.string(),
  availabilityLabel: z.string(),
  trustLabel: z.string(),
  responseTimeLabel: z.string(),
  trustCue: z.string(),
  freshnessLabel: z.string().exactOptional(),
  photoUrl: z.string().exactOptional(),
  pricingSummary: z.string().exactOptional(),
  availabilitySummary: z.string().exactOptional(),
  nextStepLabel: z.string(),
  detailUrl: z.string(),
  publishedPhone: z.string().exactOptional(),
  services: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      summary: z.string(),
      pricingSummary: z.string().exactOptional(),
      availabilitySummary: z.string().exactOptional(),
    }),
  ),
})

export const AnswerCompareFieldSchema = z.enum(['area', 'response', 'availability', 'hours', 'trust', 'freshness', 'nextStep'])
export const ANSWER_OPERATION_CANDIDATE_LIMIT = 4 as const

const operationCandidatesArtifactSchema = z.object({
  kind: z.literal('operation-candidates'),
  candidates: z.array(operationCandidateSchema).max(ANSWER_OPERATION_CANDIDATE_LIMIT),
  operationCandidatesDigest: z.string().exactOptional(),
  selection: operationSelectionSchema.exactOptional(),
}).superRefine((artifact, context) => {
  if (
    artifact.operationCandidatesDigest !== undefined
    && answerOperationCandidateSetDigest(artifact.candidates) !== artifact.operationCandidatesDigest
  ) {
    context.addIssue({ code: 'custom', path: ['operationCandidatesDigest'], message: 'operation_candidates_digest_invalid' })
  }
  const selection = artifact.selection
  if (selection === undefined) {
    return
  }
  const matchingCandidates = artifact.candidates.filter((candidate) => candidate.operationRef === selection.operationRef)
  if (matchingCandidates.length !== 1) {
    context.addIssue({ code: 'custom', path: ['selection', 'operationRef'], message: 'operation_selection_ref_not_in_candidates' })
    return
  }
  if (matchingCandidates[0]?.descriptorDigest !== selection.descriptorDigest) {
    context.addIssue({ code: 'custom', path: ['selection', 'descriptorDigest'], message: 'operation_selection_descriptor_digest_invalid' })
  }
  if (matchingCandidates[0]?.executionBindingDigest !== selection.executionBindingDigest) {
    context.addIssue({ code: 'custom', path: ['selection', 'executionBindingDigest'], message: 'operation_selection_execution_binding_digest_invalid' })
  }
  if (
    selection.candidateSetDigest !== undefined
    && artifact.operationCandidatesDigest !== undefined
    && selection.candidateSetDigest !== artifact.operationCandidatesDigest
  ) {
    context.addIssue({ code: 'custom', path: ['selection', 'candidateSetDigest'], message: 'operation_selection_candidate_set_digest_invalid' })
  }
})

export const AnswerArtifactSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one-line'), text: z.string() }),
  z.object({ kind: z.literal('selected-provider'), provider: AnswerSourceSchema }),
  z.object({ kind: z.literal('provider-cards'), providers: z.array(AnswerSourceSchema) }),
  z.object({
    kind: z.literal('provider-compare-table'),
    providers: z.array(AnswerSourceSchema),
    fields: z.array(AnswerCompareFieldSchema).exactOptional(),
  }),
  operationCandidatesArtifactSchema,
  AnswerOperationComparisonArtifactSchema,
  AnswerOperationPlanArtifactSchema,
  z.object({
    kind: z.literal('operation-outcome'),
    outcome: operationOutcomeSchema,
  }),
  z.object({
    kind: z.literal('imported-claims'),
    claims: z.array(importedClaimSchema).max(5),
  }),
  z.object({
    kind: z.literal('recovery-prompts'),
    title: z.string().exactOptional(),
    prompts: z.array(z.object({ label: z.string(), query: z.string() })).min(1).max(4),
    links: z.array(z.object({ label: z.string(), href: z.enum(['/for-providers']) })).max(2).exactOptional(),
  }),
  z.object({
    kind: z.literal('location-map'),
    label: z.string(),
    placeQuery: z.string(),
  }),
  z.object({
    kind: z.literal('prose'),
    block: z.enum(['summary']),
    text: z.string(),
  }),
  z.object({ kind: z.literal('what-to-do-now'), text: z.string() }),
  z.object({ kind: z.literal('agent-json'), url: z.string() }),
  z.object({ kind: z.literal('protected-by-ae') }),
])

export const AeAnswerArtifactsSchema = z.object({
  query: z.string(),
  oneLine: z.string(),
  providers: z.array(AnswerSourceSchema),
  summary: z.string(),
  whatToDoNow: z.string(),
  locationMap: z
    .object({
      label: z.string(),
      placeQuery: z.string(),
    })
    .exactOptional(),
  agentJsonUrl: z.string(),
})
export type AnswerOperationCandidate = z.infer<typeof operationCandidateSchema>
export type AnswerOperationOutcome = z.infer<typeof operationOutcomeSchema>
export type AnswerOperationPresentation = z.infer<typeof operationPresentationSchema>
export type AnswerOperationSelection = z.infer<typeof operationSelectionSchema>


/**
 * Candidate-set identity intentionally excludes display-only fields such as
 * names, descriptions, rich commercial copy, and the selected-only input
 * schema. It is computed before display compaction and is therefore stable
 * across answer, checkpoint, replay, and machine projections.
 */
export function projectAnswerOperationCandidateInvariant(
  candidate: AnswerOperationCandidate,
): Readonly<Record<string, unknown>> {
  const availability = candidate.availability
  return {
    rank: candidate.rank,
    operationRef: candidate.operationRef,
    descriptorDigest: candidate.descriptorDigest,
    ...(candidate.executionBindingDigest === undefined ? {} : { executionBindingDigest: candidate.executionBindingDigest }),
    availability: {
      posture: availability.posture,
      ...(availability.reason === undefined ? {} : { reason: availability.reason }),
    },
  }
}

export function answerOperationCandidateSetDigest(
  candidates: readonly AnswerOperationCandidate[],
): string {
  return canonicalDigest(candidates.map(projectAnswerOperationCandidateInvariant)).toString()
}

export type AnswerArtifact =
  | { kind: 'one-line'; text: string }
  | { kind: 'selected-provider'; provider: AnswerSource }
  | { kind: 'provider-cards'; providers: readonly AnswerSource[] }
  | { kind: 'imported-claims'; claims: readonly WebDiscoveryClaim[] }
  | {
      kind: 'provider-compare-table'
      providers: readonly AnswerSource[]
      fields?: readonly AnswerCompareField[]
    }
  | { kind: 'operation-candidates'; candidates: readonly AnswerOperationCandidate[]; operationCandidatesDigest?: string; selection?: AnswerOperationSelection }
  | ({ kind: 'operation-comparison' } & AnswerOperationComparison)
  | ({ kind: 'operation-plan' } & AnswerOperationPlan)
  | { kind: 'operation-outcome'; outcome: AnswerOperationOutcome }
  | { kind: 'recovery-prompts'; title?: string; prompts: readonly { label: string; query: string }[]; links?: readonly { label: string; href: '/for-providers' }[] }
  | { kind: 'location-map'; label: string; placeQuery: string }
  | { kind: 'prose'; block: 'summary'; text: string }
  | { kind: 'what-to-do-now'; text: string }
  | { kind: 'agent-json'; url: string }
  | { kind: 'protected-by-ae' }

export type AnswerCompareField = z.infer<typeof AnswerCompareFieldSchema>

export type AeAnswerArtifacts = {
  query: string
  oneLine: string
  providers: readonly AnswerSource[]
  summary: string
  whatToDoNow: string
  locationMap?: {
    label: string
    placeQuery: string
  }
  agentJsonUrl: string
}
export const AnswerRequestRouteValues = [
  'business',
  'operation',
  'confirmation',
  'boundary',
] as const
export type AnswerRequestRoute = (typeof AnswerRequestRouteValues)[number]

export const AnswerRequestedIntentSchema = z.strictObject({
  intentId: z.string().trim().min(1).max(48),
  phrase: z.string().trim().min(1).max(180),
  requestedResult: z.string().trim().min(1).max(120),
})
export type AnswerRequestedIntent = z.infer<typeof AnswerRequestedIntentSchema>

export const AnswerRequestedIntentsSchema = AnswerRequestedIntentSchema
  .array()
  .min(1)
  .max(4)
  .superRefine((intents, context) => {
    const ids = new Set<string>()
    for (const [index, intent] of intents.entries()) {
      if (ids.has(intent.intentId)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'intentId'],
          message: 'Requested intent ids must be unique.',
        })
      }
      ids.add(intent.intentId)
    }
  })

export const AnswerContinuationValues = [
  'new',
  'refine_prior_operation',
  'resolve_pending',
] as const
export type AnswerContinuation = (typeof AnswerContinuationValues)[number]

/**
 * Whether this request authorizes a provider effect. `candidate_only` keeps
 * Market Operation reads available and withholds execution until the user
 * selects, which is what a "search only" or "do not run it" request means.
 */
export const AnswerEffectPolicyValues = ['run_when_ready', 'candidate_only'] as const
export type AnswerEffectPolicy = (typeof AnswerEffectPolicyValues)[number]

/**
 * The orchestrator's resolved policy for the model/tool agent. The agent
 * enforces this decision; it does not reinterpret the preflight route.
 */
export type EffectiveAnswerAgentRoute = Readonly<{
  lane: 'business' | 'operation'
  continuation: AnswerContinuation
  allowedReadToolFamily: 'business' | 'operation' | 'shared'
  exactOperationDetailRequired: boolean
  effectAllowed: boolean
}>

/**
 * The only coarse request interpretation used by the Answer runtime.
 *
 * Requested intents are ordered because a single request may contain more than
 * one operation, but the host still needs to preserve the model's declared
 * precedence before applying the one-effect and schema-validation gates.
 */
export const AnswerRequestInterpretationSchema = z.strictObject({
  route: z.enum(AnswerRequestRouteValues),
  requestedIntents: AnswerRequestedIntentsSchema,
  continuation: z.enum(AnswerContinuationValues),
  effectPolicy: z.enum(AnswerEffectPolicyValues)
    .describe('Use candidate_only when the request asks to search, list, or review candidates before anything runs, or says not to run, invoke, execute, or call yet.'),
})
export type AnswerRequestInterpretation = z.infer<typeof AnswerRequestInterpretationSchema>
