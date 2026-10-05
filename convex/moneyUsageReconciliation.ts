import { action, internalQuery } from './_generated/server'
import { factsArgs, factsResult, periodArgs, reconciliationResult } from './lib/money/usageReconciliation/contracts'
import { readFactsHandler } from './lib/money/usageReconciliation/facts'
import { readOwnerReconciliationHandler } from './lib/money/usageReconciliation/read'

export const readFacts = internalQuery({ args: factsArgs, returns: factsResult, handler: readFactsHandler })
export const readOwnerReconciliation = action({ args: periodArgs, returns: reconciliationResult, handler: readOwnerReconciliationHandler })
