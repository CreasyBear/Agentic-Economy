import { z } from 'zod'

import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'

const opaqueRef = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u)
export const adminCommandRecoveryIdentitySchema = z.strictObject({
  action: z.enum(Object.keys(ADMIN_ACTION_PERMISSION) as [keyof typeof ADMIN_ACTION_PERMISSION, ...(keyof typeof ADMIN_ACTION_PERMISSION)[]]),
  operationKey: opaqueRef,
  correlationId: opaqueRef,
})
export type AdminCommandRecoveryIdentity = z.infer<typeof adminCommandRecoveryIdentitySchema>
const identitiesSchema = z.array(adminCommandRecoveryIdentitySchema).max(20)
const changedEvent = 'ae:admin-command-recovery-changed'

/** Storage contains only opaque identity, scoped to deployment and authenticated actor.
 * A missing receipt never proves that the original command had no effect. */
export function adminCommandRecoveryScope(actorRef: string, deployment = import.meta.env.VITE_AE_ADMIN_RECOVERY_DEPLOYMENT_URL?.trim() || import.meta.env.VITE_CONVEX_URL || ''): string {
  return `ae.admin-command-recovery.v1.${encodeURIComponent(deployment)}.${encodeURIComponent(actorRef)}`
}

export function readAdminCommandRecovery(scope: string): readonly AdminCommandRecoveryIdentity[] {
  try {
    const raw = window.localStorage.getItem(scope)
    if (raw === null) return []
    const parsed = identitiesSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch { return [] }
}

export function retainAdminCommandRecovery(scope: string, identity: AdminCommandRecoveryIdentity): boolean {
  try {
    const validated = adminCommandRecoveryIdentitySchema.parse(identity)
    const raw = window.localStorage.getItem(scope)
    // Invalid/unreadable data is not permission to overwrite an unresolved identity.
    const previous = raw === null ? [] : identitiesSchema.parse(JSON.parse(raw))
    const existing = previous.find(entry => entry.action === validated.action && entry.operationKey === validated.operationKey)
    if (existing !== undefined && existing.correlationId !== validated.correlationId) return false
    const next = existing === undefined ? [...previous, validated] : previous
    window.localStorage.setItem(scope, JSON.stringify(identitiesSchema.parse(next)))
    if (window.localStorage.getItem(scope) !== JSON.stringify(next)) return false
    window.dispatchEvent(new Event(changedEvent))
    return true
  } catch { return false }
}

export function forgetAdminCommandRecovery(scope: string, identity: AdminCommandRecoveryIdentity): boolean {
  try {
    const raw = window.localStorage.getItem(scope)
    const previous = raw === null ? [] : identitiesSchema.parse(JSON.parse(raw))
    const next = previous.filter(entry => entry.action !== identity.action
      || entry.operationKey !== identity.operationKey || entry.correlationId !== identity.correlationId)
    window.localStorage.setItem(scope, JSON.stringify(next))
    window.dispatchEvent(new Event(changedEvent))
    return true
  } catch { return false }
}

export function subscribeAdminCommandRecovery(listener: () => void): () => void {
  window.addEventListener('storage', listener)
  window.addEventListener(changedEvent, listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener(changedEvent, listener)
  }
}
