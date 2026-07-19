import {
  invokeRegisteredRouteTransport,
  type RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  DynamicPublishedInvocationInput,
  DynamicPublishedInvocationResult,
} from './dynamic-published-contract'
import type { PublishedOperation, RuntimePublishedOperationDescriptor } from '@/modules/capability-supply/public'

export type DynamicPublishedExecutionToken = Readonly<{
  attemptRef: string
  effectGeneration: number
  authorityRef: string
  mandateDigest: string
  grantDigest: string
  expiresAt: number
}>

export async function executeDynamicPublishedTransport(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  invocation: DynamicPublishedInvocationInput
  token: DynamicPublishedExecutionToken
  runtime: RouteTransportRuntime
  markReleased(): void
}>): Promise<DynamicPublishedInvocationResult> {
  const observation = await invokeRegisteredRouteTransport({
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
      maximumSpend: { currency: 'USD', amountMinor: 1 },
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
  }, input.runtime)
  if (observation.releaseStarted) input.markReleased()
  if (observation.disposition === 'unknown' && observation.releaseStarted) {
    throw new Error(`published_operation_outcome_unknown:${observation.failureCode ?? 'unknown'}`)
  }
  const common = {
    operationId: input.operation.operationId,
    operationVersion: input.descriptor.version,
    requestDigest: observation.requestDigest,
    ...(observation.responseDigest === undefined ? {} : { responseDigest: observation.responseDigest }),
    ...(observation.providerReceipt === undefined ? {} : { providerReceipt: observation.providerReceipt }),
    ...(observation.paymentProof === undefined ? {} : { paymentProof: observation.paymentProof }),
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
  if (!input.descriptor.validateOutput(output)) {
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
