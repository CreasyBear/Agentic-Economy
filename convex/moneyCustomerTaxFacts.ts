import { mutation, query } from './_generated/server'
import { readCustomerTaxFactsArgs, readCustomerTaxFactsHandler, readCustomerTaxFactsResult } from './lib/money/customer/taxFactsRead'
import { upsertCustomerTaxFactsArgs, upsertCustomerTaxFactsHandler, upsertCustomerTaxFactsResult } from './lib/money/customer/taxFactsUpsert'

export const readCustomerTaxFacts = query({
  args: readCustomerTaxFactsArgs,
  returns: readCustomerTaxFactsResult,
  handler: readCustomerTaxFactsHandler,
})

export const upsertCustomerTaxFacts = mutation({
  args: upsertCustomerTaxFactsArgs,
  returns: upsertCustomerTaxFactsResult,
  handler: upsertCustomerTaxFactsHandler,
})
