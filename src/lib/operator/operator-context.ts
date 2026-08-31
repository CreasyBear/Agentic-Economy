export const OPERATOR_SURFACES = ['owner', 'admin', 'developer'] as const

export type OperatorSurface = (typeof OPERATOR_SURFACES)[number]

export type OperatorContext = Readonly<{
  kind: 'authorized'
  userId: string
  principalRef: string
  accountRef?: string
  allowedSurfaces: readonly OperatorSurface[]
}>

export type OperatorContextReadResult =
  | OperatorContext
  | Readonly<{ kind: 'denied'; reason: 'canonical_owner_required' }>

export const OPERATOR_SURFACE_FORBIDDEN_MESSAGE = 'This account cannot open the requested workspace surface.'

export class OperatorSurfaceForbiddenError extends Error {
  readonly code = 'operator_surface_forbidden' as const
  readonly surface: OperatorSurface

  constructor(surface: OperatorSurface) {
    super(OPERATOR_SURFACE_FORBIDDEN_MESSAGE)
    this.name = 'OperatorSurfaceForbiddenError'
    this.surface = surface
  }
}

export function operatorSurfaceForPath(pathOrHref: string): OperatorSurface {
  const pathname = pathOrHref.startsWith('http://') || pathOrHref.startsWith('https://')
    ? new URL(pathOrHref).pathname
    : pathOrHref.split(/[?#]/u, 1)[0] ?? '/'

  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin'
  if (pathname === '/developers' || pathname.startsWith('/developers/')) return 'developer'
  return 'owner'
}

export function admitOperatorContext(
  result: OperatorContextReadResult,
  pathOrHref: string,
): OperatorContext {
  const surface = operatorSurfaceForPath(pathOrHref)
  if (result.kind !== 'authorized' || !result.allowedSurfaces.includes(surface)) {
    throw new OperatorSurfaceForbiddenError(surface)
  }
  return result
}
