import { captureServerEvent } from '@/lib/observability/posthog.server'
import { captureServerException } from '@/lib/observability/sentry.server'
import type {
  AdminCommandAction,
  AdminExceptionKind,
  AdminObjectKind,
} from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { PrincipalRef } from '@/modules/principal-account/principal/public'
import type { AdminAction } from '@/modules/security/public'

type AdminCommandEventProperties = Readonly<{
  ae_action: AdminCommandAction
  ae_permission: AdminAction
  ae_outcome: 'completed' | 'proposed' | 'refused'
  $process_person_profile: false
}>

type AdminLookupEventProperties = Readonly<{
  ae_ref_kind: AdminObjectKind
  ae_found: boolean
  $process_person_profile: false
}>

type AdminQueueEventProperties = Readonly<{
  ae_queue_kind: AdminExceptionKind | 'all'
  $process_person_profile: false
}>

export type AdminEventProperties =
  | AdminCommandEventProperties
  | AdminLookupEventProperties
  | AdminQueueEventProperties

export function buildAdminEventProperties(
  event: 'admin_command',
  input: Readonly<{
    action: AdminCommandAction
    permission: AdminAction
    outcome: 'completed' | 'proposed' | 'refused'
  }>,
): AdminEventProperties
export function buildAdminEventProperties(
  event: 'admin_lookup',
  input: Readonly<{ refKind: AdminObjectKind; found: boolean }>,
): AdminEventProperties
export function buildAdminEventProperties(
  event: 'admin_queue_view',
  input: Readonly<{ kind: AdminExceptionKind | 'all' }>,
): AdminEventProperties
export function buildAdminEventProperties(
  ...args:
    | readonly [event: 'admin_command', input: Readonly<{
      action: AdminCommandAction
      permission: AdminAction
      outcome: 'completed' | 'proposed' | 'refused'
    }>]
    | readonly [event: 'admin_lookup', input: Readonly<{
      refKind: AdminObjectKind
      found: boolean
    }>]
    | readonly [event: 'admin_queue_view', input: Readonly<{
      kind: AdminExceptionKind | 'all'
    }>]
): AdminEventProperties {
  if (args[0] === 'admin_command') {
    return {
      ae_action: args[1].action,
      ae_permission: args[1].permission,
      ae_outcome: args[1].outcome,
      $process_person_profile: false,
    }
  }
  if (args[0] === 'admin_lookup') {
    return {
      ae_ref_kind: args[1].refKind,
      ae_found: args[1].found,
      $process_person_profile: false,
    }
  }
  return {
    ae_queue_kind: args[1].kind,
    $process_person_profile: false,
  }
}

export function captureAdminEvent(
  actorPrincipalRef: PrincipalRef,
  event: 'admin_command' | 'admin_lookup' | 'admin_queue_view',
  props: AdminEventProperties,
): void {
  const distinctId = `admin:${canonicalDigest(actorPrincipalRef)}`
  captureServerEvent(distinctId, event, props)
}

export function reportAdminInvariant(error: Error): void {
  captureServerException(error)
}
