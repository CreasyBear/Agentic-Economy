import type { AuthConfig } from 'convex/server'

const clerkJwtIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN ?? 'https://clerk.local.invalid'

export default {
  providers: [
    {
      domain: clerkJwtIssuerDomain,
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig
