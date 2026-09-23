// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceClosePanel } from './WorkspaceClosePanel'

const baseProps = {
  callerIsOwner: true,
  fencesPresent: false,
  fenceMessages: [] as readonly string[],
  displayName: 'Acme Corp',
  confirmationName: '',
  closeDisabled: true,
  closeDiagnostic: null,
  showCloseConfirmDialog: false,
  closePending: false,
  onConfirmationNameChange: vi.fn(),
  onRequestClose: vi.fn(),
  onCloseDialogOpenChange: vi.fn(),
  onConfirmClose: vi.fn(),
}

function openClosePanel() {
  fireEvent.click(screen.getByText('Close workspace', { selector: 'summary' }))
}

afterEach(cleanup)

describe('WorkspaceClosePanel', () => {
  it('calls onRequestClose from primary button, not onConfirmClose', () => {
    const onRequestClose = vi.fn()
    const onConfirmClose = vi.fn()
    render(
      <WorkspaceClosePanel
        {...baseProps}
        confirmationName="Acme Corp"
        closeDisabled={false}
        onRequestClose={onRequestClose}
        onConfirmClose={onConfirmClose}
      />,
    )
    openClosePanel()
    fireEvent.click(screen.getByRole('button', { name: 'Close workspace' }))
    expect(onRequestClose).toHaveBeenCalled()
    expect(onConfirmClose).not.toHaveBeenCalled()
  })

  it('shows owner-only copy when caller is not owner', () => {
    render(<WorkspaceClosePanel {...baseProps} callerIsOwner={false} />)
    expect(screen.getByText(/only the workspace owner/i)).toBeInTheDocument()
    expect(screen.getByText('Close workspace', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close workspace' })).toBeNull()
  })
})
