import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import { SDK } from '@formance/formance-sdk'

import { package4Schema } from './package4-schema.mjs'

const LEDGER = `ae-package4-contention-${Date.now().toString(36)}-${process.pid}`
const SCHEMA_VERSION = 'v1.0.0'
const CALL_COUNT = 100
const WINNER_CAPACITY = 10
const AUD = 'AUD/6'
const USDC = 'USDC/6'
const BUDGET = 'AUD_BUDGET/6'
const EXPOSURE = 'AUD_EXPOSURE/6'

const sdk = new SDK({
  serverURL: 'http://127.0.0.1:8080',
  retryConfig: { strategy: 'none' },
  timeoutMs: 30_000,
})
const noRetry = Object.freeze({ retries: { strategy: 'none' } })
const digest = (value) => createHash('sha256').update(value).digest('hex')
const shared = Object.freeze({
  account: digest(`${LEDGER}:account`),
  agent: digest(`${LEDGER}:agent`),
  legalCustomer: digest(`${LEDGER}:legal-customer`),
  processor: digest(`${LEDGER}:processor`),
})
const accounts = Object.freeze({
  accountAvailable: `accounts:${shared.account}:available`,
  agentAvailable: `agents:${shared.agent}:budget_available`,
  agentReserved: `agents:${shared.agent}:budget_reserved`,
  legalAvailable: `legal_customers:${shared.legalCustomer}:exposure_available`,
  legalReserved: `legal_customers:${shared.legalCustomer}:exposure_reserved`,
  processor: `processor:${shared.processor}:settlement`,
  providerExpense: 'platform:expense:providers',
  treasuryAvailable: 'treasury:corporate:available',
  treasuryCommitted: 'treasury:corporate:committed',
})

function transaction(template, vars, ref) {
  const commandRef = digest(`${LEDGER}:${ref}`)
  return {
    idempotencyKey: commandRef,
    ledger: LEDGER,
    schemaVersion: SCHEMA_VERSION,
    v2PostTransaction: {
      metadata: {
        call_digest: digest(`${LEDGER}:call:${ref}`),
        command_digest: commandRef,
      },
      reference: `ae-p4:${commandRef}`,
      runtime: 'machine',
      script: { template, vars },
    },
  }
}

async function create(template, vars, ref) {
  return sdk.ledger.v2.createTransaction(transaction(template, vars, ref), noRetry)
}

function callAddresses(index) {
  const call = digest(`${LEDGER}:call:${index}`)
  return {
    callReserved: `calls:${call}:buyer_reserved`,
    obligation: `provider_obligations:${call}:accrued`,
  }
}

function reservation(index) {
  const perCall = callAddresses(index)
  const elements = [
    transaction('CALL_RESERVED', {
      account_available: accounts.accountAvailable,
      agent_available: accounts.agentAvailable,
      agent_reserved: accounts.agentReserved,
      budget_amount: `${BUDGET} 1`,
      buyer_amount: `${AUD} 1`,
      call_reserved: perCall.callReserved,
      exposure_amount: `${EXPOSURE} 1`,
      legal_available: accounts.legalAvailable,
      legal_reserved: accounts.legalReserved,
    }, `call:${index}:controls`),
    transaction('TREASURY_RESERVED', {
      amount: `${USDC} 1`,
      destination: accounts.treasuryCommitted,
      source: accounts.treasuryAvailable,
    }, `call:${index}:treasury`),
    transaction('PROVIDER_OBLIGATION_ACCRUED', {
      amount: `${USDC} 1`,
      expense: accounts.providerExpense,
      obligation: perCall.obligation,
    }, `call:${index}:obligation`),
  ].map((item) => ({
    action: 'CREATE_TRANSACTION',
    data: item.v2PostTransaction,
    ik: item.idempotencyKey,
  }))

  return {
    elements,
    refs: elements.map((element) => element.data.reference),
  }
}

async function submit(index) {
  const request = reservation(index)
  const startedAt = performance.now()
  const response = await sdk.ledger.v2.createBulk({
    atomic: true,
    continueOnFailure: false,
    ledger: LEDGER,
    parallel: false,
    requestBody: request.elements,
    schemaVersion: SCHEMA_VERSION,
  }, noRetry)
  const elapsedMs = performance.now() - startedAt
  const results = response.v2BulkResponse?.data ?? []
  return {
    committed: results.length === 3
      && results.every((result) => result.responseType === 'CREATE_TRANSACTION'),
    elapsedMs,
    refs: request.refs,
  }
}

async function balance(address, asset) {
  try {
    const response = await sdk.ledger.v2.getAccount({
      address,
      expand: 'volumes',
      ledger: LEDGER,
    }, noRetry)
    return response.v2AccountResponse?.data.volumes?.[asset]?.balance ?? 0n
  } catch {
    return 0n
  }
}

async function exactReference(reference) {
  const response = await sdk.ledger.v2.listTransactions({
    ledger: LEDGER,
    pageSize: 2,
    query: { $match: { reference } },
  }, noRetry)
  return response.v2TransactionsCursorResponse?.cursor.data ?? []
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

await sdk.ledger.v2.createLedger({
  ledger: LEDGER,
  v2CreateLedgerRequest: {
    metadata: { purpose_digest: digest('package4-contention-recovery') },
  },
}, noRetry)
await sdk.ledger.v2.insertSchema({
  idempotencyKey: digest(`${LEDGER}:schema`),
  ledger: LEDGER,
  version: SCHEMA_VERSION,
  v2SchemaData: package4Schema,
}, noRetry)

await create('FUNDING_SETTLED', {
  account: accounts.accountAvailable,
  amount: `${AUD} ${WINNER_CAPACITY}`,
  processor: accounts.processor,
}, 'seed:account')
await create('TREASURY_CAPACITY_SYNCED', {
  amount: `${BUDGET} ${WINNER_CAPACITY}`,
  capacity: accounts.agentAvailable,
}, 'seed:agent')
await create('TREASURY_CAPACITY_SYNCED', {
  amount: `${EXPOSURE} ${WINNER_CAPACITY}`,
  capacity: accounts.legalAvailable,
}, 'seed:legal-customer')
await create('TREASURY_CAPACITY_SYNCED', {
  amount: `${USDC} ${WINNER_CAPACITY}`,
  capacity: accounts.treasuryAvailable,
}, 'seed:treasury')

const settled = await Promise.allSettled(
  Array.from({ length: CALL_COUNT }, (_, index) => submit(index)),
)
const fulfilled = settled
  .filter((result) => result.status === 'fulfilled')
  .map((result) => result.value)
const winners = fulfilled.filter((result) => result.committed)
const winner = winners[0]
if (winner === undefined) throw new Error('contention_winner_missing')

const replayIndex = settled.findIndex(
  (result) => result.status === 'fulfilled' && result.value.refs[0] === winner.refs[0],
)
const replay = await submit(replayIndex)
const referenceReadback = await Promise.all(winner.refs.map(exactReference))
const warmReplayLatencies = []
const warmReadbackLatencies = []
for (let index = 0; index < 20; index += 1) {
  const replayStartedAt = performance.now()
  await submit(replayIndex)
  warmReplayLatencies.push(performance.now() - replayStartedAt)

  const readbackStartedAt = performance.now()
  await exactReference(winner.refs[0])
  warmReadbackLatencies.push(performance.now() - readbackStartedAt)
}

const losingIndexes = settled
  .map((result, index) => ({ index, won: result.status === 'fulfilled' && result.value.committed }))
  .filter(({ won }) => !won)
  .map(({ index }) => index)
const loserBalances = await Promise.all(losingIndexes.map(async (index) => {
  const perCall = callAddresses(index)
  return {
    buyer: await balance(perCall.callReserved, AUD),
    provider: await balance(perCall.obligation, USDC),
  }
}))

const observations = {
  accountAvailable: await balance(accounts.accountAvailable, AUD),
  agentAvailable: await balance(accounts.agentAvailable, BUDGET),
  agentReserved: await balance(accounts.agentReserved, BUDGET),
  legalAvailable: await balance(accounts.legalAvailable, EXPOSURE),
  legalReserved: await balance(accounts.legalReserved, EXPOSURE),
  treasuryAvailable: await balance(accounts.treasuryAvailable, USDC),
  treasuryCommitted: await balance(accounts.treasuryCommitted, USDC),
}
const exactWinners = winners.length === WINNER_CAPACITY
const exactScarcity = observations.accountAvailable === 0n
  && observations.agentAvailable === 0n
  && observations.agentReserved === BigInt(WINNER_CAPACITY)
  && observations.legalAvailable === 0n
  && observations.legalReserved === BigInt(WINNER_CAPACITY)
  && observations.treasuryAvailable === 0n
  && observations.treasuryCommitted === BigInt(WINNER_CAPACITY)
const losersAreAtomic = loserBalances.every(({ buyer, provider }) => buyer === 0n && provider === 0n)
const exactReadback = referenceReadback.every(
  (transactions, index) => transactions.length === 1 && transactions[0].reference === winner.refs[index],
)
const replayIsIdempotent = replay.committed
  && observations.agentReserved === BigInt(WINNER_CAPACITY)
const latencies = fulfilled.map(({ elapsedMs }) => elapsedMs)
const p95Ms = percentile(latencies, 0.95)
const warmReplayP95Ms = percentile(warmReplayLatencies, 0.95)
const warmReadbackP95Ms = percentile(warmReadbackLatencies, 0.95)
const warmOperatingEnvelopePassed = Math.max(warmReplayP95Ms, warmReadbackP95Ms) <= 150

const evidence = {
  decision: exactWinners
    && exactScarcity
    && losersAreAtomic
    && exactReadback
    && replayIsIdempotent
    && warmOperatingEnvelopePassed
      ? 'PASS'
      : 'FAIL',
  ledger: LEDGER,
  submitted: CALL_COUNT,
  winners: winners.length,
  losers: CALL_COUNT - winners.length,
  exactScarcity,
  losersAreAtomic,
  exactReadback,
  replayIsIdempotent,
  warmOperatingEnvelopePassed,
  latencyMs: {
    contentionP50: Number(percentile(latencies, 0.5).toFixed(2)),
    contentionP95: Number(p95Ms.toFixed(2)),
    contentionMaximum: Number(Math.max(...latencies).toFixed(2)),
    warmReadbackP95: Number(warmReadbackP95Ms.toFixed(2)),
    warmReplayP95: Number(warmReplayP95Ms.toFixed(2)),
  },
  balances: Object.fromEntries(
    Object.entries(observations).map(([key, value]) => [key, value.toString()]),
  ),
}

console.log(JSON.stringify(evidence, null, 2))
process.exitCode = evidence.decision === 'PASS' ? 0 : 1
