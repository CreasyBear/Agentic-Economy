import { v, type Infer } from 'convex/values'

import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import {
  bindRouteStepGrantToReservation,
  deriveRouteStepAuthority,
  reserveRouteStepSpend,
  routeStepGrantDigest,
  type RouteStepGrant,
} from '@/modules/customer-request/route-mandate-admission'
import type { RouteMandate, RouteMandateStep } from '@/modules/customer-request/route-mandate'
import { routeStepGrantValue } from '@/modules/customer-request/runtime'

import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { getEligibleExactCapabilitySupply } from './capabilitySupply'
import {
  readCurrentRouteMandateState,
  readCurrentRouteMandateStateForPrincipal,
} from './customerRequestRouteMandate'

const command = {
  requestId: v.string(),
  mandateRef: v.string(),
  expectedMandateDigest: v.string(),
  expectedGenerationRef: v.string(),
  expectedRoutePlanId: v.string(),
  expectedRouteDigest: v.string(),
  stepPosition: v.number(),
  expectedActionId: v.string(),
  expectedCapabilityId: v.string(),
  expectedCapabilityVersion: v.number(),
  expectedCapabilityContractDigest: v.string(),
  idempotencyKey: v.string(),
}
const commandValue = v.object(command)
export type RouteStepAdmissionCommand = Infer<typeof commandValue>

const result = v.union(
  v.object({ kind: v.literal('admitted'), grant: routeStepGrantValue }),
  v.object({ kind: v.literal('replayed'), grant: routeStepGrantValue }),
  v.object({ kind: v.literal('conflict'), reason: v.literal('command_changed') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('mandate_not_current'),
      v.literal('mandate_scope_mismatch'),
      v.literal('step_already_reserved'),
      v.literal('spend_limit_exceeded'),
    ),
  }),
)

export const admitStep = internalMutation({
  args: command,
  returns: result,
  handler: async () => { throw new Error('customer_request_tables_unlisted') },
})

export async function admitRouteStep(
  ctx: MutationCtx,
  args: RouteStepAdmissionCommand,
  verifiedPrincipalId?: string,
): Promise<Infer<typeof result>> {
    const now = Date.now()
    const current = verifiedPrincipalId === undefined
      ? await readCurrentRouteMandateState(
          ctx, args.requestId, now, { requireCurrentGraph: false },
        )
      : await readCurrentRouteMandateStateForPrincipal(
          ctx, args.requestId, verifiedPrincipalId, now, { requireCurrentGraph: false },
        )
    if (current.kind !== 'active') {
      return { kind: 'refused' as const, reason: 'mandate_not_current' as const }
    }
    const mandate = domainMandate(current.mandate)
    if (mandate.mandateRef !== args.mandateRef
      || mandate.mandateDigest !== args.expectedMandateDigest) {
      return { kind: 'refused' as const, reason: 'mandate_not_current' as const }
    }
    if (!validCommandMaterial(args)) {
      return { kind: 'refused' as const, reason: 'mandate_scope_mismatch' as const }
    }
    const commandKey = `route-step-admission:v1:${canonicalDigest({
      principalId: mandate.principal.principalId,
      requestId: args.requestId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const commandDigest = canonicalDigest(args)
    const priorCommand = await ctx.db.query('customerRequestRouteStepAdmissionCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (priorCommand !== null) {
      if (priorCommand.commandDigest !== commandDigest
        || priorCommand.principalId !== mandate.principal.principalId
        || priorCommand.requestId !== args.requestId
        || priorCommand.mandateRef !== mandate.mandateRef
        || priorCommand.actionId !== args.expectedActionId) {
        return { kind: 'conflict' as const, reason: 'command_changed' as const }
      }
      const reservation = await ctx.db.query('customerRequestRouteStepReservations')
        .withIndex('by_mandateRef_and_actionId', (query) => (
          query.eq('mandateRef', mandate.mandateRef).eq('actionId', args.expectedActionId)
        )).unique()
      const replayedGrant = reservation === null ? null : grantForReservation(mandate, reservation)
      if (reservation === null || replayedGrant === null
        || reservation.reservationRef !== priorCommand.reservationRef
        || reservation.grantRef !== priorCommand.grantRef
        || reservation.grantDigest !== priorCommand.grantDigest) {
        throw new Error('customer_request_route_step_admission_command_integrity_failure')
      }
      await assertDataReservationsIntegrity(ctx, reservation, replayedGrant)
      const mandateStep = mandate.route.steps.find((step) => (
        step.position === replayedGrant.step.position
      ))
      if (mandateStep === undefined
        || !await exactStepSupplyIsCurrent(
          ctx,
          current.networkId,
          replayedGrant,
          mandateStep,
          now,
        )) {
        return { kind: 'refused' as const, reason: 'mandate_scope_mismatch' as const }
      }
      return { kind: 'replayed' as const, grant: writableGrant(replayedGrant) }
    }

    const operationKeyDigest = canonicalDigest({
      principalId: mandate.principal.principalId,
      requestId: args.requestId,
      mandateRef: mandate.mandateRef,
      idempotencyKey: args.idempotencyKey,
    })
    const derived = deriveRouteStepAuthority({
      mandate,
      expectedMandateDigest: args.expectedMandateDigest,
      expectedGenerationRef: args.expectedGenerationRef,
      expectedRoutePlanId: args.expectedRoutePlanId,
      expectedRouteDigest: args.expectedRouteDigest,
      stepPosition: args.stepPosition,
      expectedActionId: args.expectedActionId,
      expectedCapabilityId: args.expectedCapabilityId,
      expectedCapabilityVersion: args.expectedCapabilityVersion,
      expectedCapabilityContractDigest: args.expectedCapabilityContractDigest,
      operationKeyDigest,
      now,
    })
    if (derived.kind !== 'derived') {
      return { kind: 'refused' as const, reason: 'mandate_scope_mismatch' as const }
    }
    const authority = derived.authority
    const mandateStep = mandate.route.steps.find((step) => step.position === authority.step.position)
    if (mandateStep === undefined
      || !await exactStepSupplyIsCurrent(ctx, current.networkId, authority, mandateStep, now)) {
      return { kind: 'refused' as const, reason: 'mandate_scope_mismatch' as const }
    }
    const priorStep = await ctx.db.query('customerRequestRouteStepReservations')
      .withIndex('by_mandateRef_and_actionId', (query) => (
        query.eq('mandateRef', mandate.mandateRef).eq('actionId', authority.step.actionId)
      )).unique()
    if (priorStep !== null) {
      const priorGrant = grantForReservation(mandate, priorStep)
      if (priorGrant === null) {
        throw new Error('customer_request_route_step_reservation_integrity_failure')
      }
      await assertDataReservationsIntegrity(ctx, priorStep, priorGrant)
      return { kind: 'refused' as const, reason: 'step_already_reserved' as const }
    }

    const reservations = await ctx.db.query('customerRequestRouteStepReservations')
      .withIndex('by_mandateRef_and_recordedAt', (query) => query.eq('mandateRef', mandate.mandateRef))
      .take(mandate.route.steps.length + 1)
    if (reservations.length > mandate.route.steps.length) {
      throw new Error('customer_request_route_step_budget_integrity_failure')
    }
    for (const reservation of reservations) {
      const priorGrant = grantForReservation(mandate, reservation)
      if (priorGrant === null) {
        throw new Error('customer_request_route_step_budget_integrity_failure')
      }
      await assertDataReservationsIntegrity(ctx, reservation, priorGrant)
    }
    const spendReservation = reserveRouteStepSpend({
      maximumTotalSpend: mandate.route.maximumTotalSpend,
      priorReservations: reservations.map((reservation) => reservation.reservedSpend),
      requestedReservation: authority.step.maximumSpend,
    })
    if (spendReservation.kind === 'refused'
      && spendReservation.reason === 'spend_reservation_invalid') {
      throw new Error('customer_request_route_step_budget_integrity_failure')
    }
    if (spendReservation.kind === 'refused') {
      return { kind: 'refused' as const, reason: 'spend_limit_exceeded' as const }
    }

    const recordedAt = authority.admittedAt
    const reservationMaterial = {
      mandateRef: mandate.mandateRef,
      mandateDigest: mandate.mandateDigest,
      requestId: args.requestId,
      routePlanId: authority.route.routePlanId,
      routeDigest: authority.route.routeDigest,
      generationRef: authority.route.generationRef,
      actionId: authority.step.actionId,
      position: authority.step.position,
      operationKeyDigest: authority.operationKeyDigest,
      reservedSpend: authority.step.maximumSpend,
      authorityDigest: authority.authorityDigest,
      recordedAt,
    }
    const reservationDigest = canonicalDigest(reservationMaterial)
    const reservationRef = `route-step-reservation:v1:${reservationDigest}`
    const grant = writableGrant(bindRouteStepGrantToReservation({
      authority,
      reservationRef,
      reservationDigest,
    }))
    const collision = await ctx.db.query('customerRequestRouteStepReservations')
      .withIndex('by_reservationRef', (query) => query.eq('reservationRef', reservationRef)).unique()
    if (collision !== null) throw new Error('customer_request_route_step_reservation_ref_collision')

    await ctx.db.insert('customerRequestRouteStepReservations', {
      reservationRef,
      reservationDigest,
      mandateRef: mandate.mandateRef,
      mandateDigest: mandate.mandateDigest,
      requestId: args.requestId,
      routePlanId: grant.route.routePlanId,
      routeDigest: grant.route.routeDigest,
      generationRef: grant.route.generationRef,
      actionId: grant.step.actionId,
      position: grant.step.position,
      operationKeyDigest: grant.operationKeyDigest,
      reservedSpend: { ...grant.step.maximumSpend },
      authorityDigest: grant.authorityDigest,
      grantRef: grant.grantRef,
      grantDigest: grant.grantDigest,
      recordedAt,
    })
    for (const scope of grant.step.dataScope) {
      for (const purpose of scope.purposes) {
        const allocation = {
          reservationRef,
          mandateRef: mandate.mandateRef,
          actionId: grant.step.actionId,
          effectId: scope.effectId,
          inputPointer: scope.inputPointer,
          classification: scope.classification,
          phase: scope.phase,
          recipient: scope.recipient,
          purpose,
          recordedAt,
        }
        const allocationDigest = canonicalDigest(allocation)
        const allocationRef = `route-data-reservation:v1:${allocationDigest}`
        const priorAllocation = await ctx.db.query('customerRequestRouteDataReservations')
          .withIndex('by_allocationRef', (query) => query.eq('allocationRef', allocationRef)).unique()
        if (priorAllocation !== null) {
          throw new Error('customer_request_route_data_reservation_ref_collision')
        }
        await ctx.db.insert('customerRequestRouteDataReservations', {
          allocationRef,
          allocationDigest,
          ...allocation,
          recipient: { ...scope.recipient },
        })
      }
    }
    await ctx.db.insert('customerRequestRouteStepAdmissionCommands', {
      commandKey,
      commandDigest,
      principalId: mandate.principal.principalId,
      requestId: args.requestId,
      mandateRef: mandate.mandateRef,
      actionId: grant.step.actionId,
      reservationRef,
      grantRef: grant.grantRef,
      grantDigest: grant.grantDigest,
      committedAt: recordedAt,
    })
    return { kind: 'admitted' as const, grant }
}

function validGrant(grant: RouteStepGrant): boolean {
  return grant.grantRef === `route-step-grant:v1:${grant.grantDigest}`
    && routeStepGrantDigest(grant) === grant.grantDigest
}

function validReservation(
  reservation: Doc<'customerRequestRouteStepReservations'>,
  grant: RouteStepGrant,
): boolean {
  const material = {
    mandateRef: reservation.mandateRef,
    mandateDigest: reservation.mandateDigest,
    requestId: reservation.requestId,
    routePlanId: reservation.routePlanId,
    routeDigest: reservation.routeDigest,
    generationRef: reservation.generationRef,
    actionId: reservation.actionId,
    position: reservation.position,
    operationKeyDigest: reservation.operationKeyDigest,
    reservedSpend: reservation.reservedSpend,
    authorityDigest: reservation.authorityDigest,
    recordedAt: reservation.recordedAt,
  }
  return validGrant(grant)
    && reservation.reservationRef === `route-step-reservation:v1:${reservation.reservationDigest}`
    && canonicalDigest(material) === reservation.reservationDigest
    && grant.mandateRef === reservation.mandateRef
    && grant.mandateDigest === reservation.mandateDigest
    && grant.request.requestId === reservation.requestId
    && grant.route.routePlanId === reservation.routePlanId
    && grant.route.routeDigest === reservation.routeDigest
    && grant.route.generationRef === reservation.generationRef
    && grant.step.actionId === reservation.actionId
    && grant.step.position === reservation.position
    && grant.operationKeyDigest === reservation.operationKeyDigest
    && grant.authorityDigest === reservation.authorityDigest
    && grant.admission.reservationRef === reservation.reservationRef
    && grant.admission.reservationDigest === reservation.reservationDigest
    && grant.grantRef === reservation.grantRef
    && grant.grantDigest === reservation.grantDigest
    && canonicalDigest(grant.step.maximumSpend) === canonicalDigest(reservation.reservedSpend)
    && grant.admittedAt === reservation.recordedAt
}

function grantForReservation(
  mandate: RouteMandate,
  reservation: Doc<'customerRequestRouteStepReservations'>,
): RouteStepGrant | null {
  const step = mandate.route.steps.find((candidate) => candidate.position === reservation.position)
  if (step === undefined) return null
  const derived = deriveRouteStepAuthority({
    mandate,
    expectedMandateDigest: mandate.mandateDigest,
    expectedGenerationRef: mandate.route.generationRef,
    expectedRoutePlanId: mandate.route.routePlanId,
    expectedRouteDigest: mandate.route.routeDigest,
    stepPosition: step.position,
    expectedActionId: step.actionId,
    expectedCapabilityId: step.contractRef.capabilityId,
    expectedCapabilityVersion: step.contractRef.version,
    expectedCapabilityContractDigest: step.contractRef.contractDigest,
    operationKeyDigest: reservation.operationKeyDigest,
    now: reservation.recordedAt,
  })
  if (derived.kind !== 'derived' || derived.authority.authorityDigest !== reservation.authorityDigest) {
    return null
  }
  const grant = bindRouteStepGrantToReservation({
    authority: derived.authority,
    reservationRef: reservation.reservationRef,
    reservationDigest: reservation.reservationDigest,
  })
  return validReservation(reservation, grant) ? grant : null
}

async function assertDataReservationsIntegrity(
  ctx: Pick<MutationCtx, 'db'>,
  reservation: Doc<'customerRequestRouteStepReservations'>,
  grant: RouteStepGrant,
): Promise<void> {
  const expected = grant.step.dataScope.flatMap((scope: RouteStepGrant['step']['dataScope'][number]) => scope.purposes.map((purpose: RouteStepGrant['step']['dataScope'][number]['purposes'][number]) => ({
    reservationRef: reservation.reservationRef,
    mandateRef: grant.mandateRef,
    actionId: grant.step.actionId,
    effectId: scope.effectId,
    inputPointer: scope.inputPointer,
    classification: scope.classification,
    phase: scope.phase,
    recipient: scope.recipient,
    purpose,
    recordedAt: grant.admittedAt,
  })))
  const rows = await ctx.db.query('customerRequestRouteDataReservations')
    .withIndex('by_reservationRef', (query) => query.eq('reservationRef', reservation.reservationRef))
    .take(expected.length + 1)
  if (rows.length !== expected.length || rows.some((row) => {
    const material = {
      reservationRef: row.reservationRef,
      mandateRef: row.mandateRef,
      actionId: row.actionId,
      effectId: row.effectId,
      inputPointer: row.inputPointer,
      classification: row.classification,
      phase: row.phase,
      recipient: row.recipient,
      purpose: row.purpose,
      recordedAt: row.recordedAt,
    }
    const digest = canonicalDigest(material)
    return row.allocationDigest !== digest
      || row.allocationRef !== `route-data-reservation:v1:${digest}`
      || !expected.some((candidate: (typeof expected)[number]) => canonicalDigest(candidate) === digest)
  })) {
    throw new Error('customer_request_route_data_reservation_integrity_failure')
  }
}

function writableGrant(value: RouteStepGrant) {
  return {
    ...value,
    request: { ...value.request },
    route: { ...value.route },
    step: {
      ...value.step,
      contractRef: { ...value.step.contractRef },
      maximumSpend: { ...value.step.maximumSpend },
      dataScope: value.step.dataScope.map((scope: RouteStepGrant['step']['dataScope'][number]) => ({
        ...scope,
        recipient: { ...scope.recipient },
        purposes: [...scope.purposes],
      })),
      effects: value.step.effects.map((effect) => ({ ...effect })),
      evidence: value.step.evidence.map((evidence) => ({ ...evidence })),
      cancellation: {
        ...value.step.cancellation,
        evidenceRefs: [...value.step.cancellation.evidenceRefs],
      },
      recovery: { ...value.step.recovery },
    },
    fallbackUse: { ...value.fallbackUse },
  }
}

function domainMandate(value: unknown): RouteMandate {
  return value as RouteMandate
}

function validCommandMaterial(value: Readonly<{
  requestId: string
  mandateRef: string
  expectedMandateDigest: string
  expectedGenerationRef: string
  expectedRoutePlanId: string
  expectedRouteDigest: string
  stepPosition: number
  expectedActionId: string
  expectedCapabilityId: string
  expectedCapabilityVersion: number
  expectedCapabilityContractDigest: string
  idempotencyKey: string
}>): boolean {
  return [
    value.requestId,
    value.mandateRef,
    value.expectedGenerationRef,
    value.expectedRoutePlanId,
    value.expectedActionId,
    value.expectedCapabilityId,
    value.idempotencyKey,
  ].every((candidate) => candidate.trim().length > 0)
    && isCanonicalDigest(value.expectedMandateDigest)
    && isCanonicalDigest(value.expectedRouteDigest)
    && isCanonicalDigest(value.expectedCapabilityContractDigest)
    && Number.isSafeInteger(value.stepPosition)
    && value.stepPosition >= 1
    && Number.isSafeInteger(value.expectedCapabilityVersion)
    && value.expectedCapabilityVersion >= 1
}

async function exactStepSupplyIsCurrent(
  ctx: Pick<MutationCtx, 'db'>,
  networkId: string,
  authority: Parameters<typeof bindRouteStepGrantToReservation>[0]['authority'],
  mandateStep: RouteMandateStep,
  now: number,
): Promise<boolean> {
  const supply = await getEligibleExactCapabilitySupply(ctx.db, {
    networkId,
    businessId: authority.step.businessId,
    offeringId: authority.step.offeringId,
    bindingId: authority.step.bindingId,
    contractRef: authority.step.contractRef,
    expectedOfferingRegistrationHash: authority.step.offeringRegistrationHash,
    expectedBindingRegistrationHash: authority.step.bindingRegistrationHash,
    now,
  })
  if (supply.kind !== 'available'
    || canonicalDigest(supply.offering.presentation.price) !== canonicalDigest(mandateStep.price)
    || canonicalDigest(supply.binding.cancellation) !== canonicalDigest(mandateStep.cancellation)) {
    return false
  }
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', authority.step.publicationRef)
        .eq('revision', authority.step.publicationRevision)
    )).unique()
  const current = publication !== null
    && publication.disposition === 'current'
    && String(publication.businessId) === authority.step.businessId
    && publication.networkId === networkId
    && publication.offeringId === authority.step.offeringId
    && publication.bindingId === authority.step.bindingId
    && publication.capabilityId === authority.step.contractRef.capabilityId
    && publication.version === authority.step.contractRef.version
    && publication.contractDigest === authority.step.contractRef.contractDigest
    && publication.credentialState === 'ready'
    && publication.healthState === 'healthy'
    && publication.readinessObservedAt !== undefined
    && publication.readinessObservedAt <= now
    && publication.readinessValidUntil !== undefined
    && publication.readinessValidUntil >= now
  return current
}
