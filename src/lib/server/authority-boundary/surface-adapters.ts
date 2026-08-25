import type {
  AuthoritySurface,
  ConsequenceAuthorityBoundary,
  ServerAuthorityResolutionPort,
  SurfaceAuthorityAdapter,
} from '../../../modules/authority/context/public'

export type SurfaceAuthorityResolvers = Readonly<Record<AuthoritySurface, ServerAuthorityResolutionPort>>
export type SurfaceAuthorityAdapters = Readonly<Record<AuthoritySurface, SurfaceAuthorityAdapter>>

function adapter(
  boundary: ConsequenceAuthorityBoundary,
  surface: AuthoritySurface,
  resolver: ServerAuthorityResolutionPort,
): SurfaceAuthorityAdapter {
  return boundary.forSurface(surface, resolver)
}

export function createHttpAuthorityAdapter(boundary: ConsequenceAuthorityBoundary, resolver: ServerAuthorityResolutionPort) {
  return adapter(boundary, 'http', resolver)
}

export function createConvexAuthorityAdapter(boundary: ConsequenceAuthorityBoundary, resolver: ServerAuthorityResolutionPort) {
  return adapter(boundary, 'convex', resolver)
}

export function createMcpAuthorityAdapter(boundary: ConsequenceAuthorityBoundary, resolver: ServerAuthorityResolutionPort) {
  return adapter(boundary, 'mcp', resolver)
}

export function createCliAuthorityAdapter(boundary: ConsequenceAuthorityBoundary, resolver: ServerAuthorityResolutionPort) {
  return adapter(boundary, 'cli', resolver)
}

export function createCallbackAuthorityAdapter(boundary: ConsequenceAuthorityBoundary, resolver: ServerAuthorityResolutionPort) {
  return adapter(boundary, 'callback', resolver)
}

export function createWorkerAuthorityAdapter(boundary: ConsequenceAuthorityBoundary, resolver: ServerAuthorityResolutionPort) {
  return adapter(boundary, 'worker', resolver)
}

export function createJobAuthorityAdapter(boundary: ConsequenceAuthorityBoundary, resolver: ServerAuthorityResolutionPort) {
  return adapter(boundary, 'job', resolver)
}

export function createCronAuthorityAdapter(boundary: ConsequenceAuthorityBoundary, resolver: ServerAuthorityResolutionPort) {
  return adapter(boundary, 'cron', resolver)
}

export function createReconciliationAuthorityAdapter(boundary: ConsequenceAuthorityBoundary, resolver: ServerAuthorityResolutionPort) {
  return adapter(boundary, 'reconciliation', resolver)
}

export function createSurfaceAuthorityAdapters(
  boundary: ConsequenceAuthorityBoundary,
  resolvers: SurfaceAuthorityResolvers,
): SurfaceAuthorityAdapters {
  return Object.freeze({
    http: createHttpAuthorityAdapter(boundary, resolvers.http),
    convex: createConvexAuthorityAdapter(boundary, resolvers.convex),
    mcp: createMcpAuthorityAdapter(boundary, resolvers.mcp),
    cli: createCliAuthorityAdapter(boundary, resolvers.cli),
    callback: createCallbackAuthorityAdapter(boundary, resolvers.callback),
    worker: createWorkerAuthorityAdapter(boundary, resolvers.worker),
    job: createJobAuthorityAdapter(boundary, resolvers.job),
    cron: createCronAuthorityAdapter(boundary, resolvers.cron),
    reconciliation: createReconciliationAuthorityAdapter(boundary, resolvers.reconciliation),
  })
}
