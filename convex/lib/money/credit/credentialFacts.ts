import { v,type Infer } from 'convex/values'
import { paginationOptsValidator,paginationResultValidator } from 'convex/server'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { reconcileUsage, type CreditActivityView } from '@/modules/money/public'
import { readFactsForAccount } from '../usageReconciliation/facts'
import { credentialFinancialPageResult } from '../usageReconciliation/contracts'
import { creditActivityResultValue } from './contracts'
import { usageSourceVersionDigest } from '../../capabilityExecution/serviceUsage/sourceVersions'

async function ownedCredential(ctx:QueryCtx,accountRef:string,credentialId:string){
  if(!/^[A-Za-z0-9:._-]{1,200}$/u.test(credentialId))return false
  const bindings=await ctx.db.query('agentAccessPrincipals').withIndex('by_credentialId',q=>q.eq('credentialId',credentialId)).take(2)
  if(bindings.length===1&&bindings[0]?.ownerId===accountRef)return true
  if(bindings.length!==0)return false
  const calls=await ctx.db.query('capabilityCalls').withIndex('by_credentialId_and_createdAt',q=>q.eq('credentialId',credentialId)).take(2)
  return calls.length>0&&calls.every(call=>call.ownerId===accountRef)
}
export const credentialActivityJoinArgs={accountRef:v.string(),credentialId:v.string(),financial:credentialFinancialPageResult}
export async function readCredentialActivityFactsHandler(ctx:QueryCtx,args:{accountRef:string;credentialId:string;financial:Infer<typeof credentialFinancialPageResult>}):Promise<Infer<typeof creditActivityResultValue>>{
  const actor=await resolveBusinessActor(ctx)
  if(actor.kind!=='authenticated_owner'||actor.canonicalAccountRef!==args.accountRef)return {kind:'refused',code:'billing_identity_mismatch',items:[]}
  if(!await ownedCredential(ctx,args.accountRef,args.credentialId))return {kind:'refused',code:'credential_not_owned',items:[]}
  const read=args.financial
  if(read.kind!=='available'||read.periodStartAt===undefined||read.periodEndAt===undefined)return {kind:'refused',code:'source_unavailable',items:[]}
  const period={periodStartAt:read.periodStartAt,periodEndAt:read.periodEndAt},facts=await readFactsForAccount(ctx,{...period,entries:read.entries},args.accountRef,{includeCreatedCalls:false,maximumCallUpdatedAt:read.snapshotAt})
  if(facts.kind!=='available')return {kind:'refused',code:facts.code,items:[]}
  const reconciled=reconcileUsage({...period,financial:{kind:'available',entries:read.entries,snapshotAt:read.snapshotAt,coverage:read.coverage},calls:facts.calls,sources:facts.sources})
  const page:CreditActivityView[]=[]
  for(const entry of reconciled.entries){
    if(entry.credentialRef!==args.credentialId||entry.callRef===null||entry.units===null||entry.reverted||!['charge','refund','promotional_use','promotional_refund'].includes(entry.kind))continue
    const linkedCallRef=entry.callRef
    const call=await ctx.db.query('capabilityCalls').withIndex('by_callRef',q=>q.eq('callRef',linkedCallRef)).unique()
    if(call?.ownerId!==args.accountRef||call.credentialId!==args.credentialId)throw new Error('credential_activity_source_changed')
    const tool=call.toolJson===undefined?undefined:parsePublishedToolSnapshot(call.toolJson),receipt=call.result!==undefined&&'receipt' in call.result?call.result.receipt:undefined
    const price=receipt?.priceDigest??call.usage?.priceDigest??tool?.priceDigest
    const source=read.entries.find(row=>row.transactionId===entry.transactionId)
    const fee=receipt?.commercialModel==='account_aud'&&receipt.serviceFee.currency==='AUD'&&receipt.serviceFee.exponent===6?receipt.serviceFee.units:undefined
    page.push({activityRef:`credit-activity:${canonicalDigest({accountRef:args.accountRef,transactionId:entry.transactionId}).slice(7)}`,credentialId:args.credentialId,serviceRef:null,offeringRef:tool?.identity.offeringId??null,businessId:tool?.identity.businessId??null,operationKey:canonicalDigest({callRef:call.callRef,idempotencyKey:call.idempotencyKey}),callRef:call.callRef,attemptRef:call.attemptRef??null,grossAmount:{currency:'AUD',exponent:6,units:entry.units},chargeState:entry.kind==='refund'||entry.kind==='promotional_refund'?'refunded':'paid',priceDigest:price!==undefined&&/^sha256:[a-f0-9]{64}$/u.test(price)?price:null,observedAt:read.snapshotAt,
      ...(source?.transactionRef==null?{}:{transactionRef:source.transactionRef}),entryKind:entry.kind as NonNullable<CreditActivityView['entryKind']>,callCreatedAt:call.createdAt,effectiveAt:entry.occurredAt,recordedAt:entry.recordedAt,...(fee===undefined?{}:{serviceFeeUnits:fee})})
  }
  return {kind:'ok',page,isDone:read.isDone,continueCursor:read.continueCursor,...period,snapshotAt:read.snapshotAt,timeBasis:'financial_effective',coverage:reconciled.amountCoverage==='partial'||reconciled.attributionCoverage==='partial'?'partial':'complete',source:'formance_with_canonical_call_joins'}
}
export const credentialSourceArgs={credentialId:v.string(),periodStartAt:v.number(),periodEndAt:v.number()}
export const credentialSourceResult=v.union(v.object({kind:v.literal('available'),sourceVersionDigest:v.string()}),v.object({kind:v.literal('refused'),code:v.string()}))
export async function readCredentialSourceHandler(ctx:QueryCtx,args:{credentialId:string;periodStartAt:number;periodEndAt:number}){
  const actor=await resolveBusinessActor(ctx)
  if(actor.kind!=='authenticated_owner'||!await ownedCredential(ctx,actor.canonicalAccountRef,args.credentialId))return {kind:'refused' as const,code:'credential_not_owned'}
  return {kind:'available' as const,sourceVersionDigest:await usageSourceVersionDigest(ctx,{accountRef:actor.canonicalAccountRef,...args})}
}
export const credentialCreatedCallsArgs={...credentialSourceArgs,snapshotAt:v.number(),paginationOpts:paginationOptsValidator}
export const credentialCreatedCallsResult=paginationResultValidator(v.object({callRef:v.string(),chargeState:v.union(v.literal('free_tier'),v.literal('paid'),v.literal('insufficient_credit'),v.literal('outcome_unknown'),v.literal('refunded'))}))
export async function readCredentialCreatedCallsHandler(ctx:QueryCtx,args:{credentialId:string;periodStartAt:number;periodEndAt:number;snapshotAt:number;paginationOpts:Infer<typeof paginationOptsValidator>}){
  const actor=await resolveBusinessActor(ctx)
  if(actor.kind!=='authenticated_owner'||!await ownedCredential(ctx,actor.canonicalAccountRef,args.credentialId)||args.paginationOpts.numItems<1||args.paginationOpts.numItems>100)throw new Error('credential_not_owned')
  const page=await ctx.db.query('capabilityCalls').withIndex('by_credentialId_and_createdAt',q=>q.eq('credentialId',args.credentialId).gte('createdAt',args.periodStartAt).lt('createdAt',args.periodEndAt)).paginate(args.paginationOpts)
  const records:Array<Infer<typeof credentialCreatedCallsResult>['page'][number]>=[]
  for(const row of page.page){
    if(row.ownerId!==actor.canonicalAccountRef)throw new Error('credential_not_owned')
    if(row._creationTime>args.snapshotAt)continue
    const known=row.updatedAt<=args.snapshotAt,usage=known?row.usage:undefined,result=known?row.result:undefined
    const receipt=result!==undefined&&'receipt' in result?result.receipt:undefined
    const chargeState=usage?.chargeState==='free_tier'&&usage.amount.currency==='AUD'&&usage.amount.exponent===6&&usage.amount.units==='0'?'free_tier' as const
      :receipt?.commercialModel==='account_aud'&&receipt.state==='refunded'&&row.formanceFinancialState==='released'?'refunded' as const
      :receipt?.commercialModel==='account_aud'&&receipt.state==='settled'&&row.formanceFinancialState==='settled'?'paid' as const
      :result?.kind==='refused'&&result.code==='insufficient_balance'?'insufficient_credit' as const:'outcome_unknown' as const
    records.push({callRef:row.callRef,chargeState})
  }
  return {...page,page:records}
}
