/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const source = vi.hoisted(() => ({ access: undefined as unknown }))
vi.mock('convex/react', () => ({ useQuery: () => source.access }))
vi.mock('@/components/ae/admin/actions/AdminActionSheet', () => ({
  AdminActionSheet: ({ onOpenChange, ...props }: { onOpenChange: (open: boolean) => void }) => (
    <section aria-label="Command review">
      <output data-testid="command-review">{JSON.stringify(props)}</output>
      <button type="button" onClick={() => onOpenChange(false)}>Close review</button>
    </section>
  ),
}))

import { AdminMembershipActions } from '@/components/ae/admin/audit/AdminMembershipActions'
import { PendingApprovalsActions } from '@/components/ae/admin/audit/PendingApprovalsActions'
import type { AdminApprovalProposal, PendingApprovalsActionsProps } from '@/components/ae/admin/audit/audit.contracts'

const material = {
  input: { targetClerkUserId: 'user:target', targetTokenIdentifier: 'issuer|target', role: 'support' },
  reasonCode: 'role_change',
  evidenceRefs: ['evidence:exact'],
  expectedStateDigest: 'digest:current',
}
const proposal: AdminApprovalProposal = {
  proposalRef: 'proposal:exact', action: 'grant_admin_membership', proposerRef: 'principal:other',
  createdAt: 1_799_999_000_000, expiresAt: 1_800_000_001_000, commandJson: JSON.stringify(material),
}
const approvalProps = (): PendingApprovalsActionsProps => ({
  proposals: [proposal], now: 1_800_000_000_000, role: 'owner_admin', actorRef: 'principal:reviewer',
  paginationStatus: 'Exhausted', onLoadMore: vi.fn(),
})
const review = () => JSON.parse(screen.getByTestId('command-review').textContent ?? '')
beforeEach(() => { source.access = { kind: 'allowed', role: 'owner_admin' } })
afterEach(cleanup)

describe('Arc Admin access decisions', () => {
  it.each([undefined, { kind: 'refused' }, { kind: 'allowed', role: 'support' }, { kind: 'allowed', role: 'reviewer' }])(
    'retains the membership permission gate for %j', (access) => {
      source.access = access
      render(<AdminMembershipActions />)
      expect(screen.queryByLabelText('Clerk user ID')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Grant Admin membership' })).toBeNull()
    },
  )

  it('keeps raw native fields, trims review inputs and omits an empty revoke token', () => {
    render(<AdminMembershipActions />)
    const user = screen.getByLabelText<HTMLInputElement>('Clerk user ID')
    const token = screen.getByLabelText<HTMLInputElement>('Token identifier')
    const grant = screen.getByRole('button', { name: 'Grant Admin membership' })
    const revoke = screen.getByRole('button', { name: 'Revoke Admin membership' })
    expect(grant.hasAttribute('disabled')).toBe(true)
    expect(revoke.hasAttribute('disabled')).toBe(true)
    fireEvent.change(user, { target: { value: '  user:target  ' } })
    expect(user.value).toBe('  user:target  ')
    expect(user.getAttribute('autocomplete')).toBe('off')
    expect(grant.hasAttribute('disabled')).toBe(true)
    fireEvent.submit(user.closest('form')!)
    expect(screen.queryByLabelText('Command review')).toBeNull()
    fireEvent.change(token, { target: { value: '  issuer|target  ' } })
    fireEvent.change(screen.getByLabelText('Admin role'), { target: { value: 'reviewer' } })
    fireEvent.submit(user.closest('form')!)
    expect(review()).toMatchObject({ action: 'grant_admin_membership', input: {
      targetClerkUserId: 'user:target', targetTokenIdentifier: 'issuer|target', role: 'reviewer',
    }, targetRefs: [{ label: 'Clerk user ID', value: 'user:target' }, { label: 'Token identifier', value: 'issuer|target' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Close review' }))
    fireEvent.change(token, { target: { value: '  ' } })
    fireEvent.click(revoke)
    expect(review().input).toEqual({ targetClerkUserId: 'user:target' })
    expect(review().targetRefs).toEqual([{ label: 'Clerk user ID', value: 'user:target' }])
  })

  it('reviews only another actor’s unexpired valid proposal with the original material', () => {
    const props = approvalProps()
    const { rerender } = render(<PendingApprovalsActions {...props} proposals={[
      { ...proposal, proposalRef: 'proposal:own', proposerRef: props.actorRef },
      { ...proposal, proposalRef: 'proposal:expired', expiresAt: props.now },
      { ...proposal, proposalRef: 'proposal:missing', commandJson: null },
      { ...proposal, proposalRef: 'proposal:malformed', commandJson: '{invalid' },
      proposal,
    ]} />)
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1)
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(screen.getByText('proposal:exact')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(review()).toMatchObject({ action: proposal.action, input: material.input,
      approval: { kind: 'approve', proposalRef: proposal.proposalRef },
      initialEvidenceRefs: material.evidenceRefs, currentStateDigest: material.expectedStateDigest,
      initialReasonCode: material.reasonCode,
    })
    rerender(<PendingApprovalsActions {...props} now={proposal.expiresAt} />)
    expect(screen.getByLabelText('Command review')).toBeTruthy()
    expect(review()).toMatchObject({ approval: { kind: 'approve', proposalRef: proposal.proposalRef } })
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('keeps support access read-only and the real pagination busy guard', () => {
    const props = approvalProps()
    const { rerender } = render(<PendingApprovalsActions {...props} role="support" paginationStatus="LoadingMore" />)
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    const more = screen.getByRole('button', { name: 'Load more' })
    expect(more.hasAttribute('disabled')).toBe(true)
    fireEvent.click(more)
    expect(props.onLoadMore).not.toHaveBeenCalled()
    rerender(<PendingApprovalsActions {...props} role="support" paginationStatus="CanLoadMore" />)
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(props.onLoadMore).toHaveBeenCalledOnce()
  })
})
