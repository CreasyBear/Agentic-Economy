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

export type DynamicPublishedExecutionToken = Readonly<{
  attemptRef: string
  effectGeneration: number
  authorityRef: string
  mandateDigest: string
  grantDigest: string
  expiresAt: number
}>

export type DynamicPublishedPreparedTransport = Readonly<{
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
}>): Promise<DynamicPublishedInvocationResult> {
  const observation = await invokePreparedRouteTransport(input.prepared.plan, input.runtime)
  if (observation.disposition === 'unknown' && observation.releaseStarted) {
    throw new Error(`published_operation_outcome_unknown:${observation.failureCode ?? 'unknown'}`)
  }
  return observationResult(input.operation, input.descriptor, observation)
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
