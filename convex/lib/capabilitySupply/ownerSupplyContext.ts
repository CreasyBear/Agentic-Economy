import { canonicalDigest } from '@/modules/common/canonical-digest'

import { api } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import type { ActionCtx } from '../../_generated/server'
import { resolveBusinessActor } from '../../authz'

export type OwnerSupplyOffering = Readonly<{
  offeringRef: string
  revision: number
  sourceHash?: string
  publicationRef?: string
  publicationRevision?: number
  toolRef?: string
  publisher?: string
  sourceKind?: string
  readinessCompleted?: boolean
}>

export async function ownerSupplyOffering(
  ctx: ActionCtx,
  businessId: Id<'businesses'>,
  offeringRef: string,
  offeringRevision: number,
  offeringSourceHash: string,
  publicationRef: string,
  publicationRevision: number,
): Promise<OwnerSupplyOffering | undefined> {
  const readback = await ctx.runQuery(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, { businessId })
  if (readback.kind !== 'available' || readback.businessId !== String(businessId)) return undefined
  const offering = readback.offerings.find((candidate) => (
    candidate.offeringRef === offeringRef
    && candidate.revision === offeringRevision
    && candidate.sourceHash === offeringSourceHash
    && candidate.publicationRef === publicationRef
    && candidate.publication?.publicationRevision === publicationRevision
  ))
  if (offering === undefined) return undefined
  return {
    offeringRef: offering.offeringRef,
    revision: offering.revision,
    ...(offering.sourceHash === undefined ? {} : { sourceHash: offering.sourceHash }),
    ...(offering.publicationRef === undefined ? {} : { publicationRef: offering.publicationRef }),
    ...(offering.publication?.publicationRevision === undefined
      ? {}
      : { publicationRevision: offering.publication.publicationRevision }),
    ...(offering.toolRef === undefined ? {} : { toolRef: offering.toolRef }),
    readinessCompleted: offering.stepStates.readiness === 'completed',
    ...(offering.publication === undefined ? {} : {
      publisher: offering.publication.authorityMode,
      sourceKind: offering.publication.source.kind,
    }),
  }
}

export type OwnerSupplyAuthority = Extract<Awaited<ReturnType<typeof resolveBusinessActor>>, { kind: 'authenticated_owner' }>

export async function currentOwnerSupplyAuthority(ctx: ActionCtx, businessId: Id<'businesses'>): Promise<OwnerSupplyAuthority | null> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  return await ctx.runQuery(api.catalog.authorizeProviderBusiness, { businessId })
    ? actor
    : null
}

export function sameOwnerSupplyAuthority(left: OwnerSupplyAuthority, right: OwnerSupplyAuthority | null): boolean {
  return right !== null &&
    ownerSupplyAuthorityFingerprint(left) === ownerSupplyAuthorityFingerprint(right)
}

function ownerSupplyAuthorityFingerprint(authority: OwnerSupplyAuthority): string {
  return canonicalDigest({
    principalRef: authority.canonicalPrincipalRef,
    accountRef: authority.canonicalAccountRef,
    revision: authority.authorityRevision,
    provenance: {
      providerNamespace: authority.authorityProvenance.providerNamespace,
      bindingRef: authority.authorityProvenance.bindingRef,
      credentialRef: authority.authorityProvenance.credentialRef,
      credentialGeneration: authority.authorityProvenance.credentialGeneration,
      accessKind: authority.authorityProvenance.accessKind,
      accessRef: authority.authorityProvenance.accessRef,
      currentOwnershipRef: authority.authorityProvenance.currentOwnershipRef,
    },
  })
}
