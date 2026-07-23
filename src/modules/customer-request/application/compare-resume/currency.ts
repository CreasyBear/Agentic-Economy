import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { RequestGraph } from '../interpret-compile/types'
import type { CompareResumeRouteGeneration } from './types'

export function routesAreCurrent(
  generation: CompareResumeRouteGeneration,
  graph: RequestGraph | Readonly<{ kind: 'unavailable' }>,
  now: number,
): boolean {
  const routes = generation.routes
  return graph.kind === 'available'
    && graph.registrySnapshotDigest === generation.registrySnapshotDigest
    && routes.every((route) => route.expiresAt > now)
    && routes.every((route) => route.steps.every((step) => graph.bindings.some((binding) => (
      binding.businessId === step.businessId
      && binding.offeringId === step.offeringId
      && binding.bindingId === step.bindingId
      && hasExactContractRef(step.contractRef)
      && sameCapabilityContractRef(binding.contractRef, step.contractRef)
      && binding.offeringRegistrationHash === step.offeringRegistrationHash
      && binding.bindingRegistrationHash === step.bindingRegistrationHash
      && binding.publicationRef === step.publicationRef
      && binding.publicationRevision === step.publicationRevision
      && binding.readinessValidUntil !== undefined
      && binding.readinessValidUntil >= route.expiresAt
      && binding.price !== undefined
      && canonicalDigest(binding.price) === canonicalDigest(step.price as Parameters<typeof canonicalDigest>[0])
    ))))
}

export function hasTransientBindingUnavailable(
  generation: CompareResumeRouteGeneration,
  graph: RequestGraph,
  now: number,
): boolean {
  return generation.routes.some((route) => route.steps.some((step) => (
    graph.bindings.some((binding) => (
      binding.businessId === step.businessId
      && binding.offeringId === step.offeringId
      && binding.bindingId === step.bindingId
      && hasExactContractRef(step.contractRef)
      && sameCapabilityContractRef(binding.contractRef, step.contractRef)
      && (binding.publicationRef === undefined
        || binding.readinessValidUntil === undefined
        || binding.readinessValidUntil <= now)
    ))
  )))
}

export function routeRefreshCommand(
  args: Readonly<{ requestRef: string; revision: number; idempotencyKey: string }>,
  principalId: string,
): Readonly<{ commandKey: string; commandDigest: string }> {
  return {
    commandKey: `route-refresh:${canonicalDigest({
      principalId,
      requestRef: args.requestRef,
      callerKey: args.idempotencyKey,
    })}`,
    commandDigest: canonicalDigest({
      requestRef: args.requestRef,
      revision: args.revision,
      idempotencyKey: args.idempotencyKey,
    }),
  }
}

function hasExactContractRef(
  reference: Readonly<{
    capabilityId: string
    version: number
    contractDigest?: string
  }>,
): reference is Readonly<{
  capabilityId: string
  version: number
  contractDigest: string
}> {
  return reference.contractDigest !== undefined
}
