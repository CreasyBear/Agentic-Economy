/**
 * @vitest-environment jsdom
 */
import { buildProjection, testState } from './ae-chat-route-promotion-harness'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AeChat } from '@/components/ae/chat/AeChat'

describe('AeChat route promotion readback', () => {
  it('recovers a null SSR projection with one owner readback', async () => {
    const projection = buildProjection('thread-recovered', 'Recovered answer')
    const detailRequests: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {

      const url = String(input)
      if (url.endsWith('/api/answer/threads/thread-recovered')) {
        detailRequests.push(url)
        return new Response(JSON.stringify(projection))
      }
      return new Response(JSON.stringify({ threads: [] }))
    })

    render(<AeChat threadId="thread-recovered" initialProjection={null} />)
    expect(screen.queryByText('Search unavailable')).toBeNull()
    await waitFor(() => {
      expect(screen.getByTestId('thread-transcript').getAttribute('data-projection-thread-id')).toBe('thread-recovered')
    })
    expect(detailRequests).toHaveLength(1)
  })

  it('keeps a null SSR projection concealed when owner readback returns 404', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => (
      String(input).endsWith('/api/answer/threads/thread-missing')
        ? new Response(null, { status: 404 })
        : new Response(JSON.stringify({ threads: [] }))
    ))

    render(<AeChat threadId="thread-missing" initialProjection={null} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Search unavailable' })).toBeTruthy()
    expect(screen.getByText('This search couldn’t be loaded. Start a new search to continue.')).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Start a new search' })).toHaveLength(1)
    expect(testState.latestScrollerProps).toMatchObject({
      showJumpButton: true,
      contentClassName: 'justify-center',
    })
  })

  it('does not read back a matching non-null SSR projection', async () => {
    const detailRequests: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/answer/threads/thread-one')) {
        detailRequests.push(url)
      }
      return new Response(JSON.stringify({ threads: [] }))
    })

    render(<AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />)

    await waitFor(() => expect(screen.getByTestId('thread-transcript')).toBeTruthy())
    expect(detailRequests).toHaveLength(0)
  })

  it('does not render retention policy copy in the transcript', () => {
    render(<AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />)

    expect(screen.queryByRole('note', { name: 'Chat access and retention' })).toBeNull()
    expect(screen.queryByText(/Private to this browser by default/iu)).toBeNull()
  })
})
