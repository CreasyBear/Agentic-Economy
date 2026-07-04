import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'

import { storefrontImportDraftAction } from '@/modules/storefront/storefront.actions'
import type { StorefrontImportInput, StorefrontImportResult } from '@/modules/storefront/public'

export const importStorefrontDraftServer = createServerFn({ method: 'POST' })
  .validator((data) => storefrontImportDraftAction.schema.parse(data))
  .handler(async ({ data }) => importStorefrontDraftForOwner(data))

export async function importStorefrontDraftForOwner(data: StorefrontImportInput): Promise<StorefrontImportResult> {
  if (process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E !== 'true') {
    const session = await auth()
    if (!session.isAuthenticated) {
      return {
        kind: 'error',
        code: 'storefront_import_fetch_failed',
        retryable: false,
        reason: 'Sign in before importing a service page draft.',
      }
    }
  }

  return storefrontImportDraftAction.run({
    data: storefrontImportDraftAction.schema.parse(data),
    context: { harnessApproval: { authority: 'owner' } },
  })
}
