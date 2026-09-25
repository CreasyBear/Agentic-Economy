import { degradeBackend } from '@/lib/observability/degrade-backend'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import type { RuntimePublishedToolDescriptor } from '@/modules/capability-supply/public'
import type { ContractOutputValidation } from './contracts'

export function parseContractOutput(
  observation: RouteTransportObservation,
  descriptor: RuntimePublishedToolDescriptor,
): ContractOutputValidation {
  if (observation.disposition !== 'succeeded' || observation.outputJson === undefined) return { valid: false }
  try {
    const output: unknown = JSON.parse(observation.outputJson)
    return isBoundedJsonValue(output) && descriptor.validateOutput(output)
      ? { valid: true, output }
      : { valid: false }
  } catch (cause) {
    return degradeBackend(cause, { valid: false }, { site: 'parseContractOutput', reason: 'invalid_response' })
  }
}
