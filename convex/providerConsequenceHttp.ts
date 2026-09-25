import { httpActionGeneric } from 'convex/server'

import {
  abortProviderConsequenceJournalHandler,
  attestProviderConsequenceTicketHandler,
  beginProviderConsequenceJournalHandler,
  completeProviderConsequenceJournalHandler,
} from './lib/capabilityExecution/providerConsequence/http'
import { providerConsequenceX402RpcHandler } from './lib/capabilityExecution/providerConsequence/httpX402'

export const beginProviderConsequenceJournal = httpActionGeneric(beginProviderConsequenceJournalHandler)
export const attestProviderConsequenceTicket = httpActionGeneric(attestProviderConsequenceTicketHandler)
export const completeProviderConsequenceJournal = httpActionGeneric(completeProviderConsequenceJournalHandler)
export const abortProviderConsequenceJournal = httpActionGeneric(abortProviderConsequenceJournalHandler)
export const providerConsequenceX402Rpc = httpActionGeneric(providerConsequenceX402RpcHandler)
