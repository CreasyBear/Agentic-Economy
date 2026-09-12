export type OperatorRole = 'owner' | 'admin' | 'developer'

export const roleHomeHref: Record<OperatorRole, string> = {
  owner: '/owner/offerings',
  admin: '/admin/index-health',
  developer: '/developers/discovery',
}

export const roleLabel: Record<OperatorRole, string> = {
  owner: 'Buy and supply',
  admin: 'Administration',
  developer: 'Developer tools',
}

/** Derives the operator role from a pathname prefix, for chrome (404, pending, error) that renders before a route's own operatorRole is known. */
export function operatorRoleForPath(pathname: string): OperatorRole | undefined {
  if (pathname.startsWith('/owner')) {
    return 'owner'
  }

  if (pathname.startsWith('/admin')) {
    return 'admin'
  }

  if (pathname.startsWith('/developers')) {
    return 'developer'
  }

  return undefined
}

export type OwnerWorkspaceOwner = 'operations' | 'account' | undefined

export function ownerWorkspaceOwnerForPath(pathname: string): OwnerWorkspaceOwner {
  if (pathname === '/owner/offerings' || pathname.startsWith('/owner/offerings/')) return 'operations'
  if (pathname === '/owner/supply' || pathname.startsWith('/owner/supply/')) return 'operations'
  if (pathname === '/owner/settings') return 'account'
  return undefined
}

export type OperatorNavBadgeValue = number | string | null | undefined

export type OperatorNavBadges = Partial<Record<string, OperatorNavBadgeValue>>
