export const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const
export const CLERK_ORGANIZATION_PROVIDER_NAMESPACE = 'clerk/organization' as const
export const ACCESS_FACT_QUERY_LIMIT = 50

// One Clerk session-token lifetime. Convex does not surface the JWT `exp`
// claim on UserIdentity, so identities without the claim anchor their
// credential window on the Convex-verified presentation instead.
export const INTERACTIVE_OWNER_SESSION_WINDOW_MS = 60_000

export const OWNER_DISPLAY_NAME_MAX_LENGTH = 200
