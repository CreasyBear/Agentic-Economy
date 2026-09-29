import { useAuth, useUser } from '@clerk/tanstack-react-start'
import { useEffect, useState } from 'react'

import { appendWorkspaceSuffix } from '@/lib/workspace-label'
import { readWorkspaceHeaderIdentityServer, type WorkspaceHeaderIdentity } from './workspace-identity.functions'

export type AeWorkspaceIdentityProps = Readonly<{ inMenu?: boolean }>

export function AeWorkspaceIdentity({ inMenu = false }: AeWorkspaceIdentityProps) {
  const { orgId, isLoaded } = useAuth()
  const { user } = useUser()
  const [workspace, setWorkspace] = useState<WorkspaceHeaderIdentity | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    let active = true
    setWorkspace(null)
    readWorkspaceHeaderIdentityServer().then(
      (result) => { if (active) setWorkspace(result) },
      (cause) => { if (active) console.warn('Workspace name unavailable', cause) },
    )
    return () => { active = false }
  }, [isLoaded, orgId])

  const displayName = workspace?.displayName.trim()
  const safeName = displayName && displayName !== workspace?.accountRef
    && !/^(?:user|account|principal)_[\w-]+$/.test(displayName)
    ? displayName : undefined
  const personName = workspace?.callerIsOwner ? user?.fullName?.trim() : undefined
  const name = workspace === null ? 'Workspace' : workspace.clerkOrgId
    ? safeName ?? 'Workspace'
    : personName ? appendWorkspaceSuffix(personName) : safeName ?? 'Personal workspace'
  return <span aria-label={`Workspace: ${name}`} title={name} className={inMenu ? 'block max-w-48 truncate px-2 text-xs font-medium text-foreground lg:hidden' : 'hidden min-w-0 max-w-28 truncate text-xs font-medium text-foreground lg:block xl:max-w-48'}>{name}</span>

}
