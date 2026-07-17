import type { StandingRoutePorts } from '@/modules/customer-request/application/public'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'
import { compareResumePorts } from './customerRequestCompareResumePorts'

export function standingRoutePorts(ctx: ActionCtx): StandingRoutePorts {
  const compare = compareResumePorts(ctx)
  return {
    loadCurrent: compare.loadCurrent,
    projectCurrentRoutePlans: compare.projectCurrentRoutePlans,
    getCurrentRoutePlanGeneration: compare.getCurrentRoutePlanGeneration as StandingRoutePorts['getCurrentRoutePlanGeneration'],
    listStandingCredentials: (input) => ctx.runQuery(
      internal.customerRequestPrincipals.listStandingCredentials, input,
    ),
    listPermissions: (input) => ctx.runQuery(
      internal.customerRequestStandingRoutePolicy.listPermissions, input,
    ) as ReturnType<StandingRoutePorts['listPermissions']>,
    resolvePermission: (input) => ctx.runQuery(
      internal.customerRequestStandingRoutePolicy.resolvePermission, input,
    ) as ReturnType<StandingRoutePorts['resolvePermission']>,
    issueStandingPolicy: (input) => ctx.runMutation(
      internal.customerRequestStandingRoutePolicy.issue, input,
    ) as ReturnType<StandingRoutePorts['issueStandingPolicy']>,
    issueMandate: (input) => ctx.runMutation(
      internal.customerRequestStandingRoutePolicy.issueMandate, input,
    ) as ReturnType<StandingRoutePorts['issueMandate']>,
    revokeStandingPolicy: (input) => ctx.runMutation(
      internal.customerRequestStandingRoutePolicy.revoke, input,
    ) as ReturnType<StandingRoutePorts['revokeStandingPolicy']>,
  }
}
