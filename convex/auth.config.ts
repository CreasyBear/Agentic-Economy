import type { AuthConfig } from 'convex/server'

const clerkJwtIssuerDomain = requiredEnv('CLERK_JWT_ISSUER_DOMAIN')

export default {
  providers: [
    {
      domain: clerkJwtIssuerDomain,
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  throw new Error(`${name} is required for Convex auth configuration`)
}
