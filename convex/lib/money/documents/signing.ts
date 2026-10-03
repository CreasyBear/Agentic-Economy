import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { isRecord } from '../../../../src/modules/common/is-record'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import { financialEnvironmentMatches } from '../formance/contracts'

export const signOwnerDailyCloseArgs = v.object({
    documentRef: v.string(),
    expectedRenderInputDigest: v.string(),
    confirmation: v.string(),
  })
export const signOwnerDailyCloseResult = v.union(
    v.object({ kind: v.literal('signed'), documentRef: v.string(), evidenceDigest: v.string() }),
    v.object({ kind: v.literal('replayed'), documentRef: v.string(), evidenceDigest: v.string() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  )
export const signOwnerDailyCloseHandler = async (ctx: MutationCtx, args: Infer<typeof signOwnerDailyCloseArgs>) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'authentication_required' }
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.accountRef !== actor.canonicalAccountRef || row.kind !== 'daily_close') {
      return { kind: 'refused' as const, code: 'daily_close_not_found' }
    }
    if (!financialEnvironmentMatches(row.environment)) return { kind: 'refused' as const, code: 'environment_mismatch' }
    if (row.closeEvidenceDigest !== undefined) {
      return { kind: 'replayed' as const, documentRef: row.documentRef, evidenceDigest: row.closeEvidenceDigest }
    }
    if (row.state !== 'awaiting_signature'
      || row.renderInputDigest !== args.expectedRenderInputDigest
      || args.confirmation !== row.documentRef
      || row.fileId === undefined
      || row.csvFileId === undefined
      || row.fileDigest === undefined
      || row.csvFileDigest === undefined) {
      return { kind: 'refused' as const, code: 'daily_close_confirmation_invalid' }
    }
    try {
      const input: unknown = JSON.parse(row.renderInputJson)
      if (!isRecord(input) || input.documentRef !== row.documentRef || input.accountRef !== row.accountRef
        || input.kind !== 'daily_close' || canonicalDigest(input) !== row.renderInputDigest) {
        return { kind: 'refused' as const, code: 'daily_close_confirmation_invalid' }
      }
    } catch (cause) {
      return degradeBackend(cause, { kind: 'refused' as const, code: 'daily_close_confirmation_invalid' }, {
        site: 'signOwnerDailyClose', reason: 'invalid_response',
      })
    }
    const files = await Promise.all([ctx.db.system.get('_storage', row.fileId), ctx.db.system.get('_storage', row.csvFileId)])
    if (files.some(file => file === null)) return { kind: 'refused' as const, code: 'daily_close_confirmation_invalid' }
    const signedAt = Date.now()
    const evidenceDigest = canonicalDigest({
      format: 'ae.money-daily-close-signature:v1',
      documentRef: row.documentRef,
      renderInputDigest: row.renderInputDigest,
      fileDigest: row.fileDigest,
      csvFileDigest: row.csvFileDigest,
      snapshotDigest: row.snapshotDigest,
      signedByPrincipalRef: actor.canonicalPrincipalRef,
      signedAt,
    })
    await ctx.db.patch(row._id, {
      state: 'issued',
      signedByPrincipalRef: actor.canonicalPrincipalRef,
      signedAt,
      closeEvidenceDigest: evidenceDigest,
    })
    return { kind: 'signed' as const, documentRef: row.documentRef, evidenceDigest }
  }
