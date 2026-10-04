import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'
import { vOnCompleteArgs, type OnCompleteArgs } from '@convex-dev/workpool'
import type { MutationCtx, ActionCtx } from '../../../_generated/server'
import { marketDispatchWorkpool } from '../../../marketDispatchWorkpool'

const capture=makeFunctionReference<'mutation',{reportRef:string;expectedPageCount:number},{kind:'advanced'|'replayed'|'failed'}>('capabilityCallProjections:captureUsageReportPage')
const run=makeFunctionReference<'action',{reportRef:string;expectedPageCount:number},{kind:'advanced'|'replayed'|'failed'}>('capabilityCallProjections:runUsageReportPage')
const complete=makeFunctionReference<'mutation',OnCompleteArgs<{reportRef:string},unknown>,null>('capabilityCallProjections:completeUsageReportWork')
export async function enqueueUsageReportPage(ctx:MutationCtx,reportRef:string,expectedPageCount:number):Promise<string>{
  return await marketDispatchWorkpool.enqueueAction(ctx,run,{reportRef,expectedPageCount},{retry:true,onComplete:complete,context:{reportRef}})
}
export async function runUsageReportPageHandler(ctx:ActionCtx,args:{reportRef:string;expectedPageCount:number}):Promise<{kind:'advanced'|'replayed'|'failed'}>{return await ctx.runMutation(capture,args)}
export const completeUsageReportArgs=vOnCompleteArgs(v.object({reportRef:v.string()}))
export const completeUsageReportResult=v.null()
export async function completeUsageReportWorkHandler(ctx:MutationCtx,args:Infer<typeof completeUsageReportArgs>):Promise<null>{
  const report=await ctx.db.query('capabilityUsageReports').withIndex('by_reportRef',q=>q.eq('reportRef',args.context.reportRef)).unique()
  if(report !== null && report.state === 'building' && report.workId === args.workId && args.result.kind !== 'success'){
    await ctx.db.patch(report._id,{state:'failed',failureCode:args.result.kind === 'canceled' ? 'usage_report_work_canceled' : 'usage_report_work_failed'})
  }
  return null
}
