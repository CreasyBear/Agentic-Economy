import { createHash } from 'node:crypto'

import { SDK } from '@formance/formance-sdk'

import { PACKAGE4_TEMPLATE_NAMES, package4Schema } from './package4-schema.mjs'

const runRef = Date.now().toString(36)
const LEDGER = `ae-package4-lifecycle-${runRef}`
const SCHEMA_VERSION = 'v1.0.0'
const AUD = 'AUD/6'
const USDC = 'USDC/6'
const BUDGET = 'AUD_BUDGET/6'
const EXPOSURE = 'AUD_EXPOSURE/6'

const sdk = new SDK({
  serverURL: 'http://127.0.0.1:8080',
  retryConfig: { strategy: 'none' },
  timeoutMs: 10_000,
})

const noRetry = Object.freeze({ retries: { strategy: 'none' } })
const digest = (value) => createHash('sha256').update(value).digest('hex')
const refs = Object.freeze({
  account: digest('account'),
  adjustment: digest('adjustment'),
  agent: digest('agent'),
  call: digest('call'),
  legalCustomer: digest('legal-customer'),
  processor: digest('processor'),
  provider: digest('provider'),
})
const accounts = Object.freeze({
  accountAvailable: `accounts:${refs.account}:available`,
  accountReversal: `accounts:${digest('reversal-account')}:available`,
  adjustment: `adjustments:${refs.adjustment}:buyer`,
  agentAvailable: `agents:${refs.agent}:budget_available`,
  agentReserved: `agents:${refs.agent}:budget_reserved`,
  callReserved: `calls:${refs.call}:buyer_reserved`,
  legalAvailable: `legal_customers:${refs.legalCustomer}:exposure_available`,
  legalReserved: `legal_customers:${refs.legalCustomer}:exposure_reserved`,
  obligationAccrued: `provider_obligations:${refs.call}:accrued`,
  obligationSettled: `provider_obligations:${refs.call}:settled`,
  processor: `processor:${refs.processor}:settlement`,
  providerSettlement: `providers:${refs.provider}:settlement`,
  providerExpense: 'platform:expense:providers',
  revenue: 'platform:revenue:sales',
  tax: 'platform:tax:gst',
  treasuryAvailable: 'treasury:corporate:available',
  treasuryCommitted: 'treasury:corporate:committed',
})

function command(template, vars, suffix = template) {
  const commandRef = digest(`${LEDGER}:${suffix}`)
  return {
    idempotencyKey: commandRef,
    ledger: LEDGER,
    schemaVersion: SCHEMA_VERSION,
    v2PostTransaction: {
      metadata: {
        call_digest: refs.call,
        command_digest: commandRef,
      },
      reference: `ae-p4:${commandRef}`,
      runtime: 'machine',
      script: { template, vars },
    },
  }
}

function created(response) {
  const transaction = response.v2CreateTransactionResponse?.data
  if (transaction === undefined) throw new Error('transaction_response_missing')
  return transaction
}

async function create(template, vars, suffix) {
  return created(await sdk.ledger.v2.createTransaction(
    command(template, vars, suffix),
    noRetry,
  ))
}

async function balance(address, asset) {
  const response = await sdk.ledger.v2.getAccount({ address, expand: 'volumes', ledger: LEDGER }, noRetry)
  return response.v2AccountResponse?.data.volumes?.[asset]?.balance ?? 0n
}

async function refused(run) {
  try {
    await run()
    return false
  } catch {
    return true
  }
}

await sdk.ledger.v2.createLedger({
  ledger: LEDGER,
  v2CreateLedgerRequest: { metadata: { purpose_digest: digest('package4-commercial-lifecycle') } },
}, noRetry)

await sdk.ledger.v2.insertSchema({
  idempotencyKey: digest(`${LEDGER}:schema`),
  ledger: LEDGER,
  version: SCHEMA_VERSION,
  v2SchemaData: package4Schema,
}, noRetry)

const funding = await create('FUNDING_SETTLED', {
  account: accounts.accountAvailable,
  amount: `${AUD} 100000000`,
  processor: accounts.processor,
})

const reversibleFunding = await create('FUNDING_SETTLED', {
  account: accounts.accountReversal,
  amount: `${AUD} 1000000`,
  processor: accounts.processor,
}, 'reversible-funding')
const revertedFunding = await sdk.ledger.v2.revertTransaction({
  id: reversibleFunding.id,
  idempotencyKey: digest(`${LEDGER}:revert-funding`),
  ledger: LEDGER,
  schemaVersion: SCHEMA_VERSION,
  v2RevertTransactionRequest: {
    metadata: { command_digest: digest(`${LEDGER}:revert-funding`) },
  },
}, noRetry)
const duplicateRevert = await sdk.ledger.v2.revertTransaction({
  id: reversibleFunding.id,
  idempotencyKey: digest(`${LEDGER}:revert-funding`),
  ledger: LEDGER,
  schemaVersion: SCHEMA_VERSION,
  v2RevertTransactionRequest: {
    metadata: { command_digest: digest(`${LEDGER}:revert-funding`) },
  },
}, noRetry)

await create('TREASURY_CAPACITY_SYNCED', {
  amount: `${BUDGET} 20000000`,
  capacity: accounts.agentAvailable,
}, 'agent-budget')
await create('TREASURY_CAPACITY_SYNCED', {
  amount: `${EXPOSURE} 1000000000`,
  capacity: accounts.legalAvailable,
}, 'legal-exposure')
await create('TREASURY_CAPACITY_SYNCED', {
  amount: `${USDC} 100000000`,
  capacity: accounts.treasuryAvailable,
}, 'treasury-usdc')

const reservationElements = [
  {
    action: 'CREATE_TRANSACTION',
    ik: digest(`${LEDGER}:reserve-controls`),
    data: command('CALL_RESERVED', {
      account_available: accounts.accountAvailable,
      agent_available: accounts.agentAvailable,
      agent_reserved: accounts.agentReserved,
      budget_amount: `${BUDGET} 10000000`,
      buyer_amount: `${AUD} 10000000`,
      call_reserved: accounts.callReserved,
      exposure_amount: `${EXPOSURE} 10000000`,
      legal_available: accounts.legalAvailable,
      legal_reserved: accounts.legalReserved,
    }, 'reserve-controls').v2PostTransaction,
  },
  {
    action: 'CREATE_TRANSACTION',
    ik: digest(`${LEDGER}:reserve-treasury`),
    data: command('TREASURY_RESERVED', {
      amount: `${USDC} 6500000`,
      destination: accounts.treasuryCommitted,
      source: accounts.treasuryAvailable,
    }, 'reserve-treasury').v2PostTransaction,
  },
  {
    action: 'CREATE_TRANSACTION',
    ik: digest(`${LEDGER}:accrue-provider`),
    data: command('PROVIDER_OBLIGATION_ACCRUED', {
      amount: `${USDC} 6500000`,
      expense: accounts.providerExpense,
      obligation: accounts.obligationAccrued,
    }, 'accrue-provider').v2PostTransaction,
  },
]

const reservation = await sdk.ledger.v2.createBulk({
  atomic: true,
  continueOnFailure: false,
  ledger: LEDGER,
  parallel: false,
  requestBody: reservationElements,
  schemaVersion: SCHEMA_VERSION,
}, noRetry)

const reservationResults = reservation.v2BulkResponse?.data ?? []
const reservationCommitted = reservationResults.length === 3
  && reservationResults.every((result) => result.responseType === 'CREATE_TRANSACTION')

const sale = await create('BUYER_SALE_SETTLED', {
  call_reserved: accounts.callReserved,
  revenue: accounts.revenue,
  revenue_amount: `${AUD} 9090909`,
  tax: accounts.tax,
  tax_amount: `${AUD} 909091`,
})

const providerSettlement = await create('PROVIDER_SETTLED', {
  amount: `${USDC} 6500000`,
  obligation_accrued: accounts.obligationAccrued,
  obligation_settled: accounts.obligationSettled,
  provider_settlement: accounts.providerSettlement,
  treasury_committed: accounts.treasuryCommitted,
})

const adjustment = await create('BUYER_ADJUSTED', {
  amount: `${AUD} 1000000`,
  destination: accounts.adjustment,
  source: accounts.revenue,
})

const duplicateFunding = await sdk.ledger.v2.createTransaction(
  command('FUNDING_SETTLED', {
    account: accounts.accountAvailable,
    amount: `${AUD} 100000000`,
    processor: accounts.processor,
  }),
  noRetry,
)

const changedIdempotencyRefused = await refused(async () => {
  await sdk.ledger.v2.createTransaction({
    ...command('FUNDING_SETTLED', {
      account: accounts.accountAvailable,
      amount: `${AUD} 99000000`,
      processor: accounts.processor,
    }),
    idempotencyKey: command('FUNDING_SETTLED', {
      account: accounts.accountAvailable,
      amount: `${AUD} 100000000`,
      processor: accounts.processor,
    }).idempotencyKey,
  }, noRetry)
})

const wrongSchemaRefused = await refused(async () => {
  await sdk.ledger.v2.createTransaction({
    ...command('BUYER_ADJUSTED', {
      amount: `${AUD} 1`,
      destination: accounts.adjustment,
      source: accounts.revenue,
    }, 'wrong-schema'),
    schemaVersion: 'v9.9.9',
  }, noRetry)
})

const unknownTemplateRefused = await refused(async () => {
  await sdk.ledger.v2.createTransaction(command('UNKNOWN_TEMPLATE', {}, 'unknown-template'), noRetry)
})

const directPostingRefused = await refused(async () => {
  await sdk.ledger.v2.createTransaction({
    idempotencyKey: digest(`${LEDGER}:direct-posting`),
    ledger: LEDGER,
    schemaVersion: SCHEMA_VERSION,
    v2PostTransaction: {
      metadata: { command_digest: digest(`${LEDGER}:direct-posting`) },
      postings: [{
        amount: 1n,
        asset: AUD,
        destination: accounts.adjustment,
        source: accounts.revenue,
      }],
    },
  }, noRetry)
})

const insufficientFundsRefused = await refused(async () => {
  await create('CALL_RESERVED', {
    account_available: accounts.accountAvailable,
    agent_available: accounts.agentAvailable,
    agent_reserved: accounts.agentReserved,
    budget_amount: `${BUDGET} 999999999`,
    buyer_amount: `${AUD} 999999999`,
    call_reserved: accounts.callReserved,
    exposure_amount: `${EXPOSURE} 999999999`,
    legal_available: accounts.legalAvailable,
    legal_reserved: accounts.legalReserved,
  }, 'insufficient')
})

const zeroAmountAcceptedByOfficialApi = !await refused(async () => {
  await create('BUYER_ADJUSTED', {
    amount: `${AUD} 0`,
    destination: accounts.adjustment,
    source: accounts.revenue,
  }, 'zero-amount')
})

const negativeAmountRefused = await refused(async () => {
  await create('BUYER_ADJUSTED', {
    amount: `${AUD} -1`,
    destination: accounts.adjustment,
    source: accounts.revenue,
  }, 'negative-amount')
})

const malformedAmountRefused = await refused(async () => {
  await create('BUYER_ADJUSTED', {
    amount: 'not-money',
    destination: accounts.adjustment,
    source: accounts.revenue,
  }, 'malformed-amount')
})

const experimentalRuntimeAcceptedByOfficialApi = !await refused(async () => {
  const request = command('BUYER_ADJUSTED', {
    amount: `${AUD} 1`,
    destination: accounts.adjustment,
    source: accounts.revenue,
  }, 'experimental-runtime')
  request.v2PostTransaction.runtime = 'experimental-interpreter'
  await sdk.ledger.v2.createTransaction({ ...request, dryRun: true }, noRetry)
})

const nativeFamilyTypingAbsent = !await refused(async () => {
  const request = command('FUNDING_SETTLED', {
    account: accounts.revenue,
    amount: `${AUD} 1`,
    processor: accounts.processor,
  }, 'wrong-family-probe')
  await sdk.ledger.v2.createTransaction({ ...request, dryRun: true }, noRetry)
})

const nativeAssetTypingAbsent = !await refused(async () => {
  const request = command('FUNDING_SETTLED', {
    account: accounts.accountAvailable,
    amount: `${USDC} 1`,
    processor: accounts.processor,
  }, 'wrong-asset-probe')
  await sdk.ledger.v2.createTransaction({ ...request, dryRun: true }, noRetry)
})

const forceAcceptedByOfficialApi = !await refused(async () => {
  const request = command('BUYER_ADJUSTED', {
    amount: `${AUD} 1`,
    destination: accounts.adjustment,
    source: accounts.revenue,
  }, 'force-probe')
  request.v2PostTransaction.force = true
  await sdk.ledger.v2.createTransaction({ ...request, dryRun: true }, noRetry)
})

const observations = {
  accountAvailableAud: (await balance(accounts.accountAvailable, AUD)).toString(),
  accountReversalAud: (await balance(accounts.accountReversal, AUD)).toString(),
  adjustmentAud: (await balance(accounts.adjustment, AUD)).toString(),
  agentAvailableBudget: (await balance(accounts.agentAvailable, BUDGET)).toString(),
  legalAvailableExposure: (await balance(accounts.legalAvailable, EXPOSURE)).toString(),
  obligationAccruedUsdc: (await balance(accounts.obligationAccrued, USDC)).toString(),
  obligationSettledUsdc: (await balance(accounts.obligationSettled, USDC)).toString(),
  providerSettlementUsdc: (await balance(accounts.providerSettlement, USDC)).toString(),
  revenueAud: (await balance(accounts.revenue, AUD)).toString(),
  taxAud: (await balance(accounts.tax, AUD)).toString(),
  treasuryAvailableUsdc: (await balance(accounts.treasuryAvailable, USDC)).toString(),
  treasuryCommittedUsdc: (await balance(accounts.treasuryCommitted, USDC)).toString(),
}

const expected = {
  accountAvailableAud: '90000000',
  accountReversalAud: '0',
  adjustmentAud: '1000000',
  agentAvailableBudget: '10000000',
  legalAvailableExposure: '990000000',
  obligationAccruedUsdc: '0',
  obligationSettledUsdc: '6500000',
  providerSettlementUsdc: '6500000',
  revenueAud: '8090909',
  taxAud: '909091',
  treasuryAvailableUsdc: '93500000',
  treasuryCommittedUsdc: '0',
}

const exactBalances = Object.entries(expected).every(
  ([key, value]) => observations[key] === value,
)
const duplicateSameTransaction = duplicateFunding.v2CreateTransactionResponse?.data.id === funding.id
const revertTransaction = revertedFunding.v2CreateTransactionResponse?.data
const duplicateRevertTransaction = duplicateRevert.v2CreateTransactionResponse?.data
const fullReversalExact = revertTransaction !== undefined
  && duplicateRevertTransaction?.id === revertTransaction.id
  && observations.accountReversalAud === '0'
const templatesExact = (await sdk.ledger.v2.getSchema({
  ledger: LEDGER,
  version: SCHEMA_VERSION,
}, noRetry)).v2SchemaResponse?.data.transactions

const evidence = {
  decision: reservationCommitted
    && exactBalances
    && duplicateSameTransaction
    && changedIdempotencyRefused
    && wrongSchemaRefused
    && unknownTemplateRefused
    && directPostingRefused
    && insufficientFundsRefused
    && negativeAmountRefused
    && malformedAmountRefused
    && fullReversalExact
    && PACKAGE4_TEMPLATE_NAMES.every((name) => templatesExact?.[name] !== undefined)
      ? 'PASS'
      : 'FAIL',
  ledger: LEDGER,
  reservationCommitted,
  exactBalances,
  duplicateSameTransaction,
  changedIdempotencyRefused,
  wrongSchemaRefused,
  unknownTemplateRefused,
  directPostingRefused,
  insufficientFundsRefused,
  negativeAmountRefused,
  malformedAmountRefused,
  fullReversalExact,
  officialBoundaryLimitations: {
    experimentalRuntimeAcceptedByOfficialApi,
    forceAcceptedByOfficialApi,
    nativeAssetTypingAbsent,
    nativeFamilyTypingAbsent,
    zeroAmountAcceptedByOfficialApi,
  },
  transactionRefs: {
    adjustment: adjustment.reference,
    funding: funding.reference,
    providerSettlement: providerSettlement.reference,
    sale: sale.reference,
  },
  observations,
}

console.log(JSON.stringify(evidence, null, 2))
process.exitCode = evidence.decision === 'PASS' ? 0 : 1
