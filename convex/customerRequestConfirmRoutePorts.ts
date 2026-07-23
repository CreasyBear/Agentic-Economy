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
    issueConfirmMandate: (input) => ctx.runMutation(
      internal.customerRequestRouteMandate.issue,
      {
        requestId: input.requestId,
        expectedRequestRevision: input.expectedRequestRevision,
        expectedGenerationRef: input.expectedGenerationRef,
        selectedRoutePlanId: input.selectedRoutePlanId,
        maximumTotalSpend: { ...input.maximumTotalSpend },
        expiresAt: input.expiresAt,
        idempotencyKey: input.idempotencyKey,
        ...(input.serviceAuthorization === undefined ? {} : {
          serviceAuthorization: {
            command: { ...input.serviceAuthorization.command },
            assertion: {
              ...input.serviceAuthorization.assertion,
              scopes: [...input.serviceAuthorization.assertion.scopes],
            },
          },
        }),
      },
    ),
  }
}
