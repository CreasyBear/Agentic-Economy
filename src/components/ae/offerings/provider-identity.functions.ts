import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import { degrade } from '@/lib/observability/degrade'

export type EnsureProviderBusinessResult =
  | Readonly<{ kind: 'created' | 'existing'; businessId: string; slug: string }>
  | Readonly<{
      kind: 'refused'
      code: 'unauthenticated' | 'invalid_business' | 'slug_taken' | 'multiple_businesses' | 'source_unavailable'
    }>

type EnsureProviderBusinessSourceResult = Exclude<
  EnsureProviderBusinessResult,
  Readonly<{ kind: 'refused'; code: 'source_unavailable' }>
>

const ensureProviderBusinessMutation = sourceMutation<
  { name: string; slug: string; website: string; providerIdentifier: string },
  EnsureProviderBusinessSourceResult
>('catalog:ensureProviderBusiness')

export const ensureProviderBusinessServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({
    name: z.string().trim().min(1).max(160),
    slug: z.string().trim().max(160),
    website: z.url().max(2_048),
    providerIdentifier: z.string().trim().min(1).max(240),
  }).parse(data))
  .handler(async ({ data }): Promise<EnsureProviderBusinessResult> => {
    try {
      return await callSourceMutation(ensureProviderBusinessMutation, data)
    } catch (cause) {
      return degrade(cause, { kind: 'refused', code: 'source_unavailable' } as const, {
        site: 'ensureProviderBusinessServer',
        reason: 'source_unavailable',
      })
    }
  })
