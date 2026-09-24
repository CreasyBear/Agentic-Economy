import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { upsertProviderToolIdentity } from '../../capabilityProviderToolProjection'
import { upsertOfferingAccessPathCommand } from './offerings/commands'

type Input = Readonly<{
  businessId: Id<'businesses'>
  offeringRef: string
  accessPathRef: string
  offeringRevision: number
  name: string
  summary: string
  url: string
  method: string
  authenticationSummary: string
  now: number
}>

export async function upsertDevSeedSandboxAccessPath(ctx: MutationCtx, input: Input): Promise<void> {
  const existing = await ctx.db.query('offeringAccessPaths')
    .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', input.accessPathRef))
    .unique()
  if (existing !== null
    && existing.status === 'published'
    && existing.offeringRevision === input.offeringRevision) return

  const upserted = await upsertOfferingAccessPathCommand(ctx, {
    businessId: input.businessId,
    offeringRef: input.offeringRef,
    accessPathRef: input.accessPathRef,
    expectedRevision: input.offeringRevision,
    operationKey: `seed:sandbox-tool-access-path:${input.accessPathRef}:${input.offeringRevision}`,
    descriptor: {
      kind: 'external_operation',
      name: input.name,
      summary: input.summary,
      url: input.url,
      method: input.method,
      authenticationSummary: input.authenticationSummary,
      provenance: 'business_declared',
    },
  }, input.now)
  if (upserted.kind === 'error') throw new Error(`dev_seed_sandbox_tool_access_path_${upserted.code}`)
}

export async function upsertDevSeedSandboxProviderToolProjection(
  ctx: MutationCtx,
  publication: Pick<Doc<'capabilityPublications'>, 'businessId' | 'toolRef' | 'publicationRef' | 'revision' | 'offeringId' | 'bindingId'>,
  offeringRef: string,
  offeringRevision: number,
  updatedAt: number,
): Promise<void> {
  await upsertProviderToolIdentity(ctx, {
    businessId: publication.businessId,
    providerRef: String(publication.businessId),
    toolRef: publication.toolRef,
    offeringRef,
    offeringRevision,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    offeringId: publication.offeringId,
    bindingId: publication.bindingId,
    updatedAt,
  })
}
