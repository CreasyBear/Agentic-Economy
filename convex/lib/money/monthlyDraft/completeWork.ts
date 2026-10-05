import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'
import { vOnCompleteArgs } from '@convex-dev/workpool'
import { marketDispatchWorkpool } from '../../../marketDispatchWorkpool'
import type { MutationCtx } from '../../../_generated/server'
const run=makeFunctionReference<'action',{draftRef:string},{kind:'advanced'|'replayed'|'waiting'|'failed'}>('moneyMonthlyUsageDraft:continueCompleteMonth')
const complete=makeFunctionReference<'mutation',Infer<typeof completeMonthWorkArgs>,null>('moneyMonthlyUsageDraft:completeMonthWork')
export const completeMonthWorkArgs=vOnCompleteArgs(v.object({draftRef:v.string()}))
export async function enqueueCompleteMonth(ctx:MutationCtx,draftRef:string){
  const workId=await marketDispatchWorkpool.enqueueAction(ctx,run,{draftRef},{retry:true,onComplete:complete,context:{draftRef}})
  const row=await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef',q=>q.eq('draftRef',draftRef)).unique()
  if(row!==null)await ctx.db.patch(row._id,{monthlyWorkId:workId});return workId
}
export async function enqueueLinkedMonthlyClose(ctx:MutationCtx,reportRef:string){
  const row=await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_usageReportRef',q=>q.eq('usageReportRef',reportRef)).unique()
  if(row?.durableVersion===2&&row.durableState==='building')await enqueueCompleteMonth(ctx,row.draftRef)
}
export async function completeMonthWorkHandler(ctx:MutationCtx,args:Infer<typeof completeMonthWorkArgs>):Promise<null>{
  if(args.result.kind==='success')return null
  const row=await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef',q=>q.eq('draftRef',args.context.draftRef)).unique()
  if(row?.durableState==='building'&&row.monthlyWorkId===args.workId)await ctx.db.patch(row._id,{durableState:'failed',failureCode:'monthly_close_work_failed'})
  return null
}
