import { z } from 'zod'

import { identifier } from '@/modules/capability-contract/public'

/**
 * Transport authority/continuation/cancellation shapes, split out of
 * `public.ts` so leaf modules that only need these types (e.g. schema
 * admission, route transport call/adapters) can depend on them directly
 * instead of through the module barrel - avoiding an `internal/x.ts ->
 * public.ts -> internal/x.ts` round-trip. `public.ts` still owns
 * `bindingSchema` and re-exports these schemas/types for external
 * consumers.
 */
const evidenceRefs = z.array(identifier).min(1).max(64)

export const authoritySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('public_upstream') }),
  z.strictObject({
    kind: z.literal('provider_connection'),
    connectionRef: identifier,
    providerRef: identifier,
  }),
])

export const continuationSchema = z.strictObject({
  kind: z.enum(['single_response', 'adapter_managed']),
  evidenceRefs,
})

export const cancellationSchema = z.strictObject({
  kind: z.enum(['unsupported', 'adapter_managed']),
  evidenceRefs,
})

export type CapabilityTransportAuthority = Readonly<z.infer<typeof authoritySchema>>
export type CapabilityContinuation = Readonly<z.infer<typeof continuationSchema>>
export type CapabilityCancellation = Readonly<z.infer<typeof cancellationSchema>>
