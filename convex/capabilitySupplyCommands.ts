import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { Infer } from 'convex/values'
import {
  isRegisteredOperationMappingRef,
  resolveRegisteredOperationMappingRef,
  registerCapabilityTransportBinding as registerCapabilityTransportBindingWrite,
  registerCapabilityOffering as registerCapabilityOfferingWrite,
  setCapabilitySupplyEligibility as setCapabilitySupplyEligibilityWrite,
  registerCapabilityBindingCommand as runRegisterBindingCommand,
  registerCapabilityOfferingCommand as runRegisterOfferingCommand,
  quarantineCapabilityBindingCommand as runQuarantineCommand,
  setCapabilitySupplyEligibilityCommand as runSetEligibilityCommand,
  boundedTrimmed,
  validEvidenceRefs,
  type EligibilityInput,
  type OperationLedgerPorts,
  type RegisteredOperationMapping,
  type RegistrationContext,
  type SupplyCommandActor,
} from '@/modules/capability-supply/public'

import { registeredOperationMappingValue } from './capabilitySupplyValues'
import { toRegisteredOperationMapping } from './capabilitySupplyRowMappers'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { capabilitySupplyOperationPorts } from './capabilitySupplyOperationPorts'
import { capabilitySupplyWriterPorts } from './capabilitySupplyWriterPorts'
import type { MutationCtx } from './_generated/server'
import { publicationAuthorityModeValue } from './capabilitySupplyShared'

type RegisteredOperationMappingInput = Infer<
  typeof registeredOperationMappingValue
>

type MappingCommandInput = Readonly<{
  networkId: string
  mapping: RegisteredOperationMappingInput
  authorityMode: Infer<typeof publicationAuthorityModeValue>
  registrationEvidenceRefs: readonly string[]
  actorKind: 'owner' | 'admin' | 'system'
  publisherRef: string
}>

async function validateMappingContracts(
  db: MutationCtx['db'],
  mapping: RegisteredOperationMappingInput,
): Promise<
  | Readonly<{ kind: 'ok' }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'contract_not_found'
        | 'contract_not_active'
        | 'contract_integrity_failure'
    }>
> {
  const [source, target] = await Promise.all([
    getActiveExactCapabilityContract(db, mapping.sourceContractRef),
    getActiveExactCapabilityContract(db, mapping.targetContractRef),
  ])
  const failure = [source, target].find(
    (result) => result.kind === 'unavailable',
  )
  if (failure?.kind === 'unavailable') {
    return {
      kind: 'refused',
      reason:
        failure.reason === 'not_found'
          ? 'contract_not_found'
          : failure.reason === 'not_active'
            ? 'contract_not_active'
            : 'contract_integrity_failure',
    }
  }
  return { kind: 'ok' }
}

async function registerMappingCommand(
  db: MutationCtx['db'],
  input: MappingCommandInput,
) {
  let mapping: RegisteredOperationMapping
  try {
    if (!isRegisteredOperationMappingRef(input.mapping.mappingRef)) {
      return { kind: 'refused' as const, reason: 'mapping_invalid' as const }
    }
    mapping = { ...input.mapping, mappingRef: input.mapping.mappingRef }
    if (resolveRegisteredOperationMappingRef(mapping) !== mapping.mappingRef) {
      return { kind: 'refused' as const, reason: 'mapping_invalid' as const }
    }
  } catch {
    return { kind: 'refused' as const, reason: 'mapping_invalid' as const }
  }
  const mappingRef = mapping.mappingRef
  const contracts = await validateMappingContracts(db, mapping)
  if (contracts.kind === 'refused') return contracts
  const existingMapping = await db
    .query('registeredOperationMappings')
    .withIndex('by_networkId_and_mappingRef', (query) =>
      query.eq('networkId', input.networkId).eq('mappingRef', mappingRef),
    )
    .unique()
  if (
    existingMapping !== null &&
    toRegisteredOperationMapping(existingMapping) === null
  ) {
    return {
      kind: 'refused' as const,
      reason: 'mapping_integrity_failure' as const,
    }
  }
  const requestHash = canonicalDigest({
    networkId: input.networkId,
    mapping,
    authorityMode: input.authorityMode,
  })
  const existingOperation = await db
    .query('operationKeys')
    .withIndex('by_actor_operation_key', (query) =>
      query
        .eq('actorRef', input.publisherRef)
        .eq('operationName', 'registerMapping')
        .eq('key', mappingRef),
    )
    .unique()
  if (existingOperation !== null) {
    if (
      existingOperation.requestHash !== requestHash ||
      existingOperation.status !== 'succeeded'
    ) {
      return {
        kind: 'refused' as const,
        reason: 'operation_key_conflict' as const,
      }
    }
    return { kind: 'registered' as const, mappingRef }
  }
  const now = Date.now()
  const operationId = await db.insert('operationKeys', {
    scope: 'capability_supply',
    actorKind: input.actorKind,
    actorRef: input.publisherRef,
    operationName: 'registerMapping',
    key: mappingRef,
    requestHash,
    status: 'in_progress',
    effectRefs: [],
    createdAt: now,
    updatedAt: now,
  })
  if (existingMapping === null) {
    const { mappingRef: storedMappingRef, ...material } = mapping
    await db.insert('registeredOperationMappings', {
      networkId: input.networkId,
      mappingRef: storedMappingRef,
      material,
      publisherRef: input.publisherRef,
      authorityMode: input.authorityMode,
      registrationEvidenceRefs: [...input.registrationEvidenceRefs],
      registeredAt: now,
      updatedAt: now,
    })
  }
  await db.patch(operationId, {
    status: 'succeeded',
    resultHash: canonicalDigest({ mappingRef }),
    updatedAt: now,
  })
  return { kind: 'registered' as const, mappingRef }
}

export async function registerCuratedMapping(
  ctx: MutationCtx,
  input: Readonly<{
    networkId: string
    mapping: RegisteredOperationMappingInput
    registrationEvidenceRefs: readonly string[]
  }>,
) {
  if (
    !boundedTrimmed(input.networkId, 200) ||
    !validEvidenceRefs(input.registrationEvidenceRefs)
  ) {
    return {
      kind: 'refused' as const,
      reason: 'registration_context_invalid' as const,
    }
  }
  return await registerMappingCommand(ctx.db, {
    ...input,
    authorityMode: 'ae_curated_external',
    actorKind: 'system',
    publisherRef: 'system:curated-provider-bootstrap',
  })
}

export async function registerCapabilityOffering(
  db: MutationCtx['db'],
  input: unknown,
  registeredAt: number,
) {
  return registerCapabilityOfferingWrite(
    capabilitySupplyWriterPorts(db),
    input,
    registeredAt,
  )
}

export async function registerCapabilityTransportBinding(
  db: MutationCtx['db'],
  input: unknown,
  registeredAt: number,
  expectedOperationRef?: string,
) {
  return registerCapabilityTransportBindingWrite(
    capabilitySupplyWriterPorts(db),
    input,
    registeredAt,
    expectedOperationRef,
  )
}

export async function setCapabilitySupplyEligibility(
  db: MutationCtx['db'],
  input: EligibilityInput,
  updatedAt: number,
) {
  return setCapabilitySupplyEligibilityWrite(
    capabilitySupplyWriterPorts(db),
    input,
    updatedAt,
  )
}

function portsFor(db: MutationCtx['db']): OperationLedgerPorts {
  return capabilitySupplyOperationPorts(db, {
    registerOffering: (registration, now) =>
      registerCapabilityOffering(db, registration, now),
    registerBinding: (registration, now, expectedOperationRef) =>
      registerCapabilityTransportBinding(
        db,
        registration,
        now,
        expectedOperationRef,
      ),
    setEligibility: (eligibility, now) =>
      setCapabilitySupplyEligibility(db, eligibility, now),
  })
}

export async function registerCapabilityOfferingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    registration: unknown
    context: RegistrationContext
  }>,
  now: number,
) {
  return runRegisterOfferingCommand(portsFor(db), command, now)
}

export async function registerCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    registration: unknown
    context: RegistrationContext
  }>,
  now: number,
) {
  return runRegisterBindingCommand(portsFor(db), command, now)
}

export async function setCapabilitySupplyEligibilityCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    eligibility: EligibilityInput
    context: RegistrationContext
  }>,
  now: number,
) {
  return runSetEligibilityCommand(portsFor(db), command, now)
}

export async function quarantineCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    bindingId: string
    expectedObservedRowDigest: string
    context: RegistrationContext
  }>,
  now: number,
) {
  return runQuarantineCommand(portsFor(db), command, now)
}
