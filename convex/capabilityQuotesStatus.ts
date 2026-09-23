import { query } from './_generated/server'
import { quoteStatusArgs, quoteStatusResult, readQuoteStatusQueryHandler } from './lib/capabilityQuotes/statusQuery'

export const readQuoteStatus = query({
  args: quoteStatusArgs,
  returns: quoteStatusResult,
  handler: readQuoteStatusQueryHandler,
})
