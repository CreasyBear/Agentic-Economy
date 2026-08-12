import type { AuthorizePreparationPorts } from '@/modules/customer-request/application/public'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'
import {
  compareResumePorts,
  preparationEgressPorts,
} from './customerRequestCompareResumePorts'

export function authorizePreparationPorts(ctx: ActionCtx): AuthorizePreparationPorts {
  const compare = compareResumePorts(ctx)
  const egress = preparationEgressPorts(ctx)
  return {
    loadCurrent: compare.loadCurrent,
    getAgentPrincipal: async (principalId) => await ctx.runQuery(
      internal.agentAccessPrincipals.getAgentPrincipal, { principalId },
    ),
    prepare: (input) => ctx.runMutation(internal.customerRequestV2Preparation.prepare, input),
    runEgress: egress.runEgress,
    preparationMaterialDigest: egress.preparationMaterialDigest,
    preparePreparedAction: egress.preparePreparedAction,
  }
}
