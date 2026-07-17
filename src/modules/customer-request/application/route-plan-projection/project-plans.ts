import {
  projectCustomerCriteria,
  projectNeedsAttention,
  projectRoutePlansReady,
} from '@/modules/customer-request/customer-projection'
import {
  capabilitySemanticsKey,
  projectCustomerRoutePlanDecision,
} from '@/modules/customer-request/route-plan-customer-projection'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'

import type { CustomerRequestActionResult } from '../action-result'
import type { ProjectableCustomerRequestAggregate } from './projectable-aggregate'

export type RoutePlanProjectionMaterial = Readonly<
  | {
      kind: 'found'
      current: CustomerRequestRoutePlanGeneration
      previous?: CustomerRequestRoutePlanGeneration
      businesses: readonly Readonly<{ businessId: string; name: string }>[]
      capabilities: readonly Readonly<{
        capabilityId: string
        version: number
        contractDigest: string
        name: string
        description: string
        resultLabels: readonly string[]
      }>[]
    }
  | { kind: 'not_found' }
>

export function projectRoutePlansFromMaterial(
  aggregate: ProjectableCustomerRequestAggregate,
  material: RoutePlanProjectionMaterial,
  now: number,
  onInvalid?: (error: unknown) => void,
): CustomerRequestActionResult {
  if (material.kind !== 'found'
    || material.current.requestId !== aggregate.snapshot.requestId
    || material.current.requestRevision !== aggregate.snapshot.revision) {
    return projectNeedsAttention({
      requestRef: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      summary: 'AE could not verify the current ways forward. Try this request again.',
    })
  }
  let decision: ReturnType<typeof projectCustomerRoutePlanDecision>
  try {
    decision = projectCustomerRoutePlanDecision({
      current: material.current,
      ...(material.previous === undefined ? {} : { previous: material.previous }),
      businessNames: Object.fromEntries(material.businesses.map(({ businessId, name }) => [businessId, name])),
      capabilitySemantics: Object.fromEntries(material.capabilities.map((capability) => [
        capabilitySemanticsKey(capability),
        {
          name: capability.name,
          description: capability.description,
          resultLabels: capability.resultLabels,
        },
      ])),
      now,
    })
  } catch (error) {
    onInvalid?.(error)
    return projectNeedsAttention({
      requestRef: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      summary: 'AE could not verify the current ways forward. Try this request again.',
    })
  }
  return projectRoutePlansReady({
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    summary: aggregate.snapshot.intent,
    decision,
    criteria: projectCustomerCriteria(
      material.current.decisionSnapshot?.criteria ?? aggregate.evaluation.criteria,
    ),
  })
}
