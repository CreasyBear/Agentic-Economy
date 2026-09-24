import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  FACILITATOR_DISCOVERY_PUBLISHER_REF,
  X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
} from '@/modules/capability-supply/convex'
import { v, type Infer } from 'convex/values'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import {
  type AgentAccessPrincipalValue,
  verifySupplyAgentPrincipal,
} from '../../../agentAccessPrincipals'
import { nativePublicationCanBeValidated } from '../../../capabilitySupplyNativeAdmission'
import {
  SYSTEM_WORKLOAD_ACCOUNT_REF,
  SYSTEM_WORKLOAD_PRINCIPAL_REF,
} from '../../platform/workloadCron/context'

const capabilityProbeAuthorityBaseFields = {
  publicationRef: v.string(),
  publicationRevision: v.number(),
  businessId: v.id('businesses'),
  publisherPrincipalRef: v.string(),
  ownerPrincipalRef: v.string(),
  owningAccountRef: v.string(),
  ownershipRef: v.string(),
  accountRevision: v.number(),
}
export const capabilityProbeAuthorityValue = v.union(
  v.object({
    ...capabilityProbeAuthorityBaseFields,
    mode: v.literal('human_owner'),
    publisherPrincipalRevision: v.number(),
    authorityDigest: v.string(),
  }),
  v.object({
    ...capabilityProbeAuthorityBaseFields,
    mode: v.literal('agent_grant'),
    grantRef: v.string(),
    grantGeneration: v.number(),
    grantPolicyDigest: v.string(),
    authorityExpiresAt: v.number(),
    authorityDigest: v.string(),
  }),
  v.object({
    ...capabilityProbeAuthorityBaseFields,
    mode: v.literal('system_workload'),
    workloadPrincipalRevision: v.number(),
    membershipRef: v.string(),
    membershipRevision: v.number(),
    authorityDigest: v.string(),
  }),
)
export type CapabilityProbeAuthority = Infer<typeof capabilityProbeAuthorityValue>

type CapabilityProbeAuthorityReadArgs = Readonly<{
  publicationRef: string
  expectedRevision: number
  now: number
  ownerStagedBusinessId?: Id<'businesses'>
}>

function withCapabilityProbeAuthorityDigest<T extends Omit<CapabilityProbeAuthority, 'authorityDigest'>>(
  authority: T,
): T & Readonly<{ authorityDigest: string }> {
  return {
    ...authority,
    authorityDigest: canonicalDigest({
      format: 'ae.capability-probe-authority:v1',
      ...authority,
    }),
  }
}

export async function readCurrentCapabilityProbeAuthority(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  args: CapabilityProbeAuthorityReadArgs,
): Promise<CapabilityProbeAuthority | null> {
  if (!Number.isSafeInteger(args.now) || args.now < 0) return null
  const publication = await ctx.db
    .query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (index) =>
      index.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision))
    .unique()
  if (publication === null || publication.disposition !== 'current') return null
  const business = await ctx.db.get(publication.businessId)
  const exactOwnerStagedBusiness = args.ownerStagedBusinessId !== undefined
    && publication.businessId === args.ownerStagedBusinessId
    && publication.runtimeEnvironment === 'sandbox'
    && publication.authorityMode === 'provider_owned'
    && publication.sourceKind === 'x402'
    && (publication.registrationEvidenceRefs ?? []).filter(
      (ref) => ref === X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
    ).length === 1
  if (business === null
    || business.suppressedAt !== undefined
    || (business.publicStatus !== 'published' && !exactOwnerStagedBusiness
      && !await nativePublicationCanBeValidated(ctx, publication))) return null

  if (
    publication.publisherRef === FACILITATOR_DISCOVERY_PUBLISHER_REF
    && publication.authorityMode === 'observed_external'
    && publication.sourceKind === 'x402'
  ) {
    const [workloadPrincipal, workloadAccount, memberships] = await Promise.all([
      ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', SYSTEM_WORKLOAD_PRINCIPAL_REF))
        .unique(),
      ctx.db.query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', SYSTEM_WORKLOAD_ACCOUNT_REF))
        .unique(),
      ctx.db.query('memberships')
        .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
          .eq('accountRef', SYSTEM_WORKLOAD_ACCOUNT_REF)
          .eq('memberPrincipalRef', SYSTEM_WORKLOAD_PRINCIPAL_REF)
          .eq('lifecycle', 'active'))
        .take(2),
    ])
    if (
      workloadPrincipal === null
      || workloadPrincipal.kind !== 'workload'
      || workloadPrincipal.lifecycle !== 'active'
      || workloadAccount === null
      || workloadAccount.lifecycle !== 'active'
      || memberships.length !== 1
    ) return null
    const ownership = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', workloadAccount.currentOwnershipRef))
      .unique()
    const membership = memberships[0]
    if (
      ownership === null
      || ownership.lifecycle !== 'active'
      || ownership.accountRef !== workloadAccount.accountRef
      || membership === undefined
    ) return null
    return withCapabilityProbeAuthorityDigest({
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      businessId: publication.businessId,
      publisherPrincipalRef: publication.publisherRef,
      ownerPrincipalRef: ownership.ownerPrincipalRef,
      owningAccountRef: workloadAccount.accountRef,
      ownershipRef: ownership.ownershipRef,
      accountRevision: workloadAccount.revision,
      mode: 'system_workload' as const,
      workloadPrincipalRevision: workloadPrincipal.revision,
      membershipRef: membership.membershipRef,
      membershipRevision: membership.revision,
    })
  }
  const account = await ctx.db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', business.owningAccountRef))
    .unique()
  if (account === null || account.lifecycle !== 'active') return null
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (ownership === null
    || ownership.lifecycle !== 'active'
    || ownership.accountRef !== account.accountRef) return null
  const ownerPrincipal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', ownership.ownerPrincipalRef))
    .unique()
  if (ownerPrincipal === null
    || ownerPrincipal.kind !== 'human'
    || ownerPrincipal.lifecycle !== 'active') return null

  const base = {
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    businessId: publication.businessId,
    publisherPrincipalRef: publication.publisherRef,
    ownerPrincipalRef: ownerPrincipal.principalRef,
    owningAccountRef: account.accountRef,
    ownershipRef: ownership.ownershipRef,
    accountRevision: account.revision,
  }
  if (publication.publisherRef === ownerPrincipal.principalRef) {
    return withCapabilityProbeAuthorityDigest({
      ...base,
      mode: 'human_owner' as const,
      publisherPrincipalRevision: ownerPrincipal.revision,
    })
  }

  const storedAgent = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', publication.publisherRef))
    .unique()
  if (storedAgent === null || storedAgent.ownerId !== account.accountRef) return null
  const agentPrincipal: AgentAccessPrincipalValue = {
    principalId: storedAgent.principalId,
    ownerId: storedAgent.ownerId,
    credentialId: storedAgent.credentialId,
    applicationRef: storedAgent.applicationRef,
    environment: storedAgent.environment,
    scopes: [...storedAgent.scopes],
    authorityMode: storedAgent.authorityMode,
  }
  const exactGrants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_generation', (query) => query
      .eq('credentialId', storedAgent.credentialId)
      .eq('environment', storedAgent.environment)
      .eq('generation', storedAgent.grantGeneration))
    .take(2)
  if (exactGrants.length !== 1) return null
  const grant = exactGrants[0]
  if (grant === undefined
    || grant.lifecycle !== 'active'
    || grant.principalId !== storedAgent.principalId
    || grant.ownerId !== account.accountRef
    || grant.applicationRef !== storedAgent.applicationRef
    || grant.credentialId !== storedAgent.credentialId
    || grant.authorityMode !== storedAgent.authorityMode
    || grant.toolAccess !== 'all_admitted'
    || grant.spendingPolicyDigest !== storedAgent.spendingPolicyDigest
    || grant.expiresAt <= args.now) return null
  const admission = await verifySupplyAgentPrincipal(ctx, agentPrincipal)
  if (admission.kind !== 'allowed') return null
  const authorityExpiresAt = Math.min(grant.expiresAt, storedAgent.expiresAt ?? grant.expiresAt)
  if (authorityExpiresAt <= args.now) return null
  return withCapabilityProbeAuthorityDigest({
    ...base,
    mode: 'agent_grant' as const,
    grantRef: grant.grantRef,
    grantGeneration: grant.generation,
    grantPolicyDigest: grant.spendingPolicyDigest,
    authorityExpiresAt,
  })
}

export function capabilityProbeAuthorityMatches(
  pinned: CapabilityProbeAuthority,
  current: CapabilityProbeAuthority,
): boolean {
  if (pinned.authorityDigest !== current.authorityDigest
    || pinned.publicationRef !== current.publicationRef
    || pinned.publicationRevision !== current.publicationRevision
    || pinned.businessId !== current.businessId
    || pinned.publisherPrincipalRef !== current.publisherPrincipalRef
    || pinned.ownerPrincipalRef !== current.ownerPrincipalRef
    || pinned.owningAccountRef !== current.owningAccountRef
    || pinned.ownershipRef !== current.ownershipRef
    || pinned.accountRevision !== current.accountRevision
    || pinned.mode !== current.mode) return false
  if (pinned.mode === 'human_owner' && current.mode === 'human_owner') {
    return pinned.publisherPrincipalRevision === current.publisherPrincipalRevision
  }
  if (pinned.mode === 'agent_grant' && current.mode === 'agent_grant') {
    return pinned.grantRef === current.grantRef
      && pinned.grantGeneration === current.grantGeneration
      && pinned.grantPolicyDigest === current.grantPolicyDigest
      && pinned.authorityExpiresAt === current.authorityExpiresAt
  }
  return pinned.mode === 'system_workload' && current.mode === 'system_workload'
    && pinned.workloadPrincipalRevision === current.workloadPrincipalRevision
    && pinned.membershipRef === current.membershipRef
    && pinned.membershipRevision === current.membershipRevision
}

export async function nativeDraftProbeBusinessIsAllowed(
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  args: { publicationRef: string; expectedRevision: number },
  businessId: string,
): Promise<boolean> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', q =>
      q.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision)).unique()
  return publication !== null && String(publication.businessId) === businessId
    && await nativePublicationCanBeValidated(ctx, publication)
}

export async function ownerStagedProbeBusinessIsAllowed(
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  args: Readonly<{
    publicationRef: string
    expectedRevision: number
    businessId: Id<'businesses'>
    candidateBusinessId: string
  }>,
): Promise<boolean> {
  if (args.candidateBusinessId !== String(args.businessId)) return false
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', args.publicationRef)
      .eq('revision', args.expectedRevision))
    .unique()
  if (publication === null
    || publication.disposition !== 'current'
    || publication.businessId !== args.businessId
    || (publication.runtimeEnvironment !== 'sandbox'
      && publication.runtimeEnvironment !== 'production')
    || publication.authorityMode !== 'provider_owned'
    || publication.sourceKind !== 'x402'
    || (publication.registrationEvidenceRefs ?? []).filter(
      (ref) => ref === X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
    ).length !== 1) return false
  const business = await ctx.db.get(args.businessId)
  return business !== null
    && (business.publicStatus === 'unpublished' || business.publicStatus === 'published')
    && business.suppressedAt === undefined
}
