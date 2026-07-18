import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { operationIntegrityValid } from './integrity'
import { openReadyPreparation } from './open-preparation'
import type { CustomerRequestV2PreparationEgressPorts } from './ports'
import type { AllocateEgressArgs, AllocateEgressResult } from './types'

export async function allocateEgress(
  args: AllocateEgressArgs,
  ports: CustomerRequestV2PreparationEgressPorts,
): Promise<AllocateEgressResult> {
  const replay = await ports.loadEgressCommand(args.commandKey)
  if (replay !== null) {
    if (replay.commandDigest !== args.commandDigest || replay.principalId !== args.principalId
      || replay.preparationRef !== args.preparationRef) {
      return { kind: 'conflict', reason: 'idempotency_key_reused' }
    }
    return { kind: 'replayed', operationRefs: [...replay.operationRefs] }
  }

  const opened = await openReadyPreparation(ports, args.preparationRef, args.principalId)
  if (opened.kind !== 'ready') return opened
  const { preparation, action, supplies } = opened
  const preparationDeclarations = preparation.authorityScope.declarations.filter((declaration) => (
    declaration.phase === 'preparation'
  ))
  if (preparationDeclarations.some(({ recipient }) => recipient.kind !== 'candidate_binding')) {
    return { kind: 'needs_attention', reason: 'unsupported_recipient' }
  }
  const requiresAuthority = preparationDeclarations.some((declaration) => (
    declaration.classification !== 'public' || declaration.effect.authority !== 'none'
  ))
  const authorityReference = preparation.authorityReservation?.reservationRef
    ?? `authority:none:${canonicalDigest({
      principalId: preparation.lineage.principalId,
      contractRef: preparation.lineage.contractRef,
      selectionKey: preparation.lineage.selectionKey,
      semanticDigest: preparation.lineage.semanticDigest,
      declarations: preparation.authorityScope.declarations,
    } as StableHashValue)}`
  if (requiresAuthority) {
    if (preparation.authorityReservation === undefined) {
      return { kind: 'needs_attention', reason: 'authority_changed' }
    }
    const reservation = await ports.loadAuthorityReservation(authorityReference)
    if (reservation === null
      || reservation.reservationDigest !== preparation.authorityReservation.reservationDigest
      || reservation.reservation.authorityScopeDigest !== preparation.authorityScope.authorityScopeDigest
      || reservation.reservation.approvalDigest !== preparation.authorityReservation.approvalDigest) {
      return { kind: 'needs_attention', reason: 'authority_changed' }
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
    return { kind: 'replayed', operationRefs }
  }

  const exposureUnits = [...new Map(preparationDeclarations.flatMap((declaration) => (
    declaration.inputs.flatMap((item) => declaration.purposes.map((purpose) => [canonicalDigest({
      declarationKey: declaration.declarationKey,
      inputKey: item.inputKey,
      inputPointer: item.inputPointer,
      schemaIdentity: item.schemaIdentity,
      purpose,
    } as StableHashValue), { declaration, item, purpose }] as const))
  ))).values()]
  const requiredRecipients = supplies.length
  const requiredOperations = supplies.length
  const requiredExposures = supplies.length * exposureUnits.length
  if (requiredOperations > 64 || requiredExposures > 256) {
    return { kind: 'needs_attention', reason: 'allocation_limit_exceeded' }
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
    return { kind: 'needs_attention', reason: 'capacity_exceeded' }
  }

  const operationRefs: string[] = []
  for (const supply of supplies) {
    const operationMaterial = {
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
      credentialRef: supply.binding.credentialRef,
      projectedInputDigest: preparation.projectedInputDigest ?? canonicalDigest([]),
    }
    const operationDigest = canonicalDigest(operationMaterial as StableHashValue)
    const operationRef = `preparation-egress:${operationDigest}`
    operationRefs.push(operationRef)
    await ports.insertOperation({
      operationRef,
      operationDigest,
      ...operationMaterial,
      state: 'allocated',
      allocatedAt: args.now,
    })
    for (const { declaration, item, purpose } of exposureUnits) {
      const fact = action.inputs.find((candidate) => candidate.inputKey === item.inputKey
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
        valueDigest: canonicalDigest(fact.value as StableHashValue),
      }
      const allocationDigest = canonicalDigest(allocationMaterial as StableHashValue)
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
  return { kind: 'allocated', operationRefs }
}
