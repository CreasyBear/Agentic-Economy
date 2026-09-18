/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeKeyRevealDialog } from '@/components/ae/console/AeKeyRevealDialog'
import type { IssuedAgentAccessReveal } from '@/components/ae/console/AeConnectAgentWizardDialog'
import {
  AGENT_ACCESS_SNIPPET_COPY_HINTS,
  AGENT_ACCESS_SNIPPET_DESTINATIONS,
} from '@/modules/agent-access/config-snippets'

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: mockToast,
}))

const MASKED_SECRET_DISPLAY = '••••••••••••••••'

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

  it('T2: renders title, display name, environment, guardrail copy, and masked secret by default', () => {
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    expect(screen.getByRole('dialog', { name: /save your secret key/i })).toBeInTheDocument()
    expect(screen.getByText(/step 2 of 2 · save & install/i)).toBeInTheDocument()
    expect(screen.getByText('Research Bot')).toBeInTheDocument()
    expect(screen.getByText('Sandbox')).toBeInTheDocument()
    expect(
      screen.getByText('This secret will never be shown again. Store it securely.'),
    ).toBeInTheDocument()

    expect(screen.getByText(MASKED_SECRET_DISPLAY)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(baseReveal.secret)
  })

  it('T3: copy button copies secret to clipboard while masked and triggers success toast', async () => {
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

    expect(document.body.textContent).not.toContain(baseReveal.secret)

    const copyBtn = screen.getByRole('button', { name: /copy secret key/i })
    fireEvent.click(copyBtn)

    expect(writeTextMock).toHaveBeenCalledWith(baseReveal.secret)
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        'Copied to clipboard — save this secret; it will not be shown again.',
      )
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

  it('T6: renders quickstart snippet tabs without plaintext secret while masked', async () => {
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    expect(document.body.textContent).not.toContain(baseReveal.secret)

    expect(screen.getByRole('tab', { name: /cursor/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /claude code/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /python/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /curl/i })).toBeInTheDocument()

    expect(screen.getByText(new RegExp('mcpServers'))).toBeInTheDocument()
    expect(screen.getByText(AGENT_ACCESS_SNIPPET_DESTINATIONS.cursor)).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: /claude code/i }))
    await waitFor(() => {
      expect(screen.getByText(AGENT_ACCESS_SNIPPET_DESTINATIONS.claude)).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByRole('tab', { name: /^python$/i }))
    await waitFor(() => {
      expect(screen.getByText(AGENT_ACCESS_SNIPPET_DESTINATIONS.python)).toBeInTheDocument()
    })
    expect(screen.queryByText(AGENT_ACCESS_SNIPPET_COPY_HINTS.python)).not.toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: /curl/i }))
    await waitFor(() => {
      expect(screen.getByText(AGENT_ACCESS_SNIPPET_DESTINATIONS.curl)).toBeInTheDocument()
    })
  })

  it('T6b: production reveal shows Production environment badge', () => {
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={{ ...baseReveal, environment: 'production' }}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    expect(screen.getByText('Production')).toBeInTheDocument()
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

  it('T9: Show secret reveals plaintext in the well and toggles aria-label to Hide secret', () => {
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={vi.fn()}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    const showBtn = screen.getByRole('button', { name: /show secret/i })
    fireEvent.click(showBtn)

    expect(screen.getByText(baseReveal.secret)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide secret/i })).toBeInTheDocument()
  })

  it('T10: close attempt while unchecked does not call onOpenChange(false) and shows blocked cue', () => {
    const onOpenChange = vi.fn()
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={onOpenChange}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)

    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(
      screen.getByText('Confirm you have saved the secret before closing.'),
    ).toBeInTheDocument()
  })

  it('T11: Escape while unchecked does not close and shows blocked dismiss cue', () => {
    const onOpenChange = vi.fn()
    render(
      <AeKeyRevealDialog
        open={true}
        reveal={baseReveal}
        onOpenChange={onOpenChange}
        canonicalBaseUrl={canonicalBaseUrl}
      />,
    )

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(
      screen.getByText('Confirm you have saved the secret before closing.'),
    ).toBeInTheDocument()
  })

  it('T12: checking the box enables Done and allows closing via close button', () => {
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
    expect(doneBtn).toBeEnabled()

    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
