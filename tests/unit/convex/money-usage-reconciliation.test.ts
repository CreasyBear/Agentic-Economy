import { makeFunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { digestReference, type UsageReconciliation } from '@/modules/money/public'
const ledger=vi.hoisted(()=>({listTransactions:vi.fn()}))
vi.mock('@/modules/money/formance',async original=>({...await original<typeof import('@/modules/money/formance')>(),
  readFormanceConfiguration:()=>({kind:'configured',configuration:{ledger:'fixture'}}),
  createFormanceContext:()=>({configuration:{ledger:'fixture'},sdk:{ledger:{v2:ledger}}}),
}))
const read=makeFunctionReference<'action',{periodStartAt:number;periodEndAt:number},UsageReconciliation>('moneyUsageReconciliation:readOwnerReconciliation')
const period={periodStartAt:Date.UTC(2026,8,1),periodEndAt:Date.UTC(2026,9,1)}
const callRef=`operation-invocation:v1:${'a'.repeat(64)}`,provider='provider:reconciliation'
const buyerRef=`ae-p4:${'1'.repeat(64)}`,providerRef=`ae-p4:${'2'.repeat(64)}`
function page(accountRef:string, digest=digestReference('call',callRef)) {
  const account=digestReference('account',accountRef),prov=digestReference('provider',provider),t=period.periodStartAt+1000
  return {v2TransactionsCursorResponse:{cursor:{data:[
    {id:2n,reference:providerRef,template:'PROVIDER_SETTLED',timestamp:new Date(t),insertedAt:new Date(t),reverted:false,
      metadata:{account_digest:account,call_digest:digest,provider_digest:prov},postings:[
        {source:`treasury:corporate:${'c'.repeat(64)}:committed`,destination:`providers:${prov}:settlement`,asset:'USDC/6',amount:40n},
        {source:`provider_obligations:${digest}:accrued`,destination:`provider_obligations:${digest}:settled`,asset:'USDC/6',amount:40n}]},
    {id:1n,reference:buyerRef,template:'BUYER_SALE_SETTLED',timestamp:new Date(t),insertedAt:new Date(t),reverted:false,
      metadata:{account_digest:account,call_digest:digest},postings:[{source:`calls:${digest}:buyer_reserved`,destination:'platform:revenue:sales',asset:'AUD/6',amount:100n}]},
  ],hasMore:false,pageSize:15}}}
}
afterEach(()=>ledger.listTransactions.mockReset())
describe('owner financial reconciliation',()=>{
  it('attributes a prior-month Call to its original Credential only through native and canonical evidence',async()=>{
    const backend=convexTestWithMarketComponents(), first=await publishedBusinessOwner(backend,'reconcile-first'),second=await publishedBusinessOwner(backend,'reconcile-second')
    await backend.run(async ctx=>{
      await ctx.db.insert('capabilityCalls',{callRef,ownerId:first.canonicalAccountRef,principalId:first.canonicalPrincipalRef,credentialId:'credential:original',applicationRef:'application:one',toolRef:'tool:one',idempotencyKey:'key:one',environment:'sandbox',grantRef:'grant:one',grantGeneration:1,policyDigest:'sha256:one',grantExpiresAt:Date.now()+10000,inputDigest:'sha256:one',requestDigest:'sha256:one',formanceFinancialState:'settled',formanceSettlementRefs:[buyerRef,providerRef],buyerSaleTransactionRef:buyerRef,state:'completed',createdAt:period.periodStartAt-1000,updatedAt:period.periodStartAt+1000})
      await ctx.db.insert('moneyProviderObligations',{obligationRef:'obligation:one',callRef,toolRef:'tool:one',providerRef:provider,buyerAccountRef:first.canonicalAccountRef,buyerAsset:'AUD',buyerExponent:6,buyerAmountUnits:'100',providerAsset:'USDC',providerExponent:6,providerAmountUnits:'40',settlementMethod:'managed_x402',state:'settled',payoutEligibility:'ineligible_x402',evidenceRefs:[],settlementTransactionRef:providerRef,createdAt:period.periodStartAt-1000,updatedAt:period.periodStartAt+1000})
    })
    ledger.listTransactions.mockResolvedValueOnce(page(first.canonicalAccountRef))
    const result=await first.owner.action(read,period)
    expect(result).toMatchObject({kind:'available',attributionCoverage:'complete',createdCallCountUnits:'0',totals:{grossChargeUnits:'100',providerTransferUnits:'40'},credentials:[{credentialRef:'credential:original',linkedCallCountUnits:'1',totals:{grossChargeUnits:'100',providerTransferUnits:'40'}}],bridge:expect.arrayContaining([{callCreated:'before_period',totals:expect.objectContaining({grossChargeUnits:'100'})}])})
    ledger.listTransactions.mockResolvedValueOnce(page(second.canonicalAccountRef))
    expect(await second.owner.action(read,period)).toMatchObject({kind:'available',attributionCoverage:'partial',unattributedTransactionCountUnits:'2',credentials:[]})
    ledger.listTransactions.mockResolvedValueOnce(page(first.canonicalAccountRef,'d'.repeat(64)))
    expect(await first.owner.action(read,period)).toMatchObject({kind:'available',attributionCoverage:'partial',credentials:[]})
  })

  it('attributes a measured older pure-promotional Call only after checking canonical settlement refs',async()=>{
    const backend=convexTestWithMarketComponents(),owner=await publishedBusinessOwner(backend,'reconcile-promo')
    const promoRef=`ae-p4:${'3'.repeat(64)}`,now=period.periodStartAt-1000
    await backend.run(async ctx=>{
      await ctx.db.insert('capabilityCalls',{callRef,ownerId:owner.canonicalAccountRef,principalId:owner.canonicalPrincipalRef,credentialId:'credential:promo',applicationRef:'application:one',toolRef:'tool:one',idempotencyKey:'key:promo',environment:'sandbox',grantRef:'grant:one',grantGeneration:1,policyDigest:'sha256:one',grantExpiresAt:Date.now()+10000,inputDigest:'sha256:one',requestDigest:'sha256:one',formanceFinancialState:'settled',formanceSettlementRefs:[buyerRef,providerRef,promoRef],buyerSaleTransactionRef:buyerRef,promotionalCreditAllocation:{version:'ae.promotional-credit-allocation:v1',purchasedUnits:'0',grants:[{grantRef:'promo:one',amountUnits:'100',expiresAt:period.periodEndAt}]},state:'completed',createdAt:now,updatedAt:now})
      await ctx.db.insert('capabilityServiceUsageRecords',{usageRef:'usage:promo',callRef,callDigest:digestReference('call',callRef),accountRef:owner.canonicalAccountRef,principalRef:owner.canonicalPrincipalRef,credentialRef:'credential:promo',applicationRef:'application:one',toolRef:'tool:one',providerRef:provider,environment:'sandbox',unitDefinitionRef:'delivered_request:v1',quantityUnits:'1',quantityExponent:0,source:'validated_call_result',priceDigest:`sha256:${'f'.repeat(64)}`,timeBasis:'call_updated',callCreatedAt:now,occurredAt:now,observedAt:now})
    })
    const t=period.periodStartAt+1000,digest=digestReference('call',callRef)
    const response={v2TransactionsCursorResponse:{cursor:{data:[{id:1n,reference:promoRef,template:'CALL_PROMO_SETTLED',timestamp:new Date(t),insertedAt:new Date(t),reverted:false,metadata:{account_digest:digestReference('account',owner.canonicalAccountRef),call_digest:digest},postings:[{source:`calls:${digest}:buyer_promo_reserved`,destination:'platform:expense:marketing',asset:'AUD/6',amount:100n}]}],hasMore:false,pageSize:15}}}
    ledger.listTransactions.mockResolvedValueOnce(response)
    expect(await owner.owner.action(read,period)).toMatchObject({kind:'available',attributionCoverage:'complete',totals:{grossChargeUnits:'0',promotionalUseUnits:'100'},credentials:[{credentialRef:'credential:promo',totals:{promotionalUseUnits:'100'}}]})
    const transaction=response.v2TransactionsCursorResponse.cursor.data[0]
    ledger.listTransactions.mockResolvedValueOnce({...response,v2TransactionsCursorResponse:{cursor:{...response.v2TransactionsCursorResponse.cursor,data:[{...transaction,reference:`ae-p4:${'4'.repeat(64)}`} ]}}})
    expect(await owner.owner.action(read,period)).toMatchObject({kind:'available',attributionCoverage:'partial',unattributedTransactionCountUnits:'1',credentials:[]})
  })
  it('rejects unauthenticated access and client-selected Accounts without touching the ledger',async()=>{
    const backend=convexTestWithMarketComponents()
    expect(await backend.action(read,period)).toMatchObject({kind:'refused'})
    const owner=await publishedBusinessOwner(backend,'reconcile-forged')
    const forged=makeFunctionReference<'action',{periodStartAt:number;periodEndAt:number;accountRef:string},UsageReconciliation>('moneyUsageReconciliation:readOwnerReconciliation')
    await expect(owner.owner.action(forged,{...period,accountRef:'account:other'})).rejects.toThrow()
    expect(ledger.listTransactions).not.toHaveBeenCalled()
  })
  it('rechecks authority after the native read before returning Credential data',async()=>{
    const backend=convexTestWithMarketComponents(),owner=await publishedBusinessOwner(backend,'reconcile-revoked')
    ledger.listTransactions.mockImplementationOnce(async()=>{
      await backend.run(async ctx=>{for(const row of await ctx.db.query('accountOwnerships').collect()) if(row.accountRef===owner.canonicalAccountRef) await ctx.db.delete(row._id)})
      return page(owner.canonicalAccountRef)
    })
    expect(await owner.owner.action(read,period)).toMatchObject({kind:'refused'})
  })
})
