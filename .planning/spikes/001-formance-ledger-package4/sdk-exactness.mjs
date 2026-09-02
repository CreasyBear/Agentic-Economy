import { createHash } from 'node:crypto'

import { SDK } from '@formance/formance-sdk'

const LEDGER = 'ae-package4-exactness'
const SCHEMA_VERSION = 'v1.0.0'
const ASSET = 'AUD/6'

const sdk = new SDK({
  serverURL: 'http://127.0.0.1:8080',
  retryConfig: { strategy: 'none' },
  timeoutMs: 10_000,
})

const noRetry = Object.freeze({ retries: { strategy: 'none' } })
const bigintAsString = Object.freeze({
  headers: { 'Formance-Bigint-As-String': 'true' },
  retries: { strategy: 'none' },
})

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function errorFact(error) {
  return {
    name: error instanceof Error ? error.name : typeof error,
    statusCode:
      typeof error === 'object'
      && error !== null
      && 'statusCode' in error
      && typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined,
  }
}

function transactionRequest(caseRef, units, destination, dryRun = false) {
  return {
    idempotencyKey: digest(`idempotency:${caseRef}`),
    v2PostTransaction: {
      metadata: {
        case_digest: digest(caseRef),
        command_digest: digest(`command:${caseRef}`),
      },
      reference: `ae-p4-spike:${digest(`reference:${caseRef}`)}`,
      runtime: 'machine',
      script: {
        template: 'EXACT_DEPOSIT',
        vars: {
          amount: `${ASSET} ${units}`,
          destination,
        },
      },
    },
    dryRun,
    ledger: LEDGER,
    schemaVersion: SCHEMA_VERSION,
  }
}

function createdTransaction(response) {
  const transaction = response.v2CreateTransactionResponse?.data
  if (transaction === undefined) {
    throw new Error('sdk_create_transaction_response_missing')
  }
  return transaction
}

function postingAmount(transaction) {
  const posting = transaction.postings[0]
  if (posting === undefined) {
    throw new Error('sdk_transaction_posting_missing')
  }
  return posting.amount
}

function postCommitBalance(transaction, account) {
  const volume = transaction.postCommitVolumes?.[account]?.[ASSET]
  if (volume?.balance === undefined) {
    throw new Error('sdk_post_commit_balance_missing')
  }
  return volume.balance
}

await sdk.ledger.v2.createLedger({
  ledger: LEDGER,
  v2CreateLedgerRequest: {
    metadata: { purpose_digest: digest('package4-formance-exactness') },
  },
}, noRetry)

await sdk.ledger.v2.insertSchema({
  idempotencyKey: digest('schema:package4-formance-exactness:v1'),
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
        description: 'Exact-value SDK round-trip probe',
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

const cases = [
  ['one', '1'],
  ['funding_maximum', '25000000000'],
  ['max_safe_integer', Number.MAX_SAFE_INTEGER.toString()],
  ['max_safe_integer_plus_one', (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString()],
  ['thirty_digit_ceiling', '999999999999999999999999999999'],
]

const observations = []
for (const [caseRef, units] of cases) {
  const account = `accounts:${digest(`account:${caseRef}`)}`
  const response = await sdk.ledger.v2.createTransaction(
    transactionRequest(caseRef, units, account),
    noRetry,
  )
  const observed = postingAmount(createdTransaction(response))
  observations.push({
    caseRef,
    expected: units,
    observed: observed.toString(),
    exact: observed === BigInt(units),
  })
}

const cumulativeAccount = `accounts:${digest('account:cumulative')}`
const firstCumulative = await sdk.ledger.v2.createTransaction(
  transactionRequest(
    'cumulative:first',
    Number.MAX_SAFE_INTEGER.toString(),
    cumulativeAccount,
  ),
  noRetry,
)
createdTransaction(firstCumulative)
const secondCumulative = await sdk.ledger.v2.createTransaction(
  transactionRequest('cumulative:second', '2', cumulativeAccount),
  noRetry,
)
const cumulativeTransaction = createdTransaction(secondCumulative)
const cumulativeExpected = BigInt(Number.MAX_SAFE_INTEGER) + 2n
const cumulativeObserved = postCommitBalance(
  cumulativeTransaction,
  cumulativeAccount,
)
observations.push({
  caseRef: 'cumulative_above_safe_integer',
  expected: cumulativeExpected.toString(),
  observed: cumulativeObserved.toString(),
  exact: cumulativeObserved === cumulativeExpected,
})

let headerObservation
try {
  await sdk.ledger.v2.createTransaction(
    transactionRequest(
      'bigint_header:one',
      '1',
      `accounts:${digest('account:bigint-header')}`,
      true,
    ),
    bigintAsString,
  )
  headerObservation = { exact: true, kind: 'decoded' }
} catch (error) {
  headerObservation = {
    exact: false,
    kind: 'sdk_decode_refused',
    error: errorFact(error),
  }
}

const exact = observations.every((observation) => observation.exact)
  && headerObservation.exact
const evidence = {
  decision: exact ? 'PASS' : 'FAIL',
  node: process.version,
  sdk: '7.0.0',
  ledger: 'v2.4.12',
  observations,
  bigintAsString: headerObservation,
}

console.log(JSON.stringify(evidence, null, 2))
process.exitCode = exact ? 0 : 1
