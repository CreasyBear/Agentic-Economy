import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'

import { projectRepeatPermission } from './project'
import type {
  ListStandingRouteAssistantsInput,
  RepeatPermissionAssistantsResult,
  StandingRoutePorts,
} from './types'

export async function listStandingRouteAssistants(
  input: ListStandingRouteAssistantsInput,
  ports: StandingRoutePorts,
): Promise<RepeatPermissionAssistantsResult> {
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== input.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  const [credentialResult, policyResult] = await Promise.allSettled([
    ports.listStandingCredentials({ ownerId: input.ownerId }),
    ports.listPermissions({
      requestId: input.requestRef,
      principalId: input.principalId,
    }),
  ])
  if (credentialResult.status === 'rejected') throw credentialResult.reason
  if (policyResult.status === 'rejected') throw policyResult.reason
  const credentials = credentialResult.value
  const policies = policyResult.value
  return {
    kind: 'connected_assistants',
    requestRef: input.requestRef,
    assistants: credentials.map((credential, index) => ({
      assistantRef: credential.credentialId,
      label: `Connected assistant ${index + 1}`,
      lastUsedAt: credential.lastSeenAt,
    })),
    permissions: policies.permissions.flatMap(({ requestRevision, policy }) => {
      const route = policy.routes[0]
      return route === undefined ? [] : [projectRepeatPermission(
        input.requestRef,
        requestRevision,
        customerRouteRef(policy.generationRef, route.routePlanId),
        policy,
      )]
    }),
  }
}
