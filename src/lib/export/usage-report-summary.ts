import { z } from 'zod'
import { providerUnitSummarySchema, type ProviderUnitSummary } from '@/modules/capability-execution/provider-service-units'
import type { CallUsageExport } from './call-usage-export'
const units=z.string().regex(/^(?:0|[1-9]\d*)$/u)
const daily=z.strictObject({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),callCountUnits:units,recordedChargeUnits:units,amountCoverage:z.enum(['complete','incomplete'])})
export const usageReportSummarySchema=z.strictObject({refusedCallCountUnits:units.exactOptional(),uncertainCallCountUnits:units.exactOptional(),recordCountUnits:units,deliveredRequestUnits:units,currentDeliveredRequestUnits:units,unknownCurrentDeliveryCallCountUnits:units,
  recordedChargeUnits:units,amountCoverage:z.enum(['complete','incomplete']),serviceUnitCoverage:z.enum(['complete','incomplete']),
  providerUnitReceiptCallCountUnits:units,providerUnitUnknownCallCountUnits:units,providerUnits:z.array(providerUnitSummarySchema).max(4096),daily:z.array(daily).max(367)})
export type UsageReportSummary=z.infer<typeof usageReportSummarySchema>
export function emptyUsageReportSummary(includeOperationalCounts=true):UsageReportSummary{return {...(includeOperationalCounts?{refusedCallCountUnits:'0',uncertainCallCountUnits:'0'}:{}),recordCountUnits:'0',deliveredRequestUnits:'0',currentDeliveredRequestUnits:'0',unknownCurrentDeliveryCallCountUnits:'0',recordedChargeUnits:'0',amountCoverage:'complete',serviceUnitCoverage:'complete',providerUnitReceiptCallCountUnits:'0',providerUnitUnknownCallCountUnits:'0',providerUnits:[],daily:[]}}
const add=(a:string,b:string)=>(BigInt(a)+BigInt(b)).toString()
export function appendUsageReportSummary(previous:UsageReportSummary,page:CallUsageExport,includeUnitDetails=true):UsageReportSummary{
  const providerUnits=new Map<string,ProviderUnitSummary>(previous.providerUnits.map(row=>[row.unitDefinitionRef,row]))
  for(const row of includeUnitDetails ? page.providerUnits : []){const before=providerUnits.get(row.unitDefinitionRef)
    if(before !== undefined && before.quantityExponent !== row.quantityExponent) throw new Error('usage_report_unit_definition_conflict')
    providerUnits.set(row.unitDefinitionRef,{...row,observedQuantityUnits:add(before?.observedQuantityUnits ?? '0',row.observedQuantityUnits),observedReceiptCountUnits:add(before?.observedReceiptCountUnits ?? '0',row.observedReceiptCountUnits),unknownReceiptCountUnits:add(before?.unknownReceiptCountUnits ?? '0',row.unknownReceiptCountUnits),coverage:before?.coverage === 'incomplete' || row.coverage === 'incomplete' ? 'incomplete' : 'complete'})}
  const days=new Map(previous.daily.map(row=>[row.date,{...row}]))
  let recordedChargeUnits=previous.recordedChargeUnits
  for(const row of page.records){
    const date=new Date(row.createdAt).toISOString().slice(0,10),day=days.get(date) ?? {date,callCountUnits:'0',recordedChargeUnits:'0',amountCoverage:'complete' as const}
    day.callCountUnits=add(day.callCountUnits,'1')
    if(row.paymentState === 'settled' && row.audAmountUnits !== undefined){day.recordedChargeUnits=add(day.recordedChargeUnits,row.audAmountUnits);recordedChargeUnits=add(recordedChargeUnits,row.audAmountUnits)}
    else if(row.paymentState !== 'released' && !(row.paymentState === 'not_applicable' && row.state === 'refused' && row.deliveryState === 'not_delivered')) day.amountCoverage='incomplete'
    days.set(date,day)
  }
  return usageReportSummarySchema.parse({...((previous.refusedCallCountUnits!==undefined&&previous.uncertainCallCountUnits!==undefined)?{refusedCallCountUnits:add(previous.refusedCallCountUnits,String(page.records.filter(row=>row.state==='refused').length)),uncertainCallCountUnits:add(previous.uncertainCallCountUnits,String(page.records.filter(row=>row.state==='outcome_unknown').length))}:{}),recordCountUnits:add(previous.recordCountUnits,page.recordCountUnits),deliveredRequestUnits:add(previous.deliveredRequestUnits,page.deliveredRequestUnits),currentDeliveredRequestUnits:add(previous.currentDeliveredRequestUnits,page.currentDeliveredRequestUnits),unknownCurrentDeliveryCallCountUnits:add(previous.unknownCurrentDeliveryCallCountUnits,page.unknownCurrentDeliveryCallCountUnits),recordedChargeUnits,
    amountCoverage:previous.amountCoverage === 'incomplete' || page.amountCoverage === 'incomplete' ? 'incomplete' : 'complete',serviceUnitCoverage:previous.serviceUnitCoverage === 'incomplete' || page.serviceUnitCoverage === 'incomplete' ? 'incomplete' : 'complete',providerUnitReceiptCallCountUnits:add(previous.providerUnitReceiptCallCountUnits,page.providerUnitReceiptCallCountUnits),providerUnitUnknownCallCountUnits:add(previous.providerUnitUnknownCallCountUnits,page.providerUnitUnknownCallCountUnits),providerUnits:[...providerUnits.values()].sort((a,b)=>a.unitDefinitionRef.localeCompare(b.unitDefinitionRef)),daily:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))})
}
