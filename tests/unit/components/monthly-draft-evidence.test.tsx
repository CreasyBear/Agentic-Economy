/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import '../../setup/jsdom-platform'
import { ActivityMonthlyDraft } from '@/components/ae/activity/components/ActivityMonthlyDraft'
import { CallAttemptEvidence } from '@/components/ae/call-receipt/CallAttemptEvidence'
import { CallMeasurementEvidence } from '@/components/ae/call-receipt/CallMeasurementEvidence'
import { freezeMonthlyDraft, monthlyDraftRef } from '@/modules/capability-execution/monthly-usage-draft'
import { projectServiceUsageEvidence, supportDigest } from '@/modules/capability-execution/service-usage-evidence'
import { digestReference } from '@/modules/money/public'
import { activityReturnHref } from '@/lib/call-recovery/activity-return-scope'
const mocks = vi.hoisted(() => ({ create: vi.fn(), read: vi.fn(), navigate: vi.fn(), search: {} as {draftRef?: string} }))
vi.mock('@/lib/server/monthly-usage-draft.functions', () => ({createOwnerMonthlyUsageDraftServer: mocks.create, readOwnerMonthlyUsageDraftServer: mocks.read}))
vi.mock('@tanstack/react-router', () => ({useRouter: () => ({navigate: mocks.navigate}), useSearch: () => mocks.search,
  Link: ({children,params,search,'aria-label': label}: {children: ReactNode;params: {callRef: string}; search: Record<string,string>;'aria-label'?: string}) => <a aria-label={label} href={`/calls/${encodeURIComponent(params.callRef)}?${new URLSearchParams(search)}`}>{children}</a>}))
const callRef = `operation-invocation:v1:${'a'.repeat(64)}`, transactionRef = `ae-p4:${'b'.repeat(64)}`
function draft(month: string, revision: number) {
  const occurredAt = Date.UTC(Number(month.slice(0,4)), Number(month.slice(5)) - 1, 2), captured = Date.UTC(2026,9,4)
  const frozen = freezeMonthlyDraft({format: 'ae.monthly-usage-draft:v1',draftRef: monthlyDraftRef('account:one',month,revision), accountRef: 'account:one',month,revision,
    priorDraftDigest: null,ledgerSnapshotAt:captured,sourcesCapturedAt:captured,sourceIdentity:{environment:'sandbox',sourceDigest:`sha256:${'c'.repeat(64)}`},requestedByPrincipalRef:'principal:one',authorityRevisionAccount:1,
    financial:{kind:'available',snapshotAt:captured,coverage:'complete',entries:[{transactionId:'1',transactionRef,callDigest:digestReference('call',callRef),providerDigest:null,kind:'charge',units:'10001',occurredAt,recordedAt:occurredAt,reverted:false}]},
    calls:[{callRef,credentialRef:'credential:one',principalRef:'principal:one',createdAt:occurredAt,environment:'sandbox',providerDigest:null,settlementRefs:[transactionRef],refundRefs:[],providerSettlementRef:null,providerReversalRef:null,providerObligationUnits:null}],
    sources:[callRef],measurements:[],canonicalSupport:[],authoritativeForConsequences:false,issuedInvoice:false})
  return {kind:'available' as const,draftRef:frozen.snapshot.draftRef,snapshotJson:frozen.snapshotJson,snapshotDigest:frozen.snapshotDigest,issuedInvoice:false,authoritativeForConsequences:false}
}
afterEach(() => {cleanup(); mocks.search={}; [mocks.create,mocks.read,mocks.navigate].forEach(mock=>mock.mockReset())})
describe('actual Arc monthly draft and receipt evidence',()=>{
  it('prepares an older month, supplements explicitly, and restores frozen identity on Call return',async()=>{
    mocks.create.mockImplementation(async ({data}:{data:{month:string;revision:number}})=>draft(data.month,data.revision))
    const view=render(<ActivityMonthlyDraft returnScope={{returnRange:'month'}} />)
    fireEvent.change(screen.getByLabelText('Closed UTC month'),{target:{value:'2026-08'}})
    fireEvent.click(screen.getByRole('button',{name:'Prepare monthly draft'}))
    await screen.findByText('Monthly draft revision 1 is ready.')
    expect(screen.getByText('Inspect the frozen reconciliation').parentElement).not.toHaveAttribute('open')
    fireEvent.click(screen.getByRole('button',{name:'Create supplement'}))
    await screen.findByText('Monthly draft revision 2 is ready.')
    const expected=draft('2026-08',2)
    const link=screen.getByRole('link',{name:'View Call for ledger transaction 1'})
    expect(link.getAttribute('href')).toContain(`returnDraftRef=${encodeURIComponent(expected.draftRef)}`)
    expect(activityReturnHref({returnRange:'month',returnDraftRef:expected.draftRef})).toBe(`/activity?range=month&draftRef=${encodeURIComponent(expected.draftRef)}`)
    expect(mocks.create.mock.calls.map(call=>call[0].data)).toEqual([{month:'2026-08',revision:1},{month:'2026-08',revision:2}])
    view.unmount(); mocks.search={draftRef:expected.draftRef}; mocks.read.mockResolvedValue(expected)
    render(<ActivityMonthlyDraft draftRef={expected.draftRef} returnScope={{returnRange:'month'}} />)
    await screen.findByText('Monthly draft revision 2 is ready.')
    expect(screen.getByLabelText('Closed UTC month')).toHaveValue('2026-08')
    expect(mocks.read).toHaveBeenCalledWith({data:{draftRef:expected.draftRef}})
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })
  it('does not expose frozen evidence after an owner read is refused',async()=>{
    mocks.search={draftRef:draft('2026-08',1).draftRef};mocks.read.mockResolvedValue({kind:'refused',code:'monthly_draft_not_found'})
    render(<ActivityMonthlyDraft draftRef={mocks.search.draftRef!} returnScope={{}} />)
    await screen.findByText('The saved monthly draft is unavailable for this account.')
    await waitFor(()=>expect(screen.getByRole('button',{name:'Prepare monthly draft'})).toBeEnabled())
    expect(screen.queryByRole('button',{name:'Download frozen evidence JSON'})).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('cancels removed draft reads and rechecks the same identity on reentry',async()=>{
    const saved=draft('2026-08',1)
    let finish!: (result: ReturnType<typeof draft>)=>void
    mocks.read.mockReturnValueOnce(new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce(saved)
    const view=render(<ActivityMonthlyDraft draftRef={saved.draftRef} returnScope={{}} />)
    expect(screen.getByRole('button',{name:'Preparing…'})).toHaveAttribute('aria-disabled','true')
    view.rerender(<ActivityMonthlyDraft returnScope={{}} />)
    await waitFor(()=>expect(screen.getByRole('button',{name:'Prepare monthly draft'})).toBeEnabled())
    await act(async()=>{finish(saved)})
    await waitFor(()=>expect(screen.queryByText('Monthly draft revision 1 is ready.')).toBeNull())
    view.rerender(<ActivityMonthlyDraft draftRef={saved.draftRef} returnScope={{}} />)
    await screen.findByText('Monthly draft revision 1 is ready.')
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })
  it('restores the earlier draft through an interrupted different draft read',async()=>{
    const first=draft('2026-08',1),second=draft('2026-07',1)
    let finish!: (result: ReturnType<typeof draft>)=>void
    mocks.read.mockResolvedValueOnce(first).mockReturnValueOnce(new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce(first)
    const view=render(<ActivityMonthlyDraft draftRef={first.draftRef} returnScope={{}} />)
    await screen.findByText('Monthly draft revision 1 is ready.')
    view.rerender(<ActivityMonthlyDraft draftRef={second.draftRef} returnScope={{}} />)
    await waitFor(()=>expect(screen.getByRole('button',{name:'Preparing…'})).toHaveAttribute('aria-disabled','true'))
    view.rerender(<ActivityMonthlyDraft draftRef={first.draftRef} returnScope={{}} />)
    await screen.findByText('Monthly draft revision 1 is ready.')
    expect(screen.getByLabelText('Closed UTC month')).toHaveValue('2026-08')
    await act(async()=>{finish(second)})
    await waitFor(()=>expect(screen.getByLabelText('Closed UTC month')).toHaveValue('2026-08'))
    expect(mocks.read).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('button',{name:'Read same draft'})).toBeEnabled()
  })
  it('does not publish an older creation after navigating to another frozen draft',async()=>{
    const saved=draft('2026-07',1)
    let finish!: (result: ReturnType<typeof draft>)=>void
    mocks.create.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}));mocks.read.mockResolvedValue(saved)
    const view=render(<ActivityMonthlyDraft returnScope={{}} />)
    fireEvent.change(screen.getByLabelText('Closed UTC month'),{target:{value:'2026-08'}})
    mocks.navigate.mockClear()
    fireEvent.click(screen.getByRole('button',{name:'Prepare monthly draft'}))
    view.rerender(<ActivityMonthlyDraft draftRef={saved.draftRef} returnScope={{}} />)
    await screen.findByText('Monthly draft revision 1 is ready.')
    await act(async()=>{finish(draft('2026-08',1))})
    await waitFor(()=>expect(screen.getByLabelText('Closed UTC month')).toHaveValue('2026-07'))
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
  it('never navigates from a draft creation result after the presenter unmounts',async()=>{
    let finish!: (result: ReturnType<typeof draft>)=>void
    mocks.create.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}))
    const view=render(<ActivityMonthlyDraft returnScope={{}} />)
    fireEvent.change(screen.getByLabelText('Closed UTC month'),{target:{value:'2026-08'}})
    mocks.navigate.mockClear()
    fireEvent.click(screen.getByRole('button',{name:'Prepare monthly draft'}))
    view.unmount()
    await act(async()=>{finish(draft('2026-08',1))})
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
  it('discloses actual durable attempt versions without equating release with settlement',()=>{
    render(<CallAttemptEvidence evidence={{kind:'available',source:'durable_action_execution',complete:true,authoritativeForConsequences:false,
      attempts:[{attemptRef:'attempt:one',attemptNumber:1,effectGeneration:1,release:'possibly_released',outcome:'uncertain',errorDigest:null,recordedAt:1000}],
      history:[{executionVersion:2,kind:'late_observation',current:true,commandDigest:null,evidenceDigest:null,recordedAt:2000}]}} />)
    expect(screen.getByText('Possibly released')).toBeInTheDocument()
    expect(screen.getByText('Inspect 1 audit transitions').parentElement).not.toHaveAttribute('open')
    expect(screen.getByText(/Version 2: late_observation/)).toBeInTheDocument()
    expect(screen.getByText(/Release evidence does not confirm financial settlement/)).toBeVisible()
  })
  it('retains the original delivery when current support is unknown',()=>{
    const evidence=projectServiceUsageEvidence({usageRef:'usage:one',callRef,occurredAt:1000,observedAt:1000,sourceDigest:supportDigest({state:'completed',resultKind:'completed',evidenceHash:null}),revisions:[],asOfObservedAt:2000,asOfEffectiveAt:2000})
    if(evidence.kind!=='available')throw new Error('fixture_unavailable')
    render(<CallMeasurementEvidence evidence={{...evidence,currentQuantityUnits:null}} />)
    expect(screen.getByText('1 delivered request')).toBeInTheDocument()
    expect(screen.getByText('Unknown — canonical support is absent')).toBeVisible()
    expect(screen.getByText(/creates no financial adjustment/)).toBeVisible()
  })
})
