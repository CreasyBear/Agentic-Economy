import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceMutation, sourceMutation } from '@/lib/server/convex-source'

export type EnsureSupplierBusinessResult =
  | Readonly<{ kind: 'created' | 'existing'; businessId: string; slug: string }>
  | Readonly<{
      kind: 'refused'
      code: 'unauthenticated' | 'invalid_business' | 'slug_taken' | 'multiple_businesses' | 'source_unavailable'
    }>

type EnsureSupplierBusinessSourceResult = Exclude<
  EnsureSupplierBusinessResult,
  Readonly<{ kind: 'refused'; code: 'source_unavailable' }>
>

const ensureSupplierBusinessMutation = sourceMutation<
  { name: string; slug: string; website: string; providerIdentifier: string },
  EnsureSupplierBusinessSourceResult
>('catalog:ensureSupplierBusiness')

export const ensureSupplierBusinessServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({
    name: z.string().trim().min(1).max(160),
    slug: z.string().trim().max(160),
    website: z.url().max(2_048),
    providerIdentifier: z.string().trim().min(1).max(240),
  }).parse(data))
  .handler(async ({ data }): Promise<EnsureSupplierBusinessResult> => {
    try {
      return await callSourceMutation(ensureSupplierBusinessMutation, data)
    } catch {
      return { kind: 'refused', code: 'source_unavailable' }
    }
  })
