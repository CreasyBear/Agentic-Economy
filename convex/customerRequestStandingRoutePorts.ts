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
      internal.agentAccessPrincipals.listStandingCredentials, input,
    ),
    listPermissions: (input) => ctx.runQuery(
      internal.customerRequestStandingRoutePolicy.listPermissions, input,
    ) as ReturnType<StandingRoutePorts['listPermissions']>,
    resolvePermission: (input) => ctx.runQuery(
      internal.customerRequestStandingRoutePolicy.resolvePermission, input,
    ) as ReturnType<StandingRoutePorts['resolvePermission']>,
    issueStandingPolicy: ({ serviceAuthorization, ...rest }) => ctx.runMutation(
      internal.customerRequestStandingRoutePolicy.issue,
      {
        ...rest,
        ...(serviceAuthorization === undefined ? {} : {
          serviceAuthorization: {
            operation: serviceAuthorization.operation,
            command: serviceAuthorization.command,
            assertion: {
              ...serviceAuthorization.assertion,
              scopes: [...serviceAuthorization.assertion.scopes],
            },
          },
        }),
      },
    ) as ReturnType<StandingRoutePorts['issueStandingPolicy']>,
    issueMandate: ({ serviceAuthorization, ...rest }) => ctx.runMutation(
      internal.customerRequestStandingRoutePolicy.issueMandate,
      {
        ...rest,
        ...(serviceAuthorization === undefined ? {} : {
          serviceAuthorization: {
            operation: serviceAuthorization.operation,
            command: serviceAuthorization.command,
            assertion: {
              ...serviceAuthorization.assertion,
              scopes: [...serviceAuthorization.assertion.scopes],
            },
          },
        }),
      },
    ) as ReturnType<StandingRoutePorts['issueMandate']>,
    revokeStandingPolicy: ({ serviceAuthorization, ...rest }) => ctx.runMutation(
      internal.customerRequestStandingRoutePolicy.revoke,
      {
        ...rest,
        ...(serviceAuthorization === undefined ? {} : {
          serviceAuthorization: {
            operation: serviceAuthorization.operation,
            command: serviceAuthorization.command,
            assertion: {
              ...serviceAuthorization.assertion,
              scopes: [...serviceAuthorization.assertion.scopes],
            },
          },
        }),
      },
    ) as ReturnType<StandingRoutePorts['revokeStandingPolicy']>,
  }
}
