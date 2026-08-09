import type { CustomerRequestCanonicalClaimMaterial } from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { routeAttemptIntegrityValid } from '../journal/integrity'

import type { RouteMandate } from '../../route-mandate'
import type { CancelOpenPorts } from './cancel-ports'
import type { OpenCancellationResult } from './types'
type ActiveCancellationMandate = Readonly<{
  kind: 'active'
  mandateRef: string
  mandateDigest: string
  networkId: string
  mandate: RouteMandate
}>

type CancellationOpenInvocation = Extract<OpenCancellationResult, { kind: 'available' }>['invocation']
  & Readonly<{ canonical: CustomerRequestCanonicalClaimMaterial }>

export async function openCancellationAttempt(
  args: Readonly<{ cancellationRef: string }>,
  ports: CancelOpenPorts,
): Promise<OpenCancellationResult> {
  const cancellation = await ports.loadCancellationAttempt(args.cancellationRef)
  if (cancellation === null || cancellation.state !== 'pending') {
    return { kind: 'unavailable' }
  }
  const attempt = await ports.loadAttemptByRef(cancellation.attemptRef)
  const run = attempt === null ? null : await ports.loadRunByRef(attempt.runRef)
  if (attempt === null || run === null || attempt.runRef !== cancellation.runRef
    || run.requestId !== attempt.requestId || run.principalId !== attempt.grant.principalId
    || attempt.operationKeyDigest !== cancellation.operationKeyDigest
    || attempt.grant.step.cancellation.kind !== 'adapter_managed'
    || (attempt.state !== 'dispatched' && attempt.state !== 'accepted')
    || !routeAttemptIntegrityValid(attempt)) {
    return { kind: 'unavailable' }
  }
  const now = ports.now()
  const mandate = await ports.loadActiveMandateForCancellation(
    attempt.requestId, attempt.grant.principalId, now,
  ) as ActiveCancellationMandate | { kind: 'missing' }
  if (mandate.kind !== 'active' || mandate.mandateRef !== attempt.grant.mandateRef
    || mandate.mandateDigest !== attempt.grant.mandateDigest
    || mandate.mandate.mandateRef !== attempt.grant.mandateRef
    || mandate.mandate.mandateDigest !== attempt.grant.mandateDigest) {
    return { kind: 'unavailable' }
  }
  const supply = await ports.loadEligibleExactCapabilitySupply({
    networkId: mandate.networkId,
    businessId: attempt.grant.step.businessId,
    offeringId: attempt.grant.step.offeringId,
    bindingId: attempt.grant.step.bindingId,
    contractRef: attempt.grant.step.contractRef,
    expectedOfferingRegistrationHash: attempt.grant.step.offeringRegistrationHash,
    expectedBindingRegistrationHash: attempt.grant.step.bindingRegistrationHash,
    now,
  })
  if (supply.kind !== 'available') return { kind: 'unavailable' }
  if (
    mandate.mandate.request.requestId !== run.requestId
    || mandate.mandate.request.requestRevision !== run.requestRevision
    || mandate.mandate.principal.principalId !== attempt.grant.principalId
    || mandate.mandate.route.generationRef !== attempt.grant.route.generationRef
    || mandate.mandate.route.routePlanId !== attempt.grant.route.routePlanId
    || mandate.mandate.route.routeDigest !== attempt.grant.route.routeDigest
  ) return { kind: 'unavailable' }
  const targetDigest = canonicalDigest({
    kind: 'cancellation',
    operationRef: attempt.grant.step.operationRef,
    publicationRef: attempt.grant.step.publicationRef,
    publicationRevision: attempt.grant.step.publicationRevision,
    bindingId: attempt.grant.step.bindingId,
    bindingRegistrationHash: attempt.grant.step.bindingRegistrationHash,
    adapterId: supply.binding.adapterId,
    configDigest: supply.binding.configDigest,
    endpointUrl: supply.binding.endpointUrl,
    cancellation: attempt.grant.step.cancellation,
  } as StableHashValue)
  const consequence = `customer_request_route_cancellation:${canonicalDigest({
    effects: attempt.grant.step.effects,
    cancellation: attempt.grant.step.cancellation,
  } as StableHashValue)}`
  const acceptedBasis = mandate.mandate.authorization.kind === 'explicit'
    ? {
        kind: 'customer_request_mandate_use' as const,
        mandateRef: mandate.mandate.mandateRef,
        mandateDigest: mandate.mandate.mandateDigest,
        requestRevision: mandate.mandate.request.requestRevision,
        routeGeneration: mandate.mandate.route.generation,
        authorization: {
          kind: 'explicit' as const,
          authorizationEvidenceRef: mandate.mandate.authorization.authorizationEvidenceRef,
          authorizationEvidenceDigest: mandate.mandate.authorization.authorizationEvidenceDigest,
        },
        grantRef: attempt.grant.grantRef,
        grantDigest: attempt.grant.grantDigest,
      }
    : {
        kind: 'customer_request_mandate_use' as const,
        mandateRef: mandate.mandate.mandateRef,
        mandateDigest: mandate.mandate.mandateDigest,
        requestRevision: mandate.mandate.request.requestRevision,
        routeGeneration: mandate.mandate.route.generation,
        authorization: {
          kind: 'standing_low_risk' as const,
          standingPolicyRef: mandate.mandate.authorization.standingPolicyRef,
          standingPolicyDigest: mandate.mandate.authorization.standingPolicyDigest,
          authorityUseRef: mandate.mandate.authorization.authorityUseRef,
        },
        grantRef: attempt.grant.grantRef,
        grantDigest: attempt.grant.grantDigest,
      }
  const recordedAt = new Date(cancellation.requestedAt).toISOString()
  const cancellationAttemptRef = `action-attempt:customer-request-route-cancellation:${cancellation.cancellationRef}`
  const canonical = {
    invocationRef: `action-invocation:customer-request-route-cancellation:${cancellation.cancellationRef}`,
    sourceRef: cancellation.cancellationRef,
    invocationVersion: 1,
    actor: {
      callerRef: 'runtime:customer-request-route-cancellation',
      principalRef: attempt.grant.principalId,
    },
    origin: {
      kind: 'request_owned' as const,
      requestRef: run.requestId,
      revision: run.requestRevision,
    },
    action: {
      id: `${attempt.grant.step.actionId}.cancel`,
      contractVersion: String(attempt.grant.step.contractRef.version),
    },
    materialInputDigest: canonicalDigest({
      cancellationRef: cancellation.cancellationRef,
      operationKeyDigest: cancellation.operationKeyDigest,
    }),
    authority: {
      reference: attempt.grant.grantRef,
      decisionDigest: attempt.grant.grantDigest,
      targetDigest,
      consequence,
      limits: { amount: { ...attempt.grant.step.maximumSpend } },
      expiresAt: new Date(attempt.grant.expiresAt).toISOString(),
      acceptedBasis,
    },
    attempt: {
      attemptRef: cancellationAttemptRef,
      attemptNumber: 1,
      effectGeneration: 1,
      operationKey: cancellation.operationKeyDigest,
      leaseOwner: `customer-request-route-cancellation:${cancellation.cancellationRef}`,
      leaseExpiresAt: new Date(cancellation.requestedAt + 30_000).toISOString(),
    },
    recordedAt,
  } satisfies CustomerRequestCanonicalClaimMaterial
  const invocation = {
    cancellationRef: cancellation.cancellationRef,
    attemptRef: attempt.attemptRef,
    requestId: attempt.requestId,
    requestRevision: run.requestRevision,
    principalId: attempt.grant.principalId,
    mandateRef: attempt.grant.mandateRef,
    operationKeyDigest: attempt.operationKeyDigest,
    grantRef: attempt.grant.grantRef,
    authorityDigest: attempt.grant.authorityDigest,
    actionId: attempt.grant.step.actionId,
    position: attempt.grant.step.position,
    binding: { ...supply.binding },
    authority: {
      mandateDigest: attempt.grant.mandateDigest,
      grantDigest: attempt.grant.grantDigest,
      capabilityContractDigest: attempt.grant.step.contractRef.contractDigest,
      maximumSpend: { ...attempt.grant.step.maximumSpend },
      expiresAt: attempt.grant.expiresAt,
    },
    canonical,
  } as CancellationOpenInvocation
  return {
    kind: 'available',
    invocation: invocation as Extract<OpenCancellationResult, { kind: 'available' }>['invocation'],
  }
}
