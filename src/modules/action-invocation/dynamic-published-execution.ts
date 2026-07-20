import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type PreparedRouteTransportInvocation,
  type RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  DynamicPublishedInvocationInput,
  DynamicPublishedInvocationResult,
} from './dynamic-published-contract'
import type { PublishedOperation, RuntimePublishedOperationDescriptor } from '@/modules/capability-supply/public'
import { executableFixedPrice } from './dynamic-published-contract'
import {
  x402PaymentAttemptKey,
  type X402PaymentAttempt,
  type X402PaymentAuthorizationEvent,
} from './x402-payment-attempt'

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
  attemptRef: string
  effectGeneration: number
  plan: PreparedRouteTransportInvocation
}>

export function prepareDynamicPublishedTransport(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  invocation: DynamicPublishedInvocationInput
  token: DynamicPublishedExecutionToken
  runtime: RouteTransportRuntime
}>):
  | Readonly<{ kind: 'prepared'; prepared: DynamicPublishedPreparedTransport }>
  | Readonly<{ kind: 'refused'; result: DynamicPublishedInvocationResult }> {
  const transportInvocation = dynamicTransportInvocation(input)
  const preparation = prepareRegisteredRouteTransportInvocation(
    transportInvocation,
    input.runtime.resolveCredential,
    input.runtime.x402PaymentSigningAvailable ?? (() => false),
  )
  if (preparation.kind === 'refused') {
    return {
      kind: 'refused',
      result: observationResult(input.operation, input.descriptor, preparation.observation),
    }
  }
  return {
    kind: 'prepared',
    prepared: {
      invocationRef: input.token.invocationRef,
      operationKey: input.invocation.operationKey,
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
  paymentAuthorizationEvents?: Map<string, X402PaymentAuthorizationEvent>
  now?: () => number
}>): Promise<DynamicPublishedInvocationResult> {
  const runtime = input.paymentAttempts === undefined
    ? input.runtime
    : createPaymentAttemptRuntime(
        input.runtime,
        input.prepared,
        input.paymentAttempts,
        input.paymentAuthorizationEvents,
        input.now ?? Date.now,
      )
  const eventKey = x402PaymentAttemptKey(input.prepared)
  let observation: Awaited<ReturnType<typeof invokePreparedRouteTransport>>
  try {
    observation = await invokePreparedRouteTransport(input.prepared.plan, runtime)
  } catch (error) {
    if (input.paymentAuthorizationEvents !== undefined
      && !input.paymentAuthorizationEvents.has(eventKey)) {
      input.paymentAuthorizationEvents.set(eventKey, {
        invocationRef: input.prepared.invocationRef,
        attemptRef: input.prepared.attemptRef,
        effectGeneration: input.prepared.effectGeneration,
        operationKey: input.prepared.operationKey,
        queryRelease: 'released',
        authorization: 'unknown',
        recordedAt: (input.now ?? Date.now)(),
      })
    }
    throw error
  }
  if (input.paymentAuthorizationEvents !== undefined
    && !input.paymentAuthorizationEvents.has(eventKey)
    && observation.releaseStarted) {
    input.paymentAuthorizationEvents.set(eventKey, {
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
    })
  }
  if (observation.disposition === 'unknown' && observation.releaseStarted) {
    throw new Error(`published_operation_outcome_unknown:${observation.failureCode ?? 'unknown'}`)
  }
  const result = observationResult(input.operation, input.descriptor, observation)
  if (observation.paymentAuthorizationStatus === 'created'
    && result.kind !== 'published_operation_succeeded') {
    if (input.paymentAttempts !== undefined) {
      const key = x402PaymentAttemptKey({
        invocationRef: input.prepared.invocationRef,
        attemptRef: input.prepared.attemptRef,
        effectGeneration: input.prepared.effectGeneration,
      })
      const current = input.paymentAttempts.get(key)
      if (current !== undefined) {
        input.paymentAttempts.set(key, {
          ...current,
          state: 'reconciliation_required',
        })
      }
    }
    throw new Error(
      `published_operation_payment_reconciliation_required:${result.failureCode ?? result.kind}`,
    )
  }
  return result
}

export function createPaymentAttemptRuntime(
  runtime: RouteTransportRuntime,
  prepared: DynamicPublishedPreparedTransport,
  attempts: Map<string, X402PaymentAttempt>,
  authorizationEvents: Map<string, X402PaymentAuthorizationEvent> | undefined,
  now: () => number,
): RouteTransportRuntime {
  const key = x402PaymentAttemptKey({
    invocationRef: prepared.invocationRef,
    attemptRef: prepared.attemptRef,
    effectGeneration: prepared.effectGeneration,
  })
  return {
    ...runtime,
    async prepareX402PaymentAuthorization(request) {
      const current = attempts.get(key)
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
      if (runtime.prepareX402PaymentAuthorization === undefined) {
        throw new Error('x402_payment_custody_prepare_unavailable')
      }
      const authorization = await runtime.prepareX402PaymentAuthorization(request)
      if (authorization === undefined) return undefined
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
        amount: request.selectedRequirement.amount,
        providerEndpoint: request.challenge.resource.url,
        operationRevision: prepared.plan.invocation.authority.capabilityContractDigest,
        authorizationDigest: authorization.authorizationDigest,
        custodyRef: authorization.custodyRef,
        state: 'prepared',
        preparedAt: now(),
        evidenceRefs: [],
      }
      attempts.set(key, paymentAttempt)
      authorizationEvents?.set(key, {
        invocationRef: prepared.invocationRef,
        attemptRef: prepared.attemptRef,
        effectGeneration: prepared.effectGeneration,
        operationKey: prepared.operationKey,
        queryRelease: 'released',
        authorization: 'created',
        recordedAt: paymentAttempt.preparedAt,
        challengeDigest: paymentAttempt.challengeDigest,
        authorizationDigest: authorization.authorizationDigest,
      })
      return authorization
    },
    async readX402PaymentAuthorization(authorization) {
      const current = attempts.get(key)
      if (current === undefined
        || current.state !== 'prepared'
        || current.custodyRef !== authorization.custodyRef
        || current.authorizationDigest !== authorization.authorizationDigest) {
        throw new Error('x402_payment_attempt_reconciliation_required')
      }
      if (runtime.readX402PaymentAuthorization === undefined) {
        throw new Error('x402_payment_custody_read_unavailable')
      }
      return runtime.readX402PaymentAuthorization(authorization)
    },
    markX402PaymentPossiblySubmitted(event) {
      const current = attempts.get(key)
      if (current === undefined
        || current.custodyRef !== event.custodyRef
        || current.challengeDigest !== event.challengeDigest) {
        throw new Error('x402_payment_attempt_attribution_invalid')
      }
      attempts.set(key, {
        ...current,
        state: 'possibly_submitted',
        submissionStartedAt: now(),
      })
    },
    observeX402PaymentAttempt(event) {
      const current = attempts.get(key)
      if (current === undefined || current.custodyRef !== event.custodyRef) {
        throw new Error('x402_payment_attempt_attribution_invalid')
      }
      attempts.set(key, {
        ...current,
        state: event.state,
        observedAt: now(),
        evidenceRefs: event.evidenceRefs,
      })
    },
  }
}

function dynamicTransportInvocation(input: Readonly<{
  operation: PublishedOperation
  invocation: DynamicPublishedInvocationInput
  token: DynamicPublishedExecutionToken
}>): import('@/modules/capability-supply/route-transport-runtime').RouteTransportInvocation {
  const price = executableFixedPrice(input.operation)
  return {
    binding: {
      adapterId: input.operation.binding.adapter.adapterId,
      endpointUrl: input.operation.binding.endpointUrl,
      credentialRef: input.operation.binding.credentialRef,
      configJson: input.operation.transport.configJson,
      configDigest: input.operation.transport.configDigest,
    },
    authority: {
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
    },
    inputJson: JSON.stringify(input.invocation.input),
  }
}

function observationResult(
  operation: PublishedOperation,
  descriptor: RuntimePublishedOperationDescriptor,
  observation: import('@/modules/capability-supply/route-transport-runtime').RouteTransportObservation,
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
