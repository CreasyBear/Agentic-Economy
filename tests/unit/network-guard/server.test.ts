import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultDnsResolver, type ResolvedAddress } from '@/modules/network-guard/public'
import { sendGuardedHttpRequest } from '@/modules/network-guard/server'

afterEach(() => vi.restoreAllMocks())

describe('guarded HTTP request deadline', () => {
  it('returns after abort while DNS is still unresolved', async () => {
    const dns = Promise.withResolvers<readonly ResolvedAddress[]>()
    const lookup = vi.spyOn(defaultDnsResolver, 'lookup').mockReturnValue(dns.promise)
    const controller = new AbortController()
    const request = sendGuardedHttpRequest(new Request('https://feedback-timeout.invalid/batch/', {
      method: 'POST', body: '{}', signal: controller.signal,
    })).then(() => 'accepted', (error: unknown) => error)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1))
      controller.abort(new DOMException('Deadline reached', 'TimeoutError'))
      const result = await Promise.race([
        request,
        new Promise(resolve => { timer = setTimeout(() => resolve('still_pending'), 1_000) }),
      ])
      expect(result).toMatchObject({ name: 'TimeoutError' })
    } finally {
      clearTimeout(timer)
      dns.resolve([])
      await request
    }
  })
})
