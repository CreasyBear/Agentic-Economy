import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { requireAuthenticatedAccountContext } from '../billingSettings/authority'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { redactPayload, validateAuditEvent, type AuditEventType } from '@/modules/observability/public'
import { persistAuditEvent } from '../../security/audit/persistence'

export async function currentReportingOwner(ctx:Pick<QueryCtx,'db'>,row:Pick<Doc<'moneyUsageReportingPolicies'>,'accountRef'|'ownerPrincipalRef'|'authorityRevisionAccount'>){
  const account=await ctx.db.query('accounts').withIndex('by_accountRef',q=>q.eq('accountRef',row.accountRef)).unique()
  if(account?.lifecycle!=='active'||account.revision!==row.authorityRevisionAccount)return false
  const ownership=await ctx.db.query('accountOwnerships').withIndex('by_ownershipRef',q=>q.eq('ownershipRef',account.currentOwnershipRef)).unique()
  const principal=await ctx.db.query('principals').withIndex('by_principalRef',q=>q.eq('principalRef',row.ownerPrincipalRef)).unique()
  return ownership?.lifecycle==='active'&&ownership.accountRef===row.accountRef&&ownership.ownerPrincipalRef===row.ownerPrincipalRef&&principal?.lifecycle==='active'&&principal.kind==='human'
}
export async function reportingAuthority(ctx:Pick<QueryCtx,'db'|'auth'>){
  const identity=await ctx.auth.getUserIdentity();if(identity===null)throw new Error('monthly_reporting_owner_required')
  return await requireAuthenticatedAccountContext(ctx.db,identity)
}
export async function recordReportingAudit(ctx:MutationCtx,input:{eventType:AuditEventType;accountRef:string;principalRef:string;authorityRevisionAccount:number;idempotencyRef:string;before:string;after:string;digest:string}){
  const eventId=`audit:${input.eventType}:${canonicalDigest({accountRef:input.accountRef,idempotencyRef:input.idempotencyRef}).slice(7)}`
  const audit=validateAuditEvent({eventId:brandNonEmpty(eventId,'AuditEventId'),eventType:input.eventType,actorKind:'owner',actorRef:input.principalRef,activeAccountRef:input.accountRef,authorityGeneration:input.authorityRevisionAccount,sourceSystem:'ae_recorded',targetType:'billing',targetRef:input.accountRef,idempotencyKey:brandNonEmpty(input.idempotencyRef,'OperationKey'),correlationId:brandNonEmpty(eventId,'CorrelationId'),beforeState:input.before,afterState:input.after,evidenceRefs:[input.digest],redactedPayload:redactPayload({requestDigest:input.digest}),payloadHash:brandNonEmpty(input.digest,'SourceHash'),createdAt:Date.now()})
  if(!audit.valid)throw new Error(`usage_reporting_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db,audit.event)
}
export async function readReportingPolicyHandler(ctx:QueryCtx){
  const authority=await reportingAuthority(ctx)
  const row=await ctx.db.query('moneyUsageReportingPolicies').withIndex('by_accountRef',q=>q.eq('accountRef',authority.canonicalAccountRef)).unique()
  return {automaticMonthly:row?.automaticMonthly??false,revision:row?.revision??0,ownerConsentCurrent:row===null?false:await currentReportingOwner(ctx,row),schedulerActive:false as const}
}
export async function configureReportingHandler(ctx:MutationCtx,args:{automaticMonthly:boolean;expectedRevision:number;idempotencyRef:string}){
  if(!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<0||!/^usage-reporting:[a-f0-9-]{36}$/u.test(args.idempotencyRef))throw new Error('usage_reporting_intent_invalid')
  const authority=await reportingAuthority(ctx),accountRef=authority.canonicalAccountRef,ownerPrincipalRef=authority.canonicalPrincipalRef
  const requestDigest=canonicalDigest({format:'ae.usage-reporting-policy:v1',accountRef,ownerPrincipalRef,...args})
  const row=await ctx.db.query('moneyUsageReportingPolicies').withIndex('by_accountRef',q=>q.eq('accountRef',accountRef)).unique()
  if(row?.idempotencyRef===args.idempotencyRef){if(row.requestDigest!==requestDigest)throw new Error('usage_reporting_replay_conflict');return {kind:'replayed' as const,revision:row.revision}}
  if(args.expectedRevision!==(row?.revision??0))throw new Error('usage_reporting_revision_conflict')
  const revision=args.expectedRevision+1,value={accountRef,ownerPrincipalRef,authorityRevisionAccount:authority.authorityGeneration,revision,automaticMonthly:args.automaticMonthly,updatedAt:Date.now(),idempotencyRef:args.idempotencyRef,requestDigest}
  if(row===null)await ctx.db.insert('moneyUsageReportingPolicies',value);else await ctx.db.patch(row._id,value)
  await recordReportingAudit(ctx,{eventType:'billing.usage_reporting_configured',accountRef,principalRef:ownerPrincipalRef,authorityRevisionAccount:authority.authorityGeneration,idempotencyRef:args.idempotencyRef,before:String(row?.automaticMonthly??false),after:String(args.automaticMonthly),digest:requestDigest})
  return {kind:'updated' as const,revision}
}
