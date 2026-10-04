/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createPublicToolRef } from '@/modules/capability-supply/public'
import { blockrunTool, blockrunChatReceipt, blockrunSpeechReceipt } from '../capability-execution/fixtures/blockrun-service-unit-evidence'
import { upsertCallProjection } from '../../../convex/lib/capabilityExecution/callLifecycle/dispatchProjection'
import { readProviderUnitEvidence } from '../../../convex/lib/capabilityExecution/serviceUsage/providerObservations'
import { readProjectedSupport } from '../../../convex/lib/capabilityExecution/serviceUsage/projectedSupport'
import { callExportSourceDigest } from '../../../convex/lib/capabilityExecution/callProjection/exportSnapshot'
import { readOwnerReceiptContextHandler } from '../../../convex/lib/capabilityExecution/callLifecycle/callRecoveryReads'
import { createCallUsageExport, generateCallUsageExportCsv, callUsageExportRowSchema } from '@/lib/export/call-usage-export'

const modules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}')).map(([path,load]) => [path.replace('../../../convex/','./'),load]))
const now = Date.UTC(2026,8,15), accountRef = 'account:synthetic', callRef = 'call:synthetic-unit', hash = canonicalDigest('synthetic-response')
afterEach(() => vi.useRealTimers())
async function fixture(kind: 'chat' | 'speech' = 'chat') {
  vi.useFakeTimers();vi.setSystemTime(now + 1000)
  const backend = convexTest(schema, modules), tool = blockrunTool(kind)
  const toolRef = createPublicToolRef({operationId:tool.operationId,publicationRef:tool.identity.publicationRef,publicationRevision:tool.identity.publicationRevision,contractRef:tool.contract.ref})
  const output = kind === 'chat' ? blockrunChatReceipt : blockrunSpeechReceipt
  const result = {kind:'completed' as const,callRef,toolRef,output,evidenceHash:hash}
  const callId = await backend.run(async ctx => {
    await ctx.db.insert('actionExecutionAttempts',{executionRef:callRef,attemptRef:`operation-attempt:${callRef}:1`,attemptNumber:1,effectGeneration:1,
      actor:{callerRef:'synthetic:caller',principalRef:'principal:synthetic'},idempotency:{operationKey:'synthetic-logical-operation',materialInputDigest:canonicalDigest('model'),effectIdentity:'synthetic-effect-1'},
      lease:{owner:'private-lease-owner',expiresAt:new Date(now+10000).toISOString()},release:{state:'released',observedAt:new Date(now).toISOString()},outcome:{state:'returned',businessOutcome:'operation_succeeded'},recordedAt:new Date(now).toISOString()})
    return await ctx.db.insert('capabilityCalls',{callRef,ownerId:accountRef,principalId:'principal:synthetic',credentialId:'credential:synthetic',applicationRef:'application:synthetic',toolRef,
      idempotencyKey:'private-idempotency-key',environment:'sandbox',grantRef:'grant:synthetic',grantGeneration:1,policyDigest:canonicalDigest('policy'),grantExpiresAt:now+10000,
      toolJson:JSON.stringify(tool),inputJson:'{"model":"requested-model"}',inputDigest:canonicalDigest({model:'requested-model'}),requestDigest:canonicalDigest({operationRef:toolRef,input:{model:'requested-model'}}),
      state:'completed',dispatchState:'completed',result,evidenceHash:hash,attemptRef:`operation-attempt:${callRef}:1`,createdAt:now-100,updatedAt:now,
      usage:{usageRef:'usage:synthetic',observedAt:now,chargeState:'paid',amount:{currency:'AUD',units:'1000000',exponent:6},priceDigest:tool.priceDigest}})
  })
  const project = () => backend.run(async ctx => { const call = await ctx.db.get(callId); if (!call) throw new Error('call_missing'); await upsertCallProjection(ctx,call,{state:call.state as 'completed',...(call.result===undefined?{}:{result:call.result}),...(call.evidenceHash===undefined?{}:{evidenceHash:call.evidenceHash}),...(call.attemptRef===undefined?{}:{attemptRef:call.attemptRef}),...(call.usage===undefined?{}:{usage:call.usage}),dispatchState:call.dispatchState as 'completed'},call.updatedAt) })
  const evidence = (observedThrough=Date.now(),effectiveThrough=Date.now()) => backend.run(async ctx => {const call=await ctx.db.get(callId); if(!call)throw new Error('call_missing');return await readProviderUnitEvidence(ctx,call,observedThrough,effectiveThrough)})
  const support = () => backend.run(async ctx => {const projection=await ctx.db.query('capabilityCallProjections').unique();if(!projection)throw new Error('projection_missing');return await readProjectedSupport(ctx,projection)})
  const fingerprint = () => backend.run(async ctx => await callExportSourceDigest(ctx,{accountRef,periodStartAt:now-1000,periodEndAt:now+86400000,snapshotAt:now+10000}))
  await project()
  return {backend,callId,toolRef,result,project,evidence,support,fingerprint}
}
describe('canonical provider quantity observations', () => {
  it('captures once, ignores replay and payment-only changes, and redacts source payloads',async()=>{
    const f=await fixture();const before=await f.evidence()
    expect(before).toMatchObject({currentSupport:'verified',current:{units:[{quantityUnits:'12'},{quantityUnits:'8'}],requestedModel:'requested-model',responseModel:'gpt-5.5'},observations:[{sequence:1,change:'initial_attempt'}]})
    await f.project();await f.project()
    await f.backend.run(async ctx=>{const call=await ctx.db.get(f.callId);await ctx.db.patch(f.callId,{usage:{...call!.usage!,chargeState:'refunded'},updatedAt:now+1000})})
    await f.project()
    expect(await f.evidence()).toEqual(before)
    expect(await f.support()).toMatchObject({verified:true,providerUnitObservation:{units:[{quantityUnits:'12'},{quantityUnits:'8'}]}})
    const stored=await f.backend.run(async ctx=>await ctx.db.query('capabilityServiceUnitObservations').collect())
    expect(stored).toHaveLength(1)
    for(const secret of ['SYNTHETIC_PRIVATE_OUTPUT','private-idempotency-key','private-lease-owner','synthetic-logical-operation'])expect(JSON.stringify(stored)).not.toContain(secret)
    expect(await f.backend.run(async ctx=>await readOwnerReceiptContextHandler(ctx,{callRef,ownerId:'account:other',toolRef:f.toolRef,observedAt:Date.now()}))).toBeNull()
  })
  it('detects quantity drift without a changed declared evidence hash and appends corrections/restorations',async()=>{
    const f=await fixture();const before=await f.fingerprint();vi.setSystemTime(now+2000)
    const corrected={...f.result,output:{...blockrunChatReceipt,usage:{prompt_tokens:14,completion_tokens:8,total_tokens:22}}}
    await f.backend.run(async ctx=>await ctx.db.patch(f.callId,{result:corrected,updatedAt:now+2000}))
    expect(await f.support()).toMatchObject({providerUnitObservation:null})
    expect((await f.evidence()).currentSupport).toBe('unknown');expect(await f.fingerprint()).not.toBe(before)
    await f.project();await f.project()
    expect(await f.evidence()).toMatchObject({current:{units:[{quantityUnits:'14'},{quantityUnits:'8'}],occurredAt:now,effectiveAt:now+2000},observations:[{sequence:1},{sequence:2,change:'support_correction'}]})
    expect((await f.evidence(now+1500,now+1500)).currentSupport).toBe('unknown')
    await f.backend.run(async ctx=>await ctx.db.patch(f.callId,{result:f.result,updatedAt:now+2000}));await f.project()
    const restored=await f.evidence();expect(restored.observations).toHaveLength(3);expect(restored.current?.units[0]?.quantityUnits).toBe('12')
    expect(restored.observations[2]?.previousAttemptObservationRef).toBe(restored.observations[1]?.observationRef)
  })
  it('keeps identical output from another attempt separate rather than adding it to logical-call totals',async()=>{
    const f=await fixture();vi.setSystemTime(now+2000)
    await f.backend.run(async ctx=>{const old=await ctx.db.query('actionExecutionAttempts').unique();if(!old)throw new Error('attempt_missing');const {_id,_creationTime,...row}=old;
      await ctx.db.insert('actionExecutionAttempts',{...row,attemptRef:`operation-attempt:${callRef}:2`,attemptNumber:2,effectGeneration:2,idempotency:{...row.idempotency,effectIdentity:'synthetic-effect-2'}})
      await ctx.db.patch(f.callId,{attemptRef:`operation-attempt:${callRef}:2`,updatedAt:now+2000})})
    await f.project();const evidence=await f.evidence()
    expect(evidence.observations).toHaveLength(2)
    expect(evidence.current).toMatchObject({attemptNumber:2,effectGeneration:2,previousAttemptObservationRef:null,change:'initial_attempt',units:[{quantityUnits:'12'},{quantityUnits:'8'}]})
    expect(evidence.observations[0]?.sourceDigest).not.toBe(evidence.observations[1]?.sourceDigest)
    const projection=await f.backend.run(async ctx=>{const {_id,_creationTime,...row}=(await ctx.db.query('capabilityCallProjections').unique())!;return row})
    const doc=createCallUsageExport({periodStartAt:now-1000,periodEndAt:now+86400000,status:'all'},[callUsageExportRowSchema.parse({...projection,currentSupportVerified:true,providerUnitSupportVerified:true})],Date.now(),1,accountRef)
    expect(doc.providerUnits.map(row=>row.observedQuantityUnits)).toEqual(['12','8'])
    expect(generateCallUsageExportCsv(doc)).toContain('ElevenLabs reported character credits')
  })
  it('requires durable identity, loses current support on unresolved delivery and fails closed on root drift',async()=>{
    const f=await fixture();vi.setSystemTime(now+2000)
    await f.backend.run(async ctx=>await ctx.db.patch(f.callId,{state:'reconciliation_required',result:undefined,updatedAt:now+2000}));await f.project()
    expect(await f.evidence()).toMatchObject({current:null,currentSupport:'unknown',observations:[{sequence:1}]})
    expect(await f.support()).toMatchObject({providerUnitObservation:null})
    await f.backend.run(async ctx=>{await ctx.db.patch(f.callId,{state:'completed',result:f.result,updatedAt:now+2000});const root=await ctx.db.query('capabilityServiceUsageRecords').unique();await ctx.db.patch(root!._id,{providerUnitHeadRef:'wrong:head'})})
    expect((await f.evidence()).currentSupport).toBe('unknown')
    await f.backend.run(async ctx=>{for(const row of await ctx.db.query('actionExecutionAttempts').collect())await ctx.db.delete(row._id)})
    await f.project();expect((await f.evidence()).observations).toHaveLength(1)
  })
  it('records missing speech credits as unknown without inferring characters, and never persists audio URLs',async()=>{
    const f=await fixture('speech')
    expect((await f.evidence()).current?.units).toMatchObject([{unitDefinitionRef:'blockrun_elevenlabs_character_credit:v1',quantityUnits:'51'}])
    expect(JSON.stringify(await f.evidence())).not.toContain('PRIVATE_AUDIO')
    vi.setSystemTime(now+2000)
    await f.backend.run(async ctx=>await ctx.db.patch(f.callId,{result:{...f.result,output:{...blockrunSpeechReceipt,data:[{characters:999,url:'https://synthetic.invalid'}]}},updatedAt:now+2000}))
    await f.project();expect((await f.evidence()).current?.units[0]).toMatchObject({state:'unknown',quantityUnits:null,reason:'usage_missing'})
  })
})
