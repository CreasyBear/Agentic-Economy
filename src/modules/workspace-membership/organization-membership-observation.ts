import {
  callPublicSourceMutation,
  createConvexServerFunctionAssertion,
  sourceMutation,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'

export const ORGANIZATION_MEMBERSHIP_CREATED_OPERATION =
  'workspaceMemberships.recordOrganizationMembershipCreatedForServer'
export const ORGANIZATION_MEMBERSHIP_CREATED_SCOPE =
  'workspace:record_organization_membership_created'

export const ORGANIZATION_MEMBERSHIP_UPDATED_OPERATION =
  'workspaceMemberships.recordOrganizationMembershipUpdatedForServer'
export const ORGANIZATION_MEMBERSHIP_UPDATED_SCOPE =
  'workspace:record_organization_membership_updated'

export const ORGANIZATION_MEMBERSHIP_DELETED_OPERATION =
  'workspaceMemberships.recordOrganizationMembershipDeletedForServer'
export const ORGANIZATION_MEMBERSHIP_DELETED_SCOPE =
  'workspace:record_organization_membership_deleted'

export type OrganizationMembershipRole = 'org:admin' | 'org:member'

export type OrganizationMembershipCreatedObservation = Readonly<{
  clerkOrgId: string
  providerIdentifier: string
  deliveryRefHash: string
  membershipRefHash: string
  role: OrganizationMembershipRole
  observedAt: number
}>

export type OrganizationMembershipUpdatedObservation = OrganizationMembershipCreatedObservation

export type OrganizationMembershipDeletedObservation = OrganizationMembershipCreatedObservation

export type OrganizationMembershipCreatedObservationResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' | 'identity_binding_missing' }
>

export type OrganizationMembershipUpdatedObservationResult = OrganizationMembershipCreatedObservationResult

export type OrganizationMembershipDeletedObservationResult = OrganizationMembershipCreatedObservationResult

type RecordOrganizationMembershipCreatedArgs = OrganizationMembershipCreatedObservation & Readonly<{
  serviceAuth: ConvexServerFunctionAssertion
}>

const recordOrganizationMembershipCreatedMutation = sourceMutation<
  RecordOrganizationMembershipCreatedArgs,
  OrganizationMembershipCreatedObservationResult
>('workspaceMemberships:recordOrganizationMembershipCreatedForServer')

export async function recordOrganizationMembershipCreatedThroughSource(
  command: OrganizationMembershipCreatedObservation,
): Promise<OrganizationMembershipCreatedObservationResult> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: ORGANIZATION_MEMBERSHIP_CREATED_OPERATION,
    scope: ORGANIZATION_MEMBERSHIP_CREATED_SCOPE,
    command,
  })
  return await callPublicSourceMutation(recordOrganizationMembershipCreatedMutation, {
    ...command,
    serviceAuth,
  })
}

type RecordOrganizationMembershipUpdatedArgs = OrganizationMembershipUpdatedObservation & Readonly<{
  serviceAuth: ConvexServerFunctionAssertion
}>

const recordOrganizationMembershipUpdatedMutation = sourceMutation<
  RecordOrganizationMembershipUpdatedArgs,
  OrganizationMembershipUpdatedObservationResult
>('workspaceMemberships:recordOrganizationMembershipUpdatedForServer')

export async function recordOrganizationMembershipUpdatedThroughSource(
  command: OrganizationMembershipUpdatedObservation,
): Promise<OrganizationMembershipUpdatedObservationResult> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: ORGANIZATION_MEMBERSHIP_UPDATED_OPERATION,
    scope: ORGANIZATION_MEMBERSHIP_UPDATED_SCOPE,
    command,
  })
  return await callPublicSourceMutation(recordOrganizationMembershipUpdatedMutation, {
    ...command,
    serviceAuth,
  })
}

type RecordOrganizationMembershipDeletedArgs = OrganizationMembershipDeletedObservation & Readonly<{
  serviceAuth: ConvexServerFunctionAssertion
}>

const recordOrganizationMembershipDeletedMutation = sourceMutation<
  RecordOrganizationMembershipDeletedArgs,
  OrganizationMembershipDeletedObservationResult
>('workspaceMemberships:recordOrganizationMembershipDeletedForServer')

export async function recordOrganizationMembershipDeletedThroughSource(
  command: OrganizationMembershipDeletedObservation,
): Promise<OrganizationMembershipDeletedObservationResult> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: ORGANIZATION_MEMBERSHIP_DELETED_OPERATION,
    scope: ORGANIZATION_MEMBERSHIP_DELETED_SCOPE,
    command,
  })
  return await callPublicSourceMutation(recordOrganizationMembershipDeletedMutation, {
    ...command,
    serviceAuth,
  })
}
