import { z } from 'zod'
import { ownerInventoryReturnFields, inventoryQueryFromReturnSearch, ownerInventoryReturnSearch, type OwnerInventoryReturnSearch } from '@/lib/operator/owner-inventory-return'

export type SupplierOnboardingStep = 'profile' | 'first_tool'

export type SupplierOnboardingProfile = Readonly<{
  name: string
  website: string
}>

export type SupplierOnboardingSaveResult =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'error'; message: string }>

export const newOperationSearchSchema = z.object({
  ...ownerInventoryReturnFields,
  connection: z.string().trim().min(1).max(300).optional(),
  environment: z.enum(['sandbox', 'production']).optional(),
  draft: z.string().trim().min(1).max(300).optional(),
})

export function ownerNewOperationSearch(search: OwnerInventoryReturnSearch & Readonly<{
  connection?: string | undefined
  environment?: 'sandbox' | 'production' | undefined
  draft?: string | undefined
}>): OwnerInventoryReturnSearch & Readonly<{
  connection?: string
  environment?: 'sandbox' | 'production'
  draft?: string
}> {
  return {
    ...ownerInventoryReturnSearch(inventoryQueryFromReturnSearch(search)),
    ...(typeof search.connection === 'string' ? { connection: search.connection } : {}),
    ...(search.environment === 'sandbox' || search.environment === 'production' ? { environment: search.environment } : {}),
    ...(typeof search.draft === 'string' ? { draft: search.draft } : {}),
  }
}
