import { v } from 'convex/values'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'

const credentialLifecycle = v.union(
  v.literal('active'),
  v.literal('stale'),
  v.literal('revoked'),
)

export const directoryRecord = v.object({
  principalRef: v.string(),
  principalRevision: v.number(),
  displayName: v.string(),
  applicationRef: v.string(),
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  currentProviderCredentialId: v.string(),
  lastSeenAt: v.number(),
  status: v.union(v.literal('connected'), v.literal('attention'), v.literal('expired'), v.literal('disconnected')),
  admissionLifecycle: v.union(v.literal('active'), v.literal('revoked'), v.literal('expired')),
  authorityMode: v.union(v.literal('read_only'), v.literal('approval_required'), v.literal('spending_policy'), v.literal('unrestricted_test_only')),
  scopes: v.array(v.string()),
  credentialHistoryTruncated: v.boolean(),
  credentials: v.array(v.object({
    credentialRef: v.string(),
    providerCredentialId: v.string(),
    generation: v.number(),
    lifecycle: credentialLifecycle,
    predecessorCredentialRef: v.optional(v.string()),
    issuedAt: v.number(),
    expiresAt: v.number(),
    lastAuthenticatedAt: v.optional(v.number()),
  })),
})

export const listOwnedArgs = { now: v.number() }
export const listOwnedResult = v.array(directoryRecord)
export const listOwnedPageArgs = { now: v.number(), paginationOpts: paginationOptsValidator }
export const listOwnedPageResult = paginationResultValidator(directoryRecord)
