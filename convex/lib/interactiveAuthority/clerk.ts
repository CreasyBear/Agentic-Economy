import type { UserIdentity } from 'convex/server'

export type InteractiveAccountSelectionState =
  | 'unique'
  | 'selected'
  | 'org_bound'
  | 'selection_required'

export function clerkActiveOrganizationId(identity: UserIdentity): string | null {
  const record = identity as UserIdentity & Record<string, unknown> & { o?: { id?: unknown } }
  const candidate = identity.org_id ?? record['o.id'] ?? record.o?.id
  if (typeof candidate !== 'string') return null
  const trimmed = candidate.trim()
  return trimmed.length > 0 ? trimmed : null
}
