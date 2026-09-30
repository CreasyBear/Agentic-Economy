/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminTreasuryResult } from '@/modules/money/treasury-report'
import { treasuryTestView } from '../treasury/treasury-test-fixture'
import type { PendingApprovalsActionsProps } from './audit.contracts'

const external = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: external.query }))
vi.mock('../actions/useAdminCommandProof', () => ({ useAdminCommandProof: () => external.execute }))
import { PendingApprovalsActions } from './PendingApprovalsActions'

let treasury: AdminTreasuryResult | undefined
const props: PendingApprovalsActionsProps = {
  proposals: [{ proposalRef: 'proposal:resume', action: 'set_payments_paused', proposerRef: 'owner:one',
    createdAt: 1, expiresAt: 100_000, commandJson: JSON.stringify({ input: { environment: 'sandbox', paused: false },
      reasonCode: 'operational_resume', evidenceRefs: ['treasury:review'], expectedStateDigest: 'launch:1' }) }],
  now: 10, role: 'owner_admin', actorRef: 'owner:two', paginationStatus: 'Exhausted', onLoadMore: () => {},
}
beforeEach(() => {
  treasury = treasuryTestView()
  treasury.controls.paymentsOpenTo = 'none'
  external.query.mockImplementation(reference => {
    const name = getFunctionName(reference)
    if (name === 'adminConsoleTreasury:read') return treasury
    if (name === 'adminConsoleAudit:readAdminAuditAccess') return { kind: 'allowed', role: 'owner_admin', actorRef: 'owner:two' }
    if (name === 'adminConsoleOverview:readAdminOverview') return { clerkFva: 'present' }
    throw new Error(`unexpected_query:${name}`)
  })
  external.execute.mockResolvedValue({ kind: 'refused', action: 'set_payments_paused', code: 'target_changed', correlationId: 'review:resume' })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('second-owner payment audience review', () => {
  it.each(['admins', 'everyone'] as const)('shows the exact %s audience and submits the original proposal', async audience => {
    if (treasury?.kind !== 'ready') throw new Error('fixture_not_ready')
    treasury.controls.resumePaymentsOpenTo = audience
    render(<PendingApprovalsActions {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByText(audience === 'admins' ? 'Open to admins' : 'Open to everyone')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    await waitFor(() => expect(external.execute).toHaveBeenCalledOnce())
    expect(external.execute.mock.calls[0]![0]).toMatchObject({
      action: 'set_payments_paused', input: { environment: 'sandbox', paused: false },
      approval: { kind: 'approve', proposalRef: 'proposal:resume' }, expectedStateDigest: 'launch:1',
    })
  })
  it('removes approval when the protected audience changes during review', () => {
    const result = render(<PendingApprovalsActions {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByRole('button', { name: 'Submit command' })).toBeTruthy()
    if (treasury?.kind !== 'ready') throw new Error('fixture_not_ready')
    treasury = { ...treasury, controls: { ...treasury.controls, launchStateDigest: 'launch:2', resumePaymentsOpenTo: 'everyone' } }
    result.rerender(<PendingApprovalsActions {...props} />)
    expect(screen.queryByRole('button', { name: 'Submit command' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Review Treasury before proposing resume again.' }).getAttribute('href')).toBe('/admin/treasury')
    expect(external.execute).not.toHaveBeenCalled()
  })
  it.each(['loading', 'refused', 'environment'] as const)('does not offer approval with %s evidence', state => {
    treasury = state === 'loading' ? undefined : state === 'refused' ? { kind: 'refused', code: 'permission_denied' }
      : { ...treasuryTestView(), environment: 'production' }
    render(<PendingApprovalsActions {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.queryByRole('button', { name: 'Submit command' })).toBeNull()
    expect(state === 'loading' ? screen.getByText('Loading the payment audience for review…') : screen.getByRole('alert')).toBeTruthy()
    expect(external.execute).not.toHaveBeenCalled()
  })
})
