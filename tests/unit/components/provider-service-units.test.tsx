/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { providerUnitMaterial, observationRef, type ProviderUnitEvidence } from '@/modules/capability-execution/provider-service-units'
import { blockrunTool, blockrunChatReceipt, blockrunSpeechReceipt } from '../capability-execution/fixtures/blockrun-service-unit-evidence'
import { CallProviderUnits } from '@/components/ae/call-receipt/CallProviderUnits'
import { MonthlyProviderUnits } from '@/components/ae/activity/components/MonthlyProviderUnits'
vi.mock('@tanstack/react-router', () => ({Link: ({params,search,children}:{params:{callRef:string};search:Record<string,string>;children:React.ReactNode}) => <a href={`/calls/${params.callRef}?${new URLSearchParams(search)}`}>{children}</a>}))
afterEach(cleanup)
function evidence(kind:'chat'|'speech'='chat'):ProviderUnitEvidence {
  const tool=blockrunTool(kind),call={callRef:'call:ui',ownerId:'account:ui',principalId:'principal:ui',credentialId:'credential:ui',applicationRef:'application:ui',toolRef:tool.operationId,environment:'sandbox' as const,
    requestDigest:canonicalDigest('logical'),state:'completed',result:{kind:'completed',output:kind==='chat'?blockrunChatReceipt:blockrunSpeechReceipt,evidenceHash:canonicalDigest('response')},attemptRef:'operation-attempt:call:ui:1'}
  const material=providerUnitMaterial(call,tool,{attemptRef:call.attemptRef,attemptNumber:1,effectGeneration:1,operationKeyDigest:canonicalDigest('operation')})!
  const linkage={sourceDigest:material.sourceDigest,previousObservationRef:null,previousAttemptObservationRef:null,sequence:1}
  const observation={...material,...linkage,observationRef:observationRef(linkage),change:'initial_attempt' as const,occurredAt:Date.UTC(2026,8,15),effectiveAt:Date.UTC(2026,8,15),observedAt:Date.UTC(2026,9,2),timeBasis:'call_updated' as const}
  return {source:'provider_reported_completed_call',authoritativeForMoney:false,current:observation,currentSupport:'verified',observations:[observation],evidenceDigest:canonicalDigest('fixture'),coverage:'successful_call_receipts_only'}
}
describe('actual Arc provider unit presentation',()=>{
  it('shows separate token values, source coverage and attempt provenance without payloads',()=>{
    const source=evidence();render(<CallProviderUnits evidence={source}/> )
    expect(screen.getByText('BlockRun input tokens')).toBeVisible();expect(screen.getByText('12')).toBeVisible();expect(screen.getByText('8')).toBeVisible()
    expect(screen.getByText('2 of 2 quantities reported')).toBeVisible();expect(screen.getByText('1 / 1')).toBeVisible()
    expect(screen.getByText(/Inspect 1 immutable provider observations/)).toBeVisible()
    expect(document.body.textContent).not.toContain('SYNTHETIC_PRIVATE_OUTPUT')
  })
  it('shows unknown current quantities while retaining historical attempt evidence',()=>{
    const source=evidence('speech');render(<CallProviderUnits evidence={{...source,current:null,currentSupport:'unknown'}} />)
    expect(screen.getByText(/Current provider quantities are unknown/)).toBeVisible()
    expect(screen.getByText(/Inspect 1 immutable provider observations/)).toBeVisible()
    expect(document.body.textContent).not.toContain('PRIVATE_AUDIO')
  })
  it('links frozen quantities back through the same range and draft scope, separating unlike units',()=>{
    const source=evidence(),draftRef=`monthly-usage-draft:${'a'.repeat(64)}`
    render(<MonthlyProviderUnits returnScope={{returnRange:'month',returnAgent:'principal:ui'}} snapshot={{month:'2026-09',draftRef,providerUnitEvidence:[{callRef:'call:ui',evidence:source}]}} />)
    expect(screen.getByText('Historically reported BlockRun input tokens')).toBeVisible();expect(screen.getByText('Historically reported BlockRun output tokens')).toBeVisible()
    expect(screen.getByText(/BlockRun input tokens: 1 reported attempts; 0 attempts with unknown quantities/)).toBeVisible()
    const href=screen.getByRole('link',{name:'Inspect receipt call:ui, attempt 1'}).getAttribute('href')!
    expect(href).toContain('returnRange=month');expect(href).toContain(`returnDraftRef=${encodeURIComponent(draftRef)}`);expect(href).toContain('returnAgent=principal%3Aui')
  })
  it('does not pretend older frozen drafts contain provider unit coverage',()=>{
    render(<MonthlyProviderUnits returnScope={{}} snapshot={{month:'2026-09',draftRef:'draft:old'}} />)
    expect(screen.getByText('Provider quantity evidence was not captured in this older draft.')).toBeVisible()
    expect(screen.queryByText('Historically reported BlockRun input tokens')).toBeNull()
  })
  it('retains a September attempt when the current attempt occurred in October, without summing correction revisions',()=>{
    const source=evidence(),first=source.current!, later={...first,attemptRef:'operation-attempt:call:ui:2',attemptNumber:2,effectGeneration:2,occurredAt:Date.UTC(2026,9,1)}
    // Build valid, differently sourced attempt reports through the same material contract.
    const tool=blockrunTool(),call={callRef:first.callRef,ownerId:first.accountRef,principalId:first.principalRef,credentialId:first.credentialRef,applicationRef:first.applicationRef,toolRef:first.toolRef,environment:first.environment,
      requestDigest:first.logicalRequestDigest,state:'completed',result:{kind:'completed',output:blockrunChatReceipt,evidenceHash:first.responseEvidenceHash},attemptRef:later.attemptRef}
    const correctedMaterial=providerUnitMaterial({...call,attemptRef:first.attemptRef,result:{...call.result,output:{...blockrunChatReceipt,usage:{prompt_tokens:14,completion_tokens:8,total_tokens:22}}}},tool,first)!
    const correctedLink={sourceDigest:correctedMaterial.sourceDigest,previousObservationRef:first.observationRef,previousAttemptObservationRef:first.observationRef,sequence:2}
    const correction={...first,...correctedMaterial,...correctedLink,observationRef:observationRef(correctedLink),change:'support_correction' as const,effectiveAt:Date.UTC(2026,9,2)}
    const material=providerUnitMaterial(call,tool,later)!,linkage={sourceDigest:material.sourceDigest,previousObservationRef:correction.observationRef,previousAttemptObservationRef:null,sequence:3}
    const october={...material,...linkage,observationRef:observationRef(linkage),change:'initial_attempt' as const,occurredAt:Date.UTC(2026,9,1),effectiveAt:Date.UTC(2026,9,1),observedAt:Date.UTC(2026,9,2),timeBasis:'call_updated' as const}
    render(<MonthlyProviderUnits returnScope={{returnRange:'month'}} snapshot={{month:'2026-09',draftRef:'draft:period',providerUnitEvidence:[{callRef:first.callRef,evidence:{...source,current:october,observations:[first,correction,october]}}]}} />)
    expect(screen.getByText('14')).toBeVisible()
    expect(screen.queryByText('26')).toBeNull()
    expect(screen.getByText(/1 captured attempt reports in 1 Calls have a recorded source date in this month/)).toBeVisible()
    expect(screen.getByRole('link',{name:'Inspect receipt call:ui, attempt 1'})).toBeVisible()
    expect(screen.queryByRole('link',{name:'Inspect receipt call:ui, attempt 2'})).toBeNull()
    expect(screen.getByText(/Historical provider report; current support not established/)).toBeVisible()
  })
})
