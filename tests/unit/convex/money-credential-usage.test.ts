import { afterEach,describe,expect,it,vi } from 'vitest'
import { api,internal } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents,publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { digestReference } from '@/modules/money/public'
const ledger=vi.hoisted(()=>({listTransactions:vi.fn()}))
vi.mock('@/modules/money/formance',async original=>({...await original<typeof import('@/modules/money/formance')>(),
  readFormanceConfiguration:()=>({kind:'configured',configuration:{ledger:'fixture',environment:'sandbox',gatewayUrl:'https://fixture.invalid'}}),
  createFormanceContext:()=>({configuration:{ledger:'fixture',environment:'sandbox',gatewayUrl:'https://fixture.invalid'},sdk:{ledger:{v2:ledger}}}),
}))
const hash=`sha256:${'a'.repeat(64)}`,callRef=`operation-invocation:v1:${'a'.repeat(64)}`,buyerRef=`ae-p4:${'1'.repeat(64)}`,providerRef=`ae-p4:${'2'.repeat(64)}`,credentialId='credential:rotated'
const now=Date.UTC(2026,9,4),start=Date.UTC(2026,9,1)
afterEach(()=>{ledger.listTransactions.mockReset();vi.useRealTimers();vi.unstubAllEnvs()})
async function fixture(count=0){
  vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN','fixture-only-cursor-key-000000000000')
  const backend=convexTestWithMarketComponents(),owner=await publishedBusinessOwner(backend,'credential-usage-owner'),other=await publishedBusinessOwner(backend,'credential-usage-other')
  await backend.run(async ctx=>{
    const base={ownerId:owner.canonicalAccountRef,principalId:owner.canonicalPrincipalRef,credentialId,applicationRef:'app:one',toolRef:'tool:one',idempotencyKey:'private:key:never-export',environment:'sandbox' as const,grantRef:'grant:one',grantGeneration:1,policyDigest:hash,grantExpiresAt:now+1000000,inputDigest:hash,requestDigest:hash,updatedAt:start+1}
    await ctx.db.insert('capabilityCalls',{...base,callRef,state:'completed',createdAt:start-1,formanceFinancialState:'settled',formanceSettlementRefs:[buyerRef,providerRef],buyerSaleTransactionRef:buyerRef})
    for(let i=0;i<count;i++){const ref=`operation-invocation:v1:${(i+10).toString(16).padStart(64,'0')}`
      await ctx.db.insert('capabilityCalls',{...base,callRef:ref,state:'completed',createdAt:start+100+i,usage:{usageRef:`usage:${i}`,amount:{currency:'AUD',exponent:6,units:'0'},priceDigest:hash,chargeState:'free_tier',observedAt:start+100+i}})
    }
  })
  vi.setSystemTime(now+100000)
  return {backend,owner,other}
}
function page(accountRef:string,options:{id?:number;next?:string;unknown?:boolean}={}){
  const digest=digestReference('call',callRef)
  return {v2TransactionsCursorResponse:{cursor:{pageSize:15,hasMore:options.next!==undefined,...(options.next===undefined?{}:{next:options.next}),data:[{
    id:BigInt(options.id??1),reference:buyerRef,template:options.unknown?'UNKNOWN_TEMPLATE':'BUYER_SALE_SETTLED',timestamp:new Date(start+1000),insertedAt:new Date(start+1000),reverted:false,
    metadata:{account_digest:digestReference('account',accountRef),call_digest:digest,Authorization:'Bearer sk-SENTINEL-private'},
    postings:[{source:`calls:${digest}:buyer_reserved`,destination:'platform:revenue:sales',asset:'AUD/6',amount:10001n}],
  }]}}}
}
describe('credential activity and complete month usage',()=>{
  it('joins historical rotated credential settlements, preserves clocks and explicit unknown metadata without effects',async()=>{
    const f=await fixture(),args={principalId:f.owner.canonicalAccountRef,credentialId,currency:'AUD'}
    ledger.listTransactions.mockResolvedValueOnce(page(f.owner.canonicalAccountRef))
    const native=await f.owner.owner.action(internal.moneyFormance.readCredentialActivityPage,{accountRef:f.owner.canonicalAccountRef,credentialRef:credentialId})
    if(native.kind!=='available')throw new Error(native.code)
    expect(native).toMatchObject({kind:'available'})
    expect(await f.owner.owner.query(internal.moneyLedger.readCredentialActivityFacts,{accountRef:f.owner.canonicalAccountRef,credentialId,financial:native})).toMatchObject({kind:'ok'})
    ledger.listTransactions.mockResolvedValueOnce(page(f.owner.canonicalAccountRef))
    const activity=await f.owner.owner.action(api.moneyLedger.listCreditActivity,{...args,paginationOpts:{numItems:10,cursor:null}})
    expect(activity).toMatchObject({kind:'ok',coverage:'complete',timeBasis:'financial_effective',periodStartAt:start,page:[{credentialId,callRef,serviceRef:null,businessId:null,priceDigest:null,entryKind:'charge',callCreatedAt:start-1,effectiveAt:start+1000,grossAmount:{units:'10001'}}]})
    expect(JSON.stringify(activity)).not.toContain('private:key');expect(JSON.stringify(activity)).not.toContain('sk-SENTINEL')
    ledger.listTransactions.mockResolvedValueOnce(page(f.owner.canonicalAccountRef))
    const usage=await f.owner.owner.action(api.moneyLedger.readKeyUsage,args)
    expect(usage).toMatchObject({kind:'ok',callCount:0,paidCallCount:0,freeCallCount:0,grossSpend:{units:'10001'},netChargeUnits:'10001',countTimeBasis:'call_created',spendTimeBasis:'financial_effective',coverage:'complete'})
    expect(await f.backend.run(ctx=>ctx.db.query('moneyFundingCommands').collect())).toHaveLength(0)
  })
  it('traverses more than one native Call page, counts only evidenced free Calls, and marks unknown outcomes partial',async()=>{
    const f=await fixture(205),args={principalId:f.owner.canonicalAccountRef,credentialId,currency:'AUD'}
    expect(await f.owner.owner.query(internal.moneyLedger.readCredentialSource,{credentialId,periodStartAt:start,periodEndAt:Date.UTC(2026,10,1)})).toMatchObject({kind:'available'})
    expect(await f.owner.owner.query(internal.moneyLedger.readCredentialCreatedCalls,{credentialId,periodStartAt:start,periodEndAt:Date.UTC(2026,10,1),snapshotAt:now+100000,paginationOpts:{numItems:100,cursor:null}})).toMatchObject({isDone:false})
    const empty={v2TransactionsCursorResponse:{cursor:{data:[],hasMore:false,pageSize:15}}}
    ledger.listTransactions.mockResolvedValueOnce(empty)
    expect(await f.owner.owner.action(api.moneyLedger.readKeyUsage,args)).toMatchObject({kind:'ok',callCount:205,freeCallCount:205,paidCallCount:0,grossSpend:{units:'0'},coverage:'complete'})
    await f.backend.run(async ctx=>{const row=await ctx.db.query('capabilityCalls').withIndex('by_credentialId_and_createdAt',q=>q.eq('credentialId',credentialId).gte('createdAt',start)).first();await ctx.db.patch(row!._id,{usage:undefined,state:'pending'})})
    ledger.listTransactions.mockResolvedValueOnce(empty)
    expect(await f.owner.owner.action(api.moneyLedger.readKeyUsage,args)).toMatchObject({kind:'ok',callCount:205,freeCallCount:204,coverage:'partial',states:['free_tier','outcome_unknown']})
  })
  it('refuses foreign, unsupported currency, missing identity and forged cursor; keeps unsupported ledger entries partial',async()=>{
    const f=await fixture(),args={principalId:f.owner.canonicalAccountRef,credentialId,currency:'AUD'}
    expect(await f.backend.action(api.moneyLedger.readKeyUsage,args)).toMatchObject({kind:'refused',code:'unauthenticated'})
    expect(await f.other.owner.action(api.moneyLedger.readKeyUsage,args)).toMatchObject({kind:'refused',code:'billing_identity_mismatch'})
    expect(await f.owner.owner.action(api.moneyLedger.readKeyUsage,{...args,currency:'USDC'})).toMatchObject({kind:'refused',code:'credit_currency_unsupported'})
    ledger.listTransactions.mockResolvedValueOnce(page(f.other.canonicalAccountRef))
    expect(await f.other.owner.action(api.moneyLedger.readKeyUsage,{...args,principalId:f.other.canonicalAccountRef})).toMatchObject({kind:'refused',code:'credential_not_owned'})
    expect(await f.owner.owner.action(api.moneyLedger.listCreditActivity,{...args,paginationOpts:{numItems:10,cursor:'forged'}})).toMatchObject({kind:'refused',code:'credential_activity_cursor_invalid'})
    ledger.listTransactions.mockResolvedValueOnce(page(f.owner.canonicalAccountRef,{unknown:true}))
    expect(await f.owner.owner.action(api.moneyLedger.readKeyUsage,args)).toMatchObject({kind:'ok',coverage:'partial',grossSpend:{units:'0'}})
  })
  it('refuses cross-page transaction replay and never returns partial totals as complete',async()=>{
    const f=await fixture(),args={principalId:f.owner.canonicalAccountRef,credentialId,currency:'AUD'}
    ledger.listTransactions.mockResolvedValueOnce(page(f.owner.canonicalAccountRef,{id:2,next:'native:next'})).mockResolvedValueOnce(page(f.owner.canonicalAccountRef,{id:2}))
    expect(await f.owner.owner.action(api.moneyLedger.readKeyUsage,args)).toMatchObject({kind:'refused'})
    ledger.listTransactions.mockRejectedValueOnce(new Error('Authorization: sk-SENTINEL-private'))
    const errors=vi.spyOn(console,'error').mockImplementation(()=>{})
    expect(await f.owner.owner.action(api.moneyLedger.readKeyUsage,args)).toMatchObject({kind:'refused',code:'source_unavailable'})
    expect(JSON.stringify(errors.mock.calls)).not.toContain('sk-SENTINEL');errors.mockRestore()
    expect(await f.backend.query(internal.moneyLedger.readCredentialSource,{credentialId,periodStartAt:start,periodEndAt:Date.UTC(2026,10,1)})).toMatchObject({kind:'refused'})
  })
})
