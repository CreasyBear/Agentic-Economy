import { action, internalQuery, mutation, query } from './_generated/server'
import {
  creditAccountArgs,
  creditActivityArgs,
  creditAccountResultValue,
  creditActivityResultValue,
  keyUsageArgs,
  keyUsageResultValue,
} from './lib/money/credit/contracts'
import {
  creditAccountMoneyFactsArgs,
  creditAccountMoneyFactsValue,
  readCreditAccountMoneyFactsHandler,
  readCreditAccountHandler,
} from './lib/money/credit/balance'
import { listCreditActivityHandler, readKeyUsageHandler } from './lib/money/credit/activity'
import {
  ownerProviderEarningsPageArgs,
  ownerProviderEarningsPageResultValue,
  readOwnerProviderEarningsPageHandler,
  ownerProviderEarningsArgs,
  ownerProviderEarningsResultValue,
  agentProviderEarningsArgs,
  agentProviderEarningsResultValue,
  readOwnerProviderEarningsHandler,
  readAgentProviderEarningsHandler,
} from './lib/money/earnings/providerEarnings'
export const readCreditAccountMoneyFacts = internalQuery({
  args: creditAccountMoneyFactsArgs,
  returns: creditAccountMoneyFactsValue,
  handler: readCreditAccountMoneyFactsHandler,
})

export const readCreditAccount = action({
  args: creditAccountArgs,
  returns: creditAccountResultValue,
  handler: readCreditAccountHandler,
})

export const listCreditActivity = action({
  args: creditActivityArgs,
  returns: creditActivityResultValue,
  handler: listCreditActivityHandler,
})

export const readKeyUsage = action({
  args: keyUsageArgs,
  returns: keyUsageResultValue,
  handler: readKeyUsageHandler,
})

export const readOwnerProviderEarnings = query({
  args: ownerProviderEarningsArgs,
  returns: ownerProviderEarningsResultValue,
  handler: readOwnerProviderEarningsHandler,
})

export const readAgentProviderEarnings = mutation({
  args: agentProviderEarningsArgs,
  returns: agentProviderEarningsResultValue,
  handler: readAgentProviderEarningsHandler,
})

import { credentialActivityJoinArgs,readCredentialActivityFactsHandler,credentialSourceArgs,credentialSourceResult,readCredentialSourceHandler,credentialCreatedCallsArgs,credentialCreatedCallsResult,readCredentialCreatedCallsHandler } from './lib/money/credit/credentialFacts'
export const readCredentialActivityFacts=internalQuery({args:credentialActivityJoinArgs,returns:creditActivityResultValue,handler:readCredentialActivityFactsHandler})
export const readCredentialSource=internalQuery({args:credentialSourceArgs,returns:credentialSourceResult,handler:readCredentialSourceHandler})
export const readCredentialCreatedCalls=internalQuery({args:credentialCreatedCallsArgs,returns:credentialCreatedCallsResult,handler:readCredentialCreatedCallsHandler})

export const readOwnerProviderEarningsPage = query({ args: ownerProviderEarningsPageArgs, returns: ownerProviderEarningsPageResultValue, handler: readOwnerProviderEarningsPageHandler })
