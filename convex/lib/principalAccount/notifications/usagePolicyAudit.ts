import type { MutationCtx,QueryCtx } from '../../../_generated/server'
import type { UsageAlertPolicy } from '@/modules/principal-account/notification-preferences.view-model'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { redactPayload,validateAuditEvent } from '@/modules/observability/public'
import { persistAuditEvent } from '../../security/audit/persistence'
const policyEventId=(accountRef:string,idempotencyRef:string)=>`audit:usage-alert:${canonicalDigest({accountRef,idempotencyRef}).slice(7)}`
export async function readUsagePolicyReplay(ctx:Pick<QueryCtx,'db'>,input:{accountRef:string;idempotencyRef:string;requestDigest:string}){
  const event=await ctx.db.query('auditEvents').withIndex('by_eventId',q=>q.eq('eventId',policyEventId(input.accountRef,input.idempotencyRef))).unique()
  if(event===null)return null
  const revision=Number(event.afterState)
  if(event.eventType!=='billing.usage_alert_policy_configured'||event.evidenceRefs[1]!==input.requestDigest||!Number.isSafeInteger(revision)||revision<1)return {kind:'conflict'} as const
  return {kind:'replayed',revision} as const
}
export async function recordUsagePolicyAudit(ctx:MutationCtx,input:{accountRef:string;principalRef:string;authorityRevisionAccount:number;idempotencyRef:string;correlationRef:string;before:UsageAlertPolicy|undefined;after:UsageAlertPolicy;requestDigest:string;revision:number}){
  const hash=canonicalDigest({format:'ae.usage-alert-policy:v1',...input,before:input.before??null}),eventId=policyEventId(input.accountRef,input.idempotencyRef)
  const audit=validateAuditEvent({eventId:brandNonEmpty(eventId,'AuditEventId'),eventType:'billing.usage_alert_policy_configured',actorKind:'owner',actorRef:input.principalRef,activeAccountRef:input.accountRef,authorityGeneration:input.authorityRevisionAccount,sourceSystem:'ae_recorded',targetType:'billing',targetRef:input.accountRef,idempotencyKey:brandNonEmpty(input.idempotencyRef,'OperationKey'),correlationId:brandNonEmpty(input.correlationRef,'CorrelationId'),beforeState:String(input.before?.enabled??false),afterState:String(input.revision),evidenceRefs:[hash,input.requestDigest],redactedPayload:redactPayload({policy:input.after,revision:input.revision}),payloadHash:brandNonEmpty(hash,'SourceHash'),createdAt:Date.now()})
  if(!audit.valid)throw new Error(`usage_alert_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db,audit.event)
}
