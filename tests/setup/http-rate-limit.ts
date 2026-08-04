import { beforeEach } from 'vitest'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'

beforeEach(() => {
  setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
})
