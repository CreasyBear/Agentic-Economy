import { query } from './_generated/server'
import { quoteStatusArgs, quoteStatusResult, readQuoteStatusQueryHandler } from './lib/capabilityExecution/quotes/statusQuery'

export const readQuoteStatus = query({
  args: quoteStatusArgs,
  returns: quoteStatusResult,
  handler: readQuoteStatusQueryHandler,
})
