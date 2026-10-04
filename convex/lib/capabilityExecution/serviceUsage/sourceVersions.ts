import {enqueueMoneyAlertEvaluation} from '../../principalAccount/notifications/usageAlerts'
import {degradeBackend} from '@/lib/observability/degrade-backend'
import { Triggers } from 'convex-helpers/server/triggers'
import type { DataModel, Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'

export const usageSourceTriggers = new Triggers<DataModel>()
const SHARDS = 16
const monthOf = (timestamp:number) => new Date(timestamp).toISOString().slice(0,7)
function shardOf(callRef:string) { return Number.parseInt(canonicalDigest(callRef).slice(7,9),16) % SHARDS }
async function advance(ctx: MutationCtx, accountRef:string, month:string, shard:number) {
  const row=await ctx.db.query('capabilityUsageSourceVersions').withIndex('by_accountRef_and_month_and_shard',q=>q.eq('accountRef',accountRef).eq('month',month).eq('shard',shard)).unique()
  if(row === null) await ctx.db.insert('capabilityUsageSourceVersions',{accountRef,month,shard,generationUnits:'1'})
  else await ctx.db.patch(row._id,{generationUnits:(BigInt(row.generationUnits)+1n).toString()})
}
async function changedCalls(ctx:MutationCtx, before:Doc<'capabilityCalls'>|null, after:Doc<'capabilityCalls'>|null) {
  const scopes=new Map<string,{accountRef:string;month:string;shard:number}>()
  for(const call of [before,after]) if(call !== null){
    const scope={accountRef:call.ownerId,month:monthOf(call.createdAt),shard:shardOf(call.callRef)}
    scopes.set(JSON.stringify(scope),scope)
  }
  for(const scope of scopes.values()) await advance(ctx,scope.accountRef,scope.month,scope.shard)
}
usageSourceTriggers.register('capabilityCalls',async(ctx,change)=>{
  const inner={...ctx,db:ctx.innerDb}
  await changedCalls(inner,change.oldDoc,change.newDoc)
  if(change.newDoc?.state==='completed'&&(change.oldDoc?.state!=='completed'||change.oldDoc.usage?.transactionRef!==change.newDoc.usage?.transactionRef)){
    try{await enqueueMoneyAlertEvaluation(inner,change.newDoc.ownerId,true)}catch{degradeBackend(new Error('usage_alert_enqueue_unavailable'),undefined,{site:'usageAlertEvaluation',reason:'source_unavailable'})}
  }
})
usageSourceTriggers.register('capabilityCallProjections',async(ctx,change)=>{
  const scopes=new Map<string,{accountRef:string;month:string;shard:number}>()
  for(const row of [change.oldDoc,change.newDoc]) if(row !== null){
    const scope={accountRef:row.accountRef,month:monthOf(row.createdAt),shard:shardOf(row.callRef)};scopes.set(JSON.stringify(scope),scope)
  }
  for(const scope of scopes.values()) await advance({...ctx,db:ctx.innerDb},scope.accountRef,scope.month,scope.shard)
})
for(const table of ['capabilityServiceUsageRecords','capabilityServiceUsageRevisions','capabilityServiceUnitObservations'] as const){
  usageSourceTriggers.register(table,async(ctx,change)=>{
    const refs=new Set([change.oldDoc?.callRef,change.newDoc?.callRef])
    for(const callRef of refs) if(callRef !== undefined){
      const call=await ctx.innerDb.query('capabilityCalls').withIndex('by_callRef',q=>q.eq('callRef',callRef)).unique()
      if(call !== null) await changedCalls({...ctx,db:ctx.innerDb},call,null)
    }
  })
}
/** Finite source-version vector, independent of the number of Calls. Each
 * source write and version change commit in the same SDK-trigger transaction.
 * Restores/imports must retire unfinished jobs before serving the restored DB. */
export async function usageSourceVersionDigest(ctx:Pick<QueryCtx,'db'>,scope:{accountRef:string;periodStartAt:number;periodEndAt:number}):Promise<string>{
  const current=new Date(scope.periodStartAt), last=monthOf(scope.periodEndAt-1), months:string[]=[]
  current.setUTCDate(1);current.setUTCHours(0,0,0,0)
  for(;;){const month=monthOf(current.getTime());months.push(month);if(month === last)break;current.setUTCMonth(current.getUTCMonth()+1);if(months.length>14)throw new Error('usage_version_period_invalid')}
  const versions=[]
  for(const month of months){
    const rows=await ctx.db.query('capabilityUsageSourceVersions').withIndex('by_accountRef_and_month_and_shard',q=>q.eq('accountRef',scope.accountRef).eq('month',month)).take(SHARDS+1)
    if(rows.length>SHARDS || new Set(rows.map(row=>row.shard)).size !== rows.length || rows.some(row=>!Number.isInteger(row.shard) || row.shard<0 || row.shard>=SHARDS)) throw new Error('usage_source_versions_invalid')
    for(let shard=0;shard<SHARDS;shard++) versions.push({month,shard,generationUnits:rows.find(row=>row.shard === shard)?.generationUnits ?? '0'})
  }
  return canonicalDigest({format:'ae.usage-source-version-vector:v1',accountRef:scope.accountRef,versions})
}
