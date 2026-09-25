import { v, type Infer } from 'convex/values'

import { jsonObject } from '@/modules/capability-execution/convex'

import { internalMutation } from './_generated/server'
import { trustedChatAuthorityValue } from './lib/chat/turns/contracts'
import { resolveTrustedChatAuthority } from './lib/capabilityExecution/callLifecycle/chatCallAuthority'
import { principalValue } from './lib/capabilityExecution/callLifecycle/contracts'
import { prepareFinancialSubjectsCore } from './lib/capabilityExecution/quotes/prepareFinancialSubjects'
import { financialSubjectsResult } from './lib/capabilityExecution/quotes/contracts'

export const chatQuoteAdmissionArgs = {
  authority: trustedChatAuthorityValue,
  operationKey: v.string(),
  correlationId: v.string(),
  toolRef: v.string(),
  input: jsonObject,
}

export const chatQuoteAdmissionResult = v.object({
  principal: v.union(principalValue, v.null()),
  subjects: financialSubjectsResult,
})

export const prepare = internalMutation({
  args: chatQuoteAdmissionArgs,
  returns: chatQuoteAdmissionResult,
  handler: async (ctx, args): Promise<Infer<typeof chatQuoteAdmissionResult>> => {
    // The turn fence and live grant must be checked inside this preparation transaction.
    const principal = await resolveTrustedChatAuthority(ctx, args.authority, args.toolRef)
    if (principal === null) return {
      principal: null,
      subjects: { kind: 'refused', code: 'grant_not_found' },
    }
    return {
      principal,
      subjects: await prepareFinancialSubjectsCore(ctx, { ...args, principal }),
    }
  },
})
