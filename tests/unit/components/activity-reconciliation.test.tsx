/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import '../../setup/jsdom-platform'
import { ActivityReconciliation } from '@/components/ae/activity/components/ActivityReconciliation'
import { reconcileUsage, digestReference } from '@/modules/money/public'
import { activityReturnHref, activityReturnScopeSchema, activityReturnSearch, scopedCallHref } from '@/lib/call-recovery/activity-return-scope'

vi.mock('@tanstack/react-router',()=>({Link:({children,params,search,'aria-label':label}: {children:ReactNode;params:{callRef:string};search:{returnRange:string};'aria-label'?:string})=><a aria-label={label} href={`/calls/${encodeURIComponent(params.callRef)}?returnRange=${search.returnRange}`}>{children}</a>}))
afterEach(cleanup)
const callRef=`operation-invocation:v1:${'a'.repeat(64)}`
const transactionRef=`ae-p4:${'b'.repeat(64)}`
const summary=()=>reconcileUsage({periodStartAt:100,periodEndAt:2000,sources:[callRef],calls:[{callRef,credentialRef:'credential:shared',principalRef:'principal:buyer',createdAt:50,environment:'sandbox',providerDigest:null,settlementRefs:[transactionRef],refundRefs:[],providerSettlementRef:null,providerReversalRef:null,providerObligationUnits:null}],financial:{kind:'available',snapshotAt:3000,coverage:'complete',entries:[{transactionId:'1',transactionRef,callDigest:digestReference('call',callRef),providerDigest:null,kind:'charge',units:'9007199254740993001',occurredAt:1000,recordedAt:1100,reverted:false}]}})
const props={returnScope:{returnRange:'month' as const},retryPending:false,onRetry:vi.fn()}
describe('Arc financial reconciliation presentation',()=>{
  it('shows exact amounts and exposes financial entries and a scoped Call link through native disclosures',()=>{
    render(<ActivityReconciliation {...props} result={summary()} />)
    const region=screen.getByRole('region',{name:'Financial reconciliation'})
    expect(within(region).getAllByRole('term')).toHaveLength(6)
    expect(region).toHaveTextContent('AUD 9007199254740.993001')
    expect(screen.getByText(/Amount coverage: complete/)).toBeVisible()
    expect(screen.getByText('How these amounts and dates reconcile').parentElement).not.toHaveAttribute('open')
    const details=screen.getByText('Inspect 1 financial entries').parentElement!
    expect(details).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Inspect 1 financial entries'))
    expect(screen.getByRole('link',{name:'View Call for ledger transaction 1'})).toHaveAttribute('href',`/calls/${encodeURIComponent(callRef)}?returnRange=month`)
    expect(screen.queryByRole('img')).toBeNull()
  })
  it('keeps partial-coverage notice visible and makes retry a read-only callback',()=>{
    render(<ActivityReconciliation {...props} result={{...summary(),amountCoverage:'partial'}} />)
    expect(screen.getByText(/Every amount above is a measured subset/)).toBeVisible()
    cleanup()
    const onRetry=vi.fn(),view=render(<ActivityReconciliation {...props} result={{kind:'unavailable',code:'source_unavailable'}} onRetry={onRetry} retryPending />)
    const pending=screen.getByRole('button',{name:'Refreshing…'})
    expect(pending).toHaveAttribute('aria-disabled','true');fireEvent.click(pending);expect(onRetry).not.toHaveBeenCalled()
    view.rerender(<ActivityReconciliation {...props} result={{kind:'unavailable',code:'source_unavailable'}} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button',{name:'Retry reconciliation'}));expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.queryByRole('term')).toBeNull()
  })
  it('renders empty evidence without inventing activity or zero provider cost for missing Calls',()=>{
    const empty=reconcileUsage({periodStartAt:100,periodEndAt:2000,calls:[],sources:[],financial:{kind:'available',snapshotAt:3000,coverage:'complete',entries:[]}})
    render(<ActivityReconciliation {...props} result={empty} />)
    expect(screen.getByText('No credential-attributed usage in this period.')).toBeInTheDocument()
    expect(screen.getByText('No charge, refund, promotional use or provider transfer entries in this period.')).toBeInTheDocument()
    expect(screen.getByText(/Missing provider costs remain unknown/)).toBeVisible()
  })
  it('accepts only bounded known return scope and reconstructs a fixed local Activity route',()=>{
    const scope=activityReturnScopeSchema.parse({returnRange:'month',returnAgent:'principal:buyer',returnUrl:'https://evil.invalid'})
    expect(activityReturnSearch(scope)).toEqual({range:'month',agent:'principal:buyer'})
    expect(activityReturnHref(scope)).toBe('/activity?range=month&agent=principal%3Abuyer')
    expect(scopedCallHref('/calls/one',scope)).toBe('/calls/one?returnRange=month&returnAgent=principal%3Abuyer')
    expect(activityReturnHref(activityReturnScopeSchema.parse({returnRange:'javascript:invalid',returnAgent:'x'.repeat(201)}))).toBe('/activity')
  })
})
