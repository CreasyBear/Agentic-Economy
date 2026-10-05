import { paginationOptsValidator,paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import { resolveBusinessActor } from '../../../authz'
import type { QueryCtx } from '../../../_generated/server'
import type { PaginationOptions } from 'convex/server'
export const usageHistoryArgs={paginationOpts:paginationOptsValidator}
export const usageHistoryResult=paginationResultValidator(v.object({deliveryRef:v.string(),eventKind:v.string(),state:v.string(),reason:v.union(v.string(),v.null()),createdAt:v.number(),updatedAt:v.number()}))
export async function readUsageAlertHistoryHandler(ctx:QueryCtx,args:{paginationOpts:PaginationOptions}){
  const actor=await resolveBusinessActor(ctx);if(actor.kind!=='authenticated_owner')throw new Error('usage_alert_owner_required')
  if(args.paginationOpts.numItems<1||args.paginationOpts.numItems>50)throw new Error('usage_alert_page_invalid')
  const result=await ctx.db.query('notificationDeliveries').withIndex('by_accountRef_and_createdAt',q=>q.eq('accountRef',actor.canonicalAccountRef)).order('desc').paginate(args.paginationOpts)
  return {...result,page:result.page.map(row=>({deliveryRef:row.deliveryRef,eventKind:row.eventKind,state:row.state,reason:row.lastFailureCode??row.suppressCode??null,createdAt:row.createdAt,updatedAt:row.updatedAt}))}
}
