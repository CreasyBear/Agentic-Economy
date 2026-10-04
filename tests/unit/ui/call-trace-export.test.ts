import { describe,expect,it } from 'vitest'
import { createCallTraceExport } from '@/lib/export/call-trace'
import type { OwnerCallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'
const hash=`sha256:${'a'.repeat(64)}`,sentinel='sk-SENTINEL-PRIVATE',ref='operation-invocation:trace'
const fixture:Extract<OwnerCallStatusResult,{kind:'found'}>={kind:'found',callRef:ref,version:1,toolRef:'tool:one',state:'terminal',previousInput:{Authorization:sentinel},
  result:{kind:'completed',callRef:ref,toolRef:'tool:one',output:{privateText:sentinel,signedUrl:`https://signed.invalid?token=${sentinel}`},evidenceHash:hash,usage:{usageRef:'usage:one',chargeState:'free_tier',amount:{currency:'AUD',units:'0',exponent:6},priceDigest:hash,observedAt:100}},
  ownerContext:{purpose:null,agent:{principalRef:'principal:one',applicationRef:'app:one',currentDisplayName:sentinel},recordedTool:{kind:'available',basis:'call_snapshot',name:sentinel,providerRef:'provider:one',providerName:null},reconciliation:{canSubmitEvidence:true,permissionBasis:'account_owner',requiresVerifiedEvidence:true},
    attemptEvidence:{kind:'available',source:'durable_action_execution',complete:true,authoritativeForConsequences:false,attempts:[{attemptRef:sentinel,attemptNumber:1,effectGeneration:1,release:'released',outcome:'returned',errorDigest:null,recordedAt:100}],history:[{executionVersion:1,kind:'terminal_completed',current:true,commandDigest:hash,evidenceDigest:hash,recordedAt:100}]},
    providerUnitEvidence:{source:'provider_reported_completed_call',authoritativeForMoney:false,current:null,currentSupport:'unknown',observations:[],evidenceDigest:hash,coverage:'successful_call_receipts_only'},
  },
}
describe('owner safe trace export',()=>{
  it('exports only safe execution evidence and independent coverage, without content or raw identities',()=>{
    const trace=createCallTraceExport(fixture),text=JSON.stringify(trace)
    for(const value of [sentinel,'signed.invalid','principal:one','app:one',ref])expect(text).not.toContain(value)
    expect(trace).toMatchObject({attemptCoverage:'complete',attempts:[{release:'released',outcome:'returned'}],money:null,measurement:null,providerUnits:{support:'unknown'},authoritativeForConsequences:false})
    expect(trace.traceDigest).toMatch(/^sha256:[a-f0-9]{64}$/u)
  })
  it('requires owner context and refuses invalid history without a partial file',()=>{
    expect(()=>createCallTraceExport({...fixture,ownerContext:null})).toThrow('call_trace_owner_context_required')
    const owner=fixture.ownerContext
    if(owner?.attemptEvidence?.kind!=='available')throw new Error('fixture_invalid')
    const attempts=owner.attemptEvidence,first=attempts.attempts[0]
    if(first===undefined)throw new Error('fixture_invalid')
    expect(()=>createCallTraceExport({...fixture,ownerContext:{...owner,attemptEvidence:{...attempts,attempts:[{...first,errorDigest:sentinel}]}}})).toThrow()
  })
})
