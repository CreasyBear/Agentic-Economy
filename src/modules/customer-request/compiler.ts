import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  createCustomerRequest,
  createPlanRevision,
  decisionRelevance,
  type CapabilityContract,
  type CapabilityContractRegistry,
  type CustomerRequest,
  type CustomerRequestUnderstanding,
  type PlanInputValue,
  type PlanRevision,
} from './public'

type LiteralValue = string | number | boolean
type Awaitable<Value> = Value | Promise<Value>
type UntrustedCustomerRequestInterpretation = unknown

export type CustomerRequestInterpreter = Readonly<{
  interpreterId: string
  interpret: (input: Readonly<{
    customerJob: string
    knownFacts: Readonly<Record<string, LiteralValue>>
    knownFactFields: readonly string[]
    capabilities: readonly Readonly<{
      capabilityContractId: string
      name: string
      operation: CapabilityContract['operation']
      inputs: readonly Readonly<{ field: string; customerLabel: string; required: boolean; valueType: string }>[]
      outputs: readonly Readonly<{ field: string; customerLabel: string; valueType: string }>[]
      applicability: readonly Readonly<{ field: string; acceptedValues: readonly LiteralValue[] }>[]
    }>[]
  }>) => Promise<UntrustedCustomerRequestInterpretation>
}>

export type CustomerRequestCompilationStore = Readonly<{
  lookup: (compilationKey: string, commandDigest: string) => Awaitable<
    | Readonly<{ kind: 'replayed'; request: CustomerRequest; planRevision?: PlanRevision; outcome: CompilationOutcome }>
    | Readonly<{ kind: 'command_conflict' }>
    | undefined
  >
  commit: (input: Readonly<{
    compilationKey: string
    commandDigest: string
    expectedRevision: number
    request: CustomerRequest
    planRevision?: PlanRevision
    outcome: CompilationOutcome
  }>) => Awaitable<
    | Readonly<{ kind: 'stored' }>
    | Readonly<{ kind: 'replayed'; request: CustomerRequest; planRevision?: PlanRevision; outcome: CompilationOutcome }>
    | Readonly<{ kind: 'revision_conflict' }>
    | Readonly<{ kind: 'identity_conflict' }>
    | Readonly<{ kind: 'command_conflict' }>
  >
  getRequest: (requestId: string) => Awaitable<CustomerRequest | undefined>
  getRequestRevision: (requestId: string, revision: number) => Awaitable<CustomerRequest | undefined>
}>

export type CompileCustomerRequestCommand = Readonly<{
  compilationKey: string
  requestId: string
  expectedRevision?: number
  principalId: string
  delegatedAgentId: string
  customerJob: string
  knownFacts: Readonly<Record<string, LiteralValue>>
  routing: Readonly<{
    networkId: string
    currency: string
    maximumSpendMinor: number
    optimizeFor: 'cost' | 'latency'
  }>
}>

export type CompileCustomerRequestResult =
  | Readonly<{ kind: 'plan_ready'; request: CustomerRequest; understanding: CustomerRequestUnderstanding; planRevision: PlanRevision }>
  | Readonly<{
    kind: 'needs_information'
    request: CustomerRequest
    understanding: CustomerRequestUnderstanding
    missingInformation: readonly Readonly<{
      field: string
      customerLabel: string
      reason: 'required_for_registered_capability' | 'disambiguates_registered_capabilities'
      candidateCapabilityContractIds?: readonly string[]
    }>[]
  }>
  | Readonly<{ kind: 'unsupported'; request: CustomerRequest; reason: 'no_registered_capability' | 'unsafe_proposal' }>
  | Readonly<{ kind: 'revision_conflict'; requestId: string; expectedRevision: number }>
  | Readonly<{ kind: 'identity_conflict'; requestId: string }>
  | Readonly<{ kind: 'compilation_conflict'; requestId: string }>

type MissingInformation = Readonly<{
  field: string
  customerLabel: string
  reason: 'required_for_registered_capability' | 'disambiguates_registered_capabilities'
  candidateCapabilityContractIds?: readonly string[]
}>

type CompilationOutcome =
  | Readonly<{ kind: 'plan_ready' }>
  | Readonly<{ kind: 'needs_information'; missingInformation: readonly MissingInformation[] }>
  | Readonly<{ kind: 'unsupported'; reason: 'no_registered_capability' | 'unsafe_proposal' }>
type CompilationTerminalResult =
  | Extract<CompileCustomerRequestResult, { kind: 'plan_ready' }>
  | Extract<CompileCustomerRequestResult, { kind: 'needs_information' }>
  | Extract<CompileCustomerRequestResult, { kind: 'unsupported' }>

const identifier = z.string().trim().min(1).max(200)
const literalValue = z.union([z.string().max(8_000), z.number().safe(), z.boolean()])
const requirement = z.object({
  field: identifier,
  label: z.string().trim().min(1).max(240),
  value: literalValue,
}).strict()
const proposedInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('known_fact'), fact: identifier }).strict(),
  z.object({ kind: z.literal('action_output'), actionId: identifier, field: identifier }).strict(),
])
const proposalSchema = z.object({
  outcome: z.string().trim().min(1).max(1_000),
  hardConstraints: z.array(requirement).max(64),
  preferences: z.array(requirement.extend({ priority: z.number().int().min(1).max(64) }).strict()).max(64),
  substitutions: z.object({ allowed: z.boolean(), boundaries: z.array(z.string().trim().min(1).max(500)).max(32) }).strict(),
  completionCriterion: z.string().trim().min(1).max(1_000),
  completionRequirement: z.object({
    evidenceRole: z.enum(['provider_offer', 'result_artifact', 'status', 'provider_report']),
    valueType: z.enum(['string', 'integer', 'boolean', 'url', 'money_minor', 'provider_offer_ref']),
  }).strict(),
  deadline: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  completionEvidence: z.array(z.object({ actionId: identifier, field: identifier }).strict()).min(1).max(32),
  actions: z.array(z.object({
    actionId: identifier,
    capabilityContractId: identifier,
    dependsOn: z.array(identifier).max(32),
    input: z.record(identifier, proposedInput),
  }).strict()).min(1).max(32),
}).strict()
const ambiguousProposalSchema = z.object({
  kind: z.literal('ambiguous'),
  field: identifier,
  customerLabel: z.string().trim().min(1).max(240),
  candidateCapabilityContractIds: z.array(identifier).min(2).max(16),
}).strict()
const interpretationSchema = z.union([proposalSchema, ambiguousProposalSchema])
const commandSchema = z.object({
  compilationKey: identifier,
  requestId: identifier,
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  principalId: identifier,
  delegatedAgentId: identifier,
  customerJob: z.string().trim().min(1).max(2_000),
  knownFacts: z.record(identifier, literalValue),
  routing: z.object({
    networkId: identifier,
    currency: z.string().regex(/^[A-Z]{3}$/),
    maximumSpendMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    optimizeFor: z.enum(['cost', 'latency']),
  }).strict(),
}).strict()

export async function compileCustomerRequest(
  command: CompileCustomerRequestCommand,
  dependencies: Readonly<{
    interpreter: CustomerRequestInterpreter
    registry: CapabilityContractRegistry
    store: CustomerRequestCompilationStore
    now: () => number
  }>,
): Promise<CompileCustomerRequestResult> {
  const commandResult = commandSchema.safeParse(command)
  if (!commandResult.success) throw new Error('customer_request_compilation_command_invalid')
  const validatedCommand: CompileCustomerRequestCommand = {
    compilationKey: commandResult.data.compilationKey,
    requestId: commandResult.data.requestId,
    principalId: commandResult.data.principalId,
    delegatedAgentId: commandResult.data.delegatedAgentId,
    customerJob: commandResult.data.customerJob,
    knownFacts: commandResult.data.knownFacts,
    routing: commandResult.data.routing,
    ...(commandResult.data.expectedRevision === undefined ? {} : { expectedRevision: commandResult.data.expectedRevision }),
  }
  const commandDigest = canonicalDigest(commandDigestMaterial(validatedCommand))
  const prior = await dependencies.store.lookup(validatedCommand.compilationKey, commandDigest)
  if (prior?.kind === 'command_conflict') return { kind: 'compilation_conflict', requestId: validatedCommand.requestId }
  if (prior?.kind === 'replayed') return replayedResult(prior)
  const proposedValue = await dependencies.interpreter.interpret({
    customerJob: validatedCommand.customerJob,
    knownFacts: optionSelectionFacts(validatedCommand.knownFacts, dependencies.registry),
    knownFactFields: Object.keys(validatedCommand.knownFacts).sort(),
    capabilities: dependencies.registry.list().map(toInterpreterCapability),
  })
  const parsed = interpretationSchema.safeParse(proposedValue)
  const expectedRevision = validatedCommand.expectedRevision ?? 0
  const requestRevision = expectedRevision + 1

  if (!parsed.success) {
    const request = buildRequest(validatedCommand, unsafeUnderstanding(validatedCommand.customerJob), 'unsupported', requestRevision, dependencies.now())
    return await persistResult(validatedCommand, request, undefined, { kind: 'unsupported', request, reason: 'unsafe_proposal' }, dependencies.store)
  }

  if ('kind' in parsed.data && parsed.data.kind === 'ambiguous') {
    const missingInformation = validateAmbiguousQuestion(parsed.data, validatedCommand.knownFacts, dependencies.registry)
    const request = buildRequest(
      validatedCommand, unsafeUnderstanding(validatedCommand.customerJob),
      missingInformation === undefined ? 'unsupported' : 'needs_information', requestRevision, dependencies.now(),
    )
    if (missingInformation === undefined) {
      return await persistResult(validatedCommand, request, undefined, {
        kind: 'unsupported', request, reason: 'unsafe_proposal',
      }, dependencies.store)
    }
    return await persistResult(validatedCommand, request, undefined, {
      kind: 'needs_information', request, understanding: request.understanding, missingInformation: [missingInformation],
    }, dependencies.store)
  }

  const planProposalResult = proposalSchema.safeParse(parsed.data)
  if (!planProposalResult.success) throw new Error('customer_request_interpretation_narrowing_failed')
  const proposal = planProposalResult.data
  const understanding = freezeUnderstanding(proposal)
  const hasUnknownCapability = proposal.actions.some((action) => dependencies.registry.get(action.capabilityContractId) === undefined)
  const understandingInvalid = !hasUnknownCapability
    && !understandingMatchesPlan(
      understanding, proposal.actions, proposal.completionEvidence,
      validatedCommand.knownFacts, validatedCommand.routing, dependencies.registry, dependencies.now(),
    )
  const missingInformation = hasUnknownCapability
    ? []
    : findMissingInformation(proposal.actions, validatedCommand.knownFacts, dependencies.registry)
  const compilationState = hasUnknownCapability || understandingInvalid
    ? 'unsupported'
    : missingInformation.length > 0 ? 'needs_information' : 'plan_ready'
  const request = buildRequest(validatedCommand, understanding, compilationState, requestRevision, dependencies.now())
  if (hasUnknownCapability) {
    return await persistResult(validatedCommand, request, undefined, { kind: 'unsupported', request, reason: 'no_registered_capability' }, dependencies.store)
  }
  if (understandingInvalid) {
    return await persistResult(validatedCommand, request, undefined, {
      kind: 'unsupported', request, reason: 'unsafe_proposal',
    }, dependencies.store)
  }

  if (missingInformation.length > 0) {
    return await persistResult(validatedCommand, request, undefined, {
      kind: 'needs_information', request, understanding, missingInformation,
    }, dependencies.store)
  }

  let planRevision: PlanRevision
  try {
    planRevision = createPlanRevision({
      planRevisionId: planId(request, proposal.actions),
      requestId: request.requestId,
      requestRevision: request.revision,
      proposedByAgentId: request.delegatedAgentId,
      proposalProvenance: {
        kind: 'agent_interpretation',
        interpreterId: dependencies.interpreter.interpreterId,
        proposalDigest: canonicalDigest(proposalDigestMaterial(proposal)),
      },
      completionEvidence: proposal.completionEvidence,
      createdAt: dependencies.now(),
      actions: proposal.actions.map((action) => ({
        actionId: action.actionId,
        capabilityContractId: action.capabilityContractId,
        dependsOn: action.dependsOn,
        input: resolvePlanInput(action, validatedCommand.knownFacts, dependencies.registry),
      })),
    }, dependencies.registry)
  } catch {
    return await persistResult(validatedCommand, request, undefined, { kind: 'unsupported', request, reason: 'unsafe_proposal' }, dependencies.store)
  }

  return await persistResult(validatedCommand, request, planRevision, {
    kind: 'plan_ready', request, understanding, planRevision,
  }, dependencies.store)
}

export function createInMemoryCustomerRequestCompilationStore(): CustomerRequestCompilationStore {
  const current = new Map<string, CustomerRequest>()
  const history = new Map<string, CustomerRequest>()
  const commands = new Map<string, Readonly<{
    commandDigest: string; request: CustomerRequest; planRevision?: PlanRevision; outcome: CompilationOutcome
  }>>()
  return Object.freeze({
    lookup: (compilationKey, commandDigest) => {
      const existing = commands.get(compilationKey)
      if (existing === undefined) return undefined
      if (existing.commandDigest !== commandDigest) return { kind: 'command_conflict' }
      return {
        kind: 'replayed', request: existing.request, outcome: existing.outcome,
        ...(existing.planRevision === undefined ? {} : { planRevision: existing.planRevision }),
      }
    },
    commit: (input) => {
      const replay = commands.get(input.compilationKey)
      if (replay !== undefined) {
        if (replay.commandDigest !== input.commandDigest) return { kind: 'command_conflict' }
        return {
          kind: 'replayed', request: replay.request, outcome: replay.outcome,
          ...(replay.planRevision === undefined ? {} : { planRevision: replay.planRevision }),
        }
      }
      const existing = current.get(input.request.requestId)
      if ((existing?.revision ?? 0) !== input.expectedRevision) return { kind: 'revision_conflict' }
      if (existing !== undefined && (existing.principalId !== input.request.principalId
        || existing.delegatedAgentId !== input.request.delegatedAgentId)) return { kind: 'identity_conflict' }
      current.set(input.request.requestId, input.request)
      history.set(historyKey(input.request.requestId, input.request.revision), input.request)
      commands.set(input.compilationKey, Object.freeze({
        commandDigest: input.commandDigest,
        request: input.request,
        outcome: input.outcome,
        ...(input.planRevision === undefined ? {} : { planRevision: input.planRevision }),
      }))
      return { kind: 'stored' }
    },
    getRequest: (requestId) => current.get(requestId),
    getRequestRevision: (requestId, revision) => history.get(historyKey(requestId, revision)),
  })
}

function replayedResult(replay: Readonly<{
  kind: 'replayed'; request: CustomerRequest; planRevision?: PlanRevision; outcome: CompilationOutcome
}>): Extract<CompileCustomerRequestResult, { kind: 'plan_ready' }>
  | Extract<CompileCustomerRequestResult, { kind: 'needs_information' }>
  | Extract<CompileCustomerRequestResult, { kind: 'unsupported' }> {
  if (replay.outcome.kind === 'plan_ready') {
    if (replay.planRevision === undefined) throw new Error('compiled_plan_revision_missing')
    return {
      kind: 'plan_ready', request: replay.request, understanding: replay.request.understanding,
      planRevision: replay.planRevision,
    }
  }
  if (replay.outcome.kind === 'needs_information') {
    return {
      kind: 'needs_information', request: replay.request, understanding: replay.request.understanding,
      missingInformation: replay.outcome.missingInformation,
    }
  }
  return { kind: 'unsupported', request: replay.request, reason: replay.outcome.reason }
}

async function persistResult(
  command: CompileCustomerRequestCommand,
  request: CustomerRequest,
  planRevision: PlanRevision | undefined,
  result: CompilationTerminalResult,
  store: CustomerRequestCompilationStore,
): Promise<CompileCustomerRequestResult> {
  const expectedRevision = command.expectedRevision ?? 0
  const committed = await store.commit({
    compilationKey: command.compilationKey,
    commandDigest: canonicalDigest(commandDigestMaterial(command)),
    expectedRevision,
    request,
    outcome: outcomeFor(result),
    ...(planRevision === undefined ? {} : { planRevision }),
  })
  if (committed.kind === 'revision_conflict') return { kind: 'revision_conflict', requestId: command.requestId, expectedRevision }
  if (committed.kind === 'identity_conflict') return { kind: 'identity_conflict', requestId: command.requestId }
  if (committed.kind === 'command_conflict') return { kind: 'compilation_conflict', requestId: command.requestId }
  if (committed.kind === 'replayed') return replayedResult(committed)
  return result
}

function outcomeFor(result: CompilationTerminalResult): CompilationOutcome {
  if (result.kind === 'plan_ready') return { kind: 'plan_ready' }
  if (result.kind === 'needs_information') return { kind: 'needs_information', missingInformation: result.missingInformation }
  return { kind: 'unsupported', reason: result.reason }
}

function buildRequest(
  command: CompileCustomerRequestCommand,
  understanding: CustomerRequestUnderstanding,
  compilationState: CustomerRequest['compilationState'],
  revision: number,
  now: number,
): CustomerRequest {
  const created = createCustomerRequest({
    requestId: command.requestId,
    principalId: command.principalId,
    delegatedAgentId: command.delegatedAgentId,
    intent: command.customerJob,
    compilationState,
    understanding,
    knownFacts: command.knownFacts,
    routing: command.routing,
    createdAt: now,
  })
  return revision === 1 ? created : Object.freeze({ ...created, revision })
}

function findMissingInformation(
  actions: readonly z.infer<typeof proposalSchema>['actions'][number][],
  knownFacts: Readonly<Record<string, LiteralValue>>,
  registry: CapabilityContractRegistry,
): readonly Readonly<{ field: string; customerLabel: string; reason: 'required_for_registered_capability' }>[] {
  const missing = new Map<string, Readonly<{ field: string; customerLabel: string; reason: 'required_for_registered_capability' }>>()
  for (const action of actions) {
    const contract = registry.get(action.capabilityContractId)
    if (contract === undefined) continue
    for (const [field, definition] of Object.entries(contract.input)) {
      const proposed = action.input[field]
      if (!definition.required || decisionRelevance(contract, definition) !== 'option_selection') continue
      if (proposed?.kind === 'action_output') continue
      if (proposed?.kind === 'known_fact' && knownFacts[proposed.fact] !== undefined) continue
      missing.set(field, { field, customerLabel: definition.customerLabel, reason: 'required_for_registered_capability' })
    }
  }
  return Object.freeze([...missing.values()].sort((left, right) => left.field.localeCompare(right.field)))
}

function validateAmbiguousQuestion(
  proposal: z.infer<typeof ambiguousProposalSchema>,
  knownFacts: Readonly<Record<string, LiteralValue>>,
  registry: CapabilityContractRegistry,
): MissingInformation | undefined {
  if (knownFacts[proposal.field] !== undefined) return undefined
  const candidateIds = [...new Set(proposal.candidateCapabilityContractIds)].sort()
  if (candidateIds.length < 2) return undefined
  const candidates: CapabilityContract[] = []
  for (const capabilityContractId of candidateIds) {
    const candidate = registry.get(capabilityContractId)
    if (candidate === undefined) return undefined
    candidates.push(candidate)
  }
  if (new Set(candidates.map((candidate) => candidate.operation)).size !== 1) return undefined
  const applicability = candidates.map((candidate) => candidate.applicability?.find((rule) => rule.field === proposal.field))
  if (applicability.some((rule) => rule === undefined)) return undefined
  const fieldTypes = new Set(candidates.map((candidate) => candidate.input[proposal.field]?.valueType))
  if (fieldTypes.size !== 1 || fieldTypes.has(undefined)) return undefined
  const acceptedValueSets = applicability.map((rule) => new Set((rule?.acceptedValues ?? []).map((value) => canonicalDigest({ value }))))
  for (let left = 0; left < acceptedValueSets.length; left += 1) {
    for (let right = left + 1; right < acceptedValueSets.length; right += 1) {
      const leftValues = acceptedValueSets[left]
      const rightValues = acceptedValueSets[right]
      if (leftValues === undefined || rightValues === undefined) return undefined
      if ([...leftValues].some((value) => rightValues.has(value))) return undefined
    }
  }
  const distinctPartitions = new Set(applicability.map((rule) => canonicalDigest({ acceptedValues: rule?.acceptedValues ?? [] })))
  const changesCandidateSet = distinctPartitions.size > 1
  if (!changesCandidateSet) return undefined
  return {
    field: proposal.field,
    customerLabel: proposal.customerLabel,
    reason: 'disambiguates_registered_capabilities',
    candidateCapabilityContractIds: candidateIds,
  }
}

function understandingMatchesPlan(
  understanding: CustomerRequestUnderstanding,
  actions: readonly z.infer<typeof proposalSchema>['actions'][number][],
  completionEvidence: readonly z.infer<typeof proposalSchema>['completionEvidence'][number][],
  knownFacts: Readonly<Record<string, LiteralValue>>,
  routing: CompileCustomerRequestCommand['routing'],
  registry: CapabilityContractRegistry,
  now: number,
): boolean {
  if (understanding.deadline !== undefined && understanding.deadline <= now) return false
  const completionMatches = completionEvidence.some((evidence) => {
    const action = actions.find((candidate) => candidate.actionId === evidence.actionId)
    const contract = action === undefined ? undefined : registry.get(action.capabilityContractId)
    const output = contract?.output[evidence.field]
    return output?.evidenceRole === understanding.completionRequirement.evidenceRole
      && output.valueType === understanding.completionRequirement.valueType
  })
  if (!completionMatches) return false
  const constraintIsBound = (requirement: CustomerRequestUnderstanding['hardConstraints'][number]): boolean => actions.some((action) => {
    const contract = registry.get(action.capabilityContractId)
    if (contract === undefined) return false
    const proposedInputValue = action.input[requirement.field]
    if (proposedInputValue?.kind === 'known_fact') return knownFacts[proposedInputValue.fact] === requirement.value
    return false
  })
  if (understanding.deadline !== undefined) {
    const deadlineBound = actions.some((action) => Object.entries(action.input).some(([field, input]) => {
      if (field !== 'deadline' && field !== 'deliveryDeadline' && field !== 'expectedBy') return false
      return input.kind === 'known_fact' && knownFacts[input.fact] === understanding.deadline
    }))
    if (!deadlineBound) return false
  }
  if (understanding.hardConstraints.some((constraint) => !constraintIsBound(constraint))) return false
  const hardConstraintFields = understanding.hardConstraints.map((constraint) => constraint.field)
  if (new Set(hardConstraintFields).size !== hardConstraintFields.length) return false
  const preferenceFields = understanding.preferences.map((preference) => preference.field)
  const preferencePriorities = understanding.preferences.map((preference) => preference.priority)
  const preferenceIsSupported = (preference: CustomerRequestUnderstanding['preferences'][number]): boolean => {
    if (preference.field === 'price') return routing.optimizeFor === 'cost' && preference.value === 'lowest_total_price'
    if (preference.field === 'latency') return routing.optimizeFor === 'latency' && preference.value === 'lowest_latency'
    return constraintIsBound(preference)
  }
  const selectedFields = new Set(actions.flatMap((action) => {
    const contract = registry.get(action.capabilityContractId)
    return contract === undefined ? [] : [...Object.keys(contract.input), ...Object.keys(contract.output)]
  }))
  const substitutionsValid = understanding.substitutions.allowed
    ? understanding.substitutions.boundaries.length > 0
      && understanding.substitutions.boundaries.every((field) => selectedFields.has(field))
    : understanding.substitutions.boundaries.length === 0
  return new Set(preferenceFields).size === preferenceFields.length
    && new Set(preferencePriorities).size === preferencePriorities.length
    && preferenceFields.every((field) => !hardConstraintFields.includes(field))
    && understanding.preferences.every(preferenceIsSupported)
    && substitutionsValid
}

function optionSelectionFacts(
  knownFacts: Readonly<Record<string, LiteralValue>>,
  registry: CapabilityContractRegistry,
): Readonly<Record<string, LiteralValue>> {
  const allowed = new Set<string>()
  for (const contract of registry.list()) {
    for (const [field, definition] of Object.entries(contract.input)) {
      const classification = definition.disclosure?.classification
      if (decisionRelevance(contract, definition) === 'option_selection'
        && classification !== 'sensitive' && classification !== 'credential') allowed.add(field)
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(knownFacts).filter(([field]) => allowed.has(field))))
}

function toInterpreterCapability(contract: CapabilityContract) {
  return Object.freeze({
    capabilityContractId: contract.capabilityContractId,
    name: contract.name,
    operation: contract.operation,
    inputs: Object.entries(contract.input).map(([field, definition]) => ({
      field, customerLabel: definition.customerLabel, required: definition.required, valueType: definition.valueType,
    })),
    outputs: Object.entries(contract.output).map(([field, definition]) => ({
      field, customerLabel: definition.customerLabel, valueType: definition.valueType,
    })),
    applicability: (contract.applicability ?? []).map((rule) => ({
      field: rule.field, acceptedValues: [...rule.acceptedValues],
    })),
  })
}

function freezeUnderstanding(proposal: z.infer<typeof proposalSchema>): CustomerRequestUnderstanding {
  return Object.freeze({
    outcome: proposal.outcome,
    hardConstraints: Object.freeze(proposal.hardConstraints.map((requirementValue) => Object.freeze({ ...requirementValue }))),
    preferences: Object.freeze(proposal.preferences.map((preference) => Object.freeze({ ...preference }))),
    substitutions: Object.freeze({ allowed: proposal.substitutions.allowed, boundaries: Object.freeze([...proposal.substitutions.boundaries]) }),
    completionCriterion: proposal.completionCriterion,
    completionRequirement: proposal.completionRequirement,
    ...(proposal.deadline === undefined ? {} : { deadline: proposal.deadline }),
  })
}

function unsafeUnderstanding(customerJob: string): CustomerRequestUnderstanding {
  return Object.freeze({
    outcome: customerJob,
    hardConstraints: [],
    preferences: [],
    substitutions: Object.freeze({ allowed: false, boundaries: [] }),
    completionCriterion: customerJob,
    completionRequirement: { evidenceRole: 'status' as const, valueType: 'string' as const },
  })
}

function requiredKnownFact(knownFacts: Readonly<Record<string, LiteralValue>>, fact: string): LiteralValue {
  const value = knownFacts[fact]
  if (value === undefined) throw new Error('known_fact_missing')
  return value
}

function resolvePlanInput(
  action: z.infer<typeof proposalSchema>['actions'][number],
  knownFacts: Readonly<Record<string, LiteralValue>>,
  registry: CapabilityContractRegistry,
): Readonly<Record<string, PlanInputValue>> {
  const contract = registry.get(action.capabilityContractId)
  if (contract === undefined) throw new Error('plan_capability_contract_not_found')
  const resolved = Object.fromEntries(Object.entries(action.input).flatMap(([field, input]): [string, PlanInputValue][] => {
    if (input.kind === 'action_output') return [[field, { kind: 'action_output', actionId: input.actionId, field: input.field }]]
    const value = knownFacts[input.fact]
    if (value !== undefined) return [[field, { kind: 'literal', value }]]
    const definition = contract.input[field]
    if (definition !== undefined && decisionRelevance(contract, definition) === 'commitment') {
      return [[field, { kind: 'customer_fact', fact: input.fact }]]
    }
    return []
  }))
  for (const [field, definition] of Object.entries(contract.input)) {
    if (resolved[field] === undefined && definition.required && decisionRelevance(contract, definition) === 'commitment') {
      resolved[field] = { kind: 'customer_fact', fact: field }
    }
  }
  return resolved
}

function planId(request: CustomerRequest, actions: z.infer<typeof proposalSchema>['actions']): string {
  return `plan:${canonicalDigest({ requestId: request.requestId, requestRevision: request.revision, actions })}`
}

function historyKey(requestId: string, revision: number): string {
  return `${requestId}:${revision}`
}

function proposalDigestMaterial(proposal: z.infer<typeof proposalSchema>) {
  return {
    outcome: proposal.outcome,
    hardConstraints: proposal.hardConstraints,
    preferences: proposal.preferences,
    substitutions: proposal.substitutions,
    completionCriterion: proposal.completionCriterion,
    completionRequirement: proposal.completionRequirement,
    actions: proposal.actions,
    completionEvidence: proposal.completionEvidence,
    ...(proposal.deadline === undefined ? {} : { deadline: proposal.deadline }),
  }
}

function commandDigestMaterial(command: CompileCustomerRequestCommand) {
  return {
    compilationKey: command.compilationKey,
    requestId: command.requestId,
    principalId: command.principalId,
    delegatedAgentId: command.delegatedAgentId,
    customerJob: command.customerJob,
    knownFacts: command.knownFacts,
    routing: command.routing,
    ...(command.expectedRevision === undefined ? {} : { expectedRevision: command.expectedRevision }),
  }
}
