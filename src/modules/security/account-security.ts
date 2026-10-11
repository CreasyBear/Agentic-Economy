import type {
  ActorKind,
  AuditSourceSystem,
  AuditTargetType,
  Package3AuditEventType,
} from '@/modules/common/audit-events'

export const CLERK_SECURITY_EVENT_TYPES = [
  'session.created',
  'session.ended',
  'session.revoked',
  'user.updated',
  'user.deleted',
] as const

export const CLERK_SECURITY_OBSERVE_OPERATION = 'securityAccountHistory.recordClerkSecurityEventForServer'
export const CLERK_SECURITY_OBSERVE_SCOPE = 'account_security:observe'

export const PERSONAL_ACCOUNT_RETIRE_OPERATION = 'personalAccount.retirePersonalAccountForServer'
export const PERSONAL_ACCOUNT_RETIRE_SCOPE = 'personal_account:retire_for_server'

export const CLERK_SECURITY_ACTIONS = [
  'observe_only',
  'revoke_interactive_credentials',
  'retire_personal_account',
] as const

export type ClerkSecurityEventType = (typeof CLERK_SECURITY_EVENT_TYPES)[number]
export type ClerkSecurityAction = (typeof CLERK_SECURITY_ACTIONS)[number]

/** Redacted, signed command accepted from the maintained Clerk webhook adapter. */
export type ClerkSecurityObservation = Readonly<{
  deliveryRefHash: string
  providerIdentifier: string
  eventType: ClerkSecurityEventType
  targetRefHash: string
  observedAt: number
  /** Set by the Clerk webhook adapter once W-03 projection is implemented. */
  securityAction?: ClerkSecurityAction
  /** Redacted display name from Clerk profile fields when a name change is observed. */
  profileDisplayName?: string
  /** Digest of the primary email, so convex can notice a change without storing the address. */
  primaryEmailDigest?: string
}>

export type ClerkSecurityObservationResult =
  | Readonly<{ kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored'; eventRef?: string }>
  | Readonly<{ kind: 'refused'; code: 'authentication_required' | 'authority_conflict' | 'event_conflict' }>

export type AccountSecurityHistoryItem = Readonly<{
  eventRef: string
  eventType: Package3AuditEventType
  actorKind: ActorKind
  actorRef: string
  targetType: AuditTargetType
  targetRef: string
  outcome: string
  sourceSystem: AuditSourceSystem
  observedAt?: number
  recordedAt: number
  correlationRef: string
}>

export type AccountSecurityHistoryPage = Readonly<{
  items: readonly AccountSecurityHistoryItem[]
  continueCursor: string
  isDone: boolean
}>

export type AccountSecurityHistoryResult =
  | Readonly<{ kind: 'available'; page: AccountSecurityHistoryPage }>
  | Readonly<{ kind: 'unavailable'; reason: 'authentication_required' | 'source_unavailable' }>

export function emptyAccountSecurityHistory(): AccountSecurityHistoryPage {
  return Object.freeze({ items: Object.freeze([]), continueCursor: '', isDone: true })
}

/** Preserve the first observed event when native pages repeat their boundary. */
export function appendAccountSecurityHistoryPage(
  current: AccountSecurityHistoryPage,
  next: AccountSecurityHistoryPage,
): AccountSecurityHistoryPage {
  const seen = new Set(current.items.map((item) => item.eventRef))
  return {
    ...next,
    items: [...current.items, ...next.items.filter((item) => {
      if (seen.has(item.eventRef)) return false
      seen.add(item.eventRef)
      return true
    })],
  }
}
