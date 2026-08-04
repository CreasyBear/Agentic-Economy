import {
  isPublicOperationRef,
  isRegisteredOperationMappingRef,
  validateAdmittedOperationRef,
  type AdmittedOperationRef,
  type PublicOperationRef,
  type RegisteredInputMappingRef,
} from '@/modules/capability-supply/public'
import {
  openCapabilityDecisionModel,
  rehydrateCapabilityInputKey,
  rehydrateCapabilitySelectionKey,
  rehydratePointedSchemaIdentity,
  sameCapabilityContractRef,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type {
  ActionPreparationApprovalEvidence,
  ActionPreparationAuthorityReservation,
  ActionPreparationDisclosureReview,
  ActionPreparationLineage,
  DurableActionPreparation,
} from '@/modules/customer-request/action-preparation'
import { requestRegistrySnapshotDigest } from '@/modules/customer-request/evaluation'
import {
  aggregateIntegrityValid,
  type CustomerRequestV2PreparationPorts,
  type PreparationCommandRow,
  preparationIntegrityValid,
} from '@/modules/customer-request/v2-preparation'
import {
  customerRequestV2AggregateValue,
  durableActionPreparationV2Value,
} from '@/modules/customer-request/runtime'
import type { Infer } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { listRouteableCapabilitySupply } from './capabilitySupply'
import { registeredEvaluationBindingsFromRouteableSupply } from './customerRequestEvaluationBindings'

type Aggregate = Infer<typeof customerRequestV2AggregateValue>
type StoredFact = Aggregate['snapshot']['facts'][number]
type StoredPreparation = Infer<typeof durableActionPreparationV2Value>
type StoredLineage = StoredPreparation['lineage']
type StoredReview = StoredPreparation['disclosureReview']
type StoredReservation = NonNullable<
  Extract<StoredPreparation, { kind: 'ready_for_routing' }>['authorityReservation']
>
type StoredMissingTarget = Extract<
  NonNullable<Aggregate['evaluation']['nextRequirement']>,
  { kind: 'contract_fact' }
>['targets'][number]
type StoredMissingInput = Extract<
  Aggregate['evaluation']['candidates'][number]['viability'],
  { kind: 'blocked_on_information' }
>['inputs'][number]
type StoredCompletionRequirement = Aggregate['evaluation']['completionRequirements'][number]
type StoredInputMapping = Aggregate['plan']['actions'][number]['inputMappings'][number]
type StoredNextRequirement = NonNullable<Aggregate['evaluation']['nextRequirement']>
type StoredPreparationDisclosure = NonNullable<Aggregate['evaluation']['preparationDisclosure']>
type StoredDisclosureCategory = StoredPreparationDisclosure['categories'][number]
type DbCtx = MutationCtx | QueryCtx
type MutationDb = MutationCtx['db']

export function customerRequestV2PreparationPorts(
  ctx: DbCtx,
): CustomerRequestV2PreparationPorts {
  const db = ctx.db
  const mutationDb = db as MutationDb

  return {
    loadPreparationCommand: async (commandKey) => {
      const prior = await db.query('customerRequestV2PreparationCommands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      return prior === null ? null : toPreparationCommandRow(prior)
    },

    verifyPreparationCommandReplay: async (command) => {
      if (command.result.preparationDigest !== command.preparationDigest
        || command.result.preparationRef !== command.preparationRef
        || canonicalDigest(command.lineage)
          !== canonicalDigest(command.result.lineage)
        || !preparationIntegrityValid(command.result)) {
        throw new Error('customer_request_v2_preparation_replay_integrity_failure')
      }
      return structuredClone(command.result)
    },

    loadCurrentAggregate: async (requestId) => {
      const head = await db.query('customerRequestV2Heads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      if (head === null) return { kind: 'not_found' as const }
      const revision = await db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => query
          .eq('requestId', requestId).eq('requestRevision', head.currentRevision)).unique()
      if (revision === null
        || revision.aggregate.aggregateDigest !== head.currentAggregateDigest
        || !aggregateIntegrityValid(domainAggregate(revision.aggregate))) {
        throw new Error('customer_request_v2_preparation_aggregate_integrity_failure')
      }
      return { kind: 'current' as const, aggregate: domainAggregate(revision.aggregate) }
    },

    loadActionCapabilityModel: async (aggregate, action) => (
      await loadCurrentActionModel(db, aggregate, action)
    ),

    loadActionPreparation: async (input) => {
      const row = await db.query('customerRequestV2ActionPreparations')
        .withIndex('by_requestId_and_requestRevision_and_actionId', (query) => query
          .eq('requestId', input.requestId)
          .eq('requestRevision', input.requestRevision)
          .eq('actionId', input.actionId))
        .unique()
      if (row === null) return null
      return {
        preparationId: String(row._id),
        preparationRef: row.preparationRef,
        preparationDigest: row.preparationDigest,
        requestId: row.requestId,
        requestRevision: row.requestRevision,
        actionId: row.actionId,
        lineage: structuredClone(row.lineage) as ActionPreparationLineage,
        preparation: asDomainPreparation(row.preparation),
        recordedAt: row.recordedAt,
        updatedAt: row.updatedAt,
      }
    },

    loadDisclosureReview: async (reviewRef) => {
      const review = await db.query('customerRequestV2PreparationDisclosureReviews')
        .withIndex('by_reviewRef', (query) => query.eq('reviewRef', reviewRef)).unique()
      if (review === null) return null
      return {
        reviewRef: review.reviewRef,
        reviewDigest: review.reviewDigest,
        lineage: structuredClone(review.lineage) as ActionPreparationLineage,
        review: structuredClone(review.review) as ActionPreparationDisclosureReview,
        recordedAt: review.recordedAt,
      }
    },

    insertDisclosureReview: async (input) => {
      await mutationDb.insert('customerRequestV2PreparationDisclosureReviews', {
        reviewRef: input.reviewRef,
        reviewDigest: input.reviewDigest,
        lineage: asStoredLineage(input.lineage),
        review: asStoredReview(input.review),
        recordedAt: input.recordedAt,
      })
    },

    loadApprovalEvidence: async (approvalRef) => {
      const prior = await db.query('customerRequestV2PreparationApprovalEvidence')
        .withIndex('by_approvalRef', (query) => query.eq('approvalRef', approvalRef)).unique()
      if (prior === null) return null
      return {
        approvalRef: prior.approvalRef,
        approvalDigest: prior.approvalDigest,
        preparationRef: prior.preparationRef,
        reviewRef: prior.reviewRef,
        reviewDigest: prior.reviewDigest,
        authorityScopeDigest: prior.authorityScopeDigest,
        principalId: prior.principalId,
        ownerId: prior.ownerId,
        credentialId: prior.credentialId,
        lineage: structuredClone(prior.lineage) as ActionPreparationLineage,
        commandDigest: prior.commandDigest,
        approval: structuredClone(prior.approval) as ActionPreparationApprovalEvidence,
        recordedAt: prior.recordedAt,
      }
    },

    insertApprovalEvidence: async (input) => {
      const { approval } = input
      await mutationDb.insert('customerRequestV2PreparationApprovalEvidence', {
        approvalRef: approval.approvalRef,
        approvalDigest: approval.approvalDigest,
        preparationRef: approval.preparationRef,
        reviewRef: approval.reviewRef,
        reviewDigest: approval.reviewDigest,
        authorityScopeDigest: approval.authorityScopeDigest,
        principalId: approval.principalId,
        ownerId: approval.ownerId,
        credentialId: approval.credentialId,
        lineage: asStoredLineage(approval.lineage),
        commandDigest: approval.commandDigest,
        approval: structuredClone(approval),
        recordedAt: input.recordedAt,
      })
    },

    loadAuthorityReservation: async (reservationRef) => {
      const prior = await db.query('customerRequestV2PreparationAuthorityReservations')
        .withIndex('by_reservationRef', (query) => query.eq('reservationRef', reservationRef)).unique()
      if (prior === null) return null
      return {
        reservationRef: prior.reservationRef,
        reservationDigest: prior.reservationDigest,
        authorityReference: prior.authorityReference,
        lineage: structuredClone(prior.lineage) as ActionPreparationLineage,
        reservation: structuredClone(prior.reservation) as ActionPreparationAuthorityReservation,
        recordedAt: prior.recordedAt,
      }
    },

    insertAuthorityReservation: async (input) => {
      const { reservation } = input
      await mutationDb.insert('customerRequestV2PreparationAuthorityReservations', {
        reservationRef: reservation.reservationRef,
        reservationDigest: reservation.reservationDigest,
        authorityReference: reservation.authorityReference,
        lineage: asStoredLineage(reservation.lineage),
        reservation: asStoredReservation(reservation),
        recordedAt: input.recordedAt,
      })
    },

    insertActionPreparation: async (input) => {
      const { preparation } = input
      await mutationDb.insert('customerRequestV2ActionPreparations', {
        preparationRef: preparation.preparationRef,
        preparationDigest: preparation.preparationDigest,
        requestId: preparation.lineage.requestId,
        requestRevision: preparation.lineage.requestRevision,
        actionId: preparation.lineage.actionId,
        lineage: asStoredLineage(preparation.lineage),
        preparation: asStoredPreparation(preparation),
        recordedAt: input.recordedAt,
        updatedAt: input.updatedAt,
      })
    },

    patchActionPreparation: async (input) => {
      await mutationDb.patch(input.preparationId as Id<'customerRequestV2ActionPreparations'>, {
        preparationDigest: input.preparation.preparationDigest,
        preparation: asStoredPreparation(input.preparation),
        updatedAt: input.updatedAt,
      })
    },

    insertPreparationCommand: async (input) => {
      await mutationDb.insert('customerRequestV2PreparationCommands', {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        principalId: input.principalId,
        ...(input.authorityReference === undefined
          ? {}
          : { authorityReference: input.authorityReference }),
        lineage: asStoredLineage(input.preparation.lineage),
        preparationRef: input.preparation.preparationRef,
        preparationDigest: input.preparation.preparationDigest,
        result: asStoredPreparation(input.preparation),
        committedAt: input.committedAt,
      })
    },

    loadRequestHead: async (requestId) => {
      const head = await db.query('customerRequestV2Heads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      if (head === null) return null
      return {
        requestId: head.requestId,
        principalId: head.principalId,
        currentRevision: head.currentRevision,
        currentAggregateDigest: head.currentAggregateDigest,
      }
    },

    loadVerifiedRevision: async (input) => {
      const revision = await db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => query
          .eq('requestId', input.requestId)
          .eq('requestRevision', input.requestRevision)).unique()
      if (revision === null
        || revision.aggregate.aggregateDigest !== input.expectedAggregateDigest
        || !aggregateIntegrityValid(domainAggregate(revision.aggregate))) {
        throw new Error('customer_request_v2_preparation_resume_aggregate_integrity_failure')
      }
      return { kind: 'current' as const, aggregate: domainAggregate(revision.aggregate) }
    },
  }
}

async function loadCurrentActionModel(
  db: QueryCtx['db'],
  aggregate: CustomerRequestV2Aggregate,
  action: CustomerRequestV2Aggregate['plan']['actions'][number],
): Promise<CapabilityDecisionModel | undefined> {
  const supply = await listRouteableCapabilitySupply(db, {
    networkId: aggregate.snapshot.networkId,
    limit: 64,
  })
  if (supply.kind !== 'available') return undefined
  const bindings = registeredEvaluationBindingsFromRouteableSupply(supply)
  if (requestRegistrySnapshotDigest(bindings) !== aggregate.evaluation.registrySnapshotDigest
    || !bindings.some((binding) => sameCapabilityContractRef(binding.contractRef, action.contractRef))) {
    return undefined
  }
  const stored = await getActiveExactCapabilityContract(db, action.contractRef)
  if (stored.kind !== 'found') return undefined
  try {
    const model = openCapabilityDecisionModel(
      encodeCapabilityContractDocumentJson(stored.documentJson).contract,
    )
    return sameCapabilityContractRef(model.contractRef, action.contractRef)
      && model.selectionKey === action.selectionKey
      && model.semanticDigest === action.semanticDigest
      ? model
      : undefined
  } catch {
    return undefined
  }
}

function toPreparationCommandRow(
  prior: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    lineage: StoredLineage
    preparationRef: string
    preparationDigest: string
    result: StoredPreparation
    authorityReference?: string
    committedAt: number
  }>,
): PreparationCommandRow {
  return {
    commandKey: prior.commandKey,
    commandDigest: prior.commandDigest,
    principalId: prior.principalId,
    lineage: structuredClone(prior.lineage) as ActionPreparationLineage,
    preparationRef: prior.preparationRef,
    preparationDigest: prior.preparationDigest,
    result: asDomainPreparation(prior.result),
    ...(prior.authorityReference === undefined
      ? {}
      : { authorityReference: prior.authorityReference }),
    committedAt: prior.committedAt,
  }
}

function asDomainFact(value: StoredFact) {
  return {
    ...value,
    selectionKey: rehydrateCapabilitySelectionKey(value.selectionKey),
    inputKey: rehydrateCapabilityInputKey(value.inputKey),
    schemaIdentity: rehydratePointedSchemaIdentity(value.schemaIdentity),
  }
}

function asDomainCandidateCancellation(
  value: Aggregate['evaluation']['candidates'][number]['cancellation'],
) {
  if (value === undefined) {
    throw new Error('customer_request_v2_preparation_candidate_cancellation_incompatible_revision')
  }
  return {
    ...value,
    evidenceRefs: [...value.evidenceRefs],
  }
}

function asDomainMissingTarget(value: StoredMissingTarget) {
  return {
    ...value,
    selectionKey: rehydrateCapabilitySelectionKey(value.selectionKey),
    inputKey: rehydrateCapabilityInputKey(value.inputKey),
    schemaIdentity: rehydratePointedSchemaIdentity(value.schemaIdentity),
  }
}

function asDomainMissingInput(value: StoredMissingInput) {
  return {
    ...value,
    selectionKey: rehydrateCapabilitySelectionKey(value.selectionKey),
    inputKey: rehydrateCapabilityInputKey(value.inputKey),
    schemaIdentity: rehydratePointedSchemaIdentity(value.schemaIdentity),
  }
}

function asDomainCompletionRequirement(value: StoredCompletionRequirement) {
  return {
    ...value,
    schemaIdentity: rehydratePointedSchemaIdentity(value.schemaIdentity),
  }
}

function asDomainOperationRef(value: string): PublicOperationRef {
  if (!isPublicOperationRef(value)) {
    throw new Error('customer_request_v2_preparation_operation_ref_invalid')
  }
  return value
}

function asDomainAdmittedOperation(value: unknown): AdmittedOperationRef {
  if (!validateAdmittedOperationRef(value)) {
    throw new Error('customer_request_v2_preparation_admitted_operation_invalid')
  }
  return value
}

function asDomainMappingRef(value: string): RegisteredInputMappingRef {
  if (!isRegisteredOperationMappingRef(value)) {
    throw new Error('customer_request_v2_preparation_mapping_ref_invalid')
  }
  return value
}

function asDomainInputMapping(value: StoredInputMapping) {
  if (value.mappingRef === undefined || value.kind === undefined) {
    throw new Error('customer_request_v2_preparation_mapping_lineage_missing')
  }
  return {
    ...value,
    kind: value.kind,
    mappingRef: asDomainMappingRef(value.mappingRef),
    target: {
      ...value.target,
      inputKey: rehydrateCapabilityInputKey(value.target.inputKey),
    },
    schemaIdentity: rehydratePointedSchemaIdentity(value.schemaIdentity),
  }
}

function asDomainCandidate(value: Aggregate['evaluation']['candidates'][number]) {
  if (value.operationRef === undefined || value.admittedOperation === undefined) {
    throw new Error('customer_request_v2_preparation_candidate_admission_missing')
  }
  return {
    ...value,
    operationRef: asDomainOperationRef(value.operationRef),
    admittedOperation: asDomainAdmittedOperation(value.admittedOperation),
    selectionKey: rehydrateCapabilitySelectionKey(value.selectionKey),
    cancellation: asDomainCandidateCancellation(value.cancellation),
    viability: value.viability.kind === 'blocked_on_information'
      ? {
          ...value.viability,
          inputs: value.viability.inputs.map(asDomainMissingInput),
        }
      : value.viability,
  }
}

function asDomainAction(value: Aggregate['plan']['actions'][number]) {
  if (value.operationRef === undefined || value.mappingRefs === undefined) {
    throw new Error('customer_request_v2_preparation_action_lineage_missing')
  }
  return {
    ...value,
    operationRef: asDomainOperationRef(value.operationRef),
    selectionKey: rehydrateCapabilitySelectionKey(value.selectionKey),
    inputs: value.inputs.map(asDomainFact),
    inputMappings: value.inputMappings.map(asDomainInputMapping),
    mappingRefs: value.mappingRefs.map(asDomainMappingRef),
  }
}

function asDomainNextRequirement(value: StoredNextRequirement) {
  return value.kind === 'contract_fact'
    ? { ...value, targets: value.targets.map(asDomainMissingTarget) }
    : value
}

function asDomainDisclosureCategory(value: StoredDisclosureCategory) {
  return {
    ...value,
    inputKey: rehydrateCapabilityInputKey(value.inputKey),
  }
}

function asDomainPreparationDisclosure(value: StoredPreparationDisclosure) {
  return {
    ...value,
    categories: value.categories.map(asDomainDisclosureCategory),
  }
}

function domainAggregate(aggregate: Aggregate): CustomerRequestV2Aggregate {
  const stored = structuredClone(aggregate)
  const {
    decisionPreference,
    preparationDisclosure,
    nextRequirement,
    ...storedEvaluation
  } = stored.evaluation
  return {
    ...stored,
    snapshot: {
      ...stored.snapshot,
      facts: stored.snapshot.facts.map(asDomainFact),
    },
    evaluation: {
      ...storedEvaluation,
      facts: stored.evaluation.facts.map(asDomainFact),
      criteria: stored.evaluation.criteria.map((criterion) => ({
        ...criterion,
        inputKey: rehydrateCapabilityInputKey(criterion.inputKey),
      })),
      candidates: stored.evaluation.candidates.map(asDomainCandidate),
      completionRequirements: stored.evaluation.completionRequirements.map(asDomainCompletionRequirement),
      ...(decisionPreference === undefined ? {} : { decisionPreference: { ...decisionPreference } }),
      ...(preparationDisclosure === undefined
        ? {}
        : { preparationDisclosure: asDomainPreparationDisclosure(preparationDisclosure) }),
      ...(nextRequirement === undefined
        ? {}
        : { nextRequirement: asDomainNextRequirement(nextRequirement) }),
    },
    plan: {
      ...stored.plan,
      actions: stored.plan.actions.map(asDomainAction),
      completionRequirements: stored.plan.completionRequirements.map(asDomainCompletionRequirement),
    },
  }
}

function asDomainPreparation(value: StoredPreparation): DurableActionPreparation {
  return structuredClone(value) as DurableActionPreparation
}

function asStoredPreparation(value: DurableActionPreparation): StoredPreparation {
  const base = {
    preparationRef: value.preparationRef,
    preparationDigest: value.preparationDigest,
    lineage: asStoredLineage(value.lineage),
    ...(value.projectedInputDigest === undefined ? {} : { projectedInputDigest: value.projectedInputDigest }),
    authorityScope: {
      declarations: value.authorityScope.declarations.map((declaration) => ({
        ...declaration,
        recipient: { ...declaration.recipient },
        purposes: [...declaration.purposes],
        effect: { ...declaration.effect },
        inputs: declaration.inputs.map((item) => ({ ...item })),
      })),
      limits: { ...value.authorityScope.limits },
      authorityScopeDigest: value.authorityScope.authorityScopeDigest,
    },
    disclosureReview: asStoredReview(value.disclosureReview),
    preparedAt: value.preparedAt,
  }
  if (value.kind === 'needs_information') {
    return {
      ...base,
      kind: value.kind,
      missing: value.missing.map((item) => ({ ...item })),
    }
  }
  if (value.kind === 'needs_authority') return { ...base, kind: value.kind }
  return {
    ...base,
    kind: value.kind,
    ...(value.authorityReservation === undefined
      ? {}
      : { authorityReservation: asStoredReservation(value.authorityReservation) }),
  }
}

function asStoredLineage(value: ActionPreparationLineage): StoredLineage {
  return { ...value, contractRef: { ...value.contractRef } }
}

function asStoredReview(value: ActionPreparationDisclosureReview): StoredReview {
  return {
    ...value,
    lineage: asStoredLineage(value.lineage),
    categories: value.categories.map((category) => ({ ...category })),
    purposes: [...value.purposes],
    recipients: value.recipients.map((recipient) => ({ ...recipient })),
    effectRequirements: value.effectRequirements.map((effect) => ({ ...effect })),
    limits: { ...value.limits },
  }
}

function asStoredReservation(
  value: ActionPreparationAuthorityReservation,
): StoredReservation {
  return {
    ...value,
    lineage: asStoredLineage(value.lineage),
    verification: { ...value.verification },
  }
}
