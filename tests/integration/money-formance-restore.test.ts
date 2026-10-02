import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/freshness'
import {
  createFormanceContext, executeFormanceMoneyCommand, installPackage4FormanceSchema,
  readFormanceHealth, readFormanceTransactionByReference, type FormanceConfiguration,
  type FormanceContext, type FormanceMoneyCommand,
} from '@/modules/money/formance'
import {
  adjustFormanceSpendingPeriod, bookFormanceFundingReversal, bookFormanceFundingSettlement,
  managedCallAccounts, prepareFormanceFundingSettlement, prepareFormancePromotionalCreditGrant,
  promotionalGrantAccount, refundFormanceSettledSale, releaseFormanceManagedCall,
  reserveFormanceManagedCall, settleFormanceManagedCall, syncFormanceCapacity,
  type FormanceFundingBooking, type FormanceManagedCallBooking,
} from '@/modules/money/formance-workflows'
import { bookFormanceTreasuryBatch, treasuryBufferAccount } from '@/modules/money/formance-treasury'
import { readFormanceRestoreSnapshot } from '@/modules/money/formance-restore'
import { captureFormanceRestoreBaseline, verifyFormanceRestore } from '../../tools/release/formance-restore'

const runFile = promisify(execFile)
const compose = resolve('tests/config/native-money/compose.yml')
const SOURCE_PROJECT = 'ae-restore-proof-source'
const TARGET_PROJECT = 'ae-restore-proof-target'
const SOURCE_PORT = '3179'
const TARGET_PORT = '3182'
const BINARY_LIMIT = 32 * 1024 * 1024
const policyDigest = canonicalDigest({ fixture: 'restore-policy' })
const evidenceDigest = canonicalDigest({ fixture: 'restore-evidence' })
const accountRef = 'account:restore-source'
const secondAccountRef = 'account:restore-second'
const principalRef = 'principal:restore'
const legalCustomerRef = 'legal:restore'
const custodyRef = 'custody:restore'
const grantRef = 'promo:restore'
const now = Date.now()
const day = currentUtcDayBounds(now)
const month = currentUtcMonthBounds(now)

/**
 * Requires two explicitly provisioned disposable Compose projects; the target
 * has PostgreSQL only. Root owns startup/cleanup and no shared stack is selected.
 * Ensures a real database backup/restore preserves complete native state and
 * original replay identity; every falsifier independently changes its category.
 * Invariant: all seed commands come from canonical money builders; no source
 * writes occur between baseline scans and dump. Only the target is corrupted.
 * On violation: fail, including Docker failure, ambiguous replay or incomplete
 * evidence. No counts-only PASS and no ignored shell/native response failures.
 * Complexity: fixture-local literal child-process calls reuse the maintained
 * Compose stack; no restore service, transport, dependency or test framework.
 */
async function docker(project: typeof SOURCE_PROJECT | typeof TARGET_PROJECT, args: readonly string[], binary: true): Promise<Buffer>
async function docker(project: typeof SOURCE_PROJECT | typeof TARGET_PROJECT, args: readonly string[], binary?: false): Promise<string>
async function docker(project: typeof SOURCE_PROJECT | typeof TARGET_PROJECT, args: readonly string[], binary = false): Promise<Buffer | string> {
  const result = await runFile('docker', ['compose', '--project-name', project, '-f', compose, ...args], {
    env: { ...process.env, AE_NATIVE_MONEY_PORT: project === SOURCE_PROJECT ? SOURCE_PORT : TARGET_PORT },
    encoding: binary ? 'buffer' : 'utf8', timeout: 60_000, maxBuffer: BINARY_LIMIT,
  })
  return result.stdout
}

async function restoreDatabase(dump: Buffer): Promise<void> {
  // Literal arguments, binary stdin, no shell expansion and no production URI.
  const restore = spawn('docker', ['compose', '--project-name', TARGET_PROJECT, '-f', compose,
    'exec', '-T', 'postgres', 'pg_restore', '-U', 'ledger', '-d', 'ledger', '--exit-on-error'], {
    env: { ...process.env, AE_NATIVE_MONEY_PORT: TARGET_PORT }, stdio: ['pipe', 'ignore', 'pipe'], timeout: 60_000,
  })
  let stderrBytes = 0
  restore.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length })
  await new Promise<void>((resolveRestore, reject) => {
    restore.once('error', () => reject(new Error('restore_fixture_process_unavailable')))
    restore.stdin.once('error', () => reject(new Error('restore_fixture_stdin_failed')))
    restore.once('close', code => code === 0 ? resolveRestore()
      : reject(new Error(`restore_fixture_database_failed:${code}:${stderrBytes}`)))
    restore.stdin.end(dump)
  })
}

function funding(label: string, principalUnits: string, account = accountRef): FormanceFundingBooking {
  return { commandRef: `restore-funding:${label}`, idempotencyKey: `restore-funding:${label}`,
    accountRef: account, processorRef: 'processor:restore', principalUnits,
    serviceFeeUnits: '1', taxUnits: '1', totalUnits: (BigInt(principalUnits) + 2n).toString(),
    policyDigest, externalEvidenceDigest: evidenceDigest }
}

function fundingCommand(input: FormanceFundingBooking): FormanceMoneyCommand {
  const prepared = prepareFormanceFundingSettlement(input)
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  return prepared.command
}

function booking(label: string): FormanceManagedCallBooking {
  return {
    callRef: `call:restore:${label}`, quoteRef: `quote:restore:${label}`, idempotencyKey: `call-key:restore:${label}`,
    accountRef, principalRef, agentBudgetGeneration: 1, legalCustomerRef, legalCustomerGeneration: 1,
    treasuryRef: custodyRef, treasuryGeneration: 1, toolRef: 'tool:restore', providerRef: 'provider:restore',
    authorityGeneration: 1, policyGeneration: 1, buyerAmountUnits: '100', buyerRevenueUnits: '90', buyerTaxUnits: '10', providerAmountUnits: '10',
    quoteDigest: canonicalDigest({ fixture: 'quote', label }), inputDigest: canonicalDigest({ fixture: 'input', label }), policyDigest,
    rateEvidenceDigest: evidenceDigest, treasuryEvidenceDigest: evidenceDigest, x402RequirementDigest: evidenceDigest,
    spendingPeriods: { version: 'ae.spending-periods:v1',
      daily: { ...day, revision: 1, limitUnits: '10000' }, monthly: { ...month, revision: 1, limitUnits: '10000' } },
    promotionalCreditAllocation: { version: 'ae.promotional-credit-allocation:v1', purchasedUnits: '60',
      grants: [{ grantRef, amountUnits: '40', expiresAt: now + 86_400_000 }] },
  }
}

async function seedFinancialFamilies(context: FormanceContext): Promise<void> {
  const promotional = prepareFormancePromotionalCreditGrant({ grantRef, accountRef, amountUnits: '200',
    expiresAt: now + 86_400_000, commandDigest: evidenceDigest })
  if (promotional.kind !== 'prepared') throw new Error(promotional.code)
  expect(await executeFormanceMoneyCommand(context, promotional.command)).toMatchObject({ kind: 'completed' })
  for (const period of [{ periodKind: 'day' as const, ...day }, { periodKind: 'month' as const, ...month }]) {
    expect(await adjustFormanceSpendingPeriod(context, { principalRef, ...period, revision: 1,
      previousLimitUnits: '0', targetLimitUnits: '10000', authorityDigest: policyDigest })).toMatchObject({ kind: 'completed' })
  }
  expect(await syncFormanceCapacity(context, { commandRef: 'capacity:restore:legal', idempotencyKey: 'capacity:restore:legal',
    kind: 'legal_customer_exposure', subjectRef: legalCustomerRef, generation: 1, targetUnits: '10000', policyDigest,
    externalEvidenceDigest: evidenceDigest })).toMatchObject({ kind: 'completed' })
  const identity = { environment: 'sandbox' as const, custodyRef, custodyGeneration: 1, network: 'eip155:84532',
    asset: '0x036cbd53842c5426634e7929541ec2318f3dcf7e', address: `0x${'2'.repeat(40)}`, bufferTargetUnits: '1000' }
  expect(await bookFormanceTreasuryBatch(context, identity, {
    batchRef: canonicalDigest({ fixture: 'restore-opening' }), custodyRef, custodyGeneration: 1,
    previousCheckpoint: null, previousBufferUnits: '0', bufferIncreaseUnits: '1000',
    observation: { kind: 'observed', environment: 'sandbox', network: identity.network, asset: identity.asset,
      address: identity.address, fromBlock: '100', checkpoint: { blockNumber: '100', blockHash: `0x${'4'.repeat(64)}`, balanceUnits: '10000' },
      blockTimestamp: now, transfers: [], caughtUp: true, observedAt: now }, state: { kind: 'pending' }, createdAt: now,
  })).toMatchObject({ kind: 'completed' })

  const settled = booking('settled-refund')
  expect(await reserveFormanceManagedCall(context, settled)).toMatchObject({ kind: 'completed' })
  const settlement = await settleFormanceManagedCall(context, { booking: settled, externalEvidenceDigest: evidenceDigest })
  expect(settlement).toMatchObject({ kind: 'completed' })
  if (settlement.kind !== 'completed') throw new Error('restore_fixture_settlement_failed')
  expect(await refundFormanceSettledSale(context, { booking: settled, originalSettlementRefs: settlement.transactionRefs,
    reportDigest: canonicalDigest({ fixture: 'restore-refund-report' }) })).toMatchObject({ kind: 'completed' })
  const released = booking('released')
  expect(await reserveFormanceManagedCall(context, released)).toMatchObject({ kind: 'completed' })
  expect(await releaseFormanceManagedCall(context, { booking: released, externalEvidenceDigest: evidenceDigest,
    submissionProvenAbsent: true })).toMatchObject({ kind: 'completed' })
  expect(await reserveFormanceManagedCall(context, booking('still-reserved'))).toMatchObject({ kind: 'completed' })
}

async function snapshot(configuration: FormanceConfiguration) {
  const result = await readFormanceRestoreSnapshot(configuration)
  if (result.kind !== 'available') throw new Error(result.code)
  return result.snapshot
}

async function waitForLedger(context: FormanceContext): Promise<void> {
  const deadline = Date.now() + 30_000
  do {
    if ((await readFormanceHealth(context)).kind === 'ready') return
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
  } while (Date.now() < deadline)
  throw new Error('restore_fixture_native_not_ready')
}

describe.runIf(process.env.AE_FORMANCE_RESTORE_INTEGRATION === 'true')('complete native Formance database restore', () => {
  it('restores over 1000 canonical rows, preserves original native replay, and refuses each independent drift category', async () => {
    const ledger = `ae-restore-${randomUUID().replaceAll('-', '')}`
    const sourceConfiguration: FormanceConfiguration = { environment: 'sandbox', ledger,
      gatewayUrl: `http://127.0.0.1:${SOURCE_PORT}`, requestTimeoutMs: 10_000 }
    const targetConfiguration: FormanceConfiguration = { ...sourceConfiguration, gatewayUrl: `http://127.0.0.1:${TARGET_PORT}` }
    const source = createFormanceContext(sourceConfiguration)
    const target = createFormanceContext(targetConfiguration)
    // Project literals and distinct ports prevent accidentally selecting port 3069.
    expect(await docker(SOURCE_PROJECT, ['ps', '--services', '--status', 'running'])).toContain('ledger')
    const targetServices = (await docker(TARGET_PROJECT, ['ps', '--services', '--status', 'running'])).trim().split('\n')
    expect(targetServices).toEqual(['postgres'])
    expect(await installPackage4FormanceSchema(source)).toMatchObject({ kind: 'completed' })

    // Fund original first: after the fill it lies beyond the first 1000 rows in
    // descending native order. Its persisted IK is included in the database dump.
    const original = fundingCommand(funding('original', '1000'))
    expect(await executeFormanceMoneyCommand(source, original)).toMatchObject({ kind: 'completed', replayed: false })
    expect(await bookFormanceFundingSettlement(source, funding('second-account', '20', secondAccountRef))).toMatchObject({ kind: 'completed' })
    await seedFinancialFamilies(source)
    const fillers = Array.from({ length: 1005 }, (_, index) => fundingCommand(funding(`fill:${index}`, '1', `account:restore:fill:${index}`)))
    for (let offset = 0; offset < fillers.length; offset += 100) {
      const chunk = fillers.slice(offset, offset + 100)
      const schemaVersion = chunk[0]?.schemaVersion
      if (schemaVersion === undefined) throw new Error('restore_fixture_empty_chunk')
      const response = await source.sdk.ledger.v2.createBulk({ ledger, atomic: true, continueOnFailure: false, parallel: false, schemaVersion,
        requestBody: chunk.map(command => ({ action: 'CREATE_TRANSACTION', ik: command.idempotencyKey,
          data: { reference: command.commandRef, metadata: command.metadata, runtime: 'machine', script: { template: command.template, vars: command.variables } } })),
      }, { retries: { strategy: 'none' }, timeoutMs: 30_000 })
      const rows = response.v2BulkResponse?.data
      expect(rows).toHaveLength(chunk.length)
      expect(rows?.every((row, index) => row.responseType === 'CREATE_TRANSACTION' && row.data.reference === chunk[index]?.commandRef)).toBe(true)
    }

    const baseline = await captureFormanceRestoreBaseline(sourceConfiguration, original)
    expect(baseline.summary.counts.transactions).toBeGreaterThan(1000)
    expect(baseline.summary.counts.accounts).toBeGreaterThan(1000)
    const before = await snapshot(sourceConfiguration)
    expect(before.summary).toEqual(baseline.summary)
    const addresses = before.accounts.map(account => account.address)
    const reserved = managedCallAccounts(booking('still-reserved'))
    if (reserved === undefined) throw new Error('restore_fixture_reservation_accounts_invalid')
    expect(addresses).toEqual(expect.arrayContaining([
      original.variables.account, fundingCommand(funding('second-account', '20', secondAccountRef)).variables.account,
      promotionalGrantAccount(accountRef, grantRef), reserved.callReserved, reserved.treasuryCommitted,
      reserved.providerSettlement, treasuryBufferAccount({ custodyRef, custodyGeneration: 1 }),
      'platform:revenue:sales', 'platform:tax:gst',
    ]))

    const dump = await docker(SOURCE_PROJECT, ['exec', '-T', 'postgres', 'pg_dump', '-U', 'ledger', '-d', 'ledger', '--format=custom'], true)
    expect(dump.length).toBeGreaterThan(0)
    await restoreDatabase(dump)
    await docker(TARGET_PROJECT, ['up', '-d', 'ledger', 'gateway'])
    await waitForLedger(target)
    expect((await snapshot(targetConfiguration)).summary).toEqual(baseline.summary)
    const proof = await verifyFormanceRestore(targetConfiguration, baseline, original)
    expect(proof).toEqual({ verification: 'PASS', evidenceClass: 'formance-ledger-restore', transactionId: baseline.transactionId,
      summary: baseline.summary, restoreTime: baseline.restoreTime })
    const nativeOriginal = await readFormanceTransactionByReference(target, original.commandRef)
    expect(nativeOriginal).toMatchObject({ kind: 'found', transactionId: baseline.transactionId })
    expect((await snapshot(targetConfiguration)).summary).toEqual(baseline.summary)

    // A structurally valid command can retain metadata while changing variables.
    // Capture alone is not acceptance: the native idempotency binding must refuse
    // the changed body, and no financial state may change on that refusal.
    const wrongMaterial = { ...original, variables: { ...original.variables,
      principal_amount: 'AUD/6 1001', total_amount: 'AUD/6 1003' } }
    const wrongBaseline = await captureFormanceRestoreBaseline(sourceConfiguration, wrongMaterial)
    await expect(verifyFormanceRestore(targetConfiguration, wrongBaseline, wrongMaterial))
      .rejects.toMatchObject({ code: 'formance_restore_native_replay_failed' })
    expect((await snapshot(targetConfiguration)).summary).toEqual(baseline.summary)

    // An old row change is invisible to the retired newest 1000-only proof.
    await target.sdk.ledger.v2.addMetadataOnTransaction({ ledger, id: BigInt(baseline.transactionId),
      requestBody: { restore_fixture_drift: 'oldest-row' }, idempotencyKey: 'restore-drift:metadata', schemaVersion: original.schemaVersion })
    const oldRowChanged = await snapshot(targetConfiguration)
    expect(oldRowChanged.summary.digests.transactions).not.toBe(before.summary.digests.transactions)
    expect(oldRowChanged.summary.counts.transactions).toBe(before.summary.counts.transactions)
    await expect(verifyFormanceRestore(targetConfiguration, baseline, original)).rejects.toMatchObject({ mismatches: expect.arrayContaining(['transactions']) })

    const aggregateBefore = (await target.sdk.ledger.v2.getBalancesAggregated({ ledger })).v2AggregateBalancesResponse?.data
    if (aggregateBefore === undefined) throw new Error('restore_fixture_aggregate_missing')
    const fromAccount = original.variables.account
    const toAccount = fundingCommand(funding('second-account', '20', secondAccountRef)).variables.account
    if (fromAccount === undefined || toAccount === undefined) throw new Error('restore_fixture_accounts_missing')
    const individual = async (address: string) => (await target.sdk.ledger.v2.getAccount({ ledger, address, expand: 'volumes' })).v2AccountResponse?.data.volumes?.['AUD/6']?.balance
    const left = await individual(fromAccount)
    const right = await individual(toAccount)
    expect(await bookFormanceFundingReversal(target, funding('redistribute-reversal', '10'))).toMatchObject({ kind: 'completed' })
    expect(await bookFormanceFundingSettlement(target, funding('redistribute-credit', '10', secondAccountRef))).toMatchObject({ kind: 'completed' })
    expect((await target.sdk.ledger.v2.getBalancesAggregated({ ledger })).v2AggregateBalancesResponse?.data).toEqual(aggregateBefore)
    if (typeof left !== 'bigint' || typeof right !== 'bigint') throw new Error('restore_fixture_balance_missing')
    expect(await individual(fromAccount)).toBe(left - 10n)
    expect(await individual(toAccount)).toBe(right + 10n)
    expect((left - 10n) + (right + 10n)).toBe(left + right)
    const redistributed = await snapshot(targetConfiguration)
    expect(redistributed.summary.digests.accounts).not.toBe(oldRowChanged.summary.digests.accounts)
    await expect(verifyFormanceRestore(targetConfiguration, baseline, original)).rejects.toMatchObject({ mismatches: expect.arrayContaining(['accounts']) })

    const filler = fillers[0]
    if (filler === undefined) throw new Error('restore_fixture_filler_missing')
    const reverseCandidate = await readFormanceTransactionByReference(target, filler.commandRef)
    if (reverseCandidate.kind !== 'found') throw new Error('restore_fixture_reverse_row_missing')
    await target.sdk.ledger.v2.revertTransaction({ ledger, id: BigInt(reverseCandidate.transactionId),
      idempotencyKey: 'restore-drift:revert', atEffectiveDate: true, schemaVersion: filler.schemaVersion })
    const reverted = await snapshot(targetConfiguration)
    expect(reverted.summary.digests.transactions).not.toBe(redistributed.summary.digests.transactions)
    const revertedOriginal = reverted.transactions.find(row => row.reference === filler.commandRef)
    expect(revertedOriginal).toMatchObject({ reverted: true, revertedAt: expect.any(String) })
    await expect(verifyFormanceRestore(targetConfiguration, baseline, original)).rejects.toMatchObject({ mismatches: expect.arrayContaining(['transactions']) })

    // Native schema versions are immutable through the public API. This one
    // corruption targets only the literal disposable project's known 2.4.14
    // table, with generated/validated identifiers and a valid JSON description.
    // It leaves the version unchanged and must change the schema category alone.
    if (!/^ae-restore-[a-f0-9]{32}$/u.test(ledger) || !/^v\d+\.\d+\.\d+$/u.test(original.schemaVersion)) {
      throw new Error('restore_fixture_sql_identifier_invalid')
    }
    const changed = await docker(TARGET_PROJECT, ['exec', '-T', 'postgres', 'psql', '-U', 'ledger', '-d', 'ledger',
      '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c',
      `WITH changed AS (UPDATE _default.schemas SET transactions = jsonb_set(transactions, '{FUNDING_SETTLED,description}', '"Restore drift fixture"'::jsonb, true) WHERE ledger = '${ledger}' AND version = '${original.schemaVersion}' RETURNING 1) SELECT count(*) FROM changed;`,
    ])
    expect(changed.trim()).toBe('1')
    const schemaChanged = await snapshot(targetConfiguration)
    expect(schemaChanged.schemas.map(schema => schema.version)).toEqual(reverted.schemas.map(schema => schema.version))
    expect(schemaChanged.summary.digests.schemas).not.toBe(reverted.summary.digests.schemas)
    expect(schemaChanged.summary.digests.transactions).toBe(reverted.summary.digests.transactions)
    expect(schemaChanged.summary.digests.accounts).toBe(reverted.summary.digests.accounts)
    await expect(verifyFormanceRestore(targetConfiguration, baseline, original)).rejects.toMatchObject({ mismatches: expect.arrayContaining(['schemas']) })
  }, 240_000)
})
