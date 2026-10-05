import { describe, expect, it } from 'vitest'
import { reconcileUsage, usageReconciliationSchema, type FinancialUsageEntry, type ReconciliationCall } from '@/modules/money/public'
import { digestReference } from '@/modules/money/public'

const A = Date.UTC(2026, 7, 1), B = Date.UTC(2026, 8, 1), C = Date.UTC(2026, 9, 1), D = Date.UTC(2026, 10, 1)
const callRef = `operation-invocation:v1:${'a'.repeat(64)}`
const ref = (i: number) => `ae-p4:${String(i).padStart(64, '0')}`
const call: ReconciliationCall = { callRef, credentialRef: 'credential:shared', principalRef: 'principal:buyer', createdAt: A + 1, environment: 'production',
  providerDigest: digestReference('provider', 'provider:one'), settlementRefs: [ref(1), ref(2), ref(3)], refundRefs: [ref(4), ref(5)],
  providerSettlementRef: ref(2), providerReversalRef: null, providerObligationUnits: '400000' }
const entry = (id: number, kind: FinancialUsageEntry['kind'], units: string, occurredAt: number): FinancialUsageEntry => ({
  transactionId: String(id), transactionRef: ref(id), callDigest: digestReference('call', callRef), providerDigest: call.providerDigest,
  kind, units, occurredAt, recordedAt: occurredAt + 1, reverted: false })
function run(start: number, end: number, entries: FinancialUsageEntry[], sources: (string | null)[] = entries.map(() => callRef), calls = [call]) {
  return usageReconciliationSchema.parse(reconcileUsage({ periodStartAt: start, periodEndAt: end, calls, sources,
    financial: { kind: 'available', entries, snapshotAt: D, coverage: 'complete' } }))
}
function available(result: ReturnType<typeof run>) { if (result.kind !== 'available') throw new Error('test unavailable'); return result }

describe('usage reconciliation projections', () => {
  it('bridges created A, settled B and partially refunded C while provider cost remains', () => {
    const b = available(run(B,C,[entry(2,'provider_transfer','400000',B+2),entry(1,'charge','9007199254740993001',B+1),entry(3,'promotional_use','50',B+1)]))
    expect(b.totals).toMatchObject({ grossChargeUnits: '9007199254740993001', netChargeUnits: '9007199254740993001', providerTransferUnits: '400000', netProviderTransferUnits: '400000', netPromotionalUseUnits: '50' })
    expect(b.bridge[0]?.totals).toEqual(b.totals)
    expect(b.createdCallCountUnits).toBe('0')
    expect(b.credentials[0]).toMatchObject({ credentialRef: 'credential:shared', linkedCallCountUnits: '1', createdCallCountUnits: '0' })
    const c = available(run(C,D,[entry(5,'promotional_refund','20',C+2),entry(4,'refund','300',C+1)]))
    expect(c.totals).toMatchObject({ grossChargeUnits: '0', refundUnits: '300', netChargeUnits: '-300', providerReversalUnits: '0', netPromotionalUseUnits: '-20' })
    expect(c.bridge[0]?.totals).toEqual(c.totals)
    const a = available(run(A,B,[]))
    expect(a).toMatchObject({ createdCallCountUnits: '1', createdCallProviderObligationUnits: '400000', unknownProviderObligationCallCountUnits: '0' })
    expect(a.totals.providerTransferUnits).toBe('0') // no transfer effective in A; not a cost assertion about A's Calls
  })
  it('leaves unknown obligations and unproved credentials distinct from zero, with shared identity preserved', () => {
    const unknownCall = { ...call, providerObligationUnits: null, createdAt: B+1 }
    const result = available(run(B,C,[{ ...entry(1,'charge','100',B+1), callDigest: 'b'.repeat(64) }], [callRef], [unknownCall]))
    expect(result).toMatchObject({ unknownProviderObligationCallCountUnits: '1', attributionCoverage: 'partial', unattributedTransactionCountUnits: '1' })
    expect(result.credentials[0]).toMatchObject({ principalRefs: ['principal:buyer'], linkedCallCountUnits: '0', totals: { grossChargeUnits: '0' }, unknownProviderObligationCallCountUnits: '1' })
    expect(result.bridge[3]?.totals.grossChargeUnits).toBe('100')
  })
  it('rejects duplicate settlement evidence and counts one provider transfer once rather than two obligation legs', () => {
    const provider = entry(2,'provider_transfer','400000',B+1)
    expect(available(run(B,C,[provider])).totals.providerTransferUnits).toBe('400000')
    expect(() => run(B,C,[provider,provider])).toThrow('reconciliation_duplicate_transaction')
    expect(() => run(B,C,[provider,{ ...provider, transactionId: '90' }])).toThrow('reconciliation_duplicate_transaction')
  })

  it('keeps unsupported financial evidence visible with unknown amounts and partial coverage',()=>{
    const result=available(run(B,C,[{...entry(1,'charge','100',B+1),kind:'unsupported',units:null}], [null]))
    expect(result).toMatchObject({amountCoverage:'partial',attributionCoverage:'partial',unattributedTransactionCountUnits:'1',entries:[{kind:'unsupported',units:null,currency:null}]})
  })
  it('keeps reverted originals as incomplete, and rejects mixed periods or snapshots', () => {
    expect(available(run(B,C,[{ ...entry(1,'charge','100',B+1), reverted: true }])).amountCoverage).toBe('partial')
    expect(() => run(B,C,[entry(1,'charge','100',A+1)])).toThrow('reconciliation_period_invalid')
    expect(() => run(B,C,[{ ...entry(1,'charge','100',B+1), recordedAt: D+1 }])).toThrow('reconciliation_period_invalid')
  })
})
