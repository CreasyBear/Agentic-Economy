/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import type { WorkspaceDecommissionEligibilityView } from '@/components/ae/settings/WorkspaceDangerZone'
import { WorkspaceDangerZone } from '@/components/ae/settings/WorkspaceDangerZone'

const useQuery = vi.fn()
const closeWorkspace = vi.fn()
const transferWorkspaceOwnership = vi.fn()

vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: (ref: unknown) => {
    const refName = typeof ref === 'object' && ref !== null && 'name' in ref
      ? String((ref as { name: string }).name)
      : String(ref)
    if (refName.includes('closeWorkspace')) return closeWorkspace
    if (refName.includes('transferWorkspaceOwnership')) return transferWorkspaceOwnership
    return vi.fn()
  },
}))

const ownerEligible: WorkspaceDecommissionEligibilityView = {
  accountRef: `acc_${'2'.repeat(32)}`,
  displayName: 'Acme Corp',
  accountRevision: 4,
  ownershipRevision: 3,
  callerIsOwner: true,
  canClose: true,
  canTransfer: false,
  fences: [],
  transferCandidates: [],
}

const ownerWithMember: WorkspaceDecommissionEligibilityView = {
  ...ownerEligible,
  canTransfer: true,
  transferCandidates: [{
    principalRef: `prn_${'a'.repeat(32)}`,
    displayName: 'Sarah Connor',
    membershipRef: `mem_${'a'.repeat(32)}`,
  }],
}

const fencedOwner: WorkspaceDecommissionEligibilityView = {
  ...ownerEligible,
  canClose: false,
  fences: ['unsettled_provider_obligations', 'open_calls'],
}

const memberView: WorkspaceDecommissionEligibilityView = {
  ...ownerEligible,
  callerIsOwner: false,
  canClose: false,
  canTransfer: false,
  transferCandidates: [],
}

beforeEach(() => {
  useQuery.mockReturnValue(ownerEligible)
  closeWorkspace.mockReset()
  transferWorkspaceOwnership.mockReset()
})

afterEach(cleanup)

describe('WorkspaceDangerZone (W-14)', () => {
  it('U1: renders Close Workspace and Transfer Ownership sections', () => {
    render(<WorkspaceDangerZone />)

    expect(screen.getByRole('heading', { name: 'Close workspace' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Transfer ownership' })).toBeInTheDocument()
  })

  it('U2: if fences present, displays human reasons and disables close', () => {
    useQuery.mockReturnValue(fencedOwner)
    render(<WorkspaceDangerZone />)

    expect(screen.getByText(/unsettled provider obligations/i)).toBeInTheDocument()
    expect(screen.getByText(/open calls/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close workspace' })).toBeDisabled()
  })

  it('U3: delete confirmation button disabled until exact matching workspace name typed', () => {
    render(<WorkspaceDangerZone />)

    const input = screen.getByRole('textbox', { name: 'Type workspace name to confirm' })
    fireEvent.change(input, { target: { value: 'Acme' } })

    expect(screen.getByRole('button', { name: 'Close workspace' })).toBeDisabled()
  })

  it('U4: matching name enables destructive button', () => {
    render(<WorkspaceDangerZone />)

    const input = screen.getByRole('textbox', { name: 'Type workspace name to confirm' })
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    expect(screen.getByRole('button', { name: 'Close workspace' })).toBeEnabled()
  })

  it('U5: clicking close workspace opens AeConfirmDialog', () => {
    render(<WorkspaceDangerZone />)

    const input = screen.getByRole('textbox', { name: 'Type workspace name to confirm' })
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    const closeBtn = screen.getByRole('button', { name: 'Close workspace' })
    fireEvent.click(closeBtn)

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Close Workspace?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Permanently Close Workspace' })).toBeInTheDocument()
  })

  it('U6: transfer candidate dropdown lists active members excluding incumbent owner', () => {
    useQuery.mockReturnValue(ownerWithMember)
    render(<WorkspaceDangerZone />)

    const select = screen.getByRole('combobox', { name: 'New workspace owner' })
    const options = Array.from(select.querySelectorAll('option')).map((node) => node.textContent)
    expect(options).toEqual(['Sarah Connor'])
    expect(options).not.toContain('Acme Corp')
  })

  it('U7: non-owner renders read-only explanation without destructive controls', () => {
    useQuery.mockReturnValue(memberView)
    render(<WorkspaceDangerZone />)

    expect(screen.getByText(/only the workspace owner/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close workspace' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Transfer ownership' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'New workspace owner' })).toBeNull()
  })
})
