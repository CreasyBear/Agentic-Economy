export type OperatorRole = 'owner' | 'admin' | 'developer'

export const roleHomeHref: Record<OperatorRole, string> = {
  owner: '/owner',
  admin: '/admin/index-health',
  developer: '/developers/discovery',
}

export const roleLabel: Record<OperatorRole, string> = {
  owner: 'Workspace',
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

export type OwnerWorkspaceOwner = 'operations' | 'account' | 'workspace' | 'team' | undefined

export function ownerWorkspaceOwnerForPath(pathname: string): OwnerWorkspaceOwner {
  if (pathname === '/owner/operations' || pathname.startsWith('/owner/operations/')) return 'operations'
  if (pathname === '/owner/supply' || pathname.startsWith('/owner/supply/')) return 'operations'
  if (pathname === '/owner/workspace' || pathname.startsWith('/owner/workspace/')) return 'workspace'
  if (pathname === '/owner/team' || pathname.startsWith('/owner/team/')) return 'team'
  if (pathname === '/owner/settings') return 'account'
  return undefined
}

export type OperatorNavBadgeValue = number | string | null | undefined

export type OperatorNavBadges = Partial<Record<string, OperatorNavBadgeValue>>

/** Buyer-facing operator routes use the app header only (`DS-37`). */
export function ownerBuyerOperatorSurfaceForPath(pathname: string): boolean {
  if (pathname === '/activity' || pathname.startsWith('/activity/')) return true
  if (pathname === '/calls' || pathname.startsWith('/calls/')) return true
  if (pathname === '/agent-access' || pathname.startsWith('/agent-access/')) return true
  if (pathname === '/owner' || pathname.startsWith('/owner/')) return true
  return false
}

export function shouldMountOperatorSidebar(operatorRole: OperatorRole, pathname: string): boolean {
  if (operatorRole === 'owner') {
    return !ownerBuyerOperatorSurfaceForPath(pathname)
  }
  return true
}
