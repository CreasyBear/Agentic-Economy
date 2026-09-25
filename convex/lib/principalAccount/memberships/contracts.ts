import { v, type Infer } from 'convex/values'
import { serviceAssertion } from '../../../serviceAssertion'

const recordOrganizationMembershipInput = {
  clerkOrgId: v.string(),
  providerIdentifier: v.string(),
  deliveryRefHash: v.string(),
  membershipRefHash: v.string(),
  role: v.union(v.literal('org:admin'), v.literal('org:member')),
  observedAt: v.number(),
}

export const CLERK_ORG_MEMBERSHIP_ACTOR_REF = 'ae:clerk-organization-membership'

type WorkspaceMembershipErrorCode = 'authority_conflict'

export class WorkspaceMembershipError extends Error {
  readonly code: WorkspaceMembershipErrorCode

  constructor(code: WorkspaceMembershipErrorCode) {
    super(code)
    this.name = 'WorkspaceMembershipError'
    this.code = code
  }
}

const recordResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(v.literal('authority_conflict'), v.literal('identity_binding_missing')),
  }),
)

export type RecordResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' | 'identity_binding_missing' }
>

export type RecordCommand = Readonly<{
  clerkOrgId: string
  providerIdentifier: string
  deliveryRefHash: string
  membershipRefHash: string
  role: 'org:admin' | 'org:member'
  observedAt: number
}>

const recordArgs = { ...recordOrganizationMembershipInput, serviceAuth: serviceAssertion }
export type RecordArgs = RecordCommand & Readonly<{ serviceAuth: Infer<typeof serviceAssertion> }>
export const recordOrganizationMembershipCreatedForServerArgs = recordArgs
export const recordOrganizationMembershipCreatedForServerResult = recordResultValue
export const recordOrganizationMembershipUpdatedForServerArgs = recordArgs
export const recordOrganizationMembershipUpdatedForServerResult = recordResultValue
export const recordOrganizationMembershipDeletedForServerArgs = recordArgs
export const recordOrganizationMembershipDeletedForServerResult = recordResultValue
