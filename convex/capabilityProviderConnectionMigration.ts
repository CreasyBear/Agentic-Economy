import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import {
  FACILITATOR_DISCOVERY_PUBLISHER_REF,
} from '@/modules/capability-supply/convex'
import { providerConnectionAuthorityDigest } from '@/modules/capability-supply/provider-connection'

import { internalMutation } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import {
  hasProviderConnectionAuthorityFields,
  type ProviderConnectionAuthorityCompatibilityRow,
} from './lib/providerConnections/codecs'

const SOURCE_EVIDENCE = 'source:facilitator-discovery'
const ADAPTER_ID = 'x402-fetch:v2'
const AUTHORITY_GRANT_REF = `observed:${FACILITATOR_DISCOVERY_PUBLISHER_REF}`
const AUTHORITY_GRANT_GENERATION = 1

type BusinessRow = Doc<'businesses'>
type CompatibilityRow = Doc<'capabilityProviderConnections'>

export type ProviderConnectionAuthorityMigrationDecision =
  | Readonly<{ kind: 'current' }>
  | Readonly<{
      kind: 'backfill'
      patch: Readonly<{
        owningAccountRef: string
        installedByPrincipalRef: string
        authorityGrantRef: string
        authorityGrantGeneration: number
        authorityDigest: string
      }>
    }>
  | Readonly<{
      kind: 'blocked'
      reason: 'partial_authority' | 'invalid_current_digest' | 'business_missing' | 'legacy_provenance_unproven'
    }>

function canonicalLegacyResource(row: CompatibilityRow): string | undefined {
  if (row.grantedScopes.length !== 0 || row.grantedResources.length !== 1) return undefined
  const resourceUrl = row.grantedResources[0]
  if (resourceUrl === undefined) return undefined
  if (row.providerAccountRef !== `x402:${resourceUrl}`) return undefined
  try {
    const parsed = new URL(resourceUrl)
    if (
      parsed.protocol !== 'https:'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.hash !== ''
      || parsed.toString() !== resourceUrl
      || row.providerRef !== `provider:x402:${parsed.host.toLowerCase()}`
    ) return undefined
    return resourceUrl
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'canonicalLegacyResource', reason: 'invalid_response' })
  }
}

function exactLegacyFacilitatorDiscoveryIdentity(
  row: CompatibilityRow,
  business: BusinessRow,
): boolean {
  const resourceUrl = canonicalLegacyResource(row)
  if (resourceUrl === undefined) return false
  const identity = { businessId: String(row.businessId), resourceUrl }
  const identityDigest = canonicalDigest(identity)
  return row.adapterId === ADAPTER_ID
    && row.credentialRef === null
    && row.secretRef === undefined
    && row.lifecycle === 'active'
    && row.authorityGeneration === 1
    && row.connectionRef === `connection:x402:${identityDigest}`
    && row.lastCommandId === `facilitator-discovery:connection:${identityDigest.slice(7)}`
    && row.evidenceRefs.length === 1
    && row.evidenceRefs[0] === SOURCE_EVIDENCE
    && business.businessContext.kind === 'programmable_provider'
    && business.businessContext.providerIdentifier === row.providerRef
    && business.suppressedAt === undefined
}

/**
 * Classifies a compatibility row without guessing authority. Only the exact
 * deterministic shape written by facilitator discovery is eligible.
 */
export function decideProviderConnectionAuthorityMigration(
  row: CompatibilityRow,
  business: BusinessRow | null,
): ProviderConnectionAuthorityMigrationDecision {
  const compatibilityRow = row as ProviderConnectionAuthorityCompatibilityRow
  const authorityValues = [
    row.owningAccountRef,
    row.installedByPrincipalRef,
    row.authorityGrantRef,
    row.authorityGrantGeneration,
  ]
  const authorityFieldCount = authorityValues.filter((value) => value !== undefined).length
  if (authorityFieldCount === 4 && hasProviderConnectionAuthorityFields(compatibilityRow)) {
    return isCanonicalDigest(row.authorityDigest)
      && row.authorityDigest === providerConnectionAuthorityDigest(compatibilityRow)
      ? { kind: 'current' }
      : { kind: 'blocked', reason: 'invalid_current_digest' }
  }
  if (authorityFieldCount !== 0) return { kind: 'blocked', reason: 'partial_authority' }
  if (business === null) return { kind: 'blocked', reason: 'business_missing' }
  if (!exactLegacyFacilitatorDiscoveryIdentity(row, business)) {
    return { kind: 'blocked', reason: 'legacy_provenance_unproven' }
  }
  const authority = {
    owningAccountRef: business.owningAccountRef,
    installedByPrincipalRef: FACILITATOR_DISCOVERY_PUBLISHER_REF,
    authorityGrantRef: AUTHORITY_GRANT_REF,
    authorityGrantGeneration: AUTHORITY_GRANT_GENERATION,
  }
  return {
    kind: 'backfill',
    patch: {
      ...authority,
      authorityDigest: providerConnectionAuthorityDigest({
        ...row,
        ...authority,
      }),
    },
  }
}

const migrationResultValue = v.object({
  scanned: v.number(),
  backfilled: v.number(),
  current: v.number(),
  blocked: v.number(),
  blockedConnectionRefs: v.array(v.string()),
  continueCursor: v.string(),
  isDone: v.boolean(),
})

/**
 * Bounded, resumable and idempotent. Run pages until isDone, then tighten the
 * table validator back to required authority fields.
 */
export const backfillFacilitatorDiscoveryAuthority = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: migrationResultValue,
  handler: async (ctx, args) => {
    const page = await ctx.db.query('capabilityProviderConnections')
      .paginate(args.paginationOpts)
    let backfilled = 0
    let current = 0
    const blockedConnectionRefs: string[] = []
    for (const row of page.page) {
      const business = await ctx.db.get(row.businessId)
      const decision = decideProviderConnectionAuthorityMigration(row, business)
      if (decision.kind === 'backfill') {
        await ctx.db.patch(row._id, decision.patch)
        backfilled += 1
      } else if (decision.kind === 'current') {
        current += 1
      } else {
        blockedConnectionRefs.push(row.connectionRef)
      }
    }
    return {
      scanned: page.page.length,
      backfilled,
      current,
      blocked: blockedConnectionRefs.length,
      blockedConnectionRefs,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    }
  },
})
