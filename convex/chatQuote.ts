import { makeFunctionReference } from 'convex/server'
import type { Infer } from 'convex/values'

import { internalAction } from './_generated/server'
import { chatQuoteAdmissionArgs, chatQuoteAdmissionResult } from './chatQuoteAdmission'
import { quoteActionCore } from './lib/capabilityExecution/quotes/quoteAction'
import { refuse } from './lib/capabilityExecution/quotes/refusalHelpers'
import { quoteResult } from './lib/capabilityExecution/quotes/contracts'

type AdmissionArgs = {
  [K in keyof typeof chatQuoteAdmissionArgs]: Infer<(typeof chatQuoteAdmissionArgs)[K]>
}

const prepareRef = makeFunctionReference<'mutation', AdmissionArgs, Infer<typeof chatQuoteAdmissionResult>>(
  'chatQuoteAdmission:prepare',
)

export const quote = internalAction({
  args: chatQuoteAdmissionArgs,
  returns: quoteResult,
  handler: async (ctx, args) => {
    const { principal, subjects } = await ctx.runMutation(prepareRef, args)
    if (principal === null) return refuse(args, 'grant_not_found', false)
    return await quoteActionCore(ctx, {
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      toolRef: args.toolRef,
      input: args.input,
      principal,
    }, subjects, args.authority.turnRef)
  },
})
