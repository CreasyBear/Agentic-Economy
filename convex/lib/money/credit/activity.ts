import { type Infer } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { creditActivityResultValue,keyUsageResultValue } from './contracts'
import { credentialFinancialPageResult } from '../usageReconciliation/contracts'
import { credentialCreatedCallsResult } from './credentialFacts'
import type { CreditActivityView,ChargeState } from '@/modules/money/public'

type Page=Infer<typeof credentialFinancialPageResult>
async function admittedAccount(ctx:ActionCtx,args:{principalId:string;currency:string}){
  const actor=await resolveBusinessActor(ctx)
  if(actor.kind!=='authenticated_owner')return {kind:'refused' as const,code:'unauthenticated'}
  if(args.principalId!==actor.canonicalAccountRef)return {kind:'refused' as const,code:'billing_identity_mismatch'}
  if(args.currency!=='AUD')return {kind:'refused' as const,code:'credit_currency_unsupported'}
  return {kind:'admitted' as const,accountRef:actor.canonicalAccountRef}
}
async function readNativePage(ctx:ActionCtx,accountRef:string,credentialRef:string,cursor:string|null):Promise<Page>{
  return await ctx.runAction(internal.moneyFormance.readCredentialActivityPage,{accountRef,credentialRef,...(cursor===null?{}:{cursor})})
}
export async function listCreditActivityHandler(ctx:ActionCtx,args:{principalId:string;credentialId:string;currency:string;paginationOpts:Infer<typeof paginationOptsValidator>}):Promise<Infer<typeof creditActivityResultValue>>{
  const admission=await admittedAccount(ctx,args)
  if(admission.kind==='refused')return {...admission,items:[]}
  if(args.paginationOpts.numItems<1||args.paginationOpts.numItems>100)return {kind:'refused',code:'credit_activity_page_size_invalid',items:[]}
  try{const financial=await readNativePage(ctx,admission.accountRef,args.credentialId,args.paginationOpts.cursor)
    if(financial.kind!=='available')return {kind:'refused',code:financial.kind==='setup_required'?'source_unavailable':financial.code,items:[]}
    return await ctx.runQuery(internal.moneyLedger.readCredentialActivityFacts,{accountRef:admission.accountRef,credentialId:args.credentialId,financial})
  }catch{return {kind:'refused',code:'source_unavailable',items:[]}}
}
/** Complete native month traversal; totals are returned only after fresh owner
 * joins and source-version validation. It cannot change credit or money. */
export async function readKeyUsageHandler(ctx:ActionCtx,args:{principalId:string;credentialId:string;currency:string}):Promise<Infer<typeof keyUsageResultValue>>{
  const admission=await admittedAccount(ctx,args)
  if(admission.kind==='refused')return {...admission,items:[]}
  try{
    let cursor:string|null=null,period:{periodStartAt:number;periodEndAt:number;snapshotAt:number}|undefined,sourceVersionDigest:string|undefined
    const cursors=new Set<string>(),transactionRefs=new Set<string>()
    let gross=0n,refund=0n,promo=0n,promoRefund=0n,coverage:'complete'|'partial'='complete'
    for(;;){const financial=await readNativePage(ctx,admission.accountRef,args.credentialId,cursor)
      if(financial.kind!=='available'||financial.periodStartAt===undefined||financial.periodEndAt===undefined)return {kind:'refused',code:'source_unavailable',items:[]}
      if(period===undefined){period={periodStartAt:financial.periodStartAt,periodEndAt:financial.periodEndAt,snapshotAt:financial.snapshotAt}
        const source=await ctx.runQuery(internal.moneyLedger.readCredentialSource,{credentialId:args.credentialId,periodStartAt:period.periodStartAt,periodEndAt:period.periodEndAt})
        if(source.kind!=='available')return {kind:'refused',code:source.code,items:[]};sourceVersionDigest=source.sourceVersionDigest
      }
      if(financial.periodStartAt!==period.periodStartAt||financial.periodEndAt!==period.periodEndAt||financial.snapshotAt!==period.snapshotAt)return {kind:'refused',code:'credential_usage_snapshot_changed',items:[]}
      const activity=await ctx.runQuery(internal.moneyLedger.readCredentialActivityFacts,{accountRef:admission.accountRef,credentialId:args.credentialId,financial})
      if(activity.kind!=='ok')return activity
      if(activity.coverage==='partial')coverage='partial'
      for(const row of activity.page){
        if(row.transactionRef===undefined||transactionRefs.has(row.transactionRef))return {kind:'refused',code:'credential_usage_transaction_conflict',items:[]}
        transactionRefs.add(row.transactionRef);const units=BigInt(row.grossAmount.units)
        const kind:CreditActivityView['entryKind']=row.entryKind
        if(kind==='charge')gross+=units;else if(kind==='refund')refund+=units;else if(kind==='promotional_use')promo+=units;else if(kind==='promotional_refund')promoRefund+=units
        else return {kind:'refused',code:'credential_usage_attribution_incomplete',items:[]}
      }
      if(financial.isDone)break
      if(!financial.continueCursor||cursors.has(financial.continueCursor))return {kind:'refused',code:'credential_usage_cursor_invalid',items:[]}
      cursors.add(financial.continueCursor);cursor=financial.continueCursor
    }
    let createdCursor:string|null=null,callCount=0,paidCallCount=0,freeCallCount=0
    const states=new Set<ChargeState>(),calls=new Set<string>(),createdCursors=new Set<string>()
    for(;;){const page:Infer<typeof credentialCreatedCallsResult>=await ctx.runQuery(internal.moneyLedger.readCredentialCreatedCalls,{credentialId:args.credentialId,...period,paginationOpts:{numItems:100,cursor:createdCursor}})
      for(const call of page.page){if(calls.has(call.callRef))return {kind:'refused',code:'credential_usage_call_conflict',items:[]}
        calls.add(call.callRef);callCount++;if(call.chargeState==='paid'||call.chargeState==='refunded')paidCallCount++;if(call.chargeState==='free_tier')freeCallCount++;if(call.chargeState==='outcome_unknown')coverage='partial';states.add(call.chargeState)}
      if(page.isDone)break
      if(!page.continueCursor||createdCursors.has(page.continueCursor))return {kind:'refused',code:'credential_usage_cursor_invalid',items:[]}
      createdCursors.add(page.continueCursor);createdCursor=page.continueCursor
    }
    const current=await ctx.runQuery(internal.moneyLedger.readCredentialSource,{credentialId:args.credentialId,periodStartAt:period.periodStartAt,periodEndAt:period.periodEndAt})
    if(current.kind!=='available'||current.sourceVersionDigest!==sourceVersionDigest)return {kind:'refused',code:'credential_usage_source_changed',items:[]}
    if(!Number.isSafeInteger(callCount))return {kind:'refused',code:'credential_usage_count_unrepresentable',items:[]}
    return {kind:'ok',credentialId:args.credentialId,callCount,paidCallCount,freeCallCount,grossSpend:{currency:'AUD',exponent:6,units:gross.toString()},states:[...states].sort(),refundUnits:refund.toString(),netChargeUnits:(gross-refund).toString(),promotionalUseUnits:promo.toString(),promotionalRefundUnits:promoRefund.toString(),...period,countTimeBasis:'call_created',spendTimeBasis:'financial_effective',coverage,source:'formance_with_canonical_call_joins'}
  }catch{return {kind:'refused',code:'source_unavailable',items:[]}}
}
