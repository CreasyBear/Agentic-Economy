import { auth } from '@clerk/tanstack-react-start/server'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { storefrontImportDraftAction } from '@/modules/storefront/storefront.actions'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/storefront/import-draft')({
  server: {
    handlers: {
      POST: ({ request }) => handleImportStorefrontDraftRequest(request),
    },
  },
})

export async function handleImportStorefrontDraftRequest(request: Request): Promise<Response> {
  if (process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E !== 'true') {
    const session = await auth()
    if (!session.isAuthenticated) {
      return jsonResponse({ kind: 'error', code: 'storefront_import_unauthenticated', reason: 'Sign in before importing a service page draft.' }, { status: 401 })
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ kind: 'error', code: 'storefront_import_invalid_body', reason: 'Request body must be JSON.' }, { status: 400 })
  }

  const parsed = storefrontImportDraftAction.schema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ kind: 'error', code: 'storefront_import_invalid_body', reason: z.prettifyError(parsed.error) }, { status: 400 })
  }

  const result = await storefrontImportDraftAction.run({
    data: parsed.data,
    context: { request, harnessApproval: { authority: 'owner' } },
  })

  return jsonResponse(result, { status: result.kind === 'ok' ? 200 : 422 })
}
