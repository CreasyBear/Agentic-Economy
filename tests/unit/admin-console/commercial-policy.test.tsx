/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { COMMERCIAL_POLICY_FAMILIES, PACKAGE4_FORMANCE_REQUIREMENTS, type CommercialPolicyFamily } from '@/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'
import { buildPolicyInput, emptyPolicyFields, fieldsFromCurrent, policyDecimal, type PolicyFields, type PolicyPreparation } from '@/components/ae/admin/treasury/commercial-policy-form'

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: mocks.query }))
vi.mock('@/components/ae/admin/actions/useAdminCommandProof', () => ({ useAdminCommandProof: () => mocks.execute }))
vi.mock('@/components/ae/layout/AeRecordSheet', () => ({ AeRecordSheet: ({ open, children, action }: { open: boolean; children: ReactNode; action: ReactNode }) => open ? <div>{children}{action}</div> : null }))
import { CommercialPolicyActions } from '@/components/ae/admin/treasury/CommercialPolicyActions'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
import { PendingApprovalsActions } from '@/components/ae/admin/audit/PendingApprovalsActions'

function prepare(family: CommercialPolicyFamily): PolicyPreparation { return { kind: 'ready', family, environment: 'production', conflict: false, requiresSecondApproval: false, current: null, requirements: PACKAGE4_FORMANCE_REQUIREMENTS } }
const fields: PolicyFields = {
  ...emptyPolicyFields(), effectiveAt: '2026-10-02T10:00', expiresAt: '2027-10-02T10:00', serviceFeeTax: '10.25', callTax: '0', invoiceIssuance: 'disabled_pending_approval',
  minimumFunding: '5.01', maximumFunding: '25000', fundingIncrement: '0.01', customerMaximum: '4999.999999', retentionDays: '2557', minimumBuffer: '10.000001', rpoMinutes: '5', rtoMinutes: '60', serviceFee: '5.25', pricingMargin: '0.15', commitmentSeconds: '300', reportsPerDay: '0',
  perimeterConfirmed: true, legalHoldConfirmed: true, custodyConfirmed: true, backupConfirmed: true, restoreConfirmed: true, dailyCloseConfirmed: true,
}
let view: PolicyPreparation | { kind: 'refused'; code: string }
beforeEach(() => {
  view = prepare('commercial_perimeter')
  mocks.query.mockImplementation(reference => {
    const name = getFunctionName(reference)
    if (name === 'moneyCommercialPolicy:prepareChange') return view
    if (name === 'moneyCommercialPolicy:readSummary') return undefined
    return { kind: 'allowed', role: 'owner_admin' }
  })
  mocks.execute.mockResolvedValue({ kind: 'completed', action: 'change_commercial_policy', code: 'commercial_policy_changed', effectRefs: [], auditEventRef: 'audit:1', correlationId: 'correlation:1' })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
function inputValue(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }

describe('commercial policy input and review', () => {
  it.each(COMMERCIAL_POLICY_FAMILIES)('builds explicit %s terms and shows identical complete terms to both owners', async family => {
    const built = buildPolicyInput(prepare(family), fields, `policy:${family}`)
    expect(built.kind).toBe('ready')
    if (built.kind !== 'ready') throw new Error(built.message)
    render(<AdminActionSheet action="change_commercial_policy" input={built.input} targetRefs={[]} initialReasonCode="correction" initialEvidenceRefs={['evidence:actual']} open onOpenChange={() => {}} />)
    for (let step = 0; step < 3; step++) fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const firstReview = screen.getByRole('region', { name: 'Commercial policy terms' }).textContent
    expect(firstReview).toContain('production')
    expect(firstReview).toContain('Perth time')
    const expectCompleteApprovalTerms = () => {
      expect(screen.getByRole('region', { name: 'Policy change details' })).toBeTruthy()
      expect(screen.getByRole('region', { name: 'Business policy terms' })).toBeTruthy()
      if (family === 'operations' || family === 'treasury_custody') expect(screen.getByRole('region', { name: 'Technical requirements' })).toBeTruthy()
      if (family === 'accounting_client_money') expect(screen.getByRole('region', { name: 'Business policy terms' }).textContent).toContain('AUD 4999.999999')
      if (family === 'operations') expect(screen.getByRole('region', { name: 'Technical requirements' }).textContent).toContain(PACKAGE4_FORMANCE_REQUIREMENTS.sdkArtifactDigest)
      if (family === 'treasury_custody') {
        expect(screen.getByRole('region', { name: 'Business policy terms' }).textContent).toContain('USDC 10.000001')
        const technicalTerms = screen.getByRole('region', { name: 'Technical requirements' }).textContent
        expect(technicalTerms).toContain(PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits)
        expect(technicalTerms).toContain(PACKAGE4_FORMANCE_REQUIREMENTS.architectureReviewCumulativeUnits)
      }
    }
    expectCompleteApprovalTerms()
    if (family === 'accounting_client_money') { expect(firstReview).toContain('AUD 4999.999999'); expect(built.input.control).toMatchObject({ minimumFundingPrincipalUnits: '5010000', legalCustomerMaximumAccessibleUnits: '4999999999' }) }
    if (family === 'tax') expect(built.input.control).toMatchObject({ serviceFeeTaxBps: 1025 })
    if (family === 'operations') { expect(firstReview).toContain('5.25%'); expect(firstReview).toContain(PACKAGE4_FORMANCE_REQUIREMENTS.sdkArtifactDigest) }
    if (family === 'treasury_custody') { expect(firstReview).toContain('USDC 10.000001'); expect(firstReview).toContain(PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits) }
    cleanup()
    const props = { now: 10, role: 'owner_admin' as const, actorRef: 'owner:two', paginationStatus: 'Exhausted' as const, onLoadMore: () => {}, proposals: [{ proposalRef: 'proposal:policy', action: 'change_commercial_policy' as const, proposerRef: 'owner:one', createdAt: 1, expiresAt: 100, commandJson: JSON.stringify({ input: built.input, reasonCode: 'correction', evidenceRefs: ['evidence:actual'] }) }] }
    const second = render(<PendingApprovalsActions {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByRole('region', { name: 'Commercial policy terms' }).textContent).toBe(firstReview)
    expectCompleteApprovalTerms()
    second.rerender(<PendingApprovalsActions {...props} proposals={[]} now={101} />)
    expect(screen.getByRole('region', { name: 'Commercial policy terms' }).textContent).toBe(firstReview)
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce())
    expect(mocks.execute.mock.calls[0]?.[0]).toMatchObject({ input: built.input, approval: { kind: 'approve', proposalRef: 'proposal:policy' }, evidenceRefs: ['evidence:actual'] })
  })

  it('refuses missing attestations, invalid validity and lossy amounts', () => {
    for (const family of COMMERCIAL_POLICY_FAMILIES) expect(buildPolicyInput(prepare(family), emptyPolicyFields(), 'policy:new').kind).toBe('invalid')
    for (const [family, override] of [
      ['privacy_retention', { legalHoldConfirmed: false }], ['operations', { restoreConfirmed: false }], ['operations', { dailyCloseConfirmed: false }], ['operations', { backupConfirmed: false }], ['treasury_custody', { custodyConfirmed: false }], ['commercial_perimeter', { perimeterConfirmed: false }], ['tax', { serviceFeeTax: '1.001' }], ['accounting_client_money', { minimumFunding: '5.0000001' }], ['accounting_client_money', { minimumFunding: '5.001' }], ['operations', { commitmentSeconds: '901' }], ['treasury_custody', { rpoMinutes: '6' }],
    ] as const) expect(buildPolicyInput(prepare(family), { ...fields, ...override }, 'policy:new').kind).toBe('invalid')
    expect(buildPolicyInput(prepare('tax'), { ...fields, expiresAt: fields.effectiveAt }, 'policy:new').kind).toBe('invalid')
    expect(policyDecimal('1000000000000000000000000')).toBe('1000000000000000000')
    expect(buildPolicyInput(prepare('accounting_client_money'), { ...fields, maximumFunding: '123456789012345.123456' }, 'policy:large')).toMatchObject({ kind: 'ready', input: { control: { maximumFundingPrincipalUnits: '123456789012345123456' } } })
  })

  it('uses fresh activation semantics after suspension and never copies attestations', () => {
    const preparation: PolicyPreparation = { ...prepare('operations'), current: { policyRef: 'policy:old', lifecycle: 'suspended', revision: 8, effectiveAt: 1, expiresAt: 2, control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS.operations, evidenceRef: 'evidence:old', approvedByPrincipalRef: 'owner:one', stateDigest: 'digest:old' } }
    if (preparation.current === null) throw new Error('fixture_current_missing')
    const copied = fieldsFromCurrent(preparation.current)
    expect(copied.backupConfirmed || copied.restoreConfirmed || copied.dailyCloseConfirmed || copied.legalHoldConfirmed).toBe(false)
    const result = buildPolicyInput(preparation, fields, 'policy:new')
    expect(result).toMatchObject({ kind: 'ready', input: { changeKind: 'activate', revision: 1, policyRef: 'policy:new' } })
    if (result.kind === 'ready') expect(result.input).not.toHaveProperty('expectedCurrentPolicyRef')
    expect(buildPolicyInput({ ...preparation, current: { ...preparation.current, lifecycle: 'active' } }, fields, 'policy:new')).toMatchObject({ kind: 'ready', input: { changeKind: 'replace', revision: 9, expectedCurrentPolicyRef: 'policy:old' } })
  })

  it('does not reset edited or reviewed terms when the protected query changes', async () => {
    view = prepare('tax')
    const rendered = render(<CommercialPolicyActions environment="production" />)
    fireEvent.change(screen.getByLabelText('Policy family'), { target: { value: 'tax' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare new policy' }))
    expect(screen.getByLabelText<HTMLInputElement>('Tax on credit funding (%)').value).toBe('10')
    inputValue('Tax on credit funding (%)', '10.25')
    inputValue('Tax invoice issuance', 'enabled')
    inputValue('Effective date and time', fields.effectiveAt)
    inputValue('Expiry date and time', fields.expiresAt)
    view = { ...prepare('tax'), current: { policyRef: 'policy:newer', lifecycle: 'active', revision: 2, effectiveAt: 1, expiresAt: 2, control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS.tax, evidenceRef: 'evidence:new', approvedByPrincipalRef: 'owner:two', stateDigest: 'digest:new' } }
    rendered.rerender(<CommercialPolicyActions environment="production" />)
    expect(screen.getByLabelText<HTMLInputElement>('Tax on credit funding (%)').value).toBe('10.25')
    fireEvent.click(screen.getByRole('button', { name: 'Review policy' }))
    expect(screen.getByRole('region', { name: 'Commercial policy terms' }).textContent).toContain('10.25%')
    expect(screen.getByRole('region', { name: 'Commercial policy terms' }).textContent).toContain('Activate a new policy')
    fireEvent.click(screen.getByRole('combobox', { name: 'Reason' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Pricing update' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    inputValue('Other evidence reference', 'approval:actual-tax')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    view = { kind: 'refused', code: 'permission_denied' }
    rendered.rerender(<CommercialPolicyActions environment="production" />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce())
    expect(mocks.execute.mock.calls[0]?.[0].input).toMatchObject({ changeKind: 'activate', revision: 1, control: { serviceFeeTaxBps: 1025 } })
    expect(mocks.execute.mock.calls[0]?.[0]).not.toHaveProperty('expectedStateDigest')
  })
})
