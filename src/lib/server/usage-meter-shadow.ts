import {z} from 'zod'
import { CloudEvent,HTTP,type Message } from 'cloudevents'
import { canonicalDigest,schemaDescriptorDigest } from '@/modules/common/canonical-digest'
import { providerUnitObservationSchema } from '@/modules/capability-execution/provider-service-units'
import { createCallUsageExport,type CallUsageExport } from '@/lib/export/call-usage-export'
export type ShadowEnvironment='sandbox'|'production'
const hash=(kind:string,value:string)=>canonicalDigest({format:'ae.meter-shadow-identifier:v1',kind,value})
/** A disconnected CloudEvents boundary. Immutable delivery assertions and
 * replaceable evidence snapshots have distinct types; snapshots MUST NOT be
 * fed into a SUM or COUNT meter. Vendor acknowledgement is never money proof. */
export function buildUsageMeterShadow(document:CallUsageExport,environment:ShadowEnvironment){
  if(environment!=='sandbox'&&environment!=='production')throw new Error('shadow_environment_invalid')
  const verified=createCallUsageExport(document,document.records,document.snapshotAt,Number(document.scannedCountUnits),document.accountRef,document.exportRef)
  if(document.coverage!=='complete'||document.recordsDigest!==verified.recordsDigest||document.recordCountUnits!==verified.recordCountUnits||!Number.isSafeInteger(Number(document.scannedCountUnits)))throw new Error('shadow_source_invalid')
  const source=`urn:aecon:meter-shadow:${environment}:v1`,subject=hash('account',document.accountRef),events:CloudEvent<Record<string,unknown>>[]=[],projection:Array<z.infer<typeof shadowProjectionRow>>=[]
  let coverage:'complete'|'partial'='complete'
  const add=(type:string,id:string,time:number,data:Record<string,unknown>)=>events.push(new CloudEvent({specversion:'1.0',source,subject,type,id,time:new Date(time).toISOString(),datacontenttype:'application/json',data:{...data,authoritativeForConsequences:false}}))
  for(const row of verified.records){
    const callDigest=hash('call',row.callRef),deliveredKnown=row.currentSupportVerified===true&&row.currentDeliveredRequestUnits==='1'
    const deliveryQuantity=deliveredKnown?'1':row.deliveryState==='not_delivered'&&row.serviceUsageRef===undefined?'0':null
    projection.push({lineageDigest:hash('unit-lineage',`${row.callRef}:delivered_request:v1`),unitDefinitionRef:'delivered_request:v1',quantityUnits:deliveryQuantity,quantityExponent:0})
    if(deliveryQuantity===null)coverage='partial'
    if(row.serviceUsageRef!==undefined&&row.deliveredRequestUnits==='1')add('ae.usage.delivery_assertion.v1',hash('delivered-request',row.serviceUsageRef),row.createdAt,{callDigest,unitDefinitionRef:'delivered_request:v1',quantityUnits:'1',quantityExponent:0,semantics:'immutable_original_assertion'})
    const observation=row.providerUnitObservation===undefined?null:providerUnitObservationSchema.parse(row.providerUnitObservation)
    if(observation!==null&&observation.environment!==environment)throw new Error('shadow_environment_mismatch')
    if(observation===null&&row.deliveryState!=='not_delivered')coverage='partial'
    if(observation!==null)for(const unit of observation.units){
      const quantityUnits=row.providerUnitSupportVerified===true&&unit.state==='observed'?unit.quantityUnits:null
      if(quantityUnits===null)coverage='partial'
      projection.push({lineageDigest:hash('unit-lineage',`${row.callRef}:${unit.unitDefinitionRef}`),unitDefinitionRef:unit.unitDefinitionRef,quantityUnits,quantityExponent:unit.quantityExponent})
      const lineageDigest=hash('unit-lineage',`${row.callRef}:${unit.unitDefinitionRef}`),observationDigest=hash('observation',observation.observationRef)
      add('ae.usage.evidence_snapshot.v1',hash('unit-observation',`${observation.observationRef}:${unit.unitDefinitionRef}:${verified.recordsDigest}:${document.snapshotAt}`),document.snapshotAt,{callDigest,lineageDigest,observationDigest,previousObservationDigest:observation.previousObservationRef===null?null:hash('observation',observation.previousObservationRef),sequence:observation.sequence,unitDefinitionRef:unit.unitDefinitionRef,dimension:unit.definition?.dimension??(unit.unitDefinitionRef==='blockrun_elevenlabs_character_credit:v1'?'character':'token'),quantityUnits:unit.quantityUnits,quantityExponent:unit.quantityExponent,state:unit.state,reason:unit.reason,relationship:unit.definition?.relationship??'independent',parentUnitDigest:unit.definition?.parentUnitId===undefined?null:hash('unit-parent',unit.definition.parentUnitId),verified:row.providerUnitSupportVerified===true,asOfObservedAt:document.snapshotAt,occurredAt:observation.occurredAt,effectiveAt:observation.effectiveAt,semantics:'replace_by_verified_lineage_not_sum'})
    }
    add('ae.usage.delivery_support_snapshot.v1',hash('delivery-support',`${row.callRef}:${verified.recordsDigest}:${document.snapshotAt}`),document.snapshotAt,{callDigest,unitDefinitionRef:'delivered_request:v1',quantityUnits:row.currentSupportVerified===true?row.currentDeliveredRequestUnits??null:null,quantityExponent:0,asOfObservedAt:document.snapshotAt,semantics:'replace_by_verified_lineage_not_sum'})
  }
  projection.sort((a,b)=>`${a.lineageDigest}:${a.unitDefinitionRef}`.localeCompare(`${b.lineageDigest}:${b.unitDefinitionRef}`))
  const material={projection,coverage,format:'ae.usage-meter-shadow:v1',environment,source,subject,sourceRecordsDigest:verified.recordsDigest,scopeDigest:canonicalDigest({accountRef:document.accountRef,periodStartAt:document.periodStartAt,periodEndAt:document.periodEndAt,principalRef:document.principalRef??null,status:document.status}),snapshotAt:document.snapshotAt,eventCount:events.length,events:events.map(event=>HTTP.structured(event)),connectionState:'disabled_disconnected',environmentBasis:'caller_selected_namespace_source_proof_required_before_connection',meterNumericCompatibility:'unverified',authoritativeForConsequences:false} as const
  return {...material,batchDigest:schemaDescriptorDigest({format:material.format,environment,source,subject,sourceRecordsDigest:material.sourceRecordsDigest,scopeDigest:material.scopeDigest,snapshotAt:material.snapshotAt,eventDigests:material.events.map(event=>canonicalDigest(JSON.parse(String(event.body)))),projectionDigests:projection.map(row=>canonicalDigest(row)),coverage})}
}
export type UsageMeterShadowBatch=ReturnType<typeof buildUsageMeterShadow>
export type FixtureShadowMeterPort={ingest:(messages:readonly Message[])=>Promise<{acceptedCount:number}>}
/** Only an explicitly injected fixture port is callable. There is no endpoint,
 * credential, global transport, production switch, billing or ledger API. */
export async function runUsageMeterShadow(batch:UsageMeterShadowBatch,fixture?:FixtureShadowMeterPort){
  if(fixture===undefined)return {kind:'disabled',reason:'external_meter_not_connected',authoritativeForConsequences:false} as const
  try{const result=await fixture.ingest(batch.events);if(!Number.isSafeInteger(result.acceptedCount)||result.acceptedCount!==batch.eventCount)return {kind:'mismatch',reason:'shadow_ack_count_mismatch',authoritativeForConsequences:false} as const
    return {kind:'acknowledged',acceptedCount:result.acceptedCount,reconciled:false,authoritativeForConsequences:false} as const
  }catch{return {kind:'unavailable',reason:'shadow_fixture_unavailable',authoritativeForConsequences:false} as const}
}

const shadowProjectionRow=z.strictObject({lineageDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/u),unitDefinitionRef:z.string().max(200),quantityUnits:z.string().regex(/^(?:0|[1-9]\d{0,51})$/u).nullable(),quantityExponent:z.number().int().min(0).max(12)})
const shadowComparison=z.strictObject({sourceRecordsDigest:z.string(),scopeDigest:z.string(),snapshotAt:z.number(),projection:z.array(shadowProjectionRow),coverage:z.enum(['complete','partial'])})
/** Compare a scoped, exact vendor readback, separately from ingestion ACK.
 * This is fixture proof only; vendor numeric/correction semantics are unproven. */
export function compareUsageMeterShadow(batch:UsageMeterShadowBatch,readback:unknown){
  const parsed=shadowComparison.safeParse(readback)
  if(!parsed.success)return {kind:'unavailable',reason:'shadow_projection_invalid',authoritativeForConsequences:false} as const
  const value=parsed.data
  if(value.sourceRecordsDigest!==batch.sourceRecordsDigest||value.scopeDigest!==batch.scopeDigest||value.snapshotAt!==batch.snapshotAt)return {kind:'mismatch',reason:'shadow_scope_changed',authoritativeForConsequences:false} as const
  const order=(a:z.infer<typeof shadowProjectionRow>,b:z.infer<typeof shadowProjectionRow>)=>`${a.lineageDigest}:${a.unitDefinitionRef}`.localeCompare(`${b.lineageDigest}:${b.unitDefinitionRef}`)
  const actual=[...value.projection].sort(order)
  if(actual.length!==batch.projection.length||actual.some((row,index)=>canonicalDigest(row)!==canonicalDigest(batch.projection[index])))return {kind:'mismatch',reason:'shadow_quantity_drift',authoritativeForConsequences:false} as const
  if(value.coverage!=='complete'||batch.coverage!=='complete')return {kind:'unknown',reason:'shadow_coverage_incomplete',authoritativeForConsequences:false} as const
  return {kind:'matched',basis:'fixture_exact_lineage_projection',vendorNumericCompatibility:'unverified',authoritativeForConsequences:false} as const
}
