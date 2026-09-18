import { beforeEach } from 'vitest'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'

beforeEach(() => {
  // HTTP tests stub Convex admission so they do not need
  // AE_CONVEX_SERVER_FUNCTION_TOKEN. Production admitHttp still refuses
  // unsigned public Convex clients.
  setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
})
