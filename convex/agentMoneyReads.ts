import { actionGeneric, internalMutationGeneric, mutationGeneric } from 'convex/server'
import type { Infer } from 'convex/values'

import {
  agentActivityArgs,
  agentActivityResult,
  agentBalanceAdmissionResult,
  agentBalanceArgs,
  agentBalanceResult,
  listAgentActivityHandler,
  prepareAgentBalanceHandler,
} from './lib/agentMoneyReads'
import { internal } from './_generated/api'

export const prepareBalance = internalMutationGeneric({
  args: agentBalanceArgs,
  returns: agentBalanceAdmissionResult,
  handler: prepareAgentBalanceHandler,
})

export const balance = actionGeneric({
  args: agentBalanceArgs,
  returns: agentBalanceResult,
  handler: async (ctx, args): Promise<Infer<typeof agentBalanceResult>> => {
    const admission: Infer<typeof agentBalanceAdmissionResult> = await ctx.runMutation(
      internal.agentMoneyReads.prepareBalance,
      args,
    )
    if (admission.kind !== 'allowed') return admission
    const balance: Readonly<{
      kind: 'available'
      units: string
      observedAt: number
    }> | Readonly<{
      kind: 'setup_required' | 'unavailable'
      code: string
    }> = await ctx.runAction(internal.moneyFormance.readDisplayBalance, {
      balanceKind: 'account_aud',
      subjectRef: admission.accountRef,
    })
    if (balance.kind !== 'available') {
      return { kind: 'error' as const, code: 'source_unavailable' as const }
    }
    return {
      kind: 'available' as const,
      principalRef: admission.principalRef,
      accountRef: admission.accountRef,
      balance: { currency: 'AUD' as const, exponent: 6 as const, units: balance.units },
      accountState: 'active' as const,
      version: balance.observedAt,
      updatedAt: balance.observedAt,
      funding: {
        kind: 'agent_funding_handoff' as const,
        configAction: 'funding.handoff.config' as const,
        createAction: 'funding.handoff.create' as const,
        statusAction: 'funding.handoff.status' as const,
      },
    }
  },
})

export const activity = mutationGeneric({
  args: agentActivityArgs,
  returns: agentActivityResult,
  handler: listAgentActivityHandler,
})
