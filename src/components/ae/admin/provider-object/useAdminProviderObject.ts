import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import type { AdminProviderView } from '@/lib/operator/admin-console/views'
import type {
  AdminProviderObjectPageProps,
  AdminProviderObjectRead,
} from './provider-object.contracts'

const OBJECT_NOT_FOUND: Readonly<{ kind: 'object_not_found' }> = {
  kind: 'object_not_found',
}

export function useAdminProviderObject({ slug }: AdminProviderObjectPageProps): AdminProviderObjectRead {
  const result = useQuery(api.adminConsoleObjects.readAdminObject, {
    ref: { kind: 'provider', ref: slug },
  })
  if (result === undefined || result.kind === 'object_not_found' || result.kind === 'refused') {
    return result
  }
  if (result.kind !== 'provider') return OBJECT_NOT_FOUND

  const provider = parseAdminObjectRef('provider', result.slug)
  if (provider.kind !== 'valid' || provider.ref.kind !== 'provider') return OBJECT_NOT_FOUND

  const publications: Array<AdminProviderView['publications'][number]> = []
  for (const publication of result.publications) {
    if (!isPublicToolRef(publication.ref)) return OBJECT_NOT_FOUND
    publications.push({ ...publication, ref: publication.ref })
  }

  return {
    ...result,
    slug: provider.ref.ref,
    publications,
  }
}
