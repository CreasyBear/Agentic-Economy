import type { DevelopmentInvocationHost } from './application-service'

/**
 * Public host contract. Hosts receive only application commands and
 * authoritative projections; acquisition, release and reconciliation material
 * remain inside the Action Invocation application.
 */
export type ActionInvocationHostSeam = DevelopmentInvocationHost
