import { v, type Infer } from 'convex/values'
import { serviceAssertion } from '../../../serviceAssertion'

const recordOrganizationInvitationInput = {
  clerkOrgId: v.string(),
  deliveryRefHash: v.string(),
  invitationRefHash: v.string(),
  emailHash: v.string(),
  role: v.union(v.literal('org:admin'), v.literal('org:member')),
  observedAt: v.number(),
  expiresAt: v.optional(v.number()),
  status: v.optional(v.string()),
}

export const CLERK_ORG_INVITATION_ACTOR_REF = 'ae:clerk-organization-invitation'

type WorkspaceInvitationErrorCode = 'authority_conflict'

export class WorkspaceInvitationError extends Error {
  readonly code: WorkspaceInvitationErrorCode

  constructor(code: WorkspaceInvitationErrorCode) {
    super(code)
    this.name = 'WorkspaceInvitationError'
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
    code: v.literal('authority_conflict'),
  }),
)

export type RecordResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' }
>

export type RecordCommand = Readonly<{
  clerkOrgId: string
  deliveryRefHash: string
  invitationRefHash: string
  emailHash: string
  role: 'org:admin' | 'org:member'
  observedAt: number
  expiresAt?: number
  status?: string
}>

const recordArgs = { ...recordOrganizationInvitationInput, serviceAuth: serviceAssertion }
export type RecordArgs = RecordCommand & Readonly<{ serviceAuth: Infer<typeof serviceAssertion> }>
export const recordOrganizationInvitationCreatedForServerArgs = recordArgs
export const recordOrganizationInvitationCreatedForServerResult = recordResultValue
export const recordOrganizationInvitationRevokedForServerArgs = recordArgs
export const recordOrganizationInvitationRevokedForServerResult = recordResultValue
