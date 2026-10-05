import {afterEach,describe,expect,it,vi} from 'vitest'
import {api,internal,components} from '../../../convex/_generated/api'
import {convexTestWithWorkers,publishedBusinessOwner} from '../../helpers/convex-fixtures'
import {enqueueReportUsageAlerts,enqueueDocumentUsageAlert} from '../../../convex/lib/principalAccount/notifications/usageAlerts'
import {emptyUsageReportSummary} from '@/lib/export/usage-report-summary'
import {canonicalDigest} from '@/modules/common/canonical-digest'
const now=Date.UTC(2026,9,4,12),digest=canonicalDigest('source'),policy={enabled:true,failurePercent:20,minimumCalls:20,spendWarningPercent:80}
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})
async function fixture(){vi.useFakeTimers();vi.setSystemTime(now);const backend=convexTestWithWorkers({pauseWorkpool:true});await backend.run(ctx=>ctx.runMutation(components.notificationWorkpool.config.update,{maxParallelism:0}));const owner=await publishedBusinessOwner(backend,'usage-alert-owner');const configure=(enabled=true,expectedRevision=0)=>owner.owner.mutation(api.notifications.updatePreferences,{usageAlertPolicy:{...policy,enabled},expectedRevision,correlationRef:`usage:policy:${expectedRevision}`,idempotencyRef:`usage:policy:${expectedRevision}`});return {backend,owner,configure}}
async function rows(f:Awaited<ReturnType<typeof fixture>>){return await f.backend.run(ctx=>ctx.db.query('notificationDeliveries').collect())}
describe('owner policy-bound durable usage alerts',()=>{
  it('requires explicit current consent, deduplicates native credit observations and records policy audit once',async()=>{
    const f=await fixture(),args={accountRef:f.owner.canonicalAccountRef,observedAt:now,month:'2026-10',availableCreditUnits:'100'}
    await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,args);expect(await rows(f)).toHaveLength(0)
    await f.configure();await f.configure();await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,args);await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,args)
    const deliveries=await rows(f);expect(deliveries).toHaveLength(1);expect(deliveries[0]).toMatchObject({state:'pending',eventKind:'low_credit_balance',preferenceRevision:1,workId:expect.any(String)})
    expect(JSON.stringify(deliveries)).not.toContain('emailAddress')
    const audit=await f.backend.run(ctx=>ctx.db.query('auditEvents').withIndex('by_eventType_and_createdAt',q=>q.eq('eventType','billing.usage_alert_policy_configured')).collect());expect(audit).toHaveLength(1)
    await f.configure(false,1);expect(await f.backend.query(internal.notifications.readNotificationContext,{deliveryId:deliveries[0]!._id})).toMatchObject({kind:'skip',code:'usage_alert_consent_changed'})
  })
  it('rejects invalid thresholds and changed Account authority, stale evidence, unsupported money and tenant history access',async()=>{
    const f=await fixture();await expect(f.owner.owner.mutation(api.notifications.updatePreferences,{usageAlertPolicy:{...policy,minimumCalls:0},expectedRevision:0,correlationRef:'usage:invalid',idempotencyRef:'usage:invalid'})).rejects.toMatchObject({code:'threshold_invalid'})
    await f.configure();await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,{accountRef:f.owner.canonicalAccountRef,observedAt:now-60001,month:'2026-10',availableCreditUnits:'0'});expect(await rows(f)).toHaveLength(0)
    await f.backend.run(async ctx=>{const account=await ctx.db.query('accounts').withIndex('by_accountRef',q=>q.eq('accountRef',f.owner.canonicalAccountRef)).unique();if(account===null)throw new Error('account');await ctx.db.patch(account._id,{revision:account.revision+1})})
    await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,{accountRef:f.owner.canonicalAccountRef,observedAt:now,month:'2026-10',availableCreditUnits:'0'});expect(await rows(f)).toHaveLength(0)
    await expect(f.backend.query(api.notifications.readUsageAlertHistory,{paginationOpts:{numItems:10,cursor:null}})).rejects.toThrow('usage_alert_owner_required')
  })
  it('uses a complete all-Agent month capture for outcome alerts and preserves unknown legacy operational coverage',async()=>{
    const f=await fixture();await f.configure();const reportRef='call-usage-export:00000000-0000-4000-8000-000000000071'
    const id=await f.backend.run(ctx=>ctx.db.insert('capabilityUsageReports',{reportRef,accountRef:f.owner.canonicalAccountRef,actorRef:f.owner.canonicalPrincipalRef,periodStartAt:Date.UTC(2026,9,1),periodEndAt:Date.UTC(2026,10,1),status:'all',scopeDigest:digest,snapshotAt:now,sourceVersionDigest:digest,state:'complete',pageCount:2,partCount:2,scannedCountUnits:'20',recordCountUnits:'20',recordsChainDigest:digest,summaryJson:JSON.stringify({...emptyUsageReportSummary(false),recordCountUnits:'20'}),createdAt:now,completedAt:now}))
    await f.backend.run(ctx=>enqueueReportUsageAlerts(ctx,reportRef));expect(await rows(f)).toHaveLength(0)
    await f.backend.run(ctx=>ctx.db.patch(id,{summaryJson:JSON.stringify({...emptyUsageReportSummary(),recordCountUnits:'20',refusedCallCountUnits:'3',uncertainCallCountUnits:'1'})}));await f.backend.run(ctx=>enqueueReportUsageAlerts(ctx,reportRef));await f.backend.run(ctx=>enqueueReportUsageAlerts(ctx,reportRef));expect(await rows(f)).toHaveLength(1)
    const other=await publishedBusinessOwner(f.backend,'usage-alert-other');expect(await other.owner.query(api.notifications.readUsageAlertHistory,{paginationOpts:{numItems:1,cursor:null}})).toMatchObject({page:[],isDone:true})
    expect(await f.owner.owner.query(api.notifications.readUsageAlertHistory,{paginationOpts:{numItems:1,cursor:null}})).toMatchObject({page:[{eventKind:'call_failure_spike',state:'pending'}]})
  })
  it('refuses partial-document readiness and treats exactly-once worker completion as historical state',async()=>{
    const f=await fixture();await f.configure();await f.backend.run(ctx=>enqueueDocumentUsageAlert(ctx,'missing-document'));expect(await rows(f)).toHaveLength(0)
    await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,{accountRef:f.owner.canonicalAccountRef,observedAt:now,month:'2026-10',availableCreditUnits:'0'});const row=(await rows(f))[0];if(row===undefined||row.workId===undefined)throw new Error('delivery')
    await f.backend.mutation(internal.notifications.completeDelivery,{workId:row.workId as never,context:{deliveryId:row._id},result:{kind:'success',returnValue:{outcome:'sent',vendorMessageId:'fixture-only'}}})
    await f.backend.mutation(internal.notifications.completeDelivery,{workId:row.workId as never,context:{deliveryId:row._id},result:{kind:'failed',error:'late failure'}})
    expect((await rows(f))[0]).toMatchObject({state:'sent',vendorMessageId:'fixture-only'})
  })
  it('keeps idempotent policy history immutable even after a later change and rejects changed intent',async()=>{
    const f=await fixture();await f.configure();await f.configure(false,1)
    expect(await f.configure()).toMatchObject({kind:'replayed',revision:1})
    expect(await f.owner.owner.query(api.notifications.readPreferences,{})).toMatchObject({revision:2,usageAlertPolicy:{enabled:false}})
    await expect(f.owner.owner.mutation(api.notifications.updatePreferences,{usageAlertPolicy:{...policy,failurePercent:30},expectedRevision:2,correlationRef:'usage:new-correlation',idempotencyRef:'usage:policy:0'})).rejects.toMatchObject({code:'preference_revision_conflict'})
    const audits=await f.backend.run(ctx=>ctx.db.query('auditEvents').withIndex('by_eventType_and_createdAt',q=>q.eq('eventType','billing.usage_alert_policy_configured')).collect());expect(audits).toHaveLength(2)
  })
  it('uses the exact gross-sale spending ceiling, distinguishes warning from exceeded, and refuses malformed quantities',async()=>{
    const f=await fixture();await f.configure()
    const ceiling='900719925474099312345',budget=await f.backend.run(ctx=>ctx.db.insert('moneyMonthlySpendBudgets',{accountRef:f.owner.canonicalAccountRef,enabled:true,currency:'AUD',exponent:6,ceilingUnits:ceiling,revision:1,createdAt:now,updatedAt:now}))
    const args={accountRef:f.owner.canonicalAccountRef,observedAt:now,month:'2026-10'}
    await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,{...args,grossSpendUnits:'unsupported'})
    await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,{...args,grossSpendUnits:(BigInt(ceiling)*79n/100n).toString()});expect(await rows(f)).toHaveLength(0)
    const warning=(BigInt(ceiling)*80n/100n+1n).toString()
    await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,{...args,grossSpendUnits:warning});await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,{...args,grossSpendUnits:warning})
    await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,{...args,grossSpendUnits:ceiling})
    expect((await rows(f)).map(row=>row.eventKind)).toEqual(['spend_cap_warning','spend_cap_exceeded'])
    expect((await rows(f))[1]?.usageEvidenceJson).toContain('Refunds and promotional credits are reported separately')
    await f.backend.run(ctx=>ctx.db.patch(budget,{enabled:false,revision:2}));await f.backend.mutation(internal.notifications.enqueueMoneyUsageAlerts,{...args,grossSpendUnits:ceiling});expect(await rows(f)).toHaveLength(2)
  })
  it('waits for issued monthly files, deduplicates readiness and suppresses queued delivery after ownership revision changes',async()=>{
    const f=await fixture();await f.configure()
    const id=await f.backend.run(ctx=>ctx.db.insert('moneyDocuments',{documentRef:'document:monthly-fixture',accountRef:f.owner.canonicalAccountRef,kind:'monthly_usage',sourceTransactionRefs:[],amountUnits:'0',residualUnits:'0',policyRefs:[],policyDigest:digest,templateVersion:'fixture:v1',renderInputJson:'{}',renderInputDigest:digest,state:'failed',environment:'sandbox',sourceCount:0,snapshotDigest:digest,periodStart:Date.UTC(2026,8,1),periodEnd:Date.UTC(2026,9,1),createdAt:now}))
    await f.backend.run(ctx=>enqueueDocumentUsageAlert(ctx,'document:monthly-fixture'));expect(await rows(f)).toHaveLength(0)
    await f.backend.run(async ctx=>{const fileId=await ctx.storage.store(new Blob(['synthetic statement']));await ctx.db.patch(id,{state:'issued',fileId,renderedAt:now})})
    await f.backend.run(ctx=>enqueueDocumentUsageAlert(ctx,'document:monthly-fixture'));expect(await rows(f)).toHaveLength(0)
    await f.backend.run(async ctx=>{const csvFileId=await ctx.storage.store(new Blob(['synthetic csv']));await ctx.db.patch(id,{csvFileId})})
    await f.backend.run(ctx=>enqueueDocumentUsageAlert(ctx,'document:monthly-fixture'));await f.backend.run(ctx=>enqueueDocumentUsageAlert(ctx,'document:monthly-fixture'))
    const delivery=(await rows(f))[0];expect(delivery).toMatchObject({eventKind:'invoice_ready',state:'pending'})
    await f.backend.run(async ctx=>{const account=await ctx.db.query('accounts').withIndex('by_accountRef',q=>q.eq('accountRef',f.owner.canonicalAccountRef)).unique();if(account===null)throw new Error('account');await ctx.db.patch(account._id,{revision:account.revision+1})})
    expect(await f.backend.query(internal.notifications.readNotificationContext,{deliveryId:delivery!._id})).toMatchObject({kind:'skip',code:'usage_alert_consent_changed'})
  })
})
