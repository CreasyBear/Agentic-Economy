import { createCircuitBreaker } from '@/lib/observability/circuit-breaker'

import { JevUnavailableError } from './contracts'

/** Caller-initiated or configuration outcomes say nothing about JEV health, so they never count toward opening. */
export const jevBreaker = createCircuitBreaker({
  isFailure: cause => !(cause instanceof JevUnavailableError && (cause.reason === 'cancelled' || cause.reason === 'disabled' || cause.reason === 'missing_key')),
})
