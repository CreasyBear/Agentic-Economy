import { auth } from '@clerk/tanstack-react-start/server'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { storefrontEnrichDraftAction } from '@/modules/storefront/storefront.actions'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/storefront/enrich')({
  server: {
    handlers: {
      POST: ({ request }) => handleEnrichStorefrontDraftRequest(request),
    },
  },
})

const MAX_STOREFRONT_ENRICH_BODY_BYTES = 16 * 1024

export async function handleEnrichStorefrontDraftRequest(request: Request): Promise<Response> {
  if (!isLocalE2EAuthBypassEnabled()) {
    const session = await auth()
    if (!session.isAuthenticated) {
      return jsonResponse({ kind: 'error', code: 'storefront_enrich_unauthenticated', reason: 'Sign in before gathering public details for a service page draft.' }, { status: 401 })
    }
  }

  const boundedBody = await readBoundedRequestJson(request, MAX_STOREFRONT_ENRICH_BODY_BYTES)
  if (!boundedBody.ok) {
    const isTooLarge = boundedBody.code === 'payload_too_large'
    return jsonResponse({
      kind: 'error',
      code: isTooLarge ? 'storefront_enrich_payload_too_large' : 'storefront_enrich_invalid_body',
      reason: isTooLarge ? 'Request body is too large.' : 'Request body must be JSON.',
    }, { status: isTooLarge ? 413 : 400 })
  }

  const parsed = storefrontEnrichDraftAction.schema.safeParse(boundedBody.value)
  if (!parsed.success) {
    return jsonResponse({ kind: 'error', code: 'storefront_enrich_invalid_body', reason: z.prettifyError(parsed.error) }, { status: 400 })
  }

  const result = await storefrontEnrichDraftAction.run({
    data: parsed.data,
    context: { request, caller: 'http', harnessApproval: { authority: 'owner' } },
  })

  return jsonResponse(result, { status: result.kind === 'draft' ? 200 : 422 })
}
