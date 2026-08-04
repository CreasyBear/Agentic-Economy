/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { RequestRecordLinks } from '@/components/ae/customer-request/panels/records/records'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('customer Request activity record', () => {
  it('uses active customer language for a leased evidence step', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        kind: 'evidence',
        requestRef: 'request:one',
        state: 'running',
        generatedAt: 10,
        steps: [{
          step: 1,
          state: 'leased',
          observedAt: 10,
          business: 'Resolver',
          providerOrigin: 'https://provider.example',
          evidence: [],
        }, {
          step: 2,
          state: 'outcome_unknown',
          observedAt: 11,
          business: 'Resolver',
          providerOrigin: 'https://provider.example',
          evidence: [],
        }],
        problems: [],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<RequestRecordLinks requestRef="request:one" />)
    fireEvent.click(screen.getByRole('button', { name: 'View activity record' }))

    await waitFor(() => expect(screen.getByText(
      'Step 1 working through the active transport handoff',
    )).toBeTruthy())
    expect(screen.getByText('Step 2 still being confirmed')).toBeTruthy()
    expect(screen.queryByText(/leased/i)).toBeNull()
  })
})
