import { describe, expect, it, vi } from 'vitest'

const fetchSpy = vi.hoisted(() => vi.fn(async () => new Response('ok')))
vi.mock('undici', async (importOriginal) => ({ ...(await importOriginal<object>()), fetch: fetchSpy }))

import { sendGuardedHttpRequest } from '@/modules/network-guard/server'

describe('sendGuardedHttpRequest IP literals', () => {
  it.each(['http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/'])('refuses %s before dialing', async (url) => {
    await expect(sendGuardedHttpRequest(new Request(url))).rejects.toMatchObject({ code: 'ECONNREFUSED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('passes the pre-check for a public IP literal', async () => {
    const res = await sendGuardedHttpRequest(new Request('http://8.8.8.8/'))
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})
