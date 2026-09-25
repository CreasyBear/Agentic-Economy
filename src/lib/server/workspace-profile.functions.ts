import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

export type WorkspaceOrganizationBinding = Readonly<{
  accountRef: string
  displayName: string
  accountRevision: number
  callerIsOwner: boolean
  clerkOrgId: string | null
  ownerDisplayName: string
  ownerClerkUserId: string | null
}>
const readWorkspaceOrganizationBinding = sourceQuery<Record<string, never>, WorkspaceOrganizationBinding>(
  'workspaceAccounts:readWorkspaceOrganizationBinding',
)

const renameSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).regex(/^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u),
})
export const readPersonalWorkspaceDefaultNameServer = createServerFn().handler(async (): Promise<string | null> => {
  const binding = await callSourceQuery(readWorkspaceOrganizationBinding, {})
  if (binding.clerkOrgId !== null || !binding.displayName.startsWith('user_')) return null
  if (!binding.ownerDisplayName.startsWith('user_')) return `${binding.ownerDisplayName}'s workspace`
  if (binding.ownerClerkUserId === null) return 'Your workspace'
  const owner = await clerkClient().users.getUser(binding.ownerClerkUserId)
  const displayName = [owner.firstName, owner.lastName].filter(Boolean).join(' ')
    || owner.username || owner.emailAddresses[0]?.emailAddress.split('@')[0] || 'Your'
  return `${displayName}'s workspace`
})

type RenameWorkspaceResult =
  | Readonly<{ kind: 'accepted'; name: string }>
  | Readonly<{ kind: 'refused'; code: 'forbidden' | 'source_unavailable' }>

/** A Clerk rename is the sole writer; its webhook advances the AE account name. */
export async function renameWorkspaceThroughClerk(
  name: string,
  activeOrgId: string | null | undefined,
  readBinding: () => Promise<WorkspaceOrganizationBinding>,
  updateOrganization: (organizationId: string, name: string) => Promise<void>,
): Promise<RenameWorkspaceResult> {
  if (!activeOrgId) return { kind: 'refused', code: 'forbidden' }
  const binding = await readBinding()
  if (!binding.callerIsOwner || binding.clerkOrgId !== activeOrgId) {
    return { kind: 'refused', code: 'forbidden' }
  }
  if (binding.displayName !== name) await updateOrganization(activeOrgId, name)
  return { kind: 'accepted', name }
}

export const renameWorkspaceServer = createServerFn({ method: 'POST' })
  .validator((data) => renameSchema.parse(data))
  .handler(async ({ data }): Promise<RenameWorkspaceResult> => {
    const session = await auth()
    if (!session.isAuthenticated || !session.userId) return { kind: 'refused', code: 'forbidden' }
    try {
      return await renameWorkspaceThroughClerk(
        data.name,
        session.orgId,
        () => callSourceQuery(readWorkspaceOrganizationBinding, {}),
        async (organizationId, name) => { await clerkClient().organizations.updateOrganization(organizationId, { name }) },
      )
    } catch (cause) {
      captureRouteException(cause, { site: 'renameWorkspaceServer' })
      return { kind: 'refused', code: 'source_unavailable' }
    }
  })
