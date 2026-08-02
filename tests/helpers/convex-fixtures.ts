import { convexTest, type TestConvex } from 'convex-test'
import { register as registerWorkpool } from '@convex-dev/workpool/test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { components } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'

export type ConvexFixtureBackend = TestConvex<typeof schema>
export type ConvexFixtureAdmin = Pick<ConvexFixtureBackend, 'mutation' | 'query' | 'action'>
export const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../convex/', './'), load]),
)

export type ConvexTestWithWorkersOptions = Readonly<{
  pauseWorkpool?: boolean
}>

export function convexTestWithWorkers(
  options: ConvexTestWithWorkersOptions = {},
) {
  const backend = convexTest(schema, convexModules)
  registerWorkpool(backend)
  registerRateLimiter(backend)
  if (options.pauseWorkpool === true) {
    void backend.run(async (ctx) => {
      await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 })
    })
  }
  return backend
}

export async function ownerAdmin(backend: ConvexFixtureBackend, subject: string) {
  const identity = {
    subject,
    issuer: 'https://identity.example',
    tokenIdentifier: subject.replace(/^user_/u, 'token_'),
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert('adminMemberships', {
      clerkUserId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      role: 'owner_admin',
      state: 'active',
      grantedBy: 'test_bootstrap',
      grantedAt: 1,
    })
  })
  return backend.withIdentity(identity)
}

export type PublishedBusinessOwnerOptions = Readonly<{
  slugPrefix?: string
  identityPrefix?: string
}>

export async function publishedBusinessOwner(
  backend: ConvexFixtureBackend,
  slug: string,
  options: PublishedBusinessOwnerOptions = {},
) {
  const slugPrefix = options.slugPrefix ?? ''
  const identityPrefix = options.identityPrefix ?? ''
  const prefixLabel = slugPrefix.replace(/[-_]+$/u, '')
  const businessName = prefixLabel.length === 0
    ? slug
    : `${prefixLabel.charAt(0).toUpperCase()}${prefixLabel.slice(1)} ${slug}`
  const identitySlug = `${identityPrefix}${slug}`
  const identity = {
    subject: `user_${identitySlug}`,
    issuer: 'https://identity.example',
    tokenIdentifier: `token_${identitySlug}`,
  }
  const businessId = await backend.run(async (ctx) => {
    const ownerId = await ctx.db.insert('owners', {
      clerkUserId: identity.subject,
      createdAt: 1,
      updatedAt: 1,
    })
    return await ctx.db.insert('businesses', {
      ownerId,
      slug: `${slugPrefix}${slug}`,
      name: businessName,
      normalizedName: businessName.toLowerCase(),
      category: 'professional services',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicStatus: 'published',
      trustTier: 'listed',
      claimStatus: 'published',
      sourceHash: `source:${prefixLabel.length === 0 ? '' : `${prefixLabel}:`}${slug}`,
      createdAt: 1,
      updatedAt: 1,
    })
  }) as Id<'businesses'>
  return { businessId, owner: backend.withIdentity(identity) }
}
