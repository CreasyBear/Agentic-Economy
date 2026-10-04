import { canonicalDigest,isCanonicalDigest } from '@/modules/common/canonical-digest'
import { callStatusStateSchema,type OwnerCallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'
import { callAttemptEvidenceSchema } from '@/modules/capability-execution/call-attempt-evidence'
import { serviceUsageEvidenceSchema } from '@/modules/capability-execution/service-usage-evidence'
import { providerUnitEvidenceSchema } from '@/modules/capability-execution/provider-service-units'
import { exactAmountSchema } from '@/modules/money/public'

const digest=(kind:string,value:string)=>canonicalDigest({format:'ae.call-trace-identifier:v1',kind,value})
const evidence=(value:string|undefined|null)=>value!==undefined&&value!==null&&isCanonicalDigest(value)?value:null
/** The owner-authorized receipt supplies evidence. The export deliberately
 * projects fields rather than serializing a status, error or provider payload. */
export function createCallTraceExport(result:Extract<OwnerCallStatusResult,{kind:'found'}>){
  const owner=result.ownerContext
  if(owner===undefined||owner===null)throw new Error('call_trace_owner_context_required')
  const attempts=owner.attemptEvidence===undefined?null:callAttemptEvidenceSchema.parse(owner.attemptEvidence)
  const measured=owner.serviceUsageEvidence===undefined?null:serviceUsageEvidenceSchema.parse(owner.serviceUsageEvidence)
  const provider=owner.providerUnitEvidence===undefined?null:providerUnitEvidenceSchema.parse(owner.providerUnitEvidence)
  const receipt=result.receipt
  const material={format:'ae.call-trace:v1',source:'owner_authorized_canonical_call',authoritativeForConsequences:false,
    callDigest:digest('call',result.callRef),toolDigest:digest('tool',result.toolRef),principalDigest:digest('principal',owner.agent.principalRef),applicationDigest:digest('application',owner.agent.applicationRef),
    version:result.version,state:callStatusStateSchema.parse(result.state),evidenceDigest:evidence(result.evidenceHash),
    attempts:attempts?.kind!=='available'?null:attempts.attempts.map(row=>({...row,attemptRef:digest('attempt',row.attemptRef)})),
    auditTransitions:attempts?.kind!=='available'?null:attempts.history,
    attemptCoverage:attempts?.kind==='available'?'complete':'unknown',
    measurement:measured?.kind!=='available'?null:{usageDigest:digest('usage',measured.usageRef),unitDefinitionRef:measured.unitDefinitionRef,originalQuantityUnits:measured.originalQuantityUnits,currentQuantityUnits:measured.currentQuantityUnits,
      occurredAt:measured.originalOccurredAt,observedAt:measured.originalObservedAt,asOfObservedAt:measured.asOfObservedAt,asOfEffectiveAt:measured.asOfEffectiveAt,evidenceDigest:evidence(measured.evidenceDigest),
      revisions:measured.revisions.map(row=>({revision:row.revision,revisionDigest:digest('revision',row.revisionRef),quantityUnits:row.quantityUnits,effectiveAt:row.effectiveAt,observedAt:row.observedAt,sourceDigest:evidence(row.sourceDigest)}))},
    providerUnits:provider===null?null:{support:provider.currentSupport,coverage:provider.coverage,evidenceDigest:evidence(provider.evidenceDigest),observations:provider.observations.map(row=>({observationDigest:digest('observation',row.observationRef),previousObservationDigest:row.previousObservationRef===null?null:digest('observation',row.previousObservationRef),sequence:row.sequence,change:row.change,
      adapterId:row.adapterId,occurredAt:row.occurredAt,effectiveAt:row.effectiveAt,observedAt:row.observedAt,units:row.units.map(unit=>({unitDefinitionRef:unit.unitDefinitionRef,quantityUnits:unit.quantityUnits,quantityExponent:unit.quantityExponent,state:unit.state,reason:unit.reason}))}))},
    money:receipt===undefined?null:{state:receipt.state,customerCharge:exactAmountSchema.parse(receipt.totalBuyerCharge),serviceFee:exactAmountSchema.parse(receipt.serviceFee),providerObligation:exactAmountSchema.parse(receipt.providerObligation.amount),providerTransfer:receipt.providerSettlement===undefined?null:exactAmountSchema.parse(receipt.providerSettlement.amount),priceDigest:evidence(receipt.priceDigest)},
  } as const
  return {...material,traceDigest:canonicalDigest(material)}
}
