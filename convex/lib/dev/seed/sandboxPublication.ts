import { v } from 'convex/values'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { upsertProviderDirectoryRows } from '../../market/directoryIndex/providerRows'
import { admitDevSeedCatalogAuthority, resolveDevSeedOwningAccountRef } from './authority'
import { provisionDevSeedCatalogIdentityRows, requireLocalE2EOwnerAuthority } from './identity'
import { upsertDevSeedSandboxProviderToolProjection } from './accessPath'
import { ensureSandboxToolCatalogOrigin } from './sandboxCatalog'
import { refreshLegacySandboxTestnetPublication } from './legacyPublication'
import { createSandboxToolPublication } from './sandboxPublish'
import { readSeedEnvironmentValue, sandboxTestnetEndpointUrl, ensureSandboxTestnetProviderConnection } from './sandboxTransport'
import { SANDBOX_TESTNET_CAPABILITY_ID, SANDBOX_TESTNET_PAY_TO_ENV, SANDBOX_TESTNET_SKIP_ORIGIN_MISSING, SANDBOX_TESTNET_SKIP_PAY_TO_MISSING, sandboxTestnetToolSpec } from './sandboxTestnet'
import { SANDBOX_TOOL_BUSINESS_SLUG, SANDBOX_TOOL_CAPABILITY_ID, sandboxReferenceEndpointUrl, sandboxReferenceToolSpec } from './sandboxReference'
import { sandboxToolEvidenceRef, sandboxToolOfferingId, type SandboxToolSpec } from './sandboxFixture'
import type { SeededSandboxTool } from './contracts' 

/**
 * Publishes one sandbox Tool: catalog origin, publication.
 *
 * The catalog side runs on EVERY invocation: the publication is created once,
 * but the priced Offering revision it binds to and the business's search
 * documents have to be re-asserted on each boot. Readiness is never written
 * here — the hourly `refresh capability supply readiness` workload is the
 * only writer of the readiness fact.
 */
async function publishSeededSandboxTool(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  owningAccountRef: string,
  now: number,
  prepareBusiness?: (businessId: Id<'businesses'>) => Promise<void>,
): Promise<SeededSandboxTool> {
  const publicationRef = sandboxToolOfferingId(spec)
  const evidenceRefs = [sandboxToolEvidenceRef(spec)]
  const { businessId, origin } = await ensureSandboxToolCatalogOrigin(ctx, spec, owningAccountRef, now)
  if (prepareBusiness !== undefined) await prepareBusiness(businessId)
  const existing = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', publicationRef).eq('revision', 1)
    ))
    .unique()

  const target: SeededSandboxTool = existing !== null
    ? await refreshLegacySandboxTestnetPublication(ctx, spec, existing, origin, evidenceRefs, now)
    : await createSandboxToolPublication(ctx, spec, evidenceRefs, businessId, origin, now)
  if (existing !== null) {
    const current = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => query
        .eq('publicationRef', target.publicationRef)
        .eq('revision', target.publicationRevision))
      .unique()
    if (current === null || current.disposition !== 'current') {
      throw new Error('dev_seed_sandbox_tool_current_projection_missing')
    }
    await upsertDevSeedSandboxProviderToolProjection(ctx, current, origin.offeringRef, origin.offeringRevision, now)
    await upsertProviderDirectoryRows(ctx, current)
  }
  return target
}

const seededSandboxToolValue = v.union(
  v.object({ capabilityId: v.string(), toolRef: v.string(), created: v.boolean() }),
  v.object({ capabilityId: v.string(), skipped: v.string() }),
)
export const publishSandboxToolArgs = { owningAccountRef: v.optional(v.string()) }
export const publishSandboxToolResult = v.object({
    created: v.boolean(),
    publicationId: v.string(),
    publicationRevision: v.number(),
    toolRef: v.string(),
    businessSlug: v.string(),
    tools: v.array(seededSandboxToolValue),
  })
export async function publishSandboxToolHandler(ctx: MutationCtx, args: { owningAccountRef?: string }) {
    // Same deployment guard the money seed uses: never seed sandbox supply into
    // a deployment whose bypass owner account already carries a production agent.
    await requireLocalE2EOwnerAuthority(ctx)
    await provisionDevSeedCatalogIdentityRows(ctx)
    const authority = await admitDevSeedCatalogAuthority(ctx, 'publishSandboxTool')
    const owningAccountRef = await resolveDevSeedOwningAccountRef(ctx, args.owningAccountRef, authority.accountRef)
    const now = Date.now()

    const reference = await publishSeededSandboxTool(
      ctx,
      sandboxReferenceToolSpec(sandboxReferenceEndpointUrl()),
      owningAccountRef,
      now,
    )
    const testnet = await publishSeededSandboxTestnetTool(ctx, owningAccountRef, now)

    return {
      created: reference.created,
      publicationId: reference.publicationRef,
      publicationRevision: reference.publicationRevision,
      toolRef: reference.toolRef,
      businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
      tools: [
        { capabilityId: SANDBOX_TOOL_CAPABILITY_ID, toolRef: reference.toolRef, created: reference.created },
        testnet,
      ],
    }
}

/**
 * Seeds the Base Sepolia reference provider Tool, or reports why it was not.
 *
 * A deployment without the reference provider's env has nowhere to send a paid
 * Call, so the Tool is skipped rather than published against a guessed URL: a
 * published Tool that cannot settle is worse than an absent one.
 */
async function publishSeededSandboxTestnetTool(
  ctx: MutationCtx,
  owningAccountRef: string,
  now: number,
): Promise<
  | Readonly<{ capabilityId: string; toolRef: string; created: boolean }>
  | Readonly<{ capabilityId: string; skipped: string }>
> {
  const endpointUrl = sandboxTestnetEndpointUrl()
  if (endpointUrl === undefined) {
    return { capabilityId: SANDBOX_TESTNET_CAPABILITY_ID, skipped: SANDBOX_TESTNET_SKIP_ORIGIN_MISSING }
  }
  const payTo = readSeedEnvironmentValue(SANDBOX_TESTNET_PAY_TO_ENV)
  if (payTo === undefined || !/^0x[0-9a-f]{40}$/iu.test(payTo)) {
    return { capabilityId: SANDBOX_TESTNET_CAPABILITY_ID, skipped: SANDBOX_TESTNET_SKIP_PAY_TO_MISSING }
  }
  const spec = sandboxTestnetToolSpec(endpointUrl, payTo)
  const seeded = await publishSeededSandboxTool(
    ctx,
    spec,
    owningAccountRef,
    now,
    (businessId) => ensureSandboxTestnetProviderConnection(ctx, businessId, endpointUrl, payTo, now),
  )
  return {
    capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
    toolRef: seeded.toolRef,
    created: seeded.created,
  }
}
