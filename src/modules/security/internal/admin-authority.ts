import type { AdminAction, AdminMembership, AdminRole } from '@/modules/security/public'

export const AdminActionMatrix = {
  owner_admin: {
    read_admin_readbacks: true,
    annotate_triage: true,
    manage_admin_membership: true,
    use_break_glass: true,
    change_public_visibility: true,
    close_dispute: true,
    set_operator_control: true,
  },
  support: {
    read_admin_readbacks: true,
    annotate_triage: true,
    manage_admin_membership: false,
    use_break_glass: false,
    change_public_visibility: false,
    close_dispute: false,
    set_operator_control: false,
  },
  reviewer: {
    read_admin_readbacks: true,
    annotate_triage: false,
    manage_admin_membership: false,
    use_break_glass: false,
    change_public_visibility: false,
    close_dispute: false,
    set_operator_control: false,
  },
} satisfies Record<AdminRole, Record<AdminAction, boolean>>

export type AdminAuthorityResult =
  | { kind: 'allowed'; membership: AdminMembership }
  | { kind: 'denied'; reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed' }

export function requireAdminAuthority(membership: AdminMembership | undefined, action: AdminAction): AdminAuthorityResult {
  if (membership === undefined) {
    return { kind: 'denied', reason: 'missing_membership' }
  }

  if (membership.state !== 'active') {
    return { kind: 'denied', reason: 'inactive_membership' }
  }

  if (!AdminActionMatrix[membership.role][action]) {
    return { kind: 'denied', reason: 'action_not_allowed' }
  }

  return { kind: 'allowed', membership }
}

export type AdminBootstrapConfig = {
  authorizedClerkUserIds: readonly string[]
  activeOwnerAdminCount: number
}

export function canBootstrapOwnerAdmin(clerkUserId: string, config: AdminBootstrapConfig): boolean {
  return config.activeOwnerAdminCount === 0 && config.authorizedClerkUserIds.includes(clerkUserId)
}
