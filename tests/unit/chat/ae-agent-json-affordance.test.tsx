/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-dialog'

import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'

describe('AeAgentJsonAffordance', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('previews the fetched payload with the executed query before an explicit exact copy', async () => {
    const agentJsonUrl = '/api/businesses/search?q=tool-selected-query'
    const executedQuery = 'Emergency plumber in Parramatta today'
    const responsePayload = {
      query: 'tool-selected-query',
      providers: [{ name: 'Demo listed provider', suburb: 'Parramatta' }],
      resultCount: 1,
      evidence: { source: 'published business details', checkedAt: '2026-07-13T01:30:00.000Z' },
    }
    const previewedPayload = { ...responsePayload, query: executedQuery }
    const fetchPayload = vi.fn(async () => new Response(JSON.stringify(responsePayload)))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('fetch', fetchPayload)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    render(<AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={executedQuery} />)

    fireEvent.click(screen.getByRole('button', { name: 'Agent-readable data' }))

    expect(fetchPayload).toHaveBeenCalledOnce()
    expect(fetchPayload).toHaveBeenCalledWith(agentJsonUrl)
    expect(writeText).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog', { name: 'Agent-readable data' })
    const payloadPreview = await within(dialog).findByLabelText('Agent-readable data')
    const previewText = payloadPreview.textContent

    expect(within(dialog).getByText('Fields: query, providers, resultCount, evidence')).toBeTruthy()
    expect(previewText).toBe(JSON.stringify(previewedPayload, null, 2))
    expect(writeText).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and copy data' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText).toHaveBeenCalledWith(previewText)
  })
})
