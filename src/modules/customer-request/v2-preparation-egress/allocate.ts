import type { CustomerRequestCanonicalClaimMaterial } from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  connectionAuthoritySnapshotIsValid,
  connectionAuthoritySnapshotsEqual,
} from '@/modules/capability-supply/public'

import { operationIntegrityValid } from './integrity'
import { openReadyPreparation } from './open-preparation'
import type { CustomerRequestV2PreparationEgressPorts } from './ports'
import type { AllocateEgressArgs, AllocateEgressResult, EligibleSupply, PlanAction, ReadyPreparation } from './types'

type PreparationDeclaration = ReadyPreparation['authorityScope']['declarations'][number]
type PreparationInput = PreparationDeclaration['inputs'][number]
type PreparationPurpose = PreparationDeclaration['purposes'][number]
type ActionInput = PlanAction['inputs'][number]
type ExposureUnit = Readonly<{
  declaration: PreparationDeclaration
  item: PreparationInput
  purpose: PreparationPurpose
}>
type OperationMaterial = Readonly<{
  preparationRef: string
  requestId: string
  principalId: string
  authorityReference: string
  authorityScopeDigest: string
  lineage: ReadyPreparation['lineage']
  businessId: string
  offeringId: string
  bindingId: string
  offeringRegistrationHash: string
  bindingRegistrationHash: string
  adapterId: string
  adapterConfigDigest: string
  adapterConfigJson: string
  endpointUrl: string
  connectionAuthority?: EligibleSupply['binding']['connectionAuthority']
  credentialRef: string
  projectedInputDigest: string
}>
type CanonicalDeclaration = Readonly<{
  declarationKey: string
  inputPointer: string
  classification: PreparationDeclaration['classification']
  purposes: readonly string[]
  effect: PreparationDeclaration['effect']
  inputs: PreparationDeclaration['inputs']
}>

export async function allocateEgress(
  args: AllocateEgressArgs,
  ports: CustomerRequestV2PreparationEgressPorts,
): Promise<AllocateEgressResult> {
  const replay = await ports.loadEgressCommand(args.commandKey)
  if (replay !== null) {
    if (replay.commandDigest !== args.commandDigest || replay.principalId !== args.principalId
      || replay.preparationRef !== args.preparationRef) {
      return { kind: 'conflict', reason: 'idempotency_key_reused' } satisfies AllocateEgressResult
    }
    return { kind: 'replayed', operationRefs: [...replay.operationRefs] } satisfies AllocateEgressResult
  }

  const opened = await openReadyPreparation(ports, args.preparationRef, args.principalId)
  if (opened.kind !== 'ready') {
    return { kind: 'needs_attention', reason: opened.reason } satisfies AllocateEgressResult
  }
  const preparation: ReadyPreparation = opened.preparation
  const action: PlanAction = opened.action
  const supplies: readonly EligibleSupply[] = opened.supplies
  const preparationDeclarations: readonly PreparationDeclaration[] = (
    preparation.authorityScope.declarations.filter(
      (declaration: PreparationDeclaration) => declaration.phase === 'preparation',
    )
  )
  if (preparationDeclarations.some(
    (declaration: PreparationDeclaration) => declaration.recipient.kind !== 'candidate_binding',
  )) {
    return { kind: 'needs_attention', reason: 'unsupported_recipient' } satisfies AllocateEgressResult
  }
  for (const supply of supplies) connectionAuthorityForSupply(supply)
  const requiresAuthority = preparationDeclarations.some((declaration: PreparationDeclaration) => (
    declaration.classification !== 'public' || declaration.effect.authority !== 'none'
  ))
  const authorityReference = preparation.authorityReservation?.reservationRef
    ?? `authority:none:${canonicalDigest({
      principalId: preparation.lineage.principalId,
      contractRef: preparation.lineage.contractRef,
      selectionKey: preparation.lineage.selectionKey,
      semanticDigest: preparation.lineage.semanticDigest,
      declarations: preparation.authorityScope.declarations,
    })}`
  if (requiresAuthority) {
    if (preparation.authorityReservation === undefined) {
      return { kind: 'needs_attention', reason: 'authority_changed' } satisfies AllocateEgressResult
    }
    const reservation = await ports.loadAuthorityReservation(authorityReference)
    if (reservation === null
      || reservation.reservationDigest !== preparation.authorityReservation.reservationDigest
      || reservation.reservation.authorityScopeDigest !== preparation.authorityScope.authorityScopeDigest
      || reservation.reservation.approvalDigest !== preparation.authorityReservation.approvalDigest) {
      return { kind: 'needs_attention', reason: 'authority_changed' } satisfies AllocateEgressResult
    }
  }

  const existingOperations = await ports.listOperationsByPreparation(args.preparationRef, 65)
  if (existingOperations.length > 0) {
    if (existingOperations.some((operation) => operation.authorityReference !== authorityReference
      || operation.authorityScopeDigest !== preparation.authorityScope.authorityScopeDigest
      || !operationIntegrityValid(operation))) {
      throw new Error('customer_request_v2_egress_replay_integrity_failure')
    }
    const operationRefs = existingOperations.map(({ operationRef }) => operationRef).sort()
    await ports.insertEgressCommand({
      commandKey: args.commandKey,
      commandDigest: args.commandDigest,
      principalId: args.principalId,
      preparationRef: args.preparationRef,
      authorityReference,
      operationRefs,
      committedAt: args.now,
    })
    return { kind: 'replayed', operationRefs } satisfies AllocateEgressResult
  }

  const exposureUnits: ExposureUnit[] = [...new Map<string, ExposureUnit>(
    preparationDeclarations.flatMap((declaration: PreparationDeclaration) => (
      declaration.inputs.flatMap((item: PreparationInput) => (
        declaration.purposes.map((purpose: PreparationPurpose): readonly [string, ExposureUnit] => [
          canonicalDigest({
            declarationKey: declaration.declarationKey,
            inputKey: item.inputKey,
            inputPointer: item.inputPointer,
            schemaIdentity: item.schemaIdentity,
            purpose,
          }),
          { declaration, item, purpose },
        ])
      ))
    )),
  ).values()]
  const requiredRecipients = supplies.length
  const requiredOperations = supplies.length
  const requiredExposures = supplies.length * exposureUnits.length
  if (requiredOperations > 64 || requiredExposures > 256) {
    return { kind: 'needs_attention', reason: 'allocation_limit_exceeded' } satisfies AllocateEgressResult
  }
  const limits = preparation.authorityScope.limits
  const consumption = await ports.loadConsumption(authorityReference)
  const consumed = consumption ?? {
    consumedRecipients: 0,
    consumedExposures: 0,
    consumedOperations: 0,
    maximumRecipients: limits.maximumRecipients,
    maximumExposures: limits.maximumExposures,
    maximumOperations: limits.maximumOperations,
  }
  if (consumed.maximumRecipients !== limits.maximumRecipients
    || consumed.maximumExposures !== limits.maximumExposures
    || consumed.maximumOperations !== limits.maximumOperations
    || consumed.consumedRecipients + requiredRecipients > limits.maximumRecipients
    || consumed.consumedExposures + requiredExposures > limits.maximumExposures
    || consumed.consumedOperations + requiredOperations > limits.maximumOperations) {
    return { kind: 'needs_attention', reason: 'capacity_exceeded' } satisfies AllocateEgressResult
  }
  const operationRefs: string[] = []
  for (const supply of supplies) {
    const connectionAuthority = connectionAuthorityForSupply(supply)
    const operationMaterial: OperationMaterial = {
      preparationRef: preparation.preparationRef,
      requestId: preparation.lineage.requestId,
      principalId: preparation.lineage.principalId,
      authorityReference,
      authorityScopeDigest: preparation.authorityScope.authorityScopeDigest,
      lineage: preparation.lineage,
      businessId: supply.offering.businessId,
      offeringId: supply.offering.offeringId,
      bindingId: supply.binding.bindingId,
      offeringRegistrationHash: supply.offering.registrationHash,
      bindingRegistrationHash: supply.binding.registrationHash,
      adapterId: supply.binding.adapterId,
      adapterConfigDigest: supply.binding.configDigest,
      adapterConfigJson: supply.binding.configJson,
      endpointUrl: supply.binding.endpointUrl,
      ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
      credentialRef: supply.binding.authority.kind === 'keyless'
        ? 'none'
        : supply.binding.authority.connectionRef,
      projectedInputDigest: preparation.projectedInputDigest ?? canonicalDigest([]),
    }
    const operationDigest = canonicalDigest(operationMaterial)
    const operationRef = `preparation-egress:${operationDigest}`
    const canonicalClaimMaterial: CustomerRequestCanonicalClaimMaterial = buildCanonicalClaimMaterial({
      operationRef,
      preparation,
      supply,
      operationMaterial,
      now: args.now,
    })
    operationRefs.push(operationRef)
    await ports.insertOperation({
      operationRef,
      operationDigest,
      ...operationMaterial,
      canonicalClaimMaterial,
      state: 'allocated',
      allocatedAt: args.now,
    })
    for (const { declaration, item, purpose } of exposureUnits) {
      const fact = action.inputs.find((candidate: ActionInput) => candidate.inputKey === item.inputKey
        && candidate.inputPointer === item.inputPointer
        && candidate.schemaIdentity === item.schemaIdentity)
      if (fact === undefined) throw new Error('customer_request_v2_egress_input_integrity_failure')
      const allocationMaterial = {
        operationRef,
        preparationRef: preparation.preparationRef,
        authorityReference,
        authorityScopeDigest: preparation.authorityScope.authorityScopeDigest,
        lineage: preparation.lineage,
        declarationKey: declaration.declarationKey,
        inputKey: item.inputKey,
        inputPointer: item.inputPointer,
        schemaIdentity: item.schemaIdentity,
        classification: declaration.classification,
        purpose,
        effect: declaration.effect,
        declaredRecipient: declaration.recipient,
        businessId: supply.offering.businessId,
        offeringId: supply.offering.offeringId,
        bindingId: supply.binding.bindingId,
        offeringRegistrationHash: supply.offering.registrationHash,
        bindingRegistrationHash: supply.binding.registrationHash,
        valueDigest: canonicalDigest(fact.value),
      }
      const allocationDigest = canonicalDigest(allocationMaterial)
      await ports.insertDisclosureAllocation({
        allocationRef: `preparation-disclosure:${allocationDigest}`,
        allocationDigest,
        ...allocationMaterial,
        allocatedAt: args.now,
      })
    }
  }
  const consumptionPatch = {
    authorityReference,
    authorityScopeDigest: preparation.authorityScope.authorityScopeDigest,
    preparationRef: preparation.preparationRef,
    maximumRecipients: limits.maximumRecipients,
    maximumExposures: limits.maximumExposures,
    maximumOperations: limits.maximumOperations,
    consumedRecipients: consumed.consumedRecipients + requiredRecipients,
    consumedExposures: consumed.consumedExposures + requiredExposures,
    consumedOperations: consumed.consumedOperations + requiredOperations,
    updatedAt: args.now,
  }
  if (consumption === null) await ports.insertConsumption(consumptionPatch)
  else await ports.replaceConsumption({ consumptionId: consumption.consumptionId, row: consumptionPatch })
  operationRefs.sort()
  await ports.insertEgressCommand({
    commandKey: args.commandKey,
    commandDigest: args.commandDigest,
    principalId: args.principalId,
    preparationRef: args.preparationRef,
    authorityReference,
    operationRefs,
    committedAt: args.now,
  })
  return { kind: 'allocated', operationRefs } satisfies AllocateEgressResult
}
function buildCanonicalClaimMaterial(input: Readonly<{
  operationRef: string
  preparation: ReadyPreparation
  supply: EligibleSupply
  operationMaterial: OperationMaterial
  now: number
}>): CustomerRequestCanonicalClaimMaterial {
  const { preparation, supply } = input
  const connectionAuthority = connectionAuthorityForSupply(supply)
  const declarations: readonly CanonicalDeclaration[] = preparation.authorityScope.declarations
    .filter((declaration: PreparationDeclaration) => (
      declaration.phase === 'preparation' && declaration.recipient.kind === 'candidate_binding'
    ))
    .map((declaration: PreparationDeclaration): CanonicalDeclaration => ({
      declarationKey: declaration.declarationKey,
      inputPointer: declaration.inputPointer,
      classification: declaration.classification,
      purposes: declaration.purposes,
      effect: declaration.effect,
      inputs: declaration.inputs,
    }))
  const authorityReservation = preparation.authorityReservation
  const requiresCustomerAuthority = declarations.some((declaration) => (
    declaration.classification !== 'public' || declaration.effect.authority !== 'none'
  ))
  const acceptedBasis: CustomerRequestCanonicalClaimMaterial['authority']['acceptedBasis'] = (
    authorityReservation === undefined
      ? {
        kind: 'public_capability_use',
        publicationRef: supply.publication.publicationRef,
        publicationRevision: supply.publication.revision,
        operationRef: supply.publication.operationRef,
        bindingId: supply.binding.bindingId,
        bindingRegistrationHash: supply.binding.registrationHash,
      }
      : {
        kind: 'approve_each',
        authorityRef: authorityReservation.authorityReference,
      }
  )
  if (authorityReservation === undefined && requiresCustomerAuthority) {
    throw new Error('customer_request_v2_egress_public_authority_missing')
  }
  if (supply.binding.authority.kind === 'provider_connection' && connectionAuthority === undefined) {
    throw new Error('customer_request_v2_egress_public_authority_missing')
  }
  const authorityReference = authorityReservation?.authorityReference
    ?? supply.publication.publicationRef
  const decisionDigest = authorityReservation?.reservationDigest
    ?? canonicalDigest(acceptedBasis)
  const targetDigest = targetDigestForSupply({
    supply,
    operationMaterial: input.operationMaterial,
    connectionAuthority,
  })
  const lineage = preparation.lineage
  const recordedAt = new Date(input.now).toISOString()
  return {
    invocationRef: `action-invocation:customer-request-preparation:${input.operationRef}`,
    sourceRef: input.operationRef,
    invocationVersion: 1,
    actor: {
      callerRef: 'runtime:customer-request-preparation-egress',
      principalRef: lineage.principalId,
    },
    origin: {
      kind: 'request_owned',
      requestRef: lineage.requestId,
      revision: lineage.requestRevision,
    },
    action: {
      id: lineage.actionId,
      contractVersion: String(lineage.contractRef.version),
    },
    materialInputDigest: input.operationMaterial.projectedInputDigest,
    authority: {
      reference: authorityReference,
      decisionDigest,
      targetDigest,
      consequence: `customer_request_preparation_egress:${canonicalDigest(
        declarations,
      )}`,
      limits: {
        maximumRecipients: preparation.authorityScope.limits.maximumRecipients,
        maximumExposures: preparation.authorityScope.limits.maximumExposures,
        maximumOperations: preparation.authorityScope.limits.maximumOperations,
      },
      expiresAt: new Date(supply.publication.readinessValidUntil).toISOString(),
      acceptedBasis,
    },
    attempt: {
      attemptRef: `action-attempt:customer-request-preparation:${input.operationRef}`,
      attemptNumber: 1,
      effectGeneration: 1,
      operationKey: input.operationRef,
      leaseOwner: 'runtime:customer-request-preparation-egress',
      leaseExpiresAt: new Date(input.now + 150_000).toISOString(),
    },
    recordedAt,
  } satisfies CustomerRequestCanonicalClaimMaterial
}

export function preparationEgressTargetDigest(input: Readonly<{
  supply: EligibleSupply
  operationMaterial: Readonly<{
    adapterId: string
    adapterConfigDigest: string
    adapterConfigJson: string
    endpointUrl: string
  }>
}>): string {
  return targetDigestForSupply({
    ...input,
    connectionAuthority: connectionAuthorityForSupply(input.supply),
  })
}

function targetDigestForSupply(input: Readonly<{
  supply: EligibleSupply
  operationMaterial: Readonly<{
    adapterId: string
    adapterConfigDigest: string
    adapterConfigJson: string
    endpointUrl: string
  }>
  connectionAuthority: EligibleSupply['binding']['connectionAuthority']
}>): string {
  const { supply, operationMaterial, connectionAuthority } = input
  return canonicalDigest({
    publication: {
      publicationRef: supply.publication.publicationRef,
      revision: supply.publication.revision,
      operationRef: supply.publication.operationRef,
      admittedOperation: supply.publication.admittedOperation,
    },
    binding: {
      bindingId: supply.binding.bindingId,
      registrationHash: supply.binding.registrationHash,
      ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
      configDigest: operationMaterial.adapterConfigDigest,
    },
    adapter: {
      adapterId: operationMaterial.adapterId,
      configJson: operationMaterial.adapterConfigJson,
      endpointUrl: operationMaterial.endpointUrl,
    },
  })
}

function connectionAuthorityForSupply(
  supply: EligibleSupply,
): EligibleSupply['binding']['connectionAuthority'] {
  const bindingAuthority = supply.binding.authority
  if (bindingAuthority.kind === 'keyless') {
    if (supply.binding.connectionAuthority !== undefined
      || supply.publication.connectionAuthority !== undefined) {
      throw new Error('customer_request_v2_egress_keyless_authority_snapshot_present')
    }
    return undefined
  }
  const snapshot = supply.binding.connectionAuthority
  if (!connectionAuthoritySnapshotIsValid(snapshot)
    || !connectionAuthoritySnapshotIsValid(supply.publication.connectionAuthority)
    || !connectionAuthoritySnapshotsEqual(snapshot, supply.publication.connectionAuthority)
    || snapshot.connectionRef !== bindingAuthority.connectionRef
    || snapshot.providerRef !== bindingAuthority.providerRef
    || snapshot.adapterId !== supply.binding.adapterId
    || snapshot.operationRef !== supply.publication.operationRef) {
    throw new Error('customer_request_v2_egress_public_authority_missing')
  }
  return snapshot
}