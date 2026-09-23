/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import type { WorkspaceDecommissionEligibilityView } from '@/modules/principal-account/workspace-decommission.view-model'
import { WorkspaceDangerZone } from '@/components/ae/settings/workspace-danger-zone/WorkspaceDangerZone'

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

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useReverification: (fetcher: unknown) => fetcher,
}))

vi.mock('@clerk/shared/authorization-errors', () => ({
  reverificationError: (level: string) => ({ clerk_error: { level } }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string
    children: unknown
    className?: string
  }) => (
    <a href={to} className={className}>
      {children as never}
    </a>
  ),
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

function openClosePanel() {
  fireEvent.click(screen.getByText('Close workspace', { selector: 'summary' }))
}

function openTransferPanel() {
  fireEvent.click(screen.getByText('Transfer ownership', { selector: 'summary' }))
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

    expect(screen.getByText('Close workspace', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.getByText('Transfer ownership', { selector: 'summary' })).toBeInTheDocument()
  })

  it('U1b: loading eligibility renders reserved skeleton shell', () => {
    useQuery.mockReturnValue(undefined)
    const { container } = render(<WorkspaceDangerZone />)

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
  })

  it('U2: if fences present, displays human reasons and disables close', () => {
    useQuery.mockReturnValue(fencedOwner)
    render(<WorkspaceDangerZone />)
    openClosePanel()

    expect(screen.getByText(/provider obligations are still unsettled/i)).toBeInTheDocument()
    expect(screen.getByText(/one or more calls are still open/i)).toBeInTheDocument()
    expect(screen.getByText(/close blocked/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close workspace' })).toBeDisabled()
  })

  it('U2b: clear fences show close-allowed reassurance', () => {
    render(<WorkspaceDangerZone />)
    openClosePanel()

    expect(screen.getByText(/close is allowed/i)).toBeInTheDocument()
  })

  it('U3: delete confirmation button disabled until exact matching workspace name typed', () => {
    render(<WorkspaceDangerZone />)
    openClosePanel()

    const input = screen.getByRole('textbox', { name: 'Type workspace name to confirm' })
    fireEvent.change(input, { target: { value: 'Acme' } })

    expect(screen.getByRole('button', { name: 'Close workspace' })).toBeDisabled()
  })

  it('U4: matching name enables destructive button', () => {
    render(<WorkspaceDangerZone />)
    openClosePanel()

    const input = screen.getByRole('textbox', { name: 'Type workspace name to confirm' })
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    expect(screen.getByRole('button', { name: 'Close workspace' })).toBeEnabled()
  })

  it('U5: clicking close workspace opens AeConfirmDialog', () => {
    render(<WorkspaceDangerZone />)
    openClosePanel()

    const input = screen.getByRole('textbox', { name: 'Type workspace name to confirm' })
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    fireEvent.click(screen.getByRole('button', { name: 'Close workspace' }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Close workspace?')).toBeInTheDocument()
    expect(
      screen.getByText(/Permanently close Acme Corp\. Tools, access keys, and delegations on this workspace stop\./i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Permanently close workspace' })).toBeInTheDocument()
  })

  it('U6: transfer candidate dropdown lists active members excluding incumbent owner', () => {
    useQuery.mockReturnValue(ownerWithMember)
    render(<WorkspaceDangerZone />)
    openTransferPanel()

    const select = screen.getByRole('combobox', { name: 'New workspace owner' })
    const options = Array.from(select.querySelectorAll('option')).map((node) => node.textContent)
    expect(options).toEqual(['Sarah Connor'])
    expect(options).not.toContain('Acme Corp')
  })

  it('U6b: transfer opens confirm dialog before mutation', () => {
    useQuery.mockReturnValue(ownerWithMember)
    render(<WorkspaceDangerZone />)
    openTransferPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText(/transfer ownership to Sarah Connor/i)).toBeInTheDocument()
    expect(screen.getByText(/balances and Calls stay on this workspace/i)).toBeInTheDocument()
  })

  it('U7: non-owner renders read-only explanation under both sections', () => {
    useQuery.mockReturnValue(memberView)
    render(<WorkspaceDangerZone />)

    expect(screen.getAllByText(/only the workspace owner/i)).toHaveLength(2)
    expect(screen.getByText('Close workspace', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.getByText('Transfer ownership', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close workspace' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Transfer ownership' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'New workspace owner' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Type workspace name to confirm' })).toBeNull()
  })
})
