import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  preflightRouteTransportCredential,
  type PreparedRouteTransportInvocation,
  type RouteTransportInvocation,
  type RouteTransportObservation,
  type RouteTransportRuntime,
  type X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { exactAmountSchema } from '@/modules/money/public'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  DynamicPublishedInvocationInput,
  DynamicPublishedInvocationResult,
} from './dynamic-published-contract'
import type { PublishedOperation, RuntimePublishedOperationDescriptor } from '@/modules/capability-supply/public'
import { executableFixedPrice } from './dynamic-published-contract'
import {
  x402CustodyDigestReferenceValid,
  x402PaymentAttemptKey,
  type X402PaymentAttempt,
  type X402PaymentAttemptPort,
  type X402PaymentAuthorizationEvent,
} from './x402-payment-attempt'
import { recordCapabilityCallObservation, type CapabilityLiquidityWritePort, type LiquidityEnvironment, type LiquidityZeroReason } from '@/modules/capability-supply/public'

export type DynamicPublishedExecutionToken = Readonly<{
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  authorityRef: string
  mandateDigest: string
  grantDigest: string
  expiresAt: number
}>
export type DynamicPublishedPreparedTransport = Readonly<{
  invocationRef: string
  operationKey: string
  taskDigest?: string
  attemptRef: string
  effectGeneration: number
  plan: PreparedRouteTransportInvocation
}>
export async function prepareDynamicPublishedTransport(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  invocation: DynamicPublishedInvocationInput
  token: DynamicPublishedExecutionToken
  runtime: RouteTransportRuntime
}>):
  Promise<
    | Readonly<{ kind: 'prepared'; prepared: DynamicPublishedPreparedTransport }>
    | Readonly<{ kind: 'refused'; result: DynamicPublishedInvocationResult }>
  > {
  const transportInvocation = dynamicTransportInvocation(input)
  const preparation = prepareRegisteredRouteTransportInvocation(
    transportInvocation,
    input.runtime.x402PaymentSigningAvailable ?? (() => false),
  )
  if (preparation.kind === 'refused') {
    return {
      kind: 'refused',
      result: observationResult(input.operation, input.descriptor, preparation.observation),
    }
  }
  if (transportInvocation.binding.authority.kind === 'provider_connection') {
    const preflight = await preflightRouteTransportCredential(transportInvocation, input.runtime)
    if (preflight.kind === 'unavailable') {
      return {
        kind: 'refused',
        result: {
          kind: 'published_operation_refused',
          sourceDisposition: 'refused',
          operationId: input.operation.operationId,
          operationVersion: input.descriptor.version,
          requestDigest: preparation.prepared.requestDigest,
          failureCode: preflight.failureCode,
        },
      }
    }
  }
  return {
    kind: 'prepared',
    prepared: {
      invocationRef: input.token.invocationRef,
      operationKey: input.invocation.operationKey,
      taskDigest: input.invocation.inputDigest,
      attemptRef: input.token.attemptRef,
      effectGeneration: input.token.effectGeneration,
      plan: preparation.prepared,
    },
  }
}
export async function executeDynamicPublishedTransport(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  prepared: DynamicPublishedPreparedTransport
  runtime: RouteTransportRuntime
  paymentAttempts?: Map<string, X402PaymentAttempt>
  paymentAttemptPort?: X402PaymentAttemptPort
  paymentAuthorizationEvents?: Map<string, X402PaymentAuthorizationEvent>
  now?: () => number
  liquidityPort?: CapabilityLiquidityWritePort
  taskStartedAt?: number
  environment?: LiquidityEnvironment
}>): Promise<DynamicPublishedInvocationResult> {
  const runtime = input.paymentAttempts === undefined && input.paymentAttemptPort === undefined
    ? input.runtime
    : createPaymentAttemptRuntime(
        input.runtime,
        input.prepared,
        input.paymentAttempts,
        input.paymentAuthorizationEvents,
        input.now ?? Date.now,
        input.paymentAttemptPort,
      )
  const eventKey = x402PaymentAttemptKey(input.prepared)
  let observation: Awaited<ReturnType<typeof invokePreparedRouteTransport>>
  try {
    observation = await invokePreparedRouteTransport(input.prepared.plan, runtime)
  } catch (error) {
    if ((input.paymentAuthorizationEvents !== undefined || input.paymentAttemptPort !== undefined)
      && input.paymentAttemptPort?.loadAuthorizationEvent(eventKey) === undefined
      && !input.paymentAuthorizationEvents?.has(eventKey)) {
      const event = {
        invocationRef: input.prepared.invocationRef,
        attemptRef: input.prepared.attemptRef,
        effectGeneration: input.prepared.effectGeneration,
        operationKey: input.prepared.operationKey,
        queryRelease: 'released',
        authorization: 'unknown',
        recordedAt: (input.now ?? Date.now)(),
      } as const
      await input.paymentAttemptPort?.persist({ authorizationEvent: event })
      input.paymentAuthorizationEvents?.set(eventKey, event)
    }
    throw error
  }
  if ((input.paymentAuthorizationEvents !== undefined || input.paymentAttemptPort !== undefined)
    && input.paymentAttemptPort?.loadAuthorizationEvent(eventKey) === undefined
    && !input.paymentAuthorizationEvents?.has(eventKey)
    && observation.releaseStarted) {
    const event = {
      invocationRef: input.prepared.invocationRef,
      attemptRef: input.prepared.attemptRef,
      effectGeneration: input.prepared.effectGeneration,
      operationKey: input.prepared.operationKey,
      queryRelease: 'released',
      authorization: 'not_created',
      recordedAt: (input.now ?? Date.now)(),
      ...(observation.paymentChallengeDigest === undefined
        ? {}
        : { challengeDigest: observation.paymentChallengeDigest }),
    } as const
    await input.paymentAttemptPort?.persist({ authorizationEvent: event })
    input.paymentAuthorizationEvents?.set(eventKey, event)
  }
  const result = observationResult(input.operation, input.descriptor, observation)
  const observedAt = (input.now ?? Date.now)()
  if (input.liquidityPort !== undefined) {
    const outcome = observation.disposition === 'succeeded' ? 'filled' as const : 'zero' as const
    const evidenceRefs = observation.responseDigest === undefined
      ? [observation.failureCode ?? `transport:${observation.transport}`]
      : [observation.responseDigest]
    await recordCapabilityCallObservation({
      businessId: input.operation.identity.businessId,
      offeringRef: input.operation.identity.offeringId,
      taskDigest: input.prepared.taskDigest ?? input.prepared.operationKey,
      outcome,
      ...(outcome === 'zero' ? { zeroReason: liquidityZeroReason(observation.failureCode) } : {}),
      taskStartedAt: input.taskStartedAt ?? observedAt,
      ...(outcome === 'filled' ? { successfulAt: observedAt } : {}),
      observedAt,
      evidenceRefs,
      environment: input.environment ?? 'development',
    }, input.liquidityPort)
  }
  if (
    observation.releaseStarted
    && (
      observation.disposition === 'unknown'
      || observation.failureCode === 'payment_requirement_outside_authority'
    )
  ) {
    throw new Error(`published_operation_outcome_unknown:${observation.failureCode ?? 'unknown'}`)
  }
  if (observation.paymentAuthorizationStatus === 'created'
    && result.kind !== 'published_operation_succeeded') {
    if (input.paymentAttempts !== undefined || input.paymentAttemptPort !== undefined) {
      const key = x402PaymentAttemptKey({
        invocationRef: input.prepared.invocationRef,
        attemptRef: input.prepared.attemptRef,
        effectGeneration: input.prepared.effectGeneration,
      })
      const current = input.paymentAttemptPort?.load(key) ?? input.paymentAttempts?.get(key)
      if (current !== undefined) {
        const updated = {
          ...current,
          state: 'reconciliation_required',
        } as const
        const authorizationEvent = input.paymentAttemptPort?.loadAuthorizationEvent(key)
          ?? input.paymentAuthorizationEvents?.get(key)
        if (authorizationEvent !== undefined) {
          await input.paymentAttemptPort?.persist({ attempt: updated, authorizationEvent })
        }
        input.paymentAttempts?.set(key, updated)
      }
    }
    throw new Error(
      `published_operation_payment_reconciliation_required:${result.failureCode ?? result.kind}`,
    )
  }
  return result
}

function liquidityZeroReason(failureCode: string | undefined): LiquidityZeroReason {
  switch (failureCode) {
    case 'credential_unavailable': return 'credential_unavailable'
    case 'price_unavailable': return 'price_unavailable'
    case 'insufficient_credit': return 'insufficient_credit'
    case 'input_invalid':
    case 'published_operation_input_invalid': return 'input_invalid'
    case 'outcome_unknown': return 'outcome_unknown'
    case 'readiness_unavailable': return 'readiness_unavailable'
    default: return 'provider_refused'
  }
}
export function createPaymentAttemptRuntime(
  runtime: RouteTransportRuntime,
  prepared: DynamicPublishedPreparedTransport,
  attempts: Map<string, X402PaymentAttempt> | undefined,
  authorizationEvents: Map<string, X402PaymentAuthorizationEvent> | undefined,
  now: () => number,
  attemptPort?: X402PaymentAttemptPort,
): X402RouteTransportRuntime {
  const key = x402PaymentAttemptKey({
    invocationRef: prepared.invocationRef,
    attemptRef: prepared.attemptRef,
    effectGeneration: prepared.effectGeneration,
  })
  const custodyRuntime = runtime as Partial<X402RouteTransportRuntime>
  let volatileCustodyRef: string | undefined
  return {
    ...runtime,
    async prepareX402PaymentAuthorization(request) {
      const current = attemptPort?.load(key) ?? attempts?.get(key)
      if (current !== undefined) {
        if (current.paymentIdentifier !== request.paymentIdentifier
          || current.challengeDigest !== request.challengeDigest
          || current.attemptRef !== request.attemptRef
          || current.effectGeneration !== request.effectGeneration) {
          throw new Error('x402_payment_attempt_attribution_invalid')
        }
        if (current.state !== 'prepared') {
          throw new Error('x402_payment_attempt_reconciliation_required')
        }
        return {
          custodyRef: current.custodyRef,
          authorizationDigest: current.authorizationDigest,
        }
      }
      if (typeof custodyRuntime.prepareX402PaymentAuthorization !== 'function'
        || typeof custodyRuntime.readX402PaymentAuthorization !== 'function'
        || typeof custodyRuntime.readX402PaymentAuthorizationByDigest !== 'function') {
        throw new Error('x402_payment_custody_prepare_unavailable')
      }
      const amount = request.paymentAmount
      if (!exactAmountSchema.safeParse(amount).success) {
        throw new Error('x402_payment_amount_invalid')
      }
      const authorization = await custodyRuntime.prepareX402PaymentAuthorization(request)
      if (authorization === undefined) return undefined
      volatileCustodyRef = authorization.custodyRef
      if (!x402CustodyDigestReferenceValid(authorization.custodyRef)) {
        throw new Error('x402_payment_custody_reference_invalid')
      }
      const paymentAttempt: X402PaymentAttempt = {
        paymentIdentifier: request.paymentIdentifier,
        invocationRef: prepared.invocationRef,
        attemptRef: prepared.attemptRef,
        effectGeneration: prepared.effectGeneration,
        operationKey: prepared.operationKey,
        challengeDigest: request.challengeDigest,
        scheme: request.selectedRequirement.scheme,
        network: request.selectedRequirement.network,
        asset: request.selectedRequirement.asset,
        payTo: request.selectedRequirement.payTo,
        amount,
        providerEndpoint: request.challenge.resource.url,
        operationRevision: prepared.plan.invocation.authority.capabilityContractDigest,
        authorizationDigest: authorization.authorizationDigest,
        custodyRef: authorization.custodyRef,
        state: 'prepared',
        preparedAt: now(),
        evidenceRefs: [],
      }
      const authorizationEvent = {
        invocationRef: prepared.invocationRef,
        attemptRef: prepared.attemptRef,
        effectGeneration: prepared.effectGeneration,
        operationKey: prepared.operationKey,
        queryRelease: 'released',
        authorization: 'created',
        recordedAt: paymentAttempt.preparedAt,
        challengeDigest: paymentAttempt.challengeDigest,
        authorizationDigest: authorization.authorizationDigest,
      } as const
      await attemptPort?.persist({ attempt: paymentAttempt, authorizationEvent })
      attempts?.set(key, paymentAttempt)
      authorizationEvents?.set(key, authorizationEvent)
      return authorization
    },
    async readX402PaymentAuthorization(authorization) {
      const current = attemptPort?.load(key) ?? attempts?.get(key)
      if (current === undefined
        || current.state !== 'prepared'
        || !custodyReferenceMatches(current.custodyRef, authorization.custodyRef)
        || current.authorizationDigest !== authorization.authorizationDigest) {
        throw new Error('x402_payment_attempt_reconciliation_required')
      }
      if (typeof custodyRuntime.readX402PaymentAuthorization !== 'function'
        || typeof custodyRuntime.readX402PaymentAuthorizationByDigest !== 'function') {
        throw new Error('x402_payment_custody_read_unavailable')
      }
      const custodyReader = volatileCustodyRef === undefined
        ? custodyRuntime.readX402PaymentAuthorizationByDigest
        : custodyRuntime.readX402PaymentAuthorization
      return custodyReader({
        ...authorization,
        custodyRef: volatileCustodyRef ?? authorization.custodyRef,
      })
    },
    async readX402PaymentAuthorizationByDigest(authorization) {
      const current = attemptPort?.load(key) ?? attempts?.get(key)
      if (current === undefined
        || current.state !== 'prepared'
        || !custodyReferenceMatches(current.custodyRef, authorization.custodyRef)
        || current.authorizationDigest !== authorization.authorizationDigest) {
        throw new Error('x402_payment_attempt_reconciliation_required')
      }
      if (typeof custodyRuntime.readX402PaymentAuthorizationByDigest !== 'function') {
        throw new Error('x402_payment_custody_read_unavailable')
      }
      return custodyRuntime.readX402PaymentAuthorizationByDigest(authorization)
    },
    async markX402PaymentPossiblySubmitted(event) {
      const current = attemptPort?.load(key) ?? attempts?.get(key)
      if (current === undefined
        || !custodyReferenceMatches(current.custodyRef, event.custodyRef)
        || current.challengeDigest !== event.challengeDigest) {
        throw new Error('x402_payment_attempt_attribution_invalid')
      }
      const updated = {
        ...current,
        state: 'possibly_submitted',
        submissionStartedAt: now(),
      } as const
      const authorizationEvent = attemptPort?.loadAuthorizationEvent(key)
        ?? authorizationEvents?.get(key)
      if (authorizationEvent === undefined) throw new Error('x402_payment_authorization_event_missing')
      await attemptPort?.persist({ attempt: updated, authorizationEvent })
      attempts?.set(key, updated)
    },
    async observeX402PaymentAttempt(event) {
      const current = attemptPort?.load(key) ?? attempts?.get(key)
      if (current === undefined
        || !custodyReferenceMatches(current.custodyRef, event.custodyRef)) {
        throw new Error('x402_payment_attempt_attribution_invalid')
      }
      const updated = {
        ...current,
        state: event.state,
        observedAt: now(),
        evidenceRefs: event.evidenceRefs,
      } as const
      const authorizationEvent = attemptPort?.loadAuthorizationEvent(key)
        ?? authorizationEvents?.get(key)
      if (authorizationEvent === undefined) throw new Error('x402_payment_authorization_event_missing')
      await attemptPort?.persist({ attempt: updated, authorizationEvent })
      attempts?.set(key, updated)
    },
  }
}

function custodyReferenceMatches(persisted: string, candidate: string): boolean {
  return persisted === candidate
}

function dynamicTransportInvocation(input: Readonly<{
  operation: PublishedOperation
  invocation: DynamicPublishedInvocationInput
  token: DynamicPublishedExecutionToken
}>): RouteTransportInvocation {
  const price = executableFixedPrice(input.operation)
  const bindingBase = {
    adapterId: input.operation.binding.adapter.adapterId,
    endpointUrl: input.operation.binding.endpointUrl,
    configJson: input.operation.transport.configJson,
    configDigest: input.operation.transport.configDigest,
  }
  const authorityBase = {
    attemptRef: input.token.attemptRef,
    effectGeneration: input.token.effectGeneration,
    operationKeyDigest: input.invocation.operationKey,
    mandateDigest: input.token.mandateDigest,
    grantDigest: input.token.grantDigest,
    capabilityContractDigest: input.operation.identity.contractDigest,
    maximumSpend: price,
    expiresAt: input.token.expiresAt,
    callIdentity: {
      keyId: `invocation:${input.token.authorityRef}`,
      signature: canonicalDigest({
        operationKey: input.invocation.operationKey,
        attemptRef: input.token.attemptRef,
        effectGeneration: input.token.effectGeneration,
      }),
    },
  }
  const inputJson = JSON.stringify(input.invocation.input)
  if (input.operation.binding.authority.kind === 'keyless') {
    return {
      binding: {
        ...bindingBase,
        authority: input.operation.binding.authority,
      },
      authority: authorityBase,
      inputJson,
    }
  }
  const connectionAuthority = input.operation.connectionAuthority
  if (connectionAuthority === undefined) {
    throw new Error('published_operation_connection_authority_missing')
  }
  return {
    binding: {
      ...bindingBase,
      authority: input.operation.binding.authority,
    },
    authority: {
      ...authorityBase,
      authorityGeneration: connectionAuthority.authorityGeneration,
      authorityDigest: connectionAuthority.authorityDigest,
    },
    inputJson,
  }
}

function observationResult(
  operation: PublishedOperation,
  descriptor: RuntimePublishedOperationDescriptor,
  observation: RouteTransportObservation,
): DynamicPublishedInvocationResult {
  const common = {
    operationId: operation.operationId,
    operationVersion: descriptor.version,
    requestDigest: observation.requestDigest,
    ...(observation.responseDigest === undefined ? {} : { responseDigest: observation.responseDigest }),
    ...(observation.providerReceipt === undefined ? {} : { providerReceipt: observation.providerReceipt }),
    ...(observation.paymentProof === undefined ? {} : { paymentProof: observation.paymentProof }),
    ...(observation.paymentChallengeDigest === undefined
      ? {}
      : { paymentChallengeDigest: observation.paymentChallengeDigest }),
    ...(observation.failureCode === undefined ? {} : { failureCode: observation.failureCode }),
  }
  if (observation.disposition !== 'succeeded' || observation.outputJson === undefined) {
    return {
      kind: 'published_operation_refused',
      sourceDisposition: 'refused',
      ...common,
    }
  }
  const output = JSON.parse(observation.outputJson) as StableHashValue
  if (!descriptor.validateOutput(output)) {
    return {
      kind: 'published_operation_invalid_evidence',
      sourceDisposition: 'refused',
      ...common,
      failureCode: 'output_schema_invalid',
    }
  }
  return {
    kind: 'published_operation_succeeded',
    sourceDisposition: 'succeeded',
    ...common,
    output,
  }
}
