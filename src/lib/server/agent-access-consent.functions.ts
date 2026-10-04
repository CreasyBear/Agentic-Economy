import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import { handleOAuthAuthorizeGet } from './agent-access-oauth-api'
import { createConvexAgentAccessOAuthStore } from './agent-access-oauth-store'
import { createHttpRateLimitAdmission } from './rate-limit'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import { readOnboardingRequest } from './agent-access-oauth/onboarding'
import { createAuthenticatedSourceTransport, sourceQuery } from './convex-source'
import type { AgentOnboardingRequest } from '@/modules/agent-access/public'

const admitOAuthConsent = createHttpRateLimitAdmission('oauth-issuance')
const admitOnboardingRead = createHttpRateLimitAdmission('public-read')
const findOwnedAgent = sourceQuery<Readonly<{ credentialId: string }>, string | null>('agentDirectory:findOwnedByCredential')
export const readAgentOnboardingRequestServer = createServerFn({ method: 'GET' })
  .validator((data) => z.union([
    z.strictObject({ grantRef: z.string().trim().min(3).max(160) }),
    z.strictObject({ userCode: z.string().trim().min(3).max(32) }),
  ]).parse(data))
  .handler(async ({ data }): Promise<AgentOnboardingRequest> => {
    setResponseHeader('Cache-Control', 'private, no-store')
    setResponseHeader('Referrer-Policy', 'no-referrer')
    const request = getRequest()
    try {
      // Read-only polling has a separate key from consent/credential writes.
      const admission = await admitOnboardingRead({ request, keySuffix: 'onboarding_observation' })
      if (!admission.ok) return { kind: 'unavailable' }
      return await readOnboardingRequest(data, { store: createConvexAgentAccessOAuthStore(request, '') }, async credentialId => {
        const source = await createAuthenticatedSourceTransport()
        return await source.query(findOwnedAgent, { credentialId })
      })
    } catch (error) {
      console.error('[agent-onboarding] read failed', sanitizeTelemetryError(error))
      return { kind: 'unavailable' }
    }
  })

export const readAgentAccessConsentServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({
    userCode: z.string().trim().min(3).max(32).optional(),
    grantRef: z.string().trim().min(3).max(160).optional(),
    agentCursor: z.string().min(1).max(2_048).optional(),
  }).refine((value) => (value.userCode === undefined) !== (value.grantRef === undefined), {
    message: 'Exactly one consent locator is required.',
  }).parse(data))
  .handler(async ({ data }) => {
    const incoming = getRequest()
    const url = new URL('/oauth/authorize', incoming.url)
    if (data.userCode !== undefined) url.searchParams.set('user_code', data.userCode)
    if (data.grantRef !== undefined) url.searchParams.set('grant_ref', data.grantRef)
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
