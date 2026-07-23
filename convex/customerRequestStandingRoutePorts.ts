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
      internal.customerRequestStandingRoutePolicy.issue,
      writableAllowInput(input),
    ),
    issueMandate: (input) => ctx.runMutation(
      internal.customerRequestStandingRoutePolicy.issueMandate,
      writableUseInput(input),
    ),
    revokeStandingPolicy: (input) => ctx.runMutation(
      internal.customerRequestStandingRoutePolicy.revoke,
      writableRevokeInput(input),
    ),
  }
}

function writableAllowInput(
  input: Parameters<StandingRoutePorts['issueStandingPolicy']>[0],
) {
  const { serviceAuthorization: _authorization, ...material } = input
  return {
    ...material,
    ...(input.serviceAuthorization === undefined ? {} : {
      serviceAuthorization: {
        operation: input.serviceAuthorization.operation,
        command: { ...input.serviceAuthorization.command },
        assertion: {
          ...input.serviceAuthorization.assertion,
          scopes: [...input.serviceAuthorization.assertion.scopes],
        },
      },
    }),
  }
}

function writableUseInput(
  input: Parameters<StandingRoutePorts['issueMandate']>[0],
) {
  const { serviceAuthorization: _authorization, ...material } = input
  return {
    ...material,
    ...(input.serviceAuthorization === undefined ? {} : {
      serviceAuthorization: {
        operation: input.serviceAuthorization.operation,
        command: { ...input.serviceAuthorization.command },
        assertion: {
          ...input.serviceAuthorization.assertion,
          scopes: [...input.serviceAuthorization.assertion.scopes],
        },
      },
    }),
  }
}

function writableRevokeInput(
  input: Parameters<StandingRoutePorts['revokeStandingPolicy']>[0],
) {
  const { serviceAuthorization: _authorization, ...material } = input
  return {
    ...material,
    ...(input.serviceAuthorization === undefined ? {} : {
      serviceAuthorization: {
        operation: input.serviceAuthorization.operation,
        command: { ...input.serviceAuthorization.command },
        assertion: {
          ...input.serviceAuthorization.assertion,
          scopes: [...input.serviceAuthorization.assertion.scopes],
        },
      },
    }),
  }
}
