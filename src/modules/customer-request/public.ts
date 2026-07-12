import { z } from 'zod'

export const CUSTOMER_REQUEST_STATES = [
  'needs_information',
  'planning',
  'finding_options',
  'review_required',
  'changes_need_approval',
  'authorized',
  'dispatch_pending',
  'provider_pending',
  'outcome_unknown',
  'partially_completed',
  'completed_evidence_received',
  'definitely_failed',
  'cancellation_requested',
  'cancelled',
  'cancellation_rejected',
  'cancellation_unknown',
  'issue_reported',
  'under_review',
  'resolved',
  'unresolved_terminal',
] as const

export type CustomerRequestState = (typeof CUSTOMER_REQUEST_STATES)[number]
export type CapabilityValueType = 'string' | 'integer' | 'boolean' | 'url' | 'money_minor' | 'provider_offer_ref'
export type DataClassification = 'public' | 'personal' | 'sensitive' | 'credential'

export type CapabilityFieldDefinition = Readonly<{
  valueType: CapabilityValueType
  customerLabel: string
  required: boolean
  decisionRelevance?: 'option_selection' | 'commitment'
  disclosure?: Readonly<{
    classification: DataClassification
    phase: 'preparation' | 'execution'
    recipient: 'candidate_provider' | 'selected_provider' | 'offer_issuer' | 'named_recipient'
    purposes: readonly string[]
  }>
  evidenceRole?: 'provider_offer' | 'result_artifact' | 'status' | 'provider_report'
}>

export type CapabilityContract = Readonly<{
  capabilityContractId: string
  name: string
  operation: 'query' | 'quote' | 'reserve' | 'book' | 'purchase' | 'status' | 'cancel'
  input: Readonly<Record<string, CapabilityFieldDefinition>>
  output: Readonly<Record<string, CapabilityFieldDefinition>>
  consequence: Readonly<{
    commitment: 'none' | 'hold' | 'reservation' | 'booking' | 'purchase' | 'cancellation'
    spend: 'none' | 'quoted' | 'metered'
    reversibility: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible'
    approval: 'none' | 'explicit' | 'mandate_or_explicit'
  }>
  applicability?: readonly Readonly<{
    field: string
    acceptedValues: readonly (string | number | boolean)[]
  }>[]
  providerAffinity?: Readonly<{ kind: 'offer_issuer'; inputField: string }>
}>

export type CapabilityContractRegistry = Readonly<{
  get: (capabilityContractId: string) => CapabilityContract | undefined
  list: () => readonly CapabilityContract[]
}>

export type CustomerRequestRequirement = Readonly<{
  field: string
  label: string
  value: string | number | boolean
}>

export type CustomerRequestUnderstanding = Readonly<{
  outcome: string
  hardConstraints: readonly CustomerRequestRequirement[]
  preferences: readonly Readonly<CustomerRequestRequirement & { priority: number }>[]
  substitutions: Readonly<{ allowed: boolean; boundaries: readonly string[] }>
  completionCriterion: string
  completionRequirement: Readonly<{
    evidenceRole: 'provider_offer' | 'result_artifact' | 'status' | 'provider_report'
    valueType: CapabilityValueType
  }>
  deadline?: number
}>

export type CustomerRequest = Readonly<{
  requestId: string
  principalId: string
  delegatedAgentId: string
  intent: string
  compilationState: 'submitted' | 'needs_information' | 'plan_ready' | 'unsupported'
  understanding: CustomerRequestUnderstanding
  knownFacts: Readonly<Record<string, string | number | boolean>>
  routing: Readonly<{
    networkId: string
    currency: string
    maximumSpendMinor: number
    optimizeFor: 'cost' | 'latency'
  }>
  revision: number
  createdAt: number
}>

export type PlanInputValue =
  | Readonly<{ kind: 'literal'; value: string | number | boolean }>
  | Readonly<{ kind: 'action_output'; actionId: string; field: string }>
  | Readonly<{ kind: 'customer_fact'; fact: string }>

export type ProposedAction = Readonly<{
  actionId: string
  capabilityContractId: string
  dependsOn: readonly string[]
  input: Readonly<Record<string, PlanInputValue>>
  providerAffinity?: Readonly<{
    kind: 'offer_issuer'
    inputField: string
    sourceActionId: string
  }>
}>

export type PlanRevision = Readonly<{
  planRevisionId: string
  requestId: string
  requestRevision: number
  proposedByAgentId: string
  proposalProvenance: Readonly<
    | { kind: 'agent_interpretation'; proposalDigest: string; interpreterId: string }
    | { kind: 'direct_structured'; proposalDigest: string }
  >
  completionEvidence: readonly Readonly<{
    actionId: string
    field: string
    role: 'provider_offer' | 'result_artifact' | 'status' | 'provider_report'
  }>[]
  createdAt: number
  actions: readonly ProposedAction[]
}>

export type PreparedAction = Readonly<{
  preparedActionId: string
  requestId: string
  requestRevision: number
  planRevisionId: string
  actionId: string
  capabilityContractId: string
  resolvedInputDigest: string
  quoteId: string
  quoteDigest: string
  preparedActionDigest: string
  selectedBusiness: Readonly<{ nodeId: string; bindingId: string; name: string }>
  alternatives: readonly Readonly<{
    business: Readonly<{ nodeId: string; bindingId: string; name: string }>
    expectedCost: Readonly<{ currency: string; amountMinor: number }>
    maximumCost: Readonly<{ currency: string; amountMinor: number }>
    expectedLatencyMs: number
  }>[]
  comparisonBasis: Readonly<{
    objective: 'cost' | 'latency'
    selectedBecause: readonly string[]
    commercialInfluence: 'none' | 'disclosed'
  }>
  allowedFallbacks: readonly Readonly<{
    business: Readonly<{ nodeId: string; bindingId: string; name: string }>
    trigger: 'effect_not_committed'
    maximumCost: Readonly<{ currency: string; amountMinor: number }>
  }>[]
  expectedCost: Readonly<{ currency: string; amountMinor: number }>
  maximumGrossCost: Readonly<{ currency: string; amountMinor: number }>
  priceComponents: readonly Readonly<{ kind: 'provider' | 'ae_fee' | 'tax'; label: string; amountMinor: number }>[]
  disclosures: readonly Readonly<{
    field: string
    timing: 'already_shared_to_prepare' | 'on_execution'
    recipientBindingId: string
    recipientName: string
    purposes: readonly string[]
  }>[]
  materialTerms: readonly Readonly<{ key: string; label: string; value: string }>[]
  cancellation: Readonly<{ kind: 'supported' | 'conditional' | 'unsupported'; summary: string }>
  expectedBy?: number
  expiresAt: number
  preparedAt: number
}>

export type PreparationGrant = Readonly<{
  preparationGrantId: string
  requestId: string
  requestRevision: number
  principalId: string
  allowedDataFields: readonly string[]
  allowedRecipientKinds: readonly ('candidate_provider' | 'selected_provider' | 'offer_issuer' | 'named_recipient')[]
  allowedPurposes: readonly string[]
  maximumRecipients: number
  authenticationEvidenceRef: string
  expiresAt: number
  grantedAt: number
}>

export type ApprovalGrant = Readonly<{
  approvalGrantId: string
  approvalGrantDigest: string
  requestId: string
  requestRevision: number
  planRevisionId: string
  actionId: string
  preparedActionDigest: string
  approvingPrincipalId: string
  authoritySource: Readonly<{ kind: 'explicit'; authenticationEvidenceRef: string } | { kind: 'standing_mandate'; mandateId: string }>
  useLimit: 1
  expiresAt: number
  grantedAt: number
}>

export type ActionAttempt = Readonly<{
  actionAttemptId: string
  requestId: string
  requestRevision: number
  planRevisionId: string
  actionId: string
  preparedActionDigest: string
  approvalGrantId?: string
  idempotencyKey: string
  rootRunId?: string
  state: 'ready' | 'dispatch_pending' | 'provider_pending' | 'outcome_unknown' | 'completed' | 'definitely_failed' | 'cancel_pending' | 'cancelled' | 'cancellation_unknown'
  createdAt: number
  updatedAt: number
}>

export type CustomerRequestActivityEvent = Readonly<{
  eventId: string
  requestId: string
  requestRevision: number
  occurredAt: number
  actor: Readonly<{ kind: 'principal' | 'agent' | 'kernel' | 'provider' | 'operator'; actorId: string }>
  type: 'request_created' | 'plan_proposed' | 'action_prepared' | 'approval_granted' | 'approval_declined' | 'attempt_started' | 'provider_pending' | 'outcome_unknown' | 'effect_reported' | 'action_failed' | 'cancellation_requested' | 'cancellation_resolved' | 'issue_reported' | 'issue_resolved'
  evidenceRef?: string
}>

export type CustomerRequestProjection = Readonly<{
  requestId: string
  requestRevision: number
  state: CustomerRequestState
  title: string
  summary: string
  nextAction: Readonly<{ kind: 'none' | 'provide_information' | 'review' | 'wait' | 'inspect' | 'resolve_issue'; label: string }>
  preparedActions: readonly PreparedAction[]
  attempts: readonly ActionAttempt[]
  activity: readonly CustomerRequestActivityEvent[]
}>

const identifier = z.string().trim().min(1).max(200)
const timestamp = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const literalValueSchema = z.union([z.string().max(8_000), z.number().safe(), z.boolean()])
const requirementSchema = z.object({
  field: identifier,
  label: z.string().trim().min(1).max(240),
  value: literalValueSchema,
}).strict()
const understandingSchema = z.object({
  outcome: z.string().trim().min(1).max(1_000),
  hardConstraints: z.array(requirementSchema).max(64),
  preferences: z.array(requirementSchema.extend({ priority: z.number().int().min(1).max(64) }).strict()).max(64),
  substitutions: z.object({ allowed: z.boolean(), boundaries: z.array(z.string().trim().min(1).max(500)).max(32) }).strict(),
  completionCriterion: z.string().trim().min(1).max(1_000),
  completionRequirement: z.object({
    evidenceRole: z.enum(['provider_offer', 'result_artifact', 'status', 'provider_report']),
    valueType: z.enum(['string', 'integer', 'boolean', 'url', 'money_minor', 'provider_offer_ref']),
  }).strict().optional(),
  deadline: timestamp.optional(),
}).strict()
const fieldDefinitionSchema = z.object({
  valueType: z.enum(['string', 'integer', 'boolean', 'url', 'money_minor', 'provider_offer_ref']),
  customerLabel: z.string().trim().min(1).max(120),
  required: z.boolean(),
  decisionRelevance: z.enum(['option_selection', 'commitment']).optional(),
  disclosure: z.object({
    classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
    phase: z.enum(['preparation', 'execution']),
    recipient: z.enum(['candidate_provider', 'selected_provider', 'offer_issuer', 'named_recipient']),
    purposes: z.array(identifier).min(1).max(16),
  }).strict().optional(),
  evidenceRole: z.enum(['provider_offer', 'result_artifact', 'status', 'provider_report']).optional(),
}).strict()
const capabilityContractSchema = z.object({
  capabilityContractId: identifier.refine((value) => /:v[1-9]\d*$/.test(value)),
  name: z.string().trim().min(1).max(160),
  operation: z.enum(['query', 'quote', 'reserve', 'book', 'purchase', 'status', 'cancel']),
  input: z.record(identifier, fieldDefinitionSchema),
  output: z.record(identifier, fieldDefinitionSchema),
  consequence: z.object({
    commitment: z.enum(['none', 'hold', 'reservation', 'booking', 'purchase', 'cancellation']),
    spend: z.enum(['none', 'quoted', 'metered']),
    reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
    approval: z.enum(['none', 'explicit', 'mandate_or_explicit']),
  }).strict(),
  applicability: z.array(z.object({
    field: identifier,
    acceptedValues: z.array(literalValueSchema).min(1).max(32),
  }).strict()).max(32).optional(),
  providerAffinity: z.object({ kind: z.literal('offer_issuer'), inputField: identifier }).strict().optional(),
}).strict()
const requestSchema = z.object({
  requestId: identifier,
  principalId: identifier,
  delegatedAgentId: identifier,
  intent: z.string().trim().min(1).max(2_000),
  compilationState: z.enum(['submitted', 'needs_information', 'plan_ready', 'unsupported']).optional(),
  understanding: understandingSchema.optional(),
  knownFacts: z.record(identifier, literalValueSchema).optional(),
  routing: z.object({
    networkId: identifier,
    currency: z.string().regex(/^[A-Z]{3}$/),
    maximumSpendMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    optimizeFor: z.enum(['cost', 'latency']),
  }).strict(),
  createdAt: timestamp,
}).strict()
const planInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: z.union([z.string().max(8_000), z.number().safe(), z.boolean()]) }).strict(),
  z.object({ kind: z.literal('action_output'), actionId: identifier, field: identifier }).strict(),
  z.object({ kind: z.literal('customer_fact'), fact: identifier }).strict(),
])
const planActionSchema = z.object({
  actionId: identifier,
  capabilityContractId: identifier,
  dependsOn: z.array(identifier).max(32),
  input: z.record(identifier, planInputSchema),
}).strict()
const planRevisionSchema = z.object({
  planRevisionId: identifier,
  requestId: identifier,
  requestRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  proposedByAgentId: identifier,
  proposalProvenance: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('agent_interpretation'), proposalDigest: identifier, interpreterId: identifier }).strict(),
    z.object({ kind: z.literal('direct_structured'), proposalDigest: identifier }).strict(),
  ]),
  completionEvidence: z.array(z.object({ actionId: identifier, field: identifier }).strict()).min(1).max(32),
  createdAt: timestamp,
  actions: z.array(planActionSchema).min(1).max(32),
}).strict()

export function defineCapabilityContract(input: unknown): CapabilityContract {
  const parsed = capabilityContractSchema.safeParse(input)
  if (!parsed.success) throw new Error('capability_contract_invalid')
  const contract = parsed.data
  validateCapabilityContract(contract)
  return deepFreeze(contract) as CapabilityContract
}

export function createCapabilityContractRegistry(contracts: readonly unknown[]): CapabilityContractRegistry {
  const byId = new Map<string, CapabilityContract>()
  for (const candidate of contracts) {
    const contract = defineCapabilityContract(candidate)
    if (byId.has(contract.capabilityContractId)) throw new Error('capability_contract_duplicate')
    byId.set(contract.capabilityContractId, contract)
  }
  const ordered = Object.freeze([...byId.values()].sort((left, right) => left.capabilityContractId.localeCompare(right.capabilityContractId)))
  return Object.freeze({
    get: (capabilityContractId: string) => byId.get(capabilityContractId),
    list: () => ordered,
  })
}

export function createCustomerRequest(input: unknown): CustomerRequest {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) throw new Error('customer_request_invalid')
  const understanding = parsed.data.understanding ?? {
    outcome: parsed.data.intent,
    hardConstraints: [],
    preferences: [],
    substitutions: { allowed: false, boundaries: [] },
    completionCriterion: parsed.data.intent,
    completionRequirement: { evidenceRole: 'status' as const, valueType: 'string' as const },
  }
  const normalizedUnderstanding = {
    ...understanding,
    completionRequirement: understanding.completionRequirement
      ?? { evidenceRole: 'status' as const, valueType: 'string' as const },
  }
  return deepFreeze({
    ...parsed.data,
    compilationState: parsed.data.compilationState ?? 'submitted',
    understanding: normalizedUnderstanding,
    knownFacts: parsed.data.knownFacts ?? {},
    revision: 1,
  }) as CustomerRequest
}

export function createPlanRevision(input: unknown, registry: CapabilityContractRegistry): PlanRevision {
  const parsed = planRevisionSchema.safeParse(input)
  if (!parsed.success) throw new Error('plan_revision_invalid')
  const proposed = parsed.data
  const byActionId = new Map(proposed.actions.map((action) => [action.actionId, action]))
  if (byActionId.size !== proposed.actions.length) throw new Error('plan_action_duplicate')
  validateDependencyGraph(proposed.actions, byActionId)

  const actions = proposed.actions.map((action): ProposedAction => {
    const contract = registry.get(action.capabilityContractId)
    if (contract === undefined) throw new Error('plan_capability_contract_not_found')
    validateActionInput(action, contract, byActionId, registry)
    const affinity = resolveProviderAffinity(action, contract)
    return deepFreeze({ ...action, ...(affinity === undefined ? {} : { providerAffinity: affinity }) }) as ProposedAction
  })
  const completionEvidence = proposed.completionEvidence.map((evidence) => {
    const action = byActionId.get(evidence.actionId)
    const contract = action === undefined ? undefined : registry.get(action.capabilityContractId)
    const role = contract?.output[evidence.field]?.evidenceRole
    if (role === undefined) throw new Error('plan_completion_evidence_invalid')
    return { ...evidence, role }
  })
  return deepFreeze({ ...proposed, actions, completionEvidence }) as PlanRevision
}

function validateCapabilityContract(contract: z.infer<typeof capabilityContractSchema>): void {
  const inputFields = Object.entries(contract.input)
  const materialDisclosure = inputFields.some(([, field]) => field.disclosure !== undefined && field.disclosure.classification !== 'public')
  const material = contract.consequence.commitment !== 'none' || contract.consequence.spend !== 'none' || materialDisclosure
  if (material && contract.consequence.approval === 'none') throw new Error('capability_material_consequence_requires_authority')
  const allowedCommitments: Readonly<Record<CapabilityContract['operation'], readonly CapabilityContract['consequence']['commitment'][]>> = {
    query: ['none'], quote: ['none'], status: ['none'], reserve: ['hold', 'reservation'],
    book: ['booking'], purchase: ['purchase'], cancel: ['cancellation'],
  }
  if (!allowedCommitments[contract.operation].includes(contract.consequence.commitment)) throw new Error('capability_operation_commitment_mismatch')
  if (contract.providerAffinity !== undefined) {
    const affinityField = contract.input[contract.providerAffinity.inputField]
    if (affinityField?.valueType !== 'provider_offer_ref') throw new Error('capability_provider_affinity_invalid')
  }
  for (const applicability of contract.applicability ?? []) {
    const field = contract.input[applicability.field]
    const relevance = field?.decisionRelevance
      ?? (contract.operation === 'query' || contract.operation === 'quote' || contract.operation === 'status'
        ? 'option_selection'
        : 'commitment')
    if (field === undefined || relevance !== 'option_selection'
      || applicability.acceptedValues.some((value) => !literalMatches(value, field.valueType))) {
      throw new Error('capability_applicability_invalid')
    }
  }
  for (const field of Object.values(contract.output)) {
    if (field.disclosure !== undefined) throw new Error('capability_output_disclosure_invalid')
  }
}

function validateDependencyGraph(
  actions: readonly z.infer<typeof planActionSchema>[],
  byActionId: ReadonlyMap<string, z.infer<typeof planActionSchema>>,
): void {
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (actionId: string): void => {
    if (visiting.has(actionId)) throw new Error('plan_action_dependency_cycle')
    if (visited.has(actionId)) return
    const action = byActionId.get(actionId)
    if (action === undefined) throw new Error('plan_action_dependency_not_found')
    visiting.add(actionId)
    for (const dependency of action.dependsOn) visit(dependency)
    visiting.delete(actionId)
    visited.add(actionId)
  }
  for (const action of actions) visit(action.actionId)
}

function validateActionInput(
  action: z.infer<typeof planActionSchema>,
  contract: CapabilityContract,
  byActionId: ReadonlyMap<string, z.infer<typeof planActionSchema>>,
  registry: CapabilityContractRegistry,
): void {
  const suppliedFields = Object.keys(action.input)
  if (suppliedFields.some((field) => contract.input[field] === undefined)) throw new Error('plan_action_input_not_declared')
  for (const [field, definition] of Object.entries(contract.input)) {
    const value = action.input[field]
    if (definition.required && value === undefined) throw new Error('plan_action_input_required')
    if (value === undefined) continue
    if (value.kind === 'literal') {
      if (definition.valueType === 'provider_offer_ref' || !literalMatches(value.value, definition.valueType)) throw new Error('plan_action_input_type_mismatch')
      continue
    }
    if (value.kind === 'customer_fact') {
      if (decisionRelevance(contract, definition) !== 'commitment') throw new Error('plan_customer_fact_required_before_options')
      continue
    }
    if (!action.dependsOn.includes(value.actionId)) throw new Error('plan_action_output_dependency_missing')
    const sourceAction = byActionId.get(value.actionId)
    if (sourceAction === undefined) throw new Error('plan_action_output_source_not_found')
    const sourceContract = registry.get(sourceAction.capabilityContractId)
    const outputDefinition = sourceContract?.output[value.field]
    if (outputDefinition === undefined) throw new Error('plan_action_output_field_not_found')
    if (outputDefinition.valueType !== definition.valueType) throw new Error('plan_action_output_type_mismatch')
    if (contract.providerAffinity?.inputField === field && outputDefinition.evidenceRole !== 'provider_offer') {
      throw new Error('plan_provider_affinity_evidence_required')
    }
  }
}

export function decisionRelevance(
  contract: CapabilityContract,
  field: CapabilityFieldDefinition,
): 'option_selection' | 'commitment' {
  if (field.decisionRelevance !== undefined) return field.decisionRelevance
  return contract.operation === 'query' || contract.operation === 'quote' || contract.operation === 'status'
    ? 'option_selection'
    : 'commitment'
}

function resolveProviderAffinity(
  action: z.infer<typeof planActionSchema>,
  contract: CapabilityContract,
): ProposedAction['providerAffinity'] {
  const affinity = contract.providerAffinity
  if (affinity === undefined) return undefined
  const source = action.input[affinity.inputField]
  if (source?.kind !== 'action_output') throw new Error('plan_provider_affinity_source_required')
  return Object.freeze({ kind: 'offer_issuer', inputField: affinity.inputField, sourceActionId: source.actionId })
}

function literalMatches(value: string | number | boolean, valueType: CapabilityValueType): boolean {
  if (valueType === 'string') return typeof value === 'string'
  if (valueType === 'integer' || valueType === 'money_minor') return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  if (valueType === 'boolean') return typeof value === 'boolean'
  if (valueType === 'url') {
    if (typeof value !== 'string') return false
    try { return new URL(value).protocol === 'https:' } catch { return false }
  }
  return false
}

function deepFreeze(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}
