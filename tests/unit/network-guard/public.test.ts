import { describe, expect, it } from 'vitest'

import { isPublicHttpTarget } from '@/modules/network-guard/public'

const refuseLookup = {
  async lookup(): Promise<never> {
    throw new Error('dns_must_not_run_for_literal_ip')
  },
}

describe('public HTTP target address guard', () => {
  it('refuses 6to4 and NAT64 addresses that embed RFC1918 IPv4', async () => {
    await expect(isPublicHttpTarget(new URL('https://[2002:c0a8:101::1]/'), refuseLookup)).resolves.toBe(false)
    await expect(isPublicHttpTarget(new URL('https://[64:ff9b::c0a8:101]/'), refuseLookup)).resolves.toBe(false)
  })

  it('still admits 6to4 that embeds a public IPv4 address', async () => {
    await expect(isPublicHttpTarget(new URL('https://[2002:808:808::1]/'), refuseLookup)).resolves.toBe(true)
  })
})
