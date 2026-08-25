import type { CanonicalClaimInput } from './canonical-claim'

/**
 * Compile-time alias retained for old adapters only. Current Call runtime and
 * public barrels deliberately do not export this retired product noun.
 */
export type CustomerRequestCanonicalClaimMaterial = Readonly<
  Omit<CanonicalClaimInput, 'expectedInvocationVersion' | 'expectedEffectGeneration'>
>
