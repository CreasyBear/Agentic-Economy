import { v } from 'convex/values'
import type { ActionCtx,MutationCtx,QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { internal } from '../../../_generated/api'
import { notificationWorkpool } from '../../../notificationWorkpool'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { usageReportSummarySchema } from '@/lib/export/usage-report-summary'
import { usageAlertEvidenceSchema } from '@/modules/principal-account/public'
import { assertAdmission } from '../../platform/rateLimit'
import { resolveClerkUserIdForPrincipal } from '../workspace/directory'
const exact=/^(?:0|[1-9]\d*)$/u
const monthAt=(at:number)=>new Date(at).toISOString().slice(0,7)

export async function activeUsagePolicy(ctx:Pick<QueryCtx,'db'>,accountRef:string){
  const account=await ctx.db.query('accounts').withIndex('by_accountRef',q=>q.eq('accountRef',accountRef)).unique()
  if(account?.lifecycle!=='active')return null
  const ownership=await ctx.db.query('accountOwnerships').withIndex('by_ownershipRef',q=>q.eq('ownershipRef',account.currentOwnershipRef)).unique()
  if(ownership?.lifecycle!=='active'||ownership.accountRef!==accountRef)return null
  const owner=await ctx.db.query('principals').withIndex('by_principalRef',q=>q.eq('principalRef',ownership.ownerPrincipalRef)).unique()
  const prefs=await ctx.db.query('userNotificationPreferences').withIndex('by_principalRef_and_accountRef',q=>q.eq('principalRef',ownership.ownerPrincipalRef).eq('accountRef',accountRef)).unique()
  if(owner?.kind!=='human'||owner.lifecycle!=='active'||prefs?.usageAlertPolicy?.enabled!==true||prefs.usageAlertPolicy.authorityRevisionAccount!==account.revision)return null
  return {account,prefs,policy:prefs.usageAlertPolicy}
}
async function enqueue(ctx:MutationCtx,accountRef:string,evidence:unknown,sourceKey:string){
  const context=await activeUsagePolicy(ctx,accountRef);if(context===null)return
  const data=usageAlertEvidenceSchema.parse(evidence),{prefs,account}=context
  const allowed=data.kind==='low_credit_balance'?prefs.lowCreditBalance:data.kind==='call_failure_spike'?prefs.callFailureSpike:data.kind==='invoice_ready'?prefs.invoiceReady:prefs.spendCapWarning
  if(!allowed)return
  const sourceEventRef=canonicalDigest({format:'ae.usage-alert-episode:v1',sourceKey,preferenceRevision:prefs.revision,authorityRevisionAccount:account.revision})
  const existing=await ctx.db.query('notificationDeliveries').withIndex('by_recipient_account_event_source',q=>q.eq('recipientPrincipalRef',prefs.principalRef).eq('accountRef',accountRef).eq('eventKind',data.kind).eq('sourceEventRef',sourceEventRef)).unique()
  if(existing!==null)return
  const rate=await assertAdmission(ctx,{name:'agent-approval-email',key:`usage:${accountRef}`}),now=Date.now()
  const deliveryId=await ctx.db.insert('notificationDeliveries',{deliveryRef:`notification:${crypto.randomUUID()}`,recipientPrincipalRef:prefs.principalRef,accountRef,eventKind:data.kind,sourceEventRef,usageEvidenceJson:JSON.stringify(data),preferenceRevision:prefs.revision,authorityRevisionAccount:account.revision,state:rate.ok?'pending':'suppressed',...(rate.ok?{}:{suppressCode:'notification_rate_limited'}),createdAt:now,updatedAt:now})
  if(!rate.ok)return
  const workId=await notificationWorkpool.enqueueAction(ctx,internal.notificationDelivery.sendApprovalEmail,{deliveryId},{retry:true,onComplete:internal.notifications.completeDelivery,context:{deliveryId}})
  await ctx.db.patch(deliveryId,{workId})
}
export async function enqueueReportUsageAlerts(ctx:MutationCtx,reportRef:string){
  const row=await ctx.db.query('capabilityUsageReports').withIndex('by_reportRef',q=>q.eq('reportRef',reportRef)).unique()
  if(row?.state!=='complete'||row.principalRef!==undefined||row.status!=='all')return
  const now=Date.now(),month=monthAt(now),start=new Date(row.periodStartAt)
  if(row.periodStartAt!==Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1)||row.periodEndAt!==Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1)||monthAt(row.periodStartAt)!==month||now-row.snapshotAt>3600000)return
  const context=await activeUsagePolicy(ctx,row.accountRef);if(context===null)return
  const summary=usageReportSummarySchema.parse(JSON.parse(row.summaryJson))
  if(summary.refusedCallCountUnits===undefined||summary.uncertainCallCountUnits===undefined)return
  const calls=BigInt(summary.recordCountUnits),attention=BigInt(summary.refusedCallCountUnits)+BigInt(summary.uncertainCallCountUnits)
  if(calls>=BigInt(context.policy.minimumCalls)&&attention*100n>=calls*BigInt(context.policy.failurePercent))await enqueue(ctx,row.accountRef,{format:'ae.usage-alert:v1',kind:'call_failure_spike',month,sourceDigest:row.recordsChainDigest,observedAt:row.snapshotAt,text:`${attention} of ${calls} Calls have refused or uncertain outcomes in the current UTC month, meeting your ${context.policy.failurePercent}% threshold. This complete capture uses Call creation dates; outcomes can change after reconciliation.`},`${month}:call-outcomes`)
}
export async function enqueueDocumentUsageAlert(ctx:MutationCtx,documentRef:string){
  const row=await ctx.db.query('moneyDocuments').withIndex('by_documentRef',q=>q.eq('documentRef',documentRef)).unique()
  if(row?.kind!=='monthly_usage'||row.state!=='issued'||row.fileId===undefined||row.csvFileId===undefined||row.periodStart===undefined)return
  await enqueue(ctx,row.accountRef,{format:'ae.usage-alert:v1',kind:'invoice_ready',month:monthAt(row.periodStart),sourceDigest:row.renderInputDigest,observedAt:row.renderedAt??row.createdAt,text:'Your consolidated monthly usage statement is ready in Credit. It summarizes existing financial activity and does not charge your Account or issue another funding tax invoice.'},row.documentRef)
}
export async function enqueueMoneyAlertEvaluation(ctx:MutationCtx,accountRef:string,captureOperational=false){
  if(await activeUsagePolicy(ctx,accountRef)===null)return
  const rate=await assertAdmission(ctx,{name:'agent-approval-email',key:`usage-evaluation:${accountRef}`})
  if(!rate.ok)return
  await notificationWorkpool.enqueueAction(ctx,internal.notifications.evaluateUsageMoneyAlerts,{accountRef,captureOperational},{retry:true})
}
export const usageMoneyEvidenceArgs={accountRef:v.string(),observedAt:v.number(),availableCreditUnits:v.optional(v.string()),grossSpendUnits:v.optional(v.string()),month:v.string()}
export async function enqueueMoneyUsageAlertsHandler(ctx:MutationCtx,args:{accountRef:string;observedAt:number;availableCreditUnits?:string;grossSpendUnits?:string;month:string}):Promise<null>{
  const context=await activeUsagePolicy(ctx,args.accountRef);if(context===null)return null
  const now=Date.now();if(args.month!==monthAt(now)||args.observedAt>now||now-args.observedAt>60000)return null
  const {prefs,policy}=context
  if(args.availableCreditUnits!==undefined&&exact.test(args.availableCreditUnits)&&BigInt(args.availableCreditUnits)<=BigInt(prefs.lowCreditThresholdCents)*10000n)await enqueue(ctx,args.accountRef,{format:'ae.usage-alert:v1',kind:'low_credit_balance',month:args.month,sourceDigest:canonicalDigest({format:'ae.native-available-credit:v1',...args}),observedAt:args.observedAt,text:`Available credit is at or below your saved A$${prefs.lowCreditThresholdCents/100} threshold. Purchased and eligible promotional credit are included; the native balance may change after this observation.`},`${args.month}:low-credit`)
  const budget=await ctx.db.query('moneyMonthlySpendBudgets').withIndex('by_accountRef',q=>q.eq('accountRef',args.accountRef)).unique()
  if(budget?.enabled===true&&exact.test(budget.ceilingUnits)&&BigInt(budget.ceilingUnits)>0n&&args.grossSpendUnits!==undefined&&exact.test(args.grossSpendUnits)){
    const gross=BigInt(args.grossSpendUnits),ceiling=BigInt(budget.ceilingUnits),exceeded=gross>=ceiling
    if(exceeded||gross*100n>=ceiling*BigInt(policy.spendWarningPercent))await enqueue(ctx,args.accountRef,{format:'ae.usage-alert:v1',kind:exceeded?'spend_cap_exceeded':'spend_cap_warning',month:args.month,sourceDigest:canonicalDigest({format:'ae.native-period-spend:v1',...args,budgetRevision:budget.revision}),observedAt:args.observedAt,text:`Settled gross spending has ${exceeded?'reached':'approached'} your enabled monthly ceiling (${policy.spendWarningPercent}% warning). This uses native financial effective dates and the same gross-sale basis as the spending fence. Refunds and promotional credits are reported separately and do not reset this ceiling.`},`${args.month}:ceiling:${budget.revision}`)
  }
  return null
}
export async function evaluateUsageMoneyAlertsHandler(ctx:ActionCtx,args:{accountRef:string;captureOperational?:boolean}):Promise<null>{
  if(!await ctx.runQuery(internal.notifications.hasCurrentUsageAlertConsent,{accountRef:args.accountRef}))return null
  const now=new Date(),periodStartAt=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1),periodEndAt=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1),month=now.toISOString().slice(0,7)
  if(args.captureOperational===true)await ctx.runMutation(internal.notifications.requestUsageAlertReport,{accountRef:args.accountRef})
  const credit=await ctx.runAction(internal.moneyAccountCreditBalance.read,{accountRef:args.accountRef})
  const spend=await ctx.runAction(internal.moneyFormance.readPeriodSpend,{accountRef:args.accountRef,periodStartAt,periodEndAt})
  if(credit.kind==='unavailable'||spend.kind==='unavailable')throw new Error('usage_alert_financial_source_unavailable')
  const observedAt=Math.min(credit.kind==='available'?credit.observedAt:Date.now(),spend.kind==='available'?spend.observedAt:Date.now())
  await ctx.runMutation(internal.notifications.enqueueMoneyUsageAlerts,{accountRef:args.accountRef,observedAt,month,...(credit.kind==='available'?{availableCreditUnits:credit.units}:{}),...(spend.kind==='available'?{grossSpendUnits:spend.spendUnits}:spend.kind==='empty'?{grossSpendUnits:'0'}:{})})
  return null
}
export async function readUsageDeliveryContext(ctx:QueryCtx,delivery:Doc<'notificationDeliveries'>){
  const context=await activeUsagePolicy(ctx,delivery.accountRef)
  if(context===null||context.prefs.principalRef!==delivery.recipientPrincipalRef||context.prefs.revision!==delivery.preferenceRevision||context.account.revision!==delivery.authorityRevisionAccount)return {kind:'skip' as const,code:'usage_alert_consent_changed'}
  let evidence:unknown
  try{evidence=delivery.usageEvidenceJson===undefined?null:JSON.parse(delivery.usageEvidenceJson)}catch{return {kind:'skip' as const,code:'usage_alert_evidence_invalid'}}
  const parsed=usageAlertEvidenceSchema.safeParse(evidence)
  if(!parsed.success||parsed.data.kind!==delivery.eventKind)return {kind:'skip' as const,code:'usage_alert_evidence_invalid'}
  const site=process.env.AE_SITE_URL?.trim();if(!site)return {kind:'skip' as const,code:'site_url_missing'}
  let url:URL
  try{url=new URL('/owner/credit',site)}catch{return {kind:'skip' as const,code:'site_url_invalid'}}
  if(!['https:','http:'].includes(url.protocol))return {kind:'skip' as const,code:'site_url_invalid'}
  const clerkUserId=await resolveClerkUserIdForPrincipal(ctx.db,delivery.recipientPrincipalRef)
  if(clerkUserId===null)return {kind:'skip' as const,code:'no_clerk_identity'}
  return {kind:'ready' as const,deliveryRef:delivery.deliveryRef,clerkUserId,subject:parsed.data.kind==='invoice_ready'?'Monthly usage statement ready':'Account usage alert',text:`${parsed.data.text}\n\nObserved: ${new Date(parsed.data.observedAt).toISOString()}\nReview your Account: ${url.toString()}\n\nAn alert does not create charges or change authority. Delivery is limited to one alert of each kind per UTC month and policy revision; issued statements have their own notice.\n`}
}
