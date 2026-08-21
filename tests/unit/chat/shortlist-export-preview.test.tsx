/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-dialog'

import { AeExportPreview } from '@/components/ae/chat/AeExportPreview'
import { AeShortlistTerminal } from '@/components/ae/chat/AeShortlistTerminal'
import type { AnswerSource } from '@/modules/answer/public'

const PROOF_BOUNDARY =
  'This artifact proves what was sent, when, to whom, and their reply. It does not prove acceptance, availability, booking, or confirmation.'

describe('shortlist export interaction', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens a sanitized preview before Copy and writes only the exact preview text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    render(
      <AeShortlistTerminal
        threadId="thread-preview"
        revision="turn-3:revision-1"
        providers={[provider()]}
        timing="flexible"
      />,
    )

    fireEvent.click(within(screen.getByLabelText('Shortlist actions')).getByRole('button', { name: 'Copy' }))

    expect(writeText).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Export preview' })
    expect(within(dialog).getByText('Sanitized share')).toBeTruthy()
    expect(dialog.textContent).toContain('Not sent')
    expect(dialog.textContent).toContain('No business reply')
    expect(dialog.textContent).toContain(PROOF_BOUNDARY)

    const visiblePayload = within(dialog).getByLabelText('Export preview text').textContent
    expect(visiblePayload).not.toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy summary' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText).toHaveBeenCalledWith(visiblePayload)
  })

  it('invalidates an open preview after a semantic revision and copies only after refresh', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <AeExportPreview
        isOpen
        onOpenChange={onOpenChange}
        threadId="thread-preview"
        revision="turn-3:revision-1"
        providers={[provider()]}
        origin="https://agentic.example"
      />,
    )

    const initialDialog = screen.getByRole('dialog', { name: 'Export preview' })
    expect(within(initialDialog).getByLabelText('Export preview text').textContent).toContain('Demo inquiry provider')

    rerender(
      <AeExportPreview
        isOpen
        onOpenChange={onOpenChange}
        threadId="thread-preview"
        revision="turn-4:revision-1"
        providers={[provider({ name: 'Replacement Plumbing', slug: 'replacement-plumbing', detailUrl: '/replacement-plumbing' })]}
        origin="https://agentic.example"
      />,
    )

    const staleDialog = screen.getByRole('dialog', { name: 'Export preview' })
    const copySummary = within(staleDialog).getByRole('button', { name: 'Copy summary' })
    expect(copySummary.hasAttribute('disabled')).toBe(true)
    fireEvent.click(copySummary)
    expect(writeText).not.toHaveBeenCalled()
    expect(within(staleDialog).getByLabelText('Export preview text').textContent).toContain('Demo inquiry provider')
    expect(within(staleDialog).getByLabelText('Export preview text').textContent).not.toContain('Replacement Plumbing')

    fireEvent.click(within(staleDialog).getByRole('button', { name: /refresh/i }))

    await waitFor(() => {
      expect(within(screen.getByRole('dialog', { name: 'Export preview' })).getByLabelText('Export preview text').textContent)
        .toContain('Replacement Plumbing')
    })
    const refreshedDialog = screen.getByRole('dialog', { name: 'Export preview' })
    const refreshedCopy = within(refreshedDialog).getByRole('button', { name: 'Copy summary' })
    expect(refreshedCopy.hasAttribute('disabled')).toBe(false)
    const refreshedPayload = within(refreshedDialog).getByLabelText('Export preview text').textContent

    fireEvent.click(refreshedCopy)

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText).toHaveBeenCalledWith(refreshedPayload)
  })
})

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
  return {
    citationIndex: 1,
    slug: 'demo-plumbing',
    name: 'Demo inquiry provider',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: 'No reply history yet',
    trustCue: 'Checked',
    freshnessLabel: 'Updated recently',
    nextStepLabel: 'Review listing',
    detailUrl: '/demo-plumbing?q=customer-search-phrase&k=private-access-secret',
    services: [],
    ...overrides,
  }
}
