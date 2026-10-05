import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createFormanceContext, installPackage4FormanceSchema, PROMOTIONAL_FORMANCE_SCHEMA_VERSION } from '@/modules/money/formance'
import { readFormanceUsageReconciliation } from '@/modules/money/internal/formance-usage-reconciliation'

const digest = (value: string) => canonicalDigest(value).slice(7)
describe.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('native usage reconciliation snapshot', () => {
  it('pins insertion time across full native pagination, equal effective times, late settlements and reversals', async () => {
    const context = createFormanceContext({environment: 'sandbox', ledger: `ae-usage-proof-${randomUUID().replaceAll('-', '')}`,
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069', requestTimeoutMs: 30000})
    expect(await installPackage4FormanceSchema(context)).toMatchObject({kind: 'completed'})
    const accountDigest = digest('account:usage-proof'), callDigest = digest('call:usage-proof'), providerDigest = digest('provider:usage-proof')
    const treasury = `treasury:corporate:${digest('custody:usage-proof')}`
    const obligation = `provider_obligations:${callDigest}`, provider = `providers:${providerDigest}:settlement`
    const now = Date.now(), period = {periodStartAt: now - 86400_000, periodEndAt: now - 43200_000}, effectiveAt = now - 64800_000
    const seed = async (label: string, template: string, vars: Record<string,string>) => await context.sdk.ledger.v2.createTransaction({ledger: context.configuration.ledger, schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION, idempotencyKey: label,
      v2PostTransaction: {reference: `fixture:${label}`, timestamp: new Date(period.periodStartAt - 1000), metadata: {}, runtime: 'machine', script: {template, vars}}})
    await seed('usage-proof-capacity', 'TREASURY_CAPACITY_SYNCED', {capacity: `${treasury}:available`, amount: 'USDC/6 1000'})
    await seed('usage-proof-reservation', 'CALL_RESERVED_USDC', {source: `${treasury}:available`, destination: `${treasury}:committed`, amount: 'USDC/6 1000'})
    await seed('usage-proof-obligation', 'PROVIDER_OBLIGATION_ACCRUED', {expense: 'platform:expense:providers', obligation: `${obligation}:accrued`, amount: 'USDC/6 1000'})
    const post = async (label: string, timestamp: number, reverse = false) => await context.sdk.ledger.v2.createTransaction({
      ledger: context.configuration.ledger, schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION, idempotencyKey: label,
      v2PostTransaction: {reference: `ae-p4:${digest(label)}`, timestamp: new Date(timestamp), runtime: 'machine',
        metadata: {account_digest: accountDigest, call_digest: callDigest, provider_digest: providerDigest,
          command_digest: digest(`command:${label}`), idempotency_digest: digest(`key:${label}`), external_evidence_digest: digest(`evidence:${label}`)},
        script: reverse ? {template: 'PROVIDER_REVERSED', vars: {treasury_available: `${treasury}:available`, provider_settlement: provider, obligation_settled: `${obligation}:settled`, obligation_reversed: `${obligation}:reversed`, amount: 'USDC/6 1'}}
          : {template: 'PROVIDER_SETTLED', vars: {treasury_committed: `${treasury}:committed`, provider_settlement: provider, obligation_accrued: `${obligation}:accrued`, obligation_settled: `${obligation}:settled`, amount: 'USDC/6 1'}}}})
    let originalId: bigint | undefined
    for (let index = 0; index < 17; index += 1) {
      const transaction = await post(`equal-${index}`, effectiveAt)
      originalId ??= transaction.v2CreateTransactionResponse?.data.id
    }
    await new Promise(resolve => setTimeout(resolve, 10))
    const snapshotAt = Date.now()
    await new Promise(resolve => setTimeout(resolve, 10))
    await post('late-inserted-backdated', effectiveAt)
    await post('settlement-after-period', period.periodEndAt + 1000)
    const first = await readFormanceUsageReconciliation(context, {accountDigest, ...period, now: snapshotAt})
    expect(first).toMatchObject({kind: 'available', coverage: 'complete', snapshotAt})
    if (first.kind !== 'available') throw new Error(first.code)
    expect(first.entries).toHaveLength(17)
    expect(new Set(first.entries.map(row => row.transactionId)).size).toBe(17)
    expect(first.entries.every(row => row.occurredAt === effectiveAt && row.recordedAt !== null && row.recordedAt <= snapshotAt)).toBe(true)
    expect(first.entries.reduce((sum,row) => sum + BigInt(row.units ?? '0'), 0n)).toBe(17n)
    await post('explicit-provider-reversal', effectiveAt + 1000, true)
    await new Promise(resolve => setTimeout(resolve, 10))
    const current = await readFormanceUsageReconciliation(context, {accountDigest, ...period})
    expect(current).toMatchObject({kind: 'available', coverage: 'complete'})
    if (current.kind !== 'available') throw new Error(current.code)
    expect(current.entries.filter(row => row.kind === 'provider_transfer')).toHaveLength(18)
    expect(current.entries.filter(row => row.kind === 'provider_reversal')).toHaveLength(1)
    expect(current.entries).toHaveLength(19)
    if (originalId === undefined) throw new Error('native_transaction_id_missing')
    await context.sdk.ledger.v2.revertTransaction({ledger: context.configuration.ledger, schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION, id: originalId, idempotencyKey: 'native-reversal-after-cutoff', atEffectiveDate: true})
    const old = await readFormanceUsageReconciliation(context, {accountDigest, ...period, now: snapshotAt})
    if (old.kind === 'available') expect(old).toEqual(first)
    else expect(old).toEqual({kind: 'unavailable', code: 'formance_reconciliation_snapshot_invalid'})
  }, 30000)
})
