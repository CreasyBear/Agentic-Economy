import type { ConfirmRoutePorts } from '@/modules/customer-request/application/public'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'
import { compareResumePorts } from './customerRequestCompareResumePorts'

export function confirmRoutePorts(ctx: ActionCtx): ConfirmRoutePorts {
  const compare = compareResumePorts(ctx)
  return {
    loadCurrent: compare.loadCurrent,
    projectCurrentRoutePlans: compare.projectCurrentRoutePlans,
    getCurrentRoutePlanGeneration: compare.getCurrentRoutePlanGeneration as ConfirmRoutePorts['getCurrentRoutePlanGeneration'],
    issueConfirmMandate: ({ serviceAuthorization, ...rest }) => ctx.runMutation(
      internal.customerRequestRouteMandate.issue,
      {
        ...rest,
        ...(serviceAuthorization === undefined ? {} : {
          serviceAuthorization: {
            command: serviceAuthorization.command,
            assertion: {
              ...serviceAuthorization.assertion,
              scopes: [...serviceAuthorization.assertion.scopes],
            },
          },
        }),
      },
    ) as ReturnType<ConfirmRoutePorts['issueConfirmMandate']>,
  }
}
