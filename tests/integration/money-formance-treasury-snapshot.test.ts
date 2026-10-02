import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createFormanceContext, installPackage4FormanceSchema, PROMOTIONAL_FORMANCE_SCHEMA_VERSION } from '@/modules/money/formance'
import { readFormanceTreasurySnapshot } from '@/modules/money/formance-treasury-snapshot'
import { readFormanceTreasuryAudit } from '@/modules/money/formance-treasury-audit'

const DAY = 86_400_000
const digest = (value: string) => canonicalDigest(value).slice(7)

describe.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('native treasury metric snapshot', () => {
  it('pins all balances to one PIT, separates liability families and pages cash settlement burn without counting obligations twice', async () => {
    const context = createFormanceContext({ environment: 'sandbox', ledger: `ae-treasury-snapshot-${randomUUID().replaceAll('-', '')}`,
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069', requestTimeoutMs: 30_000 })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
    const custodyRef = 'custody:native-snapshot'
    const custodyGeneration = 1
    const effectiveNow = Date.now() - 60_000
    const capacityDigest = canonicalDigest({ format: 'ae.formance-account-segment:v1', value: {
      kind: 'treasury_usdc', reference: { subjectRef: custodyRef, generation: custodyGeneration },
    } }).slice(7)
    const available = `treasury:corporate:${capacityDigest}:available`
    const committed = available.replace(/:available$/u, ':committed')
    const buffer = `treasury:corporate:${canonicalDigest({ kind: 'ae.treasury-buffer-account:v1', custodyRef, custodyGeneration }).slice(7)}:committed`
    const purchased = `accounts:${digest('customer')}:available`
    const purchasedReserved = `calls:${digest('reserved-call')}:buyer_reserved`
    const promotional = `accounts:${digest('customer')}:promo:${digest('grant')}:available`
    const promotionalReserved = `calls:${digest('reserved-call')}:buyer_promo_reserved`
    const provider = `providers:${digest('provider')}:settlement`
    const obligation = `obligations:${digest('obligation')}:accrued`
    const obligationSettled = `obligations:${digest('obligation')}:settled`
    const post = async (label: string, timestamp: number, postings: { destination: string; asset: string; amount: bigint }[]) =>
      await context.sdk.ledger.v2.createTransaction({ ledger: context.configuration.ledger, idempotencyKey: label,
        v2PostTransaction: { reference: `fixture:${label}`, metadata: {}, timestamp: new Date(timestamp),
          postings: postings.map(posting => ({ source: 'world', ...posting })) } })
    await post('seed', effectiveNow - 8 * DAY, [
      { destination: available, asset: 'USDC/6', amount: 500n },
      { destination: committed, asset: 'USDC/6', amount: 200n },
      { destination: buffer, asset: 'USDC/6', amount: 100n },
      { destination: obligation, asset: 'USDC/6', amount: 200n },
      { destination: purchased, asset: 'AUD/6', amount: 1000n },
      { destination: purchasedReserved, asset: 'AUD/6', amount: 200n },
      { destination: promotional, asset: 'AUD/6', amount: 300n },
      { destination: promotionalReserved, asset: 'AUD/6', amount: 40n },
      // Other account suffixes and assets cannot inflate customer liability.
      { destination: `accounts:${digest('customer')}:archive:available`, asset: 'AUD/6', amount: 9000n },
      { destination: purchased, asset: 'USDC/6', amount: 7000n },
    ])
    const settle = async (label: string, timestamp: number, amount: string) =>
      await context.sdk.ledger.v2.createTransaction({ ledger: context.configuration.ledger,
        schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION, idempotencyKey: label,
        v2PostTransaction: { reference: `ae-p4:${digest(label)}:settle-provider`, timestamp: new Date(timestamp),
          metadata: { call_digest: digest(label), external_evidence_digest: digest(`evidence:${label}`),
            command_digest: digest(`command:${label}`), idempotency_digest: digest(`idempotency:${label}`) },
          runtime: 'machine', script: { template: 'PROVIDER_SETTLED', vars: {
            treasury_committed: committed, provider_settlement: provider,
            obligation_accrued: obligation, obligation_settled: obligationSettled, amount: `USDC/6 ${amount}`,
          } } } })
    for (let index = 0; index < 16; index += 1) await settle(`old-${index}`, effectiveNow - 2 * DAY + index, '1')
    const recent = await settle('recent', effectiveNow - 1_000, '30')
    await new Promise(resolve => setTimeout(resolve, 5))
    const snapshotAt = Date.now()
    await new Promise(resolve => setTimeout(resolve, 5))
    // Later inserts deliberately backdate effective time. Only an insertion-bound
    // snapshot can exclude them consistently across aggregates and cursor pages.
    await post('later-funding', effectiveNow + 1_000, [
      { destination: available, asset: 'USDC/6', amount: 999n },
      { destination: purchased, asset: 'AUD/6', amount: 999n },
    ])
    await settle('later-payment', effectiveNow + 2_000, '40')
    const read = await readFormanceTreasurySnapshot(context, { custodyRef, custodyGeneration, snapshotAt })
    expect(read, JSON.stringify(read)).toMatchObject({ kind: 'available', snapshotAt,
      treasury: { availableUnits: '500', committedUnits: '154', bufferUnits: '100' },
      liabilityAud: { purchasedAvailableUnits: '1000', purchasedReservedUnits: '200', purchasedTotalUnits: '1200',
        promotionalAvailableUnits: '300', promotionalReservedUnits: '40', promotionalTotalUnits: '340' },
      settledUsdc: { basis: 'gross_provider_payments', last24hUnits: '30', last7dUnits: '46', oldestSettledAt: effectiveNow - 2 * DAY, newestSettledAt: effectiveNow - 1_000 },
    })
    if (read.kind !== 'available') throw new Error(read.code)
    expect(read.settledUsdc.settlements).toHaveLength(17)
    expect(new Set(read.settledUsdc.settlements.map(row => row.commandRef)).size).toBe(17)
    expect(read.settledUsdc.settlements).toContainEqual({ commandRef: `ae-p4:${digest('recent')}:settle-provider`,
      settledAt: effectiveNow - 1_000, amountUnits: '30', callDigest: digest('recent'), externalEvidenceDigest: digest('evidence:recent') })
    const audit = await readFormanceTreasuryAudit(context, { custodyRef, custodyGeneration, snapshotAt })
    expect(audit.kind).toBe('available')
    if (audit.kind !== 'available') throw new Error(audit.code)
    expect(audit.transactions).toHaveLength(18)
    expect(audit.transactions.filter(row => row.template === 'PROVIDER_SETTLED')).toHaveLength(17)
    expect(audit.transactions.every(row => row.insertedAt <= snapshotAt)).toBe(true)
    expect(audit.transactions.some(row => row.commandRef === 'fixture:later-funding')).toBe(false)
    expect(audit.transactions.some(row => row.commandRef === `ae-p4:${digest('later-payment')}:settle-provider`)).toBe(false)
    const recentId = recent.v2CreateTransactionResponse?.data.id
    if (recentId === undefined) throw new Error('missing native recent transaction')
    await context.sdk.ledger.v2.revertTransaction({ ledger: context.configuration.ledger, id: recentId,
      idempotencyKey: 'revert-after-cutoff', atEffectiveDate: true })
    // The native row's current revert marker cannot silently erase a payout
    // from the earlier snapshot. Unreconstructable history remains unavailable.
    const afterRevert = await readFormanceTreasurySnapshot(context, { custodyRef, custodyGeneration, snapshotAt })
    if (afterRevert.kind === 'available') expect(afterRevert).toEqual(read)
    else expect(afterRevert.kind).toBe('unavailable')
    // The complete audit exposes the current native revert marker and must
    // refuse its post-cutoff mutation rather than losing original evidence.
    const auditAfterRevert = await readFormanceTreasuryAudit(context, { custodyRef, custodyGeneration, snapshotAt })
    expect(auditAfterRevert).toEqual({ kind: 'unavailable', code: 'formance_treasury_audit_cutoff_invalid' })
  })
})
