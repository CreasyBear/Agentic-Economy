import { auth } from '@clerk/tanstack-react-start/server'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { storefrontEnrichDraftAction } from '@/modules/storefront/storefront.actions'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/storefront/enrich')({
  server: {
    handlers: {
      POST: ({ request }) => handleEnrichStorefrontDraftRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

const MAX_STOREFRONT_ENRICH_BODY_BYTES = 16 * 1024

export async function handleEnrichStorefrontDraftRequest(request: Request): Promise<Response> {
  if (!isLocalE2EAuthBypassEnabled()) {
    const session = await auth()
    if (!session.isAuthenticated) {
      return problem({ status: 401, kind: 'UNAUTHENTICATED', code: 'storefront_enrich_unauthenticated', detail: 'Sign in before gathering public details for a service page draft.' })
    }
  }

  const boundedBody = await readBoundedRequestJson(request, MAX_STOREFRONT_ENRICH_BODY_BYTES)
  if (!boundedBody.ok) {
    const isTooLarge = boundedBody.code === 'payload_too_large'
    return problem({
      status: isTooLarge ? 413 : 400,
      kind: isTooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
      code: isTooLarge ? 'storefront_enrich_payload_too_large' : 'storefront_enrich_invalid_body',
      detail: isTooLarge ? 'Request body is too large.' : 'Request body must be JSON.',
    })
  }

  const parsed = storefrontEnrichDraftAction.schema.safeParse(boundedBody.value)
  if (!parsed.success) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'storefront_enrich_invalid_body', detail: z.prettifyError(parsed.error) })
  }

  const result = await storefrontEnrichDraftAction.run({
    data: parsed.data,
    context: { request, caller: 'http', harnessApproval: { authority: 'owner' } },
  })

  return jsonResponse(result, { status: result.kind === 'draft' ? 200 : 422 })
}
