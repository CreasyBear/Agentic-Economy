import type { MutationCtx } from '../../_generated/server'
import { revokeProviderConnectionForActor } from '../providerConnections/owner'
import { advance, block, countActiveConnections, readTargetPage, requireCase } from './caseState'

export async function revokeConnectionsPageHandler(
  ctx: MutationCtx,
  args: { caseRef: string; afterConnectionRef?: string },
) {
  const row = await requireCase(ctx, args.caseRef)
  const targets = await readTargetPage(ctx, row.caseRef, 'connection', args.afterConnectionRef)
  for (const connection of targets) {
    const current = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (index) => index.eq('connectionRef', connection.targetRef))
      .unique()
    if (current === null || current.lifecycle === 'revoked') continue
    if (current.authorityGeneration !== connection.targetRevision || current.authorityDigest !== connection.authorityDigest) {
      await block(ctx, row, 'revoke-connections', 'connections_remain')
      return { ready: false, done: false }
    }
    await revokeProviderConnectionForActor(ctx, {
      connectionRef: connection.targetRef,
      commandId: `${row.caseRef}:revoke:${connection.targetRef}`,
      expectedAuthorityGeneration: connection.targetRevision,
      expectedAuthorityDigest: connection.authorityDigest,
      reasonCode: 'provider_offboarding',
      evidenceRefs: [`provider-offboarding:${row.caseRef}`],
    }, {
      canonicalPrincipalRef: row.requestedByPrincipalRef,
      canonicalAccountRef: row.owningAccountRef,
      authorityRevision: row.authorityRevision,
      authorityProvenance: row.authorityProvenance as never,
    })
  }
  const last = targets.at(-1)
  return {
    ready: true,
    done: targets.length < 100,
    ...(targets.length < 100 || last === undefined ? {} : { nextConnectionRef: last.targetRef }),
  }
}

export async function completeConnectionRevocationHandler(ctx: MutationCtx, args: { caseRef: string }) {
  const row = await requireCase(ctx, args.caseRef)
  const remaining = await countActiveConnections(ctx, row.businessId)
  if (remaining > 0) return await block(ctx, row, 'revoke-connections', 'provider_cleanup_pending')
  await advance(ctx, row, 'verify-completion', 'verifying_cleanup')
  return { ready: true }
}
