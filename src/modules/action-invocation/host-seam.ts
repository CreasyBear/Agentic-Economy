import type { DevelopmentInvocationHost } from './host-application'

/**
 * Public host contract. Hosts receive only application commands and
 * authoritative projections; acquisition, release and reconciliation material
 * remain inside the Action Invocation application.
 */
export type ActionInvocationHostSeam = DevelopmentInvocationHost
