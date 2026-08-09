import { auth } from '@clerk/tanstack-react-start/server'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { storefrontImportDraftAction } from '@/modules/storefront/storefront.actions'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/storefront/import-draft')({
  server: {
    handlers: {
      POST: ({ request }) => handleImportStorefrontDraftRequest(request),
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

const MAX_STOREFRONT_IMPORT_BODY_BYTES = 16 * 1024

export async function handleImportStorefrontDraftRequest(request: Request): Promise<Response> {
  if (!isLocalE2EAuthBypassEnabled()) {
    const session = await auth()
    if (!session.isAuthenticated) {
      return problem({ status: 401, kind: 'UNAUTHENTICATED', code: 'storefront_import_unauthenticated', detail: 'Sign in before importing a service page draft.' })
    }
  }

  const boundedBody = await readBoundedRequestJson(request, MAX_STOREFRONT_IMPORT_BODY_BYTES)
  if (!boundedBody.ok) {
    const isTooLarge = boundedBody.code === 'payload_too_large'
    return problem({
      status: isTooLarge ? 413 : 400,
      kind: isTooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
      code: isTooLarge ? 'storefront_import_payload_too_large' : 'storefront_import_invalid_body',
      detail: isTooLarge ? 'Request body is too large.' : 'Request body must be JSON.',
    })
  }

  const parsed = storefrontImportDraftAction.schema.safeParse(boundedBody.value)
  if (!parsed.success) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'storefront_import_invalid_body', detail: z.prettifyError(parsed.error) })
  }

  const result = await storefrontImportDraftAction.run({
    data: parsed.data,
    context: { request, harnessApproval: { authority: 'owner' } },
  })

  if (result.kind !== 'ok') {
    return problem({ status: 422, kind: 'FAILED_PRECONDITION', code: result.code, detail: result.reason })
  }
  return jsonResponse(result, { status: 200 })
}
