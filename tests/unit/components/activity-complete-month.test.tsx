/** @vitest-environment jsdom */
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import type { ReactNode } from 'react'
import { ActivityCompleteMonth } from '@/components/ae/activity/components/ActivityCompleteMonth'
const mocks=vi.hoisted(()=>({prepare:vi.fn(),read:vi.fn(),policy:vi.fn(),configure:vi.fn(),navigate:vi.fn().mockResolvedValue(undefined)}))
vi.mock('@/lib/server/complete-monthly-usage.functions',()=>({requestCompleteMonthlyUsageServer:mocks.prepare,readCompleteMonthlyUsageServer:mocks.read,readUsageReportingPolicyServer:mocks.policy,configureUsageReportingServer:mocks.configure,readMonthlyRelatedDocumentsServer:vi.fn(),readMonthlyFinancialPartsServer:vi.fn()}))
vi.mock('@/lib/server/durable-usage-report.functions',()=>({readOwnerUsageReportPartsServer:vi.fn()}))
vi.mock('@tanstack/react-router',()=>({useRouter:()=>({navigate:mocks.navigate}),Link:({children,to}:{children:ReactNode;to:string})=><a href={to}>{children}</a>}))
const close={draftRef:`monthly-usage-close:${'a'.repeat(64)}`,month:'2026-09',revision:1,state:'building',failureCode:null}
beforeEach(()=>{vi.clearAllMocks();mocks.policy.mockResolvedValue({automaticMonthly:false,revision:0,ownerConsentCurrent:false,schedulerActive:false})})
afterEach(cleanup)
describe('monthly usage preparation controls',()=>{
  it('prevents duplicate requests while pending and exposes saved status plus recoverable deep link',async()=>{
    let resolve:(value:unknown)=>void=()=>{}
    mocks.prepare.mockImplementation(()=>new Promise(r=>{resolve=r}))
    render(<ActivityCompleteMonth returnScope={{returnRange:'30d'}}/>)
    fireEvent.change(screen.getByLabelText('Statement UTC month'),{target:{value:'2026-09'}})
    const button=screen.getByRole('button',{name:'Prepare or read monthly close'})
    fireEvent.click(button);fireEvent.click(button)
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    resolve({kind:'available',close})
    await waitFor(()=>expect(screen.getByText(/close is saved and preparing/u)).toBeTruthy())
    expect(mocks.navigate).toHaveBeenCalledWith(expect.objectContaining({to:'/activity',search:expect.objectContaining({draftRef:close.draftRef}),replace:true}))
    expect(screen.getByRole('button',{name:'Refresh monthly close'})).toBeTruthy()
    expect(screen.queryByRole('button',{name:'Download complete monthly JSON'})).toBeNull()
  })
  it('recovers a failed close without offering downloads or a new financial effect',async()=>{
    mocks.read.mockResolvedValue({kind:'available',close:{...close,state:'failed',failureCode:'monthly_close_work_failed'}})
    render(<ActivityCompleteMonth returnScope={{returnRange:'30d'}} draftRef={close.draftRef}/>)
    await waitFor(()=>expect(screen.getByText(/monthly_close_work_failed/u)).toBeTruthy())
    fireEvent.click(screen.getByRole('button',{name:'Refresh monthly close'}))
    await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(2))
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(screen.queryByRole('button',{name:'Download monthly ledger CSV'})).toBeNull()
  })
  it('preserves explicit inactive scheduling and supports renewal of changed owner consent',async()=>{
    mocks.policy.mockResolvedValue({automaticMonthly:true,revision:2,ownerConsentCurrent:false,schedulerActive:false});mocks.configure.mockResolvedValue({kind:'updated',revision:3})
    render(<ActivityCompleteMonth returnScope={{returnRange:'30d'}}/>)
    await waitFor(()=>expect(screen.getByRole('button',{name:'Renew owner reporting consent'})).toBeTruthy())
    fireEvent.click(screen.getByRole('button',{name:'Renew owner reporting consent'}))
    await waitFor(()=>expect(mocks.configure).toHaveBeenCalledWith({data:expect.objectContaining({automaticMonthly:true,expectedRevision:2,idempotencyRef:expect.stringMatching(/^usage-reporting:/u)})}))
    expect(screen.getByText(/Automatic preparation is currently inactive/u)).toBeTruthy()
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('shows financial source setup refusal and retains the requested month for retry',async()=>{
    mocks.prepare.mockResolvedValue({kind:'setup_required',code:'monthly_draft_source_unconfigured'})
    render(<ActivityCompleteMonth returnScope={{returnRange:'30d'}}/>)
    fireEvent.change(screen.getByLabelText('Statement UTC month'),{target:{value:'2026-09'}})
    fireEvent.click(screen.getByRole('button',{name:'Prepare or read monthly close'}))
    await waitFor(()=>expect(screen.getByText(/financial source must be configured/u)).toBeTruthy())
    expect((screen.getByLabelText('Statement UTC month') as HTMLInputElement).value).toBe('2026-09')
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
