import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'

import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { storefrontEnrichDraftAction, storefrontImportDraftAction } from '@/modules/storefront/storefront.actions'
import type {
  BusinessEnrichmentInput,
  BusinessEnrichmentResult,
  StorefrontImportInput,
  StorefrontImportResult,
} from '@/modules/storefront/public'

export const importStorefrontDraftServer = createServerFn({ method: 'POST' })
  .validator((data) => storefrontImportDraftAction.schema.parse(data))
  .handler(async ({ data }) => importStorefrontDraftForOwner(data))

async function importStorefrontDraftForOwner(data: StorefrontImportInput): Promise<StorefrontImportResult> {
  if (!isLocalE2EAuthBypassEnabled()) {
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

export const enrichBusinessDraftServer = createServerFn({ method: 'POST' })
  .validator((data) => storefrontEnrichDraftAction.schema.parse(data))
  .handler(async ({ data }) => enrichBusinessDraftForOwner(data))

async function enrichBusinessDraftForOwner(data: BusinessEnrichmentInput): Promise<BusinessEnrichmentResult> {
  if (!isLocalE2EAuthBypassEnabled()) {
    const session = await auth()
    if (!session.isAuthenticated) {
      return {
        kind: 'error',
        code: 'enrichment_failed',
        retryable: false,
        reason: 'Sign in before gathering public details for a service page draft.',
      }
    }
  }

  return storefrontEnrichDraftAction.run({
    data: storefrontEnrichDraftAction.schema.parse(data),
    context: { caller: 'ui', harnessApproval: { authority: 'owner' } },
  })
}
