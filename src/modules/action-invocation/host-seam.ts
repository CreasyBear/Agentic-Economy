import type { DevelopmentInvocationHost } from './application-service'

/**
 * Host contract for the current, development-only invocation host. Hosts
 * receive only application commands and authoritative projections;
 * acquisition, release and reconciliation material remain inside the Action
 * Invocation application.
 *
 * The name says `Development` on purpose. The only implementation behind it is
 * `DevelopmentInvocationHost`, whose views are stamped `MOCK/DEVELOPMENT ONLY`
 * and which commits no external effect. A production-shaped alias invited
 * callers to read a mock as the real execution plane. Introduce a separate
 * seam when a non-development adapter exists; do not widen this one.
 */
export type DevelopmentActionInvocationHostSeam = DevelopmentInvocationHost
