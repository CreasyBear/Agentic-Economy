import { describe, expect, it, vi } from 'vitest'

import { fetchBrowserRequestWithInterpreterRecovery } from '@/modules/customer-request/browser-submit-recovery'

describe('browser Request submit recovery', () => {
  it('retries only a transient interpreter failure with the identical submit command', async () => {
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'interpreter_unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ kind: 'request', requestRef: 'request:one' }))
    const sleep = vi.fn(async () => undefined)
    const init = { method: 'POST', body: JSON.stringify({ idempotencyKey: 'submit:one' }) }

    const response = await fetchBrowserRequestWithInterpreterRecovery('/api/requests', init, { send, sleep })

    expect(response.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1])
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('does not retry authentication, validation, or unknown server failures', async () => {
    for (const response of [
      Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }),
      Response.json({ kind: 'refused', reason: 'request_invalid' }, { status: 400 }),
      Response.json({ error: 'unexpected' }, { status: 503 }),
    ]) {
      const send = vi.fn<typeof fetch>().mockResolvedValue(response)
      await fetchBrowserRequestWithInterpreterRecovery('/api/requests', { method: 'POST' }, {
        send, sleep: async () => undefined,
      })
      expect(send).toHaveBeenCalledOnce()
    }
  })
})
