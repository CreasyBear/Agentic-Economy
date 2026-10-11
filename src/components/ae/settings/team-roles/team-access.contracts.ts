export type PendingTeamInvitation = Readonly<{
  invitationId: string; email: string; role: 'org:admin' | 'org:member'; updatedAt: number; expiresAt: number
}>
export type TeamAccessMember = Readonly<{
  membershipRef: string; revision: number; userId: string; name: string; role: 'admin' | 'member'; upstreamUpdatedAt: number
}>
export type TeamAccessView = Readonly<{
  accountRef: string; accountRevision: number; ownershipRevision: number
  canManageMembers: boolean; canManageInvitations: boolean
  members: readonly TeamAccessMember[]; invitations: readonly PendingTeamInvitation[]
  membersComplete: boolean; nextMemberOffset: number | null
  invitationsComplete: boolean; nextInvitationOffset: number | null
}>
export type TeamAccessResult = Readonly<{ kind: 'accepted' }> | Readonly<{
  kind: 'refused'; code: 'forbidden' | 'stale' | 'mfa_reverification_required' | 'last_admin' | 'last_owner' | 'source_unavailable'
}>
