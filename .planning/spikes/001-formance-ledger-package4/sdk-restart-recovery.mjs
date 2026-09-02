import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import { SDK } from '@formance/formance-sdk'

import { package4Schema } from './package4-schema.mjs'

const LEDGER = `ae-package4-recovery-${Date.now().toString(36)}-${process.pid}`
const SCHEMA_VERSION = 'v1.0.0'
const AUD = 'AUD/6'
const digest = (value) => createHash('sha256').update(value).digest('hex')
const accountRef = digest(`${LEDGER}:account`)
const processorRef = digest(`${LEDGER}:processor`)
const commandRef = digest(`${LEDGER}:funding`)
const reference = `ae-p4:${commandRef}`
const noRetry = Object.freeze({ retries: { strategy: 'none' } })

function client() {
  return new SDK({
    serverURL: 'http://127.0.0.1:8080',
    retryConfig: { strategy: 'none' },
    timeoutMs: 10_000,
  })
}

function funding(amount) {
  return {
    idempotencyKey: commandRef,
    ledger: LEDGER,
    schemaVersion: SCHEMA_VERSION,
    v2PostTransaction: {
      metadata: { command_digest: commandRef },
      reference,
      runtime: 'machine',
      script: {
        template: 'FUNDING_SETTLED',
        vars: {
          account: `accounts:${accountRef}:available`,
          amount: `${AUD} ${amount}`,
          processor: `processor:${processorRef}:settlement`,
        },
      },
    },
  }
}

async function exactReference(sdk, target) {
  const response = await sdk.ledger.v2.listTransactions({
    ledger: LEDGER,
    pageSize: 2,
    query: { $match: { reference: target } },
  }, noRetry)
  return response.v2TransactionsCursorResponse?.cursor.data ?? []
}

async function refused(run) {
  try {
    await run()
    return false
  } catch {
    return true
  }
}

const beforeRestart = client()
await beforeRestart.ledger.v2.createLedger({
  ledger: LEDGER,
  v2CreateLedgerRequest: {
    metadata: { purpose_digest: digest('package4-restart-recovery') },
  },
}, noRetry)
await beforeRestart.ledger.v2.insertSchema({
  idempotencyKey: digest(`${LEDGER}:schema`),
  ledger: LEDGER,
  version: SCHEMA_VERSION,
  v2SchemaData: package4Schema,
}, noRetry)

// Intentionally discard the accepted response to model a lost caller response.
await beforeRestart.ledger.v2.createTransaction(funding('1000000'), noRetry)

const composeArgs = [
  'compose',
  '-f', 'upstream/docker-compose.yml',
  '-f', 'docker-compose.spike.yml',
]
execFileSync('docker', [...composeArgs, 'restart', 'ledger'], { stdio: 'ignore' })
execFileSync(
  'docker',
  [...composeArgs, 'up', '-d', '--wait', '--no-deps', 'ledger'],
  { stdio: 'ignore', timeout: 30_000 },
)

// A fresh SDK instance represents the resumed Action process.
const afterRestart = client()
const recovered = await exactReference(afterRestart, reference)
const absent = await exactReference(afterRestart, `ae-p4:${digest(`${LEDGER}:absent`)}`)
const replay = await afterRestart.ledger.v2.createTransaction(funding('1000000'), noRetry)
const changedCommandRefused = await refused(async () => {
  await afterRestart.ledger.v2.createTransaction(funding('999999'), noRetry)
})

const recoveredTransaction = recovered[0]
const replayTransaction = replay.v2CreateTransactionResponse?.data
const evidence = {
  decision: recovered.length === 1
    && recoveredTransaction?.reference === reference
    && absent.length === 0
    && replayTransaction?.id === recoveredTransaction.id
    && changedCommandRefused
      ? 'PASS'
      : 'FAIL',
  ledger: LEDGER,
  acceptedResponseDiscarded: true,
  ledgerRestarted: true,
  recoveredByExactReference: recovered.length === 1,
  absentReferenceRemainsAbsent: absent.length === 0,
  replayReturnedOriginalTransaction: replayTransaction?.id === recoveredTransaction?.id,
  changedCommandRefused,
  blindResubmissionRequired: false,
}

console.log(JSON.stringify(evidence, null, 2))
process.exitCode = evidence.decision === 'PASS' ? 0 : 1
