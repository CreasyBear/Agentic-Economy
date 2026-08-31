import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

import { handleOAuthAuthorizeGet } from './agent-access-oauth-api'
import { createConvexAgentAccessOAuthStore } from './agent-access-oauth-store'
import { createHttpRateLimitAdmission } from './rate-limit'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'

const admitOAuthConsent = createHttpRateLimitAdmission('oauth-issuance')

export const readAgentAccessConsentServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({
    userCode: z.string().trim().min(3).max(32),
    agentCursor: z.string().min(1).max(2_048).optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const incoming = getRequest()
    const url = new URL('/oauth/authorize', incoming.url)
    url.searchParams.set('user_code', data.userCode)
    if (data.agentCursor !== undefined) url.searchParams.set('agent_cursor', data.agentCursor)
    const request = new Request(url, { headers: incoming.headers })
    try {
      const response = await handleOAuthAuthorizeGet(request, {
        store: createConvexAgentAccessOAuthStore(request, ''),
        rateLimit: admitOAuthConsent,
      })
      return {
        status: response.status,
        html: await response.text(),
      }
    } catch (error) {
      console.error('[agent-access-consent] read failed', sanitizeTelemetryError(error))
      return { status: 503, html: '' }
    }
  })
