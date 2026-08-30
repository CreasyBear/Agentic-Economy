export {
  isProviderConnectionCredentialRef,
  PROVIDER_CONNECTION_CLEANUP_OUTCOMES,
  PROVIDER_CONNECTION_CLEANUP_WORK_KINDS,
  PROVIDER_CONNECTION_LIFECYCLES,
  PROVIDER_CONNECTION_REFUSAL_CODES,
} from './internal/provider-connection/types'
export type {
  AuthorityCommandFields,
  BeginProviderConnectionRevocationCommand,
  CommandKind,
  CreateProviderConnectionCommand,
  CreateX402ProviderConnectionCommand,
  ProviderConnection,
  ProviderConnectionAuthorityValidation,
  ProviderConnectionCleanupOutcome,
  ProviderConnectionCleanupWorkKind,
  ProviderConnectionCommandResult,
  ProviderConnectionCredentialResolution,
  ProviderConnectionLifecycle,
  ProviderConnectionPublicProjection,
  ProviderConnectionRefusalCode,
  ReauthorizeProviderConnectionCommand,
  RecordProviderConnectionCleanupResultCommand,
} from './internal/provider-connection/types'

export {
  isProviderConnectionAuthorityCurrent,
  providerConnectionAuthorityProvenanceIsValid,
  providerConnectionAuthorityDigest,
  withProviderConnectionAuthority,
} from './internal/provider-connection/shared'
export type { ProviderConnectionAuthorityProvenance } from './internal/provider-connection/shared'

export {
  beginProviderConnectionRevocation,
  createProviderConnection,
  createX402ProviderConnection,
  isCanonicalCredentiallessX402ProviderConnection,
  providerConnectionCleanupCommandId,
  providerConnectionCleanupRequestDigest,
  providerConnectionCommandDigest,
  providerConnectionRevocationRef,
  reauthorizeProviderConnection,
  recordProviderConnectionCleanupResult,
  resolveProviderConnectionCredentialRef,
  validateProviderConnectionAuthority,
} from './internal/provider-connection/command-model'

export {
  PROVIDER_CONNECTION_LEASE_REFUSAL_CODES,
  PROVIDER_CONNECTION_LEASE_STATES,
  consumeProviderConnectionLease,
  expireProviderConnectionLease,
  invalidateProviderConnectionLease,
  issueProviderConnectionLease,
  providerConnectionLeaseAuthoritySnapshot,
  resolveProviderConnectionCredentialRefForLease,
  validateProviderConnectionLeaseAuthority,
} from './internal/provider-connection/lease'
export type {
  ConsumeProviderConnectionLeaseCommand,
  ExpireProviderConnectionLeaseCommand,
  InvalidateProviderConnectionLeaseCommand,
  IssueProviderConnectionLeaseCommand,
  ProviderConnectionInvocationLease,
  ProviderConnectionLeaseApproval,
  ProviderConnectionLeaseAuthoritySnapshot,
  ProviderConnectionLeaseAuthorityValidation,
  ProviderConnectionLeaseCommandResult,
  ProviderConnectionLeaseCredentialResolution,
  ProviderConnectionLeaseRefusalCode,
  ProviderConnectionLeaseState,
} from './internal/provider-connection/lease'

export {
  projectProviderConnectionOwner,
  projectProviderConnectionPublic,
} from './internal/provider-connection/owner-projection'
export type { ProviderConnectionOwnerProjection } from './internal/provider-connection/owner-projection'
