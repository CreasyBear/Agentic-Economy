import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import { SDK } from '@formance/formance-sdk'

import { package4Schema } from './package4-schema.mjs'

const LEDGER = process.env.AE_FORMANCE_OPERATIONS_LEDGER
const MODE = process.env.AE_FORMANCE_OPERATIONS_MODE ?? 'verify'
const TRANSACTION_COUNT = Number(process.env.AE_FORMANCE_OPERATIONS_COUNT ?? '10000')
if (!LEDGER?.match(/^ae-package4-operations-[a-z0-9-]+$/)) {
  throw new Error('AE_FORMANCE_OPERATIONS_LEDGER_required')
}
if (!['seed', 'verify'].includes(MODE)) throw new Error('operations_mode_invalid')
if (!Number.isInteger(TRANSACTION_COUNT)
  || TRANSACTION_COUNT < 1
  || TRANSACTION_COUNT > 10_000) {
  throw new Error('operations_count_invalid')
}

const SCHEMA_VERSION = 'v1.0.0'
const BATCH_SIZE = 100
const AUD = 'AUD/6'
const sdk = new SDK({
  serverURL: 'http://127.0.0.1:8080',
  retryConfig: { strategy: 'none' },
  timeoutMs: 30_000,
})
const noRetry = Object.freeze({ retries: { strategy: 'none' } })
const digest = (value) => createHash('sha256').update(value).digest('hex')
const processor = `processor:${digest(`${LEDGER}:processor`)}:settlement`

function command(index) {
  const commandRef = digest(`${LEDGER}:funding:${index}`)
  return {
    action: 'CREATE_TRANSACTION',
    ik: commandRef,
    data: {
      metadata: { command_digest: commandRef },
      reference: `ae-p4:${commandRef}`,
      runtime: 'machine',
      script: {
        template: 'FUNDING_SETTLED',
        vars: {
          account: `accounts:${digest(`${LEDGER}:account:${index}`)}:available`,
          amount: `${AUD} 1`,
          processor,
        },
      },
    },
  }
}

async function seed() {
  await sdk.ledger.v2.createLedger({
    ledger: LEDGER,
    v2CreateLedgerRequest: {
      metadata: { purpose_digest: digest('package4-operations-volume') },
    },
  }, noRetry)
  await sdk.ledger.v2.insertSchema({
    idempotencyKey: digest(`${LEDGER}:schema`),
    ledger: LEDGER,
    version: SCHEMA_VERSION,
    v2SchemaData: package4Schema,
  }, noRetry)

  const startedAt = performance.now()
  for (let start = 0; start < TRANSACTION_COUNT; start += BATCH_SIZE) {
    const requestBody = Array.from(
      { length: Math.min(BATCH_SIZE, TRANSACTION_COUNT - start) },
      (_, offset) => command(start + offset),
    )
    const response = await sdk.ledger.v2.createBulk({
      atomic: true,
      continueOnFailure: false,
      ledger: LEDGER,
      parallel: false,
      requestBody,
      schemaVersion: SCHEMA_VERSION,
    }, noRetry)
    const results = response.v2BulkResponse?.data ?? []
    if (results.length !== requestBody.length
      || results.some((result) => result.responseType !== 'CREATE_TRANSACTION')) {
      throw new Error(`operations_seed_batch_failed:${start}`)
    }
  }

  return {
    seeded: TRANSACTION_COUNT,
    seconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
  }
}

async function verify() {
  const references = new Set()
  let cursor
  let pages = 0
  const startedAt = performance.now()
  do {
    const response = await sdk.ledger.v2.listTransactions(
      cursor === undefined
        ? { ledger: LEDGER, pageSize: 15, sort: 'id:asc' }
        : { cursor, ledger: LEDGER },
      noRetry,
    )
    const page = response.v2TransactionsCursorResponse?.cursor
    if (page === undefined) throw new Error('operations_page_missing')
    for (const transaction of page.data) {
      if (transaction.reference !== undefined) references.add(transaction.reference)
    }
    pages += 1
    cursor = page.hasMore ? page.next : undefined
    if (page.hasMore && cursor === undefined) throw new Error('operations_cursor_missing')
  } while (cursor !== undefined)

  const first = command(0)
  const exact = await sdk.ledger.v2.listTransactions({
    ledger: LEDGER,
    pageSize: 2,
    query: { $match: { reference: first.data.reference } },
  }, noRetry)
  const exactTransactions = exact.v2TransactionsCursorResponse?.cursor.data ?? []
  const replay = await sdk.ledger.v2.createBulk({
    atomic: true,
    continueOnFailure: false,
    ledger: LEDGER,
    parallel: false,
    requestBody: [first],
    schemaVersion: SCHEMA_VERSION,
  }, noRetry)
  const replayTransaction = replay.v2BulkResponse?.data[0]
  const schema = await sdk.ledger.v2.getSchema({
    ledger: LEDGER,
    version: SCHEMA_VERSION,
  }, noRetry)
  const firstAccount = await sdk.ledger.v2.getAccount({
    address: first.data.script.vars.account,
    expand: 'volumes',
    ledger: LEDGER,
  }, noRetry)
  const firstBalance = firstAccount.v2AccountResponse?.data.volumes?.[AUD]?.balance
  const exactTransaction = exactTransactions[0]

  return {
    decision: references.size === TRANSACTION_COUNT
      && exactTransactions.length === 1
      && replayTransaction?.responseType === 'CREATE_TRANSACTION'
      && replayTransaction.data.id === exactTransaction?.id
      && schema.v2SchemaResponse?.data.transactions?.FUNDING_SETTLED !== undefined
      && firstBalance === 1n
        ? 'PASS'
        : 'FAIL',
    references: references.size,
    pages,
    pageSize: 15,
    exactReference: exactTransactions.length === 1,
    idempotencyPreserved: replayTransaction?.responseType === 'CREATE_TRANSACTION'
      && replayTransaction.data.id === exactTransaction?.id,
    schemaPreserved: schema.v2SchemaResponse?.data.transactions?.FUNDING_SETTLED !== undefined,
    balancePreserved: firstBalance?.toString() === '1',
    seconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
  }
}

const result = MODE === 'seed' ? await seed() : await verify()
const evidence = { ledger: LEDGER, mode: MODE, ...result }
console.log(JSON.stringify(evidence, null, 2))
if ('decision' in evidence) process.exitCode = evidence.decision === 'PASS' ? 0 : 1
