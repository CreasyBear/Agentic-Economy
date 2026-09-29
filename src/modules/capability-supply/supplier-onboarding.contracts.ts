import { z } from 'zod'

export type SupplierOnboardingStep = 'profile' | 'first_tool'

export type SupplierOnboardingProfile = Readonly<{
  name: string
  website: string
  abn: string
}>

export type SupplierOnboardingSaveResult =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'error'; message: string }>

export const newOperationSearchSchema = z.object({
  connection: z.string().trim().min(1).max(300).optional(),
  environment: z.enum(['sandbox', 'production']).optional(),
  draft: z.string().trim().min(1).max(300).optional(),
})

export function ownerNewOperationSearch(search: Readonly<{
  connection?: string | undefined
  environment?: 'sandbox' | 'production' | undefined
  draft?: string | undefined
}>): Readonly<{
  connection?: string
  environment?: 'sandbox' | 'production'
  draft?: string
}> {
  return {
    ...(typeof search.connection === 'string' ? { connection: search.connection } : {}),
    ...(search.environment === 'sandbox' || search.environment === 'production' ? { environment: search.environment } : {}),
    ...(typeof search.draft === 'string' ? { draft: search.draft } : {}),
  }
}
