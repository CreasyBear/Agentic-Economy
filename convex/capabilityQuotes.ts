import { action, internalMutation, internalQuery } from './_generated/server'

import {
  admitCallArgs,
  admitCallHandler,
  admitCallResult,
} from './lib/capabilityExecution/quotes/admitCall'
import {
  issueQuoteArgs,
  issueQuoteHandler,
  issueQuoteResult,
} from './lib/capabilityExecution/quotes/issueQuote'
import {
  prepareFinancialSubjectsArgs,
  prepareFinancialSubjectsHandler,
  prepareFinancialSubjectsResult,
} from './lib/capabilityExecution/quotes/prepareFinancialSubjects'
import {
  prepareSpendingPeriodsArgs,
  prepareSpendingPeriodsHandler,
  prepareSpendingPeriodsResult,
} from './lib/capabilityExecution/quotes/prepareSpendingPeriods'
import {
  quoteActionHandler,
  quoteActionResult,
  quoteArgs,
} from './lib/capabilityExecution/quotes/quoteAction'
import {
  readForCallArgs,
  readForCallHandler,
  readForCallResult,
} from './lib/capabilityExecution/quotes/readForCall'

// -- Registrations only. Validators, handler bodies, and DB logic live under --
// -- convex/lib/capabilityQuotes/*, grouped by concern. ----------------------

export const issueQuote = internalMutation({
  args: issueQuoteArgs,
  returns: issueQuoteResult,
  handler: issueQuoteHandler,
})

export const prepareFinancialSubjects = internalMutation({
  args: prepareFinancialSubjectsArgs,
  returns: prepareFinancialSubjectsResult,
  handler: prepareFinancialSubjectsHandler,
})

// Internal continuation used after a native period command is acknowledged.
// It deliberately omits source-write material: the outer Quote mutation has
// already consumed that nonce, and this bounded recheck is part of the same
// request's control recovery.
export const prepareSpendingPeriods = internalMutation({
  args: prepareSpendingPeriodsArgs,
  returns: prepareSpendingPeriodsResult,
  handler: prepareSpendingPeriodsHandler,
})

export const quote = action({
  args: quoteArgs,
  returns: quoteActionResult,
  handler: quoteActionHandler,
})

export const readForCall = internalQuery({
  args: readForCallArgs,
  returns: readForCallResult,
  handler: readForCallHandler,
})

export const admitCall = internalMutation({
  args: admitCallArgs,
  returns: admitCallResult,
  handler: admitCallHandler,
})
