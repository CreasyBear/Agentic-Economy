import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFormanceUsageReconciliation, type FormanceContext } from '@/modules/money/formance'
const accountDigest = 'a'.repeat(64), callDigest = 'b'.repeat(64), providerDigest = 'c'.repeat(64), treasury = 'd'.repeat(64)
const input = { accountDigest, periodStartAt: 100, periodEndAt: 2000, now: 3000 }
const available = `accounts:${accountDigest}:available`, reserved = `calls:${callDigest}:buyer_reserved`
const p = (source: string, destination: string, amount: bigint, asset = 'AUD/6') => ({ source, destination, amount, asset })
const txn = (id: number, template: string, postings: ReturnType<typeof p>[]) => ({ id: BigInt(id), template, postings, reference: `ae-p4:${String(id).padStart(64,'0')}`,
  timestamp: new Date(1000), insertedAt: new Date(1100), reverted: false, metadata: { account_digest: accountDigest, call_digest: callDigest, provider_digest: providerDigest } })
const page = (data: unknown[], next?: string) => ({ v2TransactionsCursorResponse: { cursor: { data, hasMore: next !== undefined, pageSize: 15, ...(next === undefined ? {} : { next }) } } })
function fixture(...pages: ReturnType<typeof page>[]) { const listTransactions = vi.fn(); for (const row of pages) listTransactions.mockResolvedValueOnce(row)
  return { listTransactions, context: { configuration: { ledger: 'fixture' }, sdk: { ledger: { v2: { listTransactions } } } } as unknown as FormanceContext } }
afterEach(() => vi.restoreAllMocks())
describe('native SDK usage reconciliation contract', () => {
  it('excludes unspent release and double-entry obligations, separates promotional credit, and preserves equal timestamps', async () => {
    const provider = txn(4,'PROVIDER_SETTLED',[
      p(`treasury:corporate:${treasury}:committed`,`providers:${providerDigest}:settlement`,40n,'USDC/6'),
      p(`provider_obligations:${callDigest}:accrued`,`provider_obligations:${callDigest}:settled`,40n,'USDC/6') ])
    const { context, listTransactions } = fixture(page([
      txn(7,'BUYER_SALE_REFUNDED',[p('platform:revenue:sales',available,25n)]),
      txn(6,'CALL_RELEASED_AUD',[p(reserved,available,20n)]),
      txn(5,'BUYER_SALE_SETTLED',[p(reserved,'platform:revenue:sales',90n),p(reserved,'platform:tax:gst',10n)]), provider,
    ],'official-next'),page([txn(3,'CALL_PROMO_SETTLED',[p(`calls:${callDigest}:buyer_promo_reserved`,'platform:expense:marketing',30n)])]))
    const result = await readFormanceUsageReconciliation(context,input)
    expect(result).toMatchObject({ kind: 'available', coverage: 'complete', entries: [ {kind:'refund',units:'25'}, {kind:'charge',units:'100'}, {kind:'provider_transfer',units:'40'}, {kind:'promotional_use',units:'30'} ] })
    expect(listTransactions.mock.calls[0]?.[0]).toMatchObject({ pit: new Date(3000), sort: 'id:desc', query: { $and: [
      {$match:{'metadata[account_digest]':accountDigest}}, {$gte:{timestamp:new Date(100).toISOString()}}, {$lt:{timestamp:new Date(2000).toISOString()}}, {$lte:{inserted_at:new Date(3000).toISOString()}} ] } })
    expect(listTransactions.mock.calls[1]?.[0]).toEqual({ ledger:'fixture',cursor:'official-next' })
  })

  it('reads a provider reversal as one USDC transfer and retains provider cost after unpaid buyer release',async()=>{
    const reversed=txn(2,'PROVIDER_REVERSED',[p(`providers:${providerDigest}:settlement`,`treasury:corporate:${treasury}:available`,40n,'USDC/6'),p(`provider_obligations:${callDigest}:settled`,`provider_obligations:${callDigest}:reversed`,40n,'USDC/6')])
    const {context}=fixture(page([reversed,txn(1,'CALL_RELEASED_AUD',[p(reserved,available,100n)])]))
    expect(await readFormanceUsageReconciliation(context,input)).toMatchObject({kind:'available',entries:[{kind:'provider_reversal',units:'40'}]})
  })
  it.each(['foreign','out_of_period','late_insert','late_revert','repeated_id','wrong_asset','extra_leg'])('fails closed on %s without partial totals', async kind => {
    let row = txn(1,'PROVIDER_SETTLED',[p(`treasury:corporate:${treasury}:committed`,`providers:${providerDigest}:settlement`,40n,'USDC/6'),p(`provider_obligations:${callDigest}:accrued`,`provider_obligations:${callDigest}:settled`,40n,'USDC/6')])
    if (kind==='foreign') row={...row,metadata:{...row.metadata,account_digest:'f'.repeat(64)}}
    if (kind==='out_of_period') row={...row,timestamp:new Date(2000)}
    if (kind==='late_insert') row={...row,insertedAt:new Date(3001)}
    if (kind==='wrong_asset') row={...row,postings:row.postings.map(post=>({...post,asset:'AUD/6'}))}
    if (kind==='extra_leg') row={...row,postings:[...row.postings,p('one','two',1n,'USDC/6')]}
    const candidate = kind==='late_revert' ? {...row,revertedAt:new Date(3001)} : row
    const {context}=fixture(page(kind==='repeated_id'?[candidate,candidate]:[candidate]))
    expect(await readFormanceUsageReconciliation(context,input)).toMatchObject({kind:'unavailable'})
  })

  it('retains unsupported transaction identity with unknown amount instead of silently omitting an audit gap',async()=>{
    const {context}=fixture(page([txn(1,'UNKNOWN_TEMPLATE',[p('one','two',99n,'USDC/6')])]))
    expect(await readFormanceUsageReconciliation(context,input)).toMatchObject({kind:'available',coverage:'partial',entries:[{transactionId:'1',kind:'unsupported',units:null}]})
  })
  it('allowlists metadata and logs only error class; receipt payloads and signed URLs never escape', async () => {
    const sentinel='sk-SENTINEL-PRIVATE-123'
    const {context,listTransactions}=fixture(page([{...txn(1,'BUYER_SALE_SETTLED',[p(reserved,'platform:revenue:sales',5n)]),
      metadata:{account_digest:accountDigest,call_digest:callDigest,Authorization:`Bearer ${sentinel}`,error:{receipt:`https://signed.example?token=${sentinel}`,privateText:sentinel}}}]))
    const result=await readFormanceUsageReconciliation(context,input)
    expect(JSON.stringify(result)).not.toContain(sentinel)
    const logs=vi.spyOn(console,'error').mockImplementation(()=>{})
    listTransactions.mockRejectedValueOnce(new Error(`Authorization: Bearer ${sentinel}; https://signed.example?token=${sentinel}`))
    expect(await readFormanceUsageReconciliation(context,input)).toEqual({kind:'unavailable',code:'formance_read_unavailable'})
    expect(JSON.stringify(logs.mock.calls)).not.toContain(sentinel)
    expect(JSON.stringify(logs.mock.calls)).not.toContain('signed.example')
  })
})
