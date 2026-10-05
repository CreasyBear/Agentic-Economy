import type { MutationCtx } from '../../../_generated/server'
import { activeUsagePolicy } from './usageAlerts'
import { requestUsageReportForActor } from '../../capabilityExecution/callProjection/durableReport'
/** Reuse the durable capture. Admission occurs only for current opt-in owners;
 * no independent schedule or queue is installed. Busy sources fail closed. */
export async function requestUsageAlertReportHandler(ctx:MutationCtx,args:{accountRef:string}):Promise<null>{
  const current=await activeUsagePolicy(ctx,args.accountRef);if(current===null||!current.prefs.callFailureSpike)return null
  const date=new Date(),periodStartAt=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1),periodEndAt=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)
  await requestUsageReportForActor(ctx,{reportRef:`call-usage-export:${crypto.randomUUID()}`,periodStartAt,periodEndAt,status:'all'},{canonicalAccountRef:args.accountRef,canonicalPrincipalRef:current.prefs.principalRef,authorityRevision:{account:current.account.revision}})
  return null
}
