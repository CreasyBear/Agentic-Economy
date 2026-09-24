import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'

import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'

export type WorkspaceHeaderIdentity = Readonly<{
  accountRef: string
  displayName: string
  callerIsOwner: boolean
  clerkOrgId: string | null
}>

const readWorkspaceOrganizationBinding = sourceQuery<Record<string, never>, WorkspaceHeaderIdentity>(
  'workspaceAccounts:readWorkspaceOrganizationBinding',
)

export const readWorkspaceHeaderIdentityServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<WorkspaceHeaderIdentity | null> => {
    try {
      const session = await auth()
      if (!session.isAuthenticated) return null
      return await callSourceQuery(readWorkspaceOrganizationBinding, {})
    } catch (cause) {
      captureRouteException(cause, { site: 'readWorkspaceHeaderIdentityServer' })
      return null
    }
  })
