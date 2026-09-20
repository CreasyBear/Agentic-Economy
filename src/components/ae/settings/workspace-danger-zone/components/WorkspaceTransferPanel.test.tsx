// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceTransferPanel } from './WorkspaceTransferPanel'

const candidate = {
  principalRef: `prn_${'a'.repeat(32)}`,
  displayName: 'Sarah Connor',
  membershipRef: `mem_${'a'.repeat(32)}`,
}

const baseProps = {
  callerIsOwner: true,
  transferCandidates: [candidate],
  selectedSuccessor: candidate.principalRef,
  successorName: 'Sarah Connor',
  transferDisabled: false,
  transferDiagnostic: null,
  showTransferConfirmDialog: false,
  transferPending: false,
  onSuccessorChange: vi.fn(),
  onRequestTransfer: vi.fn(),
  onTransferDialogOpenChange: vi.fn(),
  onConfirmTransfer: vi.fn(),
}

afterEach(cleanup)

describe('WorkspaceTransferPanel', () => {
  it('uses native select combobox for successor', () => {
    render(<WorkspaceTransferPanel {...baseProps} />)
    expect(screen.getByRole('combobox', { name: 'New workspace owner' })).toBeInTheDocument()
  })

  it('calls onRequestTransfer from primary button, not onConfirmTransfer', () => {
    const onRequestTransfer = vi.fn()
    const onConfirmTransfer = vi.fn()
    render(
      <WorkspaceTransferPanel
        {...baseProps}
        onRequestTransfer={onRequestTransfer}
        onConfirmTransfer={onConfirmTransfer}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))
    expect(onRequestTransfer).toHaveBeenCalled()
    expect(onConfirmTransfer).not.toHaveBeenCalled()
  })
})
