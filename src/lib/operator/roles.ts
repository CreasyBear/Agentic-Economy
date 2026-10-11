export type OperatorRole = 'owner' | 'admin' | 'developer'



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

export type OwnerWorkspaceOwner = 'operations' | 'account' | 'workspace' | 'team' | undefined

export function ownerWorkspaceOwnerForPath(pathname: string): OwnerWorkspaceOwner {
  if (pathname === '/owner/operations' || pathname.startsWith('/owner/operations/')) return 'operations'
  if (pathname === '/owner/supply' || pathname.startsWith('/owner/supply/')) return 'operations'
  if (pathname === '/owner/settings/workspace' || pathname.startsWith('/owner/settings/workspace/')) return 'workspace'
  if (pathname === '/owner/settings/team' || pathname.startsWith('/owner/settings/team/')) return 'team'
  if (pathname === '/owner/settings') return 'account'
  return undefined
}
