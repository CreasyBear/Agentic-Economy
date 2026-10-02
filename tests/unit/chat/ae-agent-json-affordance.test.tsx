/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-dialog'
import '../../setup/jsdom-platform'

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

  it('keeps confirmation disabled while loading and after a failed read', async () => {
    let finish: (response: Response) => void = () => { throw new Error('read was not started') }
    const fetchPayload = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('fetch', fetchPayload)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<AeAgentJsonAffordance agentJsonUrl="/api/discovery/examples" query="executed query" />)
    fireEvent.click(screen.getByRole('button', { name: 'Agent-readable data' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Agent-readable data' }))
    expect(dialog.getByText('Loading data preview...')).toBeTruthy()
    const confirm = dialog.getByRole('button', { name: 'Confirm and copy data' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(writeText).not.toHaveBeenCalled()
    finish(new Response('Unavailable', { status: 503 }))
    expect(await dialog.findByRole('alert')).toHaveProperty('textContent', 'The data could not be loaded. Nothing was copied.')
    expect(confirm.disabled).toBe(true)
    expect(dialog.queryByLabelText('Agent-readable data')).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps disclosed JSON selectable and unconfirmed after clipboard denial', async () => {
    const payload = { query: 'old query', source: 'published facts' }
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload))))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<AeAgentJsonAffordance agentJsonUrl="/api/discovery/examples" query="executed query" />)
    fireEvent.click(screen.getByRole('button', { name: 'Agent-readable data' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Agent-readable data' }))
    const preview = await dialog.findByLabelText('Agent-readable data')
    expect(preview.tabIndex).toBe(0)
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm and copy data' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify({ ...payload, query: 'executed query' }, null, 2)))
    expect(dialog.queryByRole('button', { name: 'Copied to clipboard' })).toBeNull()
    expect((dialog.getByRole('button', { name: 'Confirm and copy data' }) as HTMLButtonElement).disabled).toBe(false)
    expect(preview.textContent).toContain('published facts')
  })
})
