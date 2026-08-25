import {
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from 'convex/server'
import { v } from 'convex/values'

import {
  advanceLeaseDrainArgs,
  advanceLeaseDrainHandler,
  beginRevocationArgs,
  beginRevocationHandler,
  cleanupTargetValue,
  commandResult,
  connectionAuthorityValidation,
  connectionValue,
  createArgs,
  createHandler,
  credentialResolution,
  listByBusinessLifecycleArgs,
  listByBusinessLifecycleHandler,
  listByProviderLifecycleArgs,
  listByProviderLifecycleHandler,
  readArgs,
  readAtGenerationArgs,
  readAtGenerationHandler,
  readCleanupTargetArgs,
  readCleanupTargetHandler,
  readHandler,
  reauthorizeArgs,
  reauthorizeHandler,
  recordCleanupResultArgs,
  recordCleanupResultHandler,
  resolveCredentialRefArgs,
  resolveCredentialRefHandler,
  validateAuthorityArgs,
  validateAuthorityHandler,
} from './capabilityProviderConnectionLifecycle'
import {
  consumeLeaseArgs,
  consumeLeaseHandler,
  expireLeaseArgs,
  expireLeaseHandler,
  invalidateLeaseArgs,
  invalidateLeaseHandler,
  issueLeaseArgs,
  issueLeaseHandler,
  leaseAuthorityValidation,
  leaseCredentialResolution,
  leaseResult,
  leaseValue,
  readLeaseArgs,
  readLeaseByInvocationArgs,
  readLeaseByInvocationHandler,
  readLeaseHandler,
  resolveLeaseCredentialRefArgs,
  resolveLeaseCredentialRefHandler,
  validateLeaseAuthorityArgs,
  validateLeaseAuthorityHandler,
} from './capabilityProviderConnectionLeases'
import {
  connectX402OwnerArgs,
  connectX402OwnerHandler,
  listOwnerArgs,
  listOwnerHandler,
  ownerCommandResult,
  ownerProjection,
  readOwnerArgs,
  readOwnerHandler,
  reauthorizeOwnerArgs,
  reauthorizeOwnerHandler,
  retryOwnerCleanupArgs,
  retryOwnerCleanupHandler,
  revokeOwnerArgs,
  revokeOwnerHandler,
} from './capabilityProviderConnectionOwner'

export const advanceLeaseDrain = internalMutationGeneric({
  args: advanceLeaseDrainArgs,
  returns: v.null(),
  handler: advanceLeaseDrainHandler,
})

export const create = internalMutationGeneric({
  args: createArgs,
  returns: commandResult,
  handler: createHandler,
})

export const reauthorize = internalMutationGeneric({
  args: reauthorizeArgs,
  returns: commandResult,
  handler: reauthorizeHandler,
})

export const beginRevocation = internalMutationGeneric({
  args: beginRevocationArgs,
  returns: commandResult,
  handler: beginRevocationHandler,
})

export const recordCleanupResult = internalMutationGeneric({
  args: recordCleanupResultArgs,
  returns: commandResult,
  handler: recordCleanupResultHandler,
})

export const read = internalQueryGeneric({
  args: readArgs,
  returns: v.union(connectionValue, v.null()),
  handler: readHandler,
})

export const readCleanupTarget = internalQueryGeneric({
  args: readCleanupTargetArgs,
  returns: v.union(cleanupTargetValue, v.null()),
  handler: readCleanupTargetHandler,
})

export const listByBusinessLifecycle = internalQueryGeneric({
  args: listByBusinessLifecycleArgs,
  returns: v.array(connectionValue),
  handler: listByBusinessLifecycleHandler,
})

export const listByProviderLifecycle = internalQueryGeneric({
  args: listByProviderLifecycleArgs,
  returns: v.array(connectionValue),
  handler: listByProviderLifecycleHandler,
})

export const readAtGeneration = internalQueryGeneric({
  args: readAtGenerationArgs,
  returns: v.union(connectionValue, v.null()),
  handler: readAtGenerationHandler,
})

export const resolveCredentialRef = internalQueryGeneric({
  args: resolveCredentialRefArgs,
  returns: credentialResolution,
  handler: resolveCredentialRefHandler,
})

export const validateAuthority = internalQueryGeneric({
  args: validateAuthorityArgs,
  returns: connectionAuthorityValidation,
  handler: validateAuthorityHandler,
})

export const issueLease = internalMutationGeneric({
  args: issueLeaseArgs,
  returns: leaseResult,
  handler: issueLeaseHandler,
})

export const readLease = internalQueryGeneric({
  args: readLeaseArgs,
  returns: v.union(leaseValue, v.null()),
  handler: readLeaseHandler,
})

export const readLeaseByInvocation = internalQueryGeneric({
  args: readLeaseByInvocationArgs,
  returns: v.union(leaseValue, v.null()),
  handler: readLeaseByInvocationHandler,
})

export const resolveLeaseCredentialRef = internalQueryGeneric({
  args: resolveLeaseCredentialRefArgs,
  returns: leaseCredentialResolution,
  handler: resolveLeaseCredentialRefHandler,
})

export const validateLeaseAuthority = internalQueryGeneric({
  args: validateLeaseAuthorityArgs,
  returns: leaseAuthorityValidation,
  handler: validateLeaseAuthorityHandler,
})

export const consumeLease = internalMutationGeneric({
  args: consumeLeaseArgs,
  returns: leaseResult,
  handler: consumeLeaseHandler,
})

export const expireLease = internalMutationGeneric({
  args: expireLeaseArgs,
  returns: leaseResult,
  handler: expireLeaseHandler,
})

export const invalidateLease = internalMutationGeneric({
  args: invalidateLeaseArgs,
  returns: leaseResult,
  handler: invalidateLeaseHandler,
})

export const readOwner = queryGeneric({
  args: readOwnerArgs,
  returns: v.union(ownerProjection, v.null()),
  handler: readOwnerHandler,
})

export const listOwner = queryGeneric({
  args: listOwnerArgs,
  returns: v.array(ownerProjection),
  handler: listOwnerHandler,
})

export const revokeOwner = mutationGeneric({
  args: revokeOwnerArgs,
  returns: ownerCommandResult,
  handler: revokeOwnerHandler,
})

export const retryOwnerCleanup = mutationGeneric({
  args: retryOwnerCleanupArgs,
  returns: ownerCommandResult,
  handler: retryOwnerCleanupHandler,
})

export const rotateOwner = mutationGeneric({
  args: reauthorizeOwnerArgs,
  returns: ownerCommandResult,
  handler: reauthorizeOwnerHandler,
})

export const reconnectOwner = mutationGeneric({
  args: reauthorizeOwnerArgs,
  returns: ownerCommandResult,
  handler: reauthorizeOwnerHandler,
})

export const connectX402Owner = mutationGeneric({
  args: connectX402OwnerArgs,
  returns: ownerCommandResult,
  handler: connectX402OwnerHandler,
})
