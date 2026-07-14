import { v } from 'convex/values'

import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import { requestRegistrySnapshotDigest } from '@/modules/customer-request/evaluation'

import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { listEligibleCapabilitySupply } from './capabilitySupply'

const terminalState = v.union(v.literal('released'), v.literal('not_released'), v.literal('uncertain'))
const DISPATCH_LEASE_MS = 150_000

export const allocate = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    preparationRef: v.string(), now: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal('allocated'), operationRefs: v.array(v.string()) }),
    v.object({ kind: v.literal('replayed'), operationRefs: v.array(v.string()) }),
    v.object({ kind: v.literal('conflict'), reason: v.literal('idempotency_key_reused') }),
    v.object({ kind: v.literal('needs_attention'), reason: v.union(
      v.literal('preparation_not_ready'), v.literal('capability_graph_changed'), v.literal('authority_changed'),
      v.literal('capacity_exceeded'), v.literal('allocation_limit_exceeded'),
      v.literal('unsupported_recipient'), v.literal('no_eligible_bindings'),
    ) }),
  ),
  handler: async (ctx, args) => {
    const replay = await ctx.db.query('customerRequestV2PreparationEgressCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (replay !== null) {
      if (replay.commandDigest !== args.commandDigest || replay.principalId !== args.principalId
        || replay.preparationRef !== args.preparationRef) {
        return { kind: 'conflict' as const, reason: 'idempotency_key_reused' as const }
      }
      return { kind: 'replayed' as const, operationRefs: replay.operationRefs }
    }

    const opened = await openPreparation(ctx.db, args.preparationRef, args.principalId)
    if (opened.kind !== 'ready') return opened
    const { preparation, aggregate, action, supplies } = opened
    const preparationDeclarations = preparation.authorityScope.declarations.filter((declaration) => (
      declaration.phase === 'preparation'
    ))
    if (preparationDeclarations.some(({ recipient }) => recipient.kind !== 'candidate_binding')) {
      return { kind: 'needs_attention' as const, reason: 'unsupported_recipient' as const }
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
        return { kind: 'needs_attention' as const, reason: 'authority_changed' as const }
      }
      const reservation = await ctx.db.query('customerRequestV2PreparationAuthorityReservations')
        .withIndex('by_reservationRef', (query) => query.eq('reservationRef', authorityReference)).unique()
      if (reservation === null || reservation.reservationDigest !== preparation.authorityReservation.reservationDigest
        || reservation.reservation.authorityScopeDigest !== preparation.authorityScope.authorityScopeDigest
        || reservation.reservation.approvalDigest !== preparation.authorityReservation.approvalDigest) {
        return { kind: 'needs_attention' as const, reason: 'authority_changed' as const }
      }
    }

    const existingOperations = await ctx.db.query('customerRequestV2PreparationEgressOperations')
      .withIndex('by_preparationRef', (query) => query.eq('preparationRef', args.preparationRef)).take(65)
    if (existingOperations.length > 0) {
      if (existingOperations.some((operation) => operation.authorityReference !== authorityReference
        || operation.authorityScopeDigest !== preparation.authorityScope.authorityScopeDigest
        || !operationIntegrityValid(operation))) {
        throw new Error('customer_request_v2_egress_replay_integrity_failure')
      }
      const operationRefs = existingOperations.map(({ operationRef }) => operationRef).sort()
      await ctx.db.insert('customerRequestV2PreparationEgressCommands', {
        commandKey: args.commandKey, commandDigest: args.commandDigest, principalId: args.principalId,
        preparationRef: args.preparationRef, authorityReference, operationRefs, committedAt: args.now,
      })
      return { kind: 'replayed' as const, operationRefs }
    }

    const exposureUnits = [...new Map(preparationDeclarations.flatMap((declaration) => (
      declaration.inputs.flatMap((item) => declaration.purposes.map((purpose) => ({
        key: canonicalDigest({
          declarationKey: declaration.declarationKey, inputKey: item.inputKey,
          inputPointer: item.inputPointer, schemaIdentity: item.schemaIdentity, purpose,
        } as StableHashValue),
        value: { declaration, item, purpose },
      })))
    )).map(({ key, value }) => [key, value])).values()]
    const requiredRecipients = supplies.length
    const requiredOperations = supplies.length
    const requiredExposures = supplies.length * exposureUnits.length
    if (requiredOperations > 64 || requiredExposures > 256) {
      return { kind: 'needs_attention' as const, reason: 'allocation_limit_exceeded' as const }
    }
    const limits = preparation.authorityScope.limits
    const consumption = await ctx.db.query('customerRequestV2PreparationEgressConsumption')
      .withIndex('by_authorityReference', (query) => query.eq('authorityReference', authorityReference)).unique()
    const consumed = consumption ?? {
      consumedRecipients: 0, consumedExposures: 0, consumedOperations: 0,
      maximumRecipients: limits.maximumRecipients, maximumExposures: limits.maximumExposures,
      maximumOperations: limits.maximumOperations,
    }
    if (consumed.maximumRecipients !== limits.maximumRecipients
      || consumed.maximumExposures !== limits.maximumExposures
      || consumed.maximumOperations !== limits.maximumOperations
      || consumed.consumedRecipients + requiredRecipients > limits.maximumRecipients
      || consumed.consumedExposures + requiredExposures > limits.maximumExposures
      || consumed.consumedOperations + requiredOperations > limits.maximumOperations) {
      return { kind: 'needs_attention' as const, reason: 'capacity_exceeded' as const }
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
      await ctx.db.insert('customerRequestV2PreparationEgressOperations', {
        operationRef, operationDigest, ...operationMaterial, state: 'allocated', allocatedAt: args.now,
      })
      for (const { declaration, item, purpose } of exposureUnits) {
        const fact = action.inputs.find((candidate) => candidate.inputKey === item.inputKey
          && candidate.inputPointer === item.inputPointer && candidate.schemaIdentity === item.schemaIdentity)
        if (fact === undefined) throw new Error('customer_request_v2_egress_input_integrity_failure')
        const allocationMaterial = {
          operationRef, preparationRef: preparation.preparationRef, authorityReference,
          authorityScopeDigest: preparation.authorityScope.authorityScopeDigest, lineage: preparation.lineage,
          declarationKey: declaration.declarationKey, inputKey: item.inputKey,
          inputPointer: item.inputPointer, schemaIdentity: item.schemaIdentity,
          classification: declaration.classification, purpose, effect: declaration.effect,
          declaredRecipient: declaration.recipient,
          businessId: supply.offering.businessId, offeringId: supply.offering.offeringId,
          bindingId: supply.binding.bindingId, offeringRegistrationHash: supply.offering.registrationHash,
          bindingRegistrationHash: supply.binding.registrationHash,
          valueDigest: canonicalDigest(fact.value as StableHashValue),
        }
        const allocationDigest = canonicalDigest(allocationMaterial as StableHashValue)
        await ctx.db.insert('customerRequestV2PreparationDisclosureAllocations', {
          allocationRef: `preparation-disclosure:${allocationDigest}`,
          allocationDigest, ...allocationMaterial, allocatedAt: args.now,
        })
      }
    }
    const consumptionPatch = {
      authorityReference, authorityScopeDigest: preparation.authorityScope.authorityScopeDigest,
      preparationRef: preparation.preparationRef,
      maximumRecipients: limits.maximumRecipients, maximumExposures: limits.maximumExposures,
      maximumOperations: limits.maximumOperations,
      consumedRecipients: consumed.consumedRecipients + requiredRecipients,
      consumedExposures: consumed.consumedExposures + requiredExposures,
      consumedOperations: consumed.consumedOperations + requiredOperations,
      updatedAt: args.now,
    }
    if (consumption === null) await ctx.db.insert('customerRequestV2PreparationEgressConsumption', consumptionPatch)
    else await ctx.db.replace(consumption._id, consumptionPatch)
    operationRefs.sort()
    await ctx.db.insert('customerRequestV2PreparationEgressCommands', {
      commandKey: args.commandKey, commandDigest: args.commandDigest, principalId: args.principalId,
      preparationRef: args.preparationRef, authorityReference, operationRefs, committedAt: args.now,
    })
    return { kind: 'allocated' as const, operationRefs }
  },
})

export const beginDispatch = internalMutation({
  args: { operationRef: v.string(), principalId: v.string(), now: v.number() },
  returns: v.union(
    v.object({ kind: v.literal('dispatch'), endpointUrl: v.string(), credentialRef: v.string(),
      adapterId: v.string(), configJson: v.string(), bodyText: v.string(), dispatchAttemptRef: v.string() }),
    v.object({ kind: v.literal('in_flight') }),
    v.object({ kind: v.literal('terminal'), state: terminalState }),
    v.object({ kind: v.literal('needs_attention') }),
  ),
  handler: async (ctx, args) => {
    const operation = await ctx.db.query('customerRequestV2PreparationEgressOperations')
      .withIndex('by_operationRef', (query) => query.eq('operationRef', args.operationRef)).unique()
    if (operation === null || operation.lineage.principalId !== args.principalId) return { kind: 'needs_attention' as const }
    if (!operationIntegrityValid(operation)) throw new Error('customer_request_v2_egress_operation_integrity_failure')
    if (operation.state === 'dispatching') {
      if (operation.dispatchLeaseExpiresAt !== undefined && args.now < operation.dispatchLeaseExpiresAt) {
        return { kind: 'in_flight' as const }
      }
      await ctx.db.patch(operation._id, {
        state: 'uncertain', resolvedAt: args.now, failureCode: 'dispatch_interrupted',
        evidenceRef: `ae:dispatch-interrupted:${operation.operationDigest}`,
      })
      return { kind: 'terminal' as const, state: 'uncertain' as const }
    }
    if (operation.state !== 'allocated') return { kind: 'terminal' as const, state: operation.state }
    const opened = await openPreparation(ctx.db, operation.preparationRef, args.principalId)
    if (opened.kind !== 'ready') {
      await ctx.db.patch(operation._id, {
        state: 'not_released', resolvedAt: args.now, failureCode: 'release_precondition_changed',
        evidenceRef: `ae:not-released:${canonicalDigest({
          operationRef: operation.operationRef, reason: opened.reason,
        })}`,
      })
      return { kind: 'terminal' as const, state: 'not_released' as const }
    }
    const supply = opened.supplies.find(({ offering, binding }) => (
      String(offering.businessId) === String(operation.businessId)
      && offering.offeringId === operation.offeringId && binding.bindingId === operation.bindingId
      && offering.registrationHash === operation.offeringRegistrationHash
      && binding.registrationHash === operation.bindingRegistrationHash
      && binding.adapterId === operation.adapterId && binding.configDigest === operation.adapterConfigDigest
      && binding.configJson === operation.adapterConfigJson && binding.endpointUrl === operation.endpointUrl
      && binding.credentialRef === operation.credentialRef
    ))
    if (supply === undefined || opened.preparation.authorityScope.authorityScopeDigest !== operation.authorityScopeDigest) {
      await markAllocatedNotReleased(ctx.db, operation, args.now, 'release_binding_changed')
      return { kind: 'terminal' as const, state: 'not_released' as const }
    }
    if (opened.preparation.authorityScope.declarations.some((declaration) => declaration.phase === 'preparation'
      && declaration.recipient.kind === 'candidate_binding'
      && (declaration.classification !== 'public' || declaration.effect.authority !== 'none'))
      && opened.preparation.authorityReservation?.reservationRef !== operation.authorityReference) {
      await markAllocatedNotReleased(ctx.db, operation, args.now, 'release_authority_changed')
      return { kind: 'terminal' as const, state: 'not_released' as const }
    }
    if (opened.preparation.authorityReservation !== undefined) {
      const reservation = await ctx.db.query('customerRequestV2PreparationAuthorityReservations')
        .withIndex('by_reservationRef', (query) => query.eq('reservationRef', operation.authorityReference)).unique()
      if (reservation === null
        || reservation.reservationDigest !== opened.preparation.authorityReservation.reservationDigest
        || reservation.reservation.authorityScopeDigest !== operation.authorityScopeDigest) {
        await markAllocatedNotReleased(ctx.db, operation, args.now, 'release_authority_changed')
        return { kind: 'terminal' as const, state: 'not_released' as const }
      }
    }
    const allocations = await ctx.db.query('customerRequestV2PreparationDisclosureAllocations')
      .withIndex('by_operationRef', (query) => query.eq('operationRef', operation.operationRef)).take(257)
    if (allocations.length > 256) throw new Error('customer_request_v2_egress_allocation_limit_exceeded')
    const facts = allocations.map((allocation) => {
      if (!allocationIntegrityValid(allocation)
        || allocation.operationRef !== operation.operationRef
        || allocation.preparationRef !== operation.preparationRef
        || allocation.authorityReference !== operation.authorityReference
        || allocation.authorityScopeDigest !== operation.authorityScopeDigest
        || String(allocation.businessId) !== String(operation.businessId)
        || allocation.offeringId !== operation.offeringId || allocation.bindingId !== operation.bindingId
        || allocation.offeringRegistrationHash !== operation.offeringRegistrationHash
        || allocation.bindingRegistrationHash !== operation.bindingRegistrationHash
        || canonicalDigest(allocation.lineage as StableHashValue) !== canonicalDigest(operation.lineage as StableHashValue)) {
        throw new Error('customer_request_v2_egress_allocation_integrity_failure')
      }
      const declaration = opened.preparation.authorityScope.declarations.find((candidate) => (
        candidate.phase === 'preparation' && candidate.recipient.kind === 'candidate_binding'
        && candidate.declarationKey === allocation.declarationKey
        && candidate.classification === allocation.classification
        && canonicalDigest(candidate.recipient as StableHashValue)
          === canonicalDigest(allocation.declaredRecipient as StableHashValue)
        && candidate.purposes.includes(allocation.purpose)
        && canonicalDigest(candidate.effect as StableHashValue) === canonicalDigest(allocation.effect as StableHashValue)
        && candidate.inputs.some((item) => item.inputKey === allocation.inputKey
          && item.inputPointer === allocation.inputPointer && item.schemaIdentity === allocation.schemaIdentity)
      ))
      if (declaration === undefined) throw new Error('customer_request_v2_egress_declaration_integrity_failure')
      const fact = opened.action.inputs.find((candidate) => candidate.inputKey === allocation.inputKey
        && candidate.inputPointer === allocation.inputPointer && candidate.schemaIdentity === allocation.schemaIdentity)
      if (fact === undefined || canonicalDigest(fact.value as StableHashValue) !== allocation.valueDigest) {
        throw new Error('customer_request_v2_egress_value_integrity_failure')
      }
      return {
        declarationKey: allocation.declarationKey, inputKey: allocation.inputKey,
        inputPointer: allocation.inputPointer, schemaIdentity: allocation.schemaIdentity,
        value: fact.value, purpose: allocation.purpose,
      }
    })
    const dispatchAttemptRef = `preparation-dispatch:${canonicalDigest({
      operationRef: operation.operationRef, operationDigest: operation.operationDigest, startedAt: args.now,
    })}`
    await ctx.db.patch(operation._id, {
      state: 'dispatching', dispatchStartedAt: args.now, dispatchAttemptRef,
      dispatchLeaseExpiresAt: args.now + DISPATCH_LEASE_MS,
    })
    return {
      kind: 'dispatch' as const,
      endpointUrl: operation.endpointUrl, credentialRef: operation.credentialRef,
      adapterId: operation.adapterId, configJson: operation.adapterConfigJson,
      dispatchAttemptRef,
      bodyText: stableStringify({
        protocol: 'ae.preparation-egress:v1', operationRef: operation.operationRef,
        contractRef: operation.lineage.contractRef, selectionKey: operation.lineage.selectionKey,
        semanticDigest: operation.lineage.semanticDigest, facts,
      } as StableHashValue),
    }
  },
})

export const resolveDispatch = internalMutation({
  args: {
    operationRef: v.string(), state: terminalState, evidenceRef: v.string(), now: v.number(),
    dispatchAttemptRef: v.string(),
    responseStatus: v.optional(v.number()), responseContentType: v.optional(v.string()),
    responseBodyDigest: v.optional(v.string()), responseBodyText: v.optional(v.string()),
    failureCode: v.optional(v.string()),
  },
  returns: terminalState,
  handler: async (ctx, args) => {
    const operation = await ctx.db.query('customerRequestV2PreparationEgressOperations')
      .withIndex('by_operationRef', (query) => query.eq('operationRef', args.operationRef)).unique()
    if (operation === null) throw new Error('customer_request_v2_egress_operation_not_found')
    if (operation.dispatchAttemptRef !== args.dispatchAttemptRef) {
      throw new Error('customer_request_v2_egress_dispatch_attempt_mismatch')
    }
    if (operation.state !== 'dispatching') {
      if (operation.state === args.state) return operation.state
      if (args.state === 'released') {
        await ctx.db.patch(operation._id, {
          state: 'released', resolvedAt: args.now, evidenceRef: args.evidenceRef,
          ...(args.responseStatus === undefined ? {} : { responseStatus: args.responseStatus }),
          ...(args.responseContentType === undefined ? {} : { responseContentType: args.responseContentType }),
          ...(args.responseBodyDigest === undefined ? {} : { responseBodyDigest: args.responseBodyDigest }),
          ...(args.responseBodyText === undefined ? {} : { responseBodyText: args.responseBodyText }),
          failureCode: undefined,
        })
        return 'released' as const
      }
      throw new Error('customer_request_v2_egress_invalid_resolution')
    }
    await ctx.db.patch(operation._id, {
      state: args.state, resolvedAt: args.now, evidenceRef: args.evidenceRef,
      ...(args.responseStatus === undefined ? {} : { responseStatus: args.responseStatus }),
      ...(args.responseContentType === undefined ? {} : { responseContentType: args.responseContentType }),
      ...(args.responseBodyDigest === undefined ? {} : { responseBodyDigest: args.responseBodyDigest }),
      ...(args.responseBodyText === undefined ? {} : { responseBodyText: args.responseBodyText }),
      ...(args.failureCode === undefined ? {} : { failureCode: args.failureCode }),
    })
    return args.state
  },
})

export const reconcileUncertain = internalMutation({
  args: {
    operationRef: v.string(), disposition: v.union(
      v.literal('released'), v.literal('not_released'), v.literal('uncertain'),
    ), providerEvidenceRef: v.string(), responseDigest: v.string(), evidenceDigest: v.string(), observedAt: v.number(),
  },
  returns: terminalState,
  handler: async (ctx, args) => {
    const operation = await ctx.db.query('customerRequestV2PreparationEgressOperations')
      .withIndex('by_operationRef', (query) => query.eq('operationRef', args.operationRef)).unique()
    if (operation === null) throw new Error('customer_request_v2_egress_operation_not_found')
    const evidenceMaterial = {
      operationRef: args.operationRef, disposition: args.disposition,
      providerEvidenceRef: args.providerEvidenceRef, responseDigest: args.responseDigest,
    }
    if (canonicalDigest(evidenceMaterial as StableHashValue) !== args.evidenceDigest) {
      throw new Error('customer_request_v2_egress_reconciliation_evidence_invalid')
    }
    const observationMaterial = {
      ...evidenceMaterial,
      businessId: operation.businessId, offeringId: operation.offeringId, bindingId: operation.bindingId,
      offeringRegistrationHash: operation.offeringRegistrationHash,
      bindingRegistrationHash: operation.bindingRegistrationHash,
      observedAt: args.observedAt,
    }
    const observationDigest = canonicalDigest(observationMaterial as StableHashValue)
    const observationRef = `preparation-reconciliation:${observationDigest}`
    const prior = await ctx.db.query('customerRequestV2PreparationReconciliationObservations')
      .withIndex('by_observationRef', (query) => query.eq('observationRef', observationRef)).unique()
    if (prior === null) await ctx.db.insert('customerRequestV2PreparationReconciliationObservations', {
      observationRef, observationDigest, ...observationMaterial,
    })
    if (operation.state !== 'uncertain') return operation.state === 'released' || operation.state === 'not_released'
      ? operation.state : 'uncertain'
    if (args.disposition !== 'uncertain') await ctx.db.patch(operation._id, {
      state: args.disposition, resolvedAt: args.observedAt, evidenceRef: args.providerEvidenceRef,
      failureCode: undefined,
    })
    return args.disposition
  },
})

export const status = internalQuery({
  args: { preparationRef: v.string(), principalId: v.string() },
  returns: v.object({ operationCount: v.number(), states: v.array(v.object({
    operationRef: v.string(), state: v.union(
      v.literal('allocated'), v.literal('dispatching'), v.literal('released'),
      v.literal('not_released'), v.literal('uncertain'),
    ),
  })) }),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('customerRequestV2PreparationEgressOperations')
      .withIndex('by_preparationRef', (query) => query.eq('preparationRef', args.preparationRef)).take(65)
    const states = rows.filter(({ lineage }) => lineage.principalId === args.principalId)
      .map(({ operationRef, state }) => ({ operationRef, state })).sort((a, b) => a.operationRef.localeCompare(b.operationRef))
    return { operationCount: states.length, states }
  },
})

export const unresolvedForRequest = internalQuery({
  args: { requestId: v.string(), principalId: v.string() },
  returns: v.array(v.object({ operationRef: v.string(), requestRevision: v.number() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('customerRequestV2PreparationEgressOperations')
      .withIndex('by_requestId_and_principalId', (query) => query
        .eq('requestId', args.requestId).eq('principalId', args.principalId)).take(65)
    if (rows.length > 64) throw new Error('customer_request_v2_egress_operation_limit_exceeded')
    return rows.filter(({ state }) => state === 'allocated' || state === 'dispatching' || state === 'uncertain')
      .map((operation) => {
        if (!operationIntegrityValid(operation)) throw new Error('customer_request_v2_egress_operation_integrity_failure')
        return { operationRef: operation.operationRef, requestRevision: operation.lineage.requestRevision }
      })
  },
})

export const openReconciliation = internalQuery({
  args: { operationRef: v.string(), principalId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('available'), endpointUrl: v.string(), credentialRef: v.string(),
      adapterId: v.string(), configJson: v.string() }),
    v.object({ kind: v.literal('unavailable') }),
  ),
  handler: async (ctx, args) => {
    const operation = await ctx.db.query('customerRequestV2PreparationEgressOperations')
      .withIndex('by_operationRef', (query) => query.eq('operationRef', args.operationRef)).unique()
    if (operation === null || operation.state !== 'uncertain' || operation.lineage.principalId !== args.principalId) {
      return { kind: 'unavailable' as const }
    }
    if (!operationIntegrityValid(operation)) throw new Error('customer_request_v2_egress_operation_integrity_failure')
    return {
      kind: 'available' as const, endpointUrl: operation.endpointUrl,
      credentialRef: operation.credentialRef, adapterId: operation.adapterId,
      configJson: operation.adapterConfigJson,
    }
  },
})

async function openPreparation(
  db: Parameters<typeof listEligibleCapabilitySupply>[0], preparationRef: string, principalId: string,
) {
  const row = await db.query('customerRequestV2ActionPreparations')
    .withIndex('by_preparationRef', (query) => query.eq('preparationRef', preparationRef)).unique()
  if (row === null || row.lineage.principalId !== principalId || row.preparation.kind !== 'ready_for_routing') {
    return { kind: 'needs_attention' as const, reason: 'preparation_not_ready' as const }
  }
  if (row.preparationDigest !== row.preparation.preparationDigest
    || row.preparationRef !== row.preparation.preparationRef
    || canonicalDigest(row.lineage as StableHashValue) !== canonicalDigest(row.preparation.lineage as StableHashValue)
    || !preparationIntegrityValid(row.preparation)) {
    throw new Error('customer_request_v2_egress_preparation_integrity_failure')
  }
  if (row.preparation.authorityReservation !== undefined
    && !await verifiedPreparationAuthority(db, row.preparation)) {
    return { kind: 'needs_attention' as const, reason: 'authority_changed' as const }
  }
  const head = await db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', row.lineage.requestId)).unique()
  const revision = head === null ? null : await db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => query
      .eq('requestId', row.lineage.requestId).eq('requestRevision', row.lineage.requestRevision)).unique()
  if (head === null || revision === null || head.currentRevision !== row.lineage.requestRevision
    || head.currentAggregateDigest !== revision.aggregate.aggregateDigest
    || revision.aggregate.plan.planDigest !== row.lineage.planDigest
    || !aggregateIntegrityValid(revision.aggregate)) {
    return { kind: 'needs_attention' as const, reason: 'capability_graph_changed' as const }
  }
  const action = revision.aggregate.plan.actions.find(({ actionId }) => actionId === row.lineage.actionId)
  if (action === undefined || !sameCapabilityContractRef(action.contractRef, row.lineage.contractRef)
    || action.selectionKey !== row.lineage.selectionKey || action.semanticDigest !== row.lineage.semanticDigest) {
    return { kind: 'needs_attention' as const, reason: 'capability_graph_changed' as const }
  }
  const live = await listEligibleCapabilitySupply(db, { networkId: revision.aggregate.snapshot.networkId, limit: 64 })
  if (live.kind !== 'available') return { kind: 'needs_attention' as const, reason: 'capability_graph_changed' as const }
  const registryBindings = live.supplies.map(({ offering, binding }) => ({
    businessId: String(offering.businessId), offeringId: offering.offeringId, bindingId: binding.bindingId,
    contractRef: { capabilityId: binding.capabilityId, version: binding.version, contractDigest: binding.contractDigest },
    offeringRegistrationHash: offering.registrationHash, bindingRegistrationHash: binding.registrationHash,
    price: offering.presentation.price,
  }))
  if (requestRegistrySnapshotDigest(registryBindings) !== revision.aggregate.evaluation.registrySnapshotDigest) {
    return { kind: 'needs_attention' as const, reason: 'capability_graph_changed' as const }
  }
  const viable = revision.aggregate.evaluation.candidates.filter((candidate) => candidate.viability.kind === 'viable'
    && sameCapabilityContractRef(candidate.contractRef, row.lineage.contractRef)
    && candidate.selectionKey === row.lineage.selectionKey && candidate.semanticDigest === row.lineage.semanticDigest)
  const matching = live.supplies.filter(({ offering, binding }) => viable.some((candidate) => (
    String(offering.businessId) === candidate.businessId && offering.offeringId === candidate.offeringId
    && binding.bindingId === candidate.bindingId && offering.registrationHash === candidate.offeringRegistrationHash
    && binding.registrationHash === candidate.bindingRegistrationHash
  ))).sort((left, right) => String(left.offering.businessId).localeCompare(String(right.offering.businessId))
    || left.binding.bindingId.localeCompare(right.binding.bindingId))
  const selected = [...new Map(matching.map((supply) => [String(supply.offering.businessId), supply])).values()]
  if (selected.length === 0) return { kind: 'needs_attention' as const, reason: 'no_eligible_bindings' as const }
  return { kind: 'ready' as const, preparation: row.preparation, aggregate: revision.aggregate, action, supplies: selected }
}

export function operationIntegrityValid(operation: Doc<'customerRequestV2PreparationEgressOperations'>): boolean {
  const material = {
    preparationRef: operation.preparationRef,
    requestId: operation.requestId,
    principalId: operation.principalId,
    authorityReference: operation.authorityReference,
    authorityScopeDigest: operation.authorityScopeDigest,
    lineage: operation.lineage,
    businessId: operation.businessId,
    offeringId: operation.offeringId,
    bindingId: operation.bindingId,
    offeringRegistrationHash: operation.offeringRegistrationHash,
    bindingRegistrationHash: operation.bindingRegistrationHash,
    adapterId: operation.adapterId,
    adapterConfigDigest: operation.adapterConfigDigest,
    adapterConfigJson: operation.adapterConfigJson,
    endpointUrl: operation.endpointUrl,
    credentialRef: operation.credentialRef,
    projectedInputDigest: operation.projectedInputDigest,
  }
  return canonicalDigest(material as StableHashValue) === operation.operationDigest
    && operation.operationRef === `preparation-egress:${operation.operationDigest}`
    && operation.requestId === operation.lineage.requestId
    && operation.principalId === operation.lineage.principalId
}

async function markAllocatedNotReleased(
  db: MutationCtx['db'],
  operation: Doc<'customerRequestV2PreparationEgressOperations'>,
  now: number,
  failureCode: string,
): Promise<void> {
  await db.patch(operation._id, {
    state: 'not_released', resolvedAt: now, failureCode,
    evidenceRef: `ae:not-released:${canonicalDigest({ operationRef: operation.operationRef, failureCode })}`,
  })
}

export function preparationIntegrityValid(
  preparation: Doc<'customerRequestV2ActionPreparations'>['preparation'],
): boolean {
  const { preparationDigest, ...material } = preparation
  return canonicalDigest(material as StableHashValue) === preparationDigest
}

export function aggregateIntegrityValid(aggregate: Doc<'customerRequestV2Revisions'>['aggregate']): boolean {
  const { aggregateDigest, ...material } = aggregate
  return aggregate.aggregateVersion === 2 && canonicalDigest(material as StableHashValue) === aggregateDigest
}

export function allocationIntegrityValid(allocation: Doc<'customerRequestV2PreparationDisclosureAllocations'>): boolean {
  const material = {
    operationRef: allocation.operationRef,
    preparationRef: allocation.preparationRef,
    authorityReference: allocation.authorityReference,
    authorityScopeDigest: allocation.authorityScopeDigest,
    lineage: allocation.lineage,
    declarationKey: allocation.declarationKey,
    inputKey: allocation.inputKey,
    inputPointer: allocation.inputPointer,
    schemaIdentity: allocation.schemaIdentity,
    classification: allocation.classification,
    purpose: allocation.purpose,
    effect: allocation.effect,
    declaredRecipient: allocation.declaredRecipient,
    businessId: allocation.businessId,
    offeringId: allocation.offeringId,
    bindingId: allocation.bindingId,
    offeringRegistrationHash: allocation.offeringRegistrationHash,
    bindingRegistrationHash: allocation.bindingRegistrationHash,
    valueDigest: allocation.valueDigest,
  }
  return canonicalDigest(material as StableHashValue) === allocation.allocationDigest
    && allocation.allocationRef === `preparation-disclosure:${allocation.allocationDigest}`
}

export async function verifiedPreparationAuthority(
  db: Parameters<typeof listEligibleCapabilitySupply>[0],
  preparation: Extract<Doc<'customerRequestV2ActionPreparations'>['preparation'], { kind: 'ready_for_routing' }>,
): Promise<boolean> {
  const expected = preparation.authorityReservation
  if (expected === undefined) return true
  const reservation = await db.query('customerRequestV2PreparationAuthorityReservations')
    .withIndex('by_reservationRef', (query) => query.eq('reservationRef', expected.reservationRef)).unique()
  if (reservation === null) return false
  const { reservationDigest: _reservationDigest, reservationRef: _reservationRef, ...reservationMaterial } = expected
  if (canonicalDigest(reservationMaterial as StableHashValue) !== expected.reservationDigest
    || expected.reservationRef !== `action-authority-reservation:${expected.reservationDigest}`
    || reservation.reservationDigest !== expected.reservationDigest
    || canonicalDigest(reservation.reservation as StableHashValue) !== canonicalDigest(expected as StableHashValue)) return false
  const approval = await db.query('customerRequestV2PreparationApprovalEvidence')
    .withIndex('by_approvalRef', (query) => query.eq('approvalRef', expected.authorityReference)).unique()
  if (approval === null) return false
  const { approvalDigest: _approvalDigest, approvalRef: _approvalRef, ...approvalMaterial } = approval.approval
  return canonicalDigest(approvalMaterial as StableHashValue) === approval.approvalDigest
    && approval.approvalRef === `action-preparation-approval:${approval.approvalDigest}`
    && approval.approvalDigest === expected.approvalDigest
    && approval.reviewDigest === expected.reviewDigest
    && approval.authorityScopeDigest === expected.authorityScopeDigest
    && approval.principalId === expected.principalId && approval.ownerId === expected.ownerId
    && approval.credentialId === expected.credentialId
    && canonicalDigest(approval.lineage as StableHashValue) === canonicalDigest(expected.lineage as StableHashValue)
}
