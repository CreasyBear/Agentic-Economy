import type { Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { upsertOfferingAccessPathCommand } from '../../catalogOfferingMutations'

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
