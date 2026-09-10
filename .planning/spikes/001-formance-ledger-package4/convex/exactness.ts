"use node"

import { SDK } from '@formance/formance-sdk'
import { v } from 'convex/values'

import { action } from './_generated/server'

const LEDGER = 'ae-package4-convex-node'
const SCHEMA_VERSION = 'v1.0.0'
const FUNDING_MAXIMUM_UNITS = '25000000000'
const ACCOUNT_DIGEST = 'a'.repeat(64)
const IDEMPOTENCY_DIGEST = 'b'.repeat(64)
const COMMAND_DIGEST = 'c'.repeat(64)

const sdk = new SDK({
  serverURL: 'http://127.0.0.1:8080',
  retryConfig: { strategy: 'none' },
  timeoutMs: 10_000,
})

const noRetry = Object.freeze({ retries: { strategy: 'none' } })

export const run = action({
  args: {},
  returns: v.object({
    exact: v.boolean(),
    expected: v.string(),
    observed: v.string(),
  }),
  handler: async () => {
    await sdk.ledger.v2.createLedger({
      ledger: LEDGER,
      v2CreateLedgerRequest: {
        metadata: { purpose_digest: COMMAND_DIGEST },
      },
    }, noRetry)

    await sdk.ledger.v2.insertSchema({
      idempotencyKey: IDEMPOTENCY_DIGEST,
      ledger: LEDGER,
      version: SCHEMA_VERSION,
      v2SchemaData: {
        chart: {
          world: { dotSelf: {} },
          accounts: {
            additionalProperties: {
              '$accountID': {
                dotPattern: '^[a-f0-9]{64}$',
                dotSelf: {},
              },
            },
          },
        },
        transactions: {
          EXACT_DEPOSIT: {
            description: 'Convex Node Action exact-value probe',
            runtime: 'machine',
            script: `vars {
  account $destination
  monetary $amount
}
send $amount (
  source = @world
  destination = $destination
)`,
          },
        },
      },
    }, noRetry)

    const response = await sdk.ledger.v2.createTransaction({
      idempotencyKey: COMMAND_DIGEST,
      ledger: LEDGER,
      schemaVersion: SCHEMA_VERSION,
      v2PostTransaction: {
        metadata: { command_digest: COMMAND_DIGEST },
        reference: `ae-p4-spike:${COMMAND_DIGEST}`,
        runtime: 'machine',
        script: {
          template: 'EXACT_DEPOSIT',
          vars: {
            amount: `AUD/6 ${FUNDING_MAXIMUM_UNITS}`,
            destination: `accounts:${ACCOUNT_DIGEST}`,
          },
        },
      },
    }, noRetry)

    const observed = response.v2CreateTransactionResponse?.data.postings[0]?.amount
    if (observed === undefined) throw new Error('formance_posting_missing')

    return {
      exact: observed === BigInt(FUNDING_MAXIMUM_UNITS),
      expected: FUNDING_MAXIMUM_UNITS,
      observed: observed.toString(),
    }
  },
})
