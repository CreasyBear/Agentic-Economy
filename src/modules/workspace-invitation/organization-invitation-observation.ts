import {
  callPublicSourceMutation,
  createConvexServerFunctionAssertion,
  sourceMutation,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'

export const ORGANIZATION_INVITATION_CREATED_OPERATION =
  'workspaceInvitations.recordOrganizationInvitationCreatedForServer'
export const ORGANIZATION_INVITATION_CREATED_SCOPE =
  'workspace:record_organization_invitation_created'

export const ORGANIZATION_INVITATION_REVOKED_OPERATION =
  'workspaceInvitations.recordOrganizationInvitationRevokedForServer'
export const ORGANIZATION_INVITATION_REVOKED_SCOPE =
  'workspace:record_organization_invitation_revoked'

export type OrganizationInvitationRole = 'org:admin' | 'org:member'

export type OrganizationInvitationCreatedObservation = Readonly<{
  clerkOrgId: string
  deliveryRefHash: string
  invitationRefHash: string
  emailHash: string
  role: OrganizationInvitationRole
  status?: 'pending'
  observedAt: number
  expiresAt?: number
}>

export type OrganizationInvitationRevokedObservation = OrganizationInvitationCreatedObservation

export type OrganizationInvitationCreatedObservationResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' }
>

export type OrganizationInvitationRevokedObservationResult = OrganizationInvitationCreatedObservationResult

type RecordOrganizationInvitationCreatedArgs = OrganizationInvitationCreatedObservation & Readonly<{
  serviceAuth: ConvexServerFunctionAssertion
}>

const recordOrganizationInvitationCreatedMutation = sourceMutation<
  RecordOrganizationInvitationCreatedArgs,
  OrganizationInvitationCreatedObservationResult
>('workspaceInvitations:recordOrganizationInvitationCreatedForServer')

export async function recordOrganizationInvitationCreatedThroughSource(
  command: OrganizationInvitationCreatedObservation,
): Promise<OrganizationInvitationCreatedObservationResult> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: ORGANIZATION_INVITATION_CREATED_OPERATION,
    scope: ORGANIZATION_INVITATION_CREATED_SCOPE,
    command,
  })
  return await callPublicSourceMutation(recordOrganizationInvitationCreatedMutation, {
    ...command,
    serviceAuth,
  })
}

type RecordOrganizationInvitationRevokedArgs = OrganizationInvitationRevokedObservation & Readonly<{
  serviceAuth: ConvexServerFunctionAssertion
}>

const recordOrganizationInvitationRevokedMutation = sourceMutation<
  RecordOrganizationInvitationRevokedArgs,
  OrganizationInvitationRevokedObservationResult
>('workspaceInvitations:recordOrganizationInvitationRevokedForServer')

export async function recordOrganizationInvitationRevokedThroughSource(
  command: OrganizationInvitationRevokedObservation,
): Promise<OrganizationInvitationRevokedObservationResult> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: ORGANIZATION_INVITATION_REVOKED_OPERATION,
    scope: ORGANIZATION_INVITATION_REVOKED_SCOPE,
    command,
  })
  return await callPublicSourceMutation(recordOrganizationInvitationRevokedMutation, {
    ...command,
    serviceAuth,
  })
}
