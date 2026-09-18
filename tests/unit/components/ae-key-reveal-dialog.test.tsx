/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeKeyRevealDialog } from '@/components/ae/console/AeKeyRevealDialog'
import type { IssuedAgentAccessReveal } from '@/components/ae/console/AeConnectAgentWizardDialog'

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: mockToast,
}))

const baseReveal: IssuedAgentAccessReveal = {
  keyId: 'key_reveal_test_1',
  secret: 'sek_test_super_secret_reveal_value',
  displayName: 'Research Bot',
  environment: 'sandbox',
}

const canonicalBaseUrl = 'https://market.example.com'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AeKeyRevealDialog (W-27)', () => {
  it('T1: does not render dialog when open is false or reveal is undefined', () => {
    const { rerender } = render(
      <AeKeyRevealDialog
        open={false}
        reveal={baseReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(baseReveal.secret)

    rerender(
      <AeKeyRevealDialog
        open={true}
        reveal={undefined}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(baseReveal.secret)
  })

  it('T2: renders title, display name, environment, exact warning text, and plaintext secret', () => {
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    expect(screen.getByRole('dialog', { name: /save your secret key/i })).toBeInTheDocument()
    expect(screen.getByText(/Research Bot · sandbox/i)).toBeInTheDocument()
    expect(screen.getByText('Save this secret key securely. You will not be able to view it again.')).toBeInTheDocument()

    const secretElement = screen.getByText(baseReveal.secret)
    expect(secretElement.tagName.toLowerCase()).toBe('code')
  })

  it('T3: copy button copies secret to clipboard and triggers success toast', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    const copyBtn = screen.getByRole('button', { name: /copy secret key/i })
    fireEvent.click(copyBtn)

    expect(writeTextMock).toHaveBeenCalledWith(baseReveal.secret)
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Secret key copied')
    })
  })

  it('T4: Done button is disabled until acknowledgement checkbox is checked', () => {
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    const doneBtn = screen.getByRole('button', { name: /done/i })
    expect(doneBtn).toBeDisabled()

    const checkbox = screen.getByRole('checkbox', { name: /i have saved my secret key securely/i })
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)
    expect(doneBtn).toBeEnabled()
  })

  it('T5: Done button calls onOpenChange(false) only after acknowledgement', () => {
    const onOpenChange = vi.fn()
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={onOpenChange}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: /i have saved my secret key securely/i })
    fireEvent.click(checkbox)

    const doneBtn = screen.getByRole('button', { name: /done/i })
    fireEvent.click(doneBtn)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('T6: renders quickstart snippet tabs for Cursor, Claude Code, Python, and cURL', () => {
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    // Check tab triggers exist
    expect(screen.getByRole('tab', { name: /cursor/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /claude code/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /python/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /curl/i })).toBeInTheDocument()

    // Default tab is Cursor -> contains mcpServers
    expect(screen.getByText(new RegExp('mcpServers'))).toBeInTheDocument()
  })

  it('T7: does not use localStorage or sessionStorage in component source', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sourceCode = fs.readFileSync(
      path.resolve(__dirname, '../../../src/components/ae/console/AeKeyRevealDialog.tsx'),
      'utf8',
    )
    expect(sourceCode).not.toContain('localStorage')
    expect(sourceCode).not.toContain('sessionStorage')
  })

  it('T8: changing reveal keyId resets acknowledgement checkbox to unchecked', () => {
    const { rerender } = render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: /i have saved my secret key securely/i })
    fireEvent.click(checkbox)
    expect(screen.getByRole('button', { name: /done/i })).toBeEnabled()

    // Rerender with new reveal
    const nextReveal: IssuedAgentAccessReveal = {
      ...baseReveal,
      keyId: 'key_reveal_test_2',
      secret: 'sek_test_another_secret',
    }

    rerender(
      <AeKeyRevealDialog
        open={true}
        reveal={nextReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /i have saved my secret key securely/i })).not.toBeChecked()
  })
})
