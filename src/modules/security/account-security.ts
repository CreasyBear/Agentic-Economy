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
] as const

export const CLERK_SECURITY_OBSERVE_OPERATION = 'securityAccountHistory.recordClerkSecurityEventForServer'
export const CLERK_SECURITY_OBSERVE_SCOPE = 'account_security:observe'

export type ClerkSecurityEventType = (typeof CLERK_SECURITY_EVENT_TYPES)[number]

/** Redacted, signed command accepted from the maintained Clerk webhook adapter. */
export type ClerkSecurityObservation = Readonly<{
  deliveryRefHash: string
  providerIdentifier: string
  eventType: ClerkSecurityEventType
  targetRefHash: string
  observedAt: number
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
