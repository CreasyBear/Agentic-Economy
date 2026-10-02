import { createThread, getThreadMetadata, saveMessages, updateThreadMetadata } from '@convex-dev/agent'
import { internal, components } from '../../convex/_generated/api'
import {
  internalActionGeneric as action, internalMutationGeneric as mutation,
  internalQueryGeneric as query, type FunctionReference,
} from 'convex/server'
import { v, type GenericId } from 'convex/values'

// Only copied into disposable native deployments; never part of the app schema/API.
const proof = (internal as unknown as Readonly<{
  restoreProof: Readonly<{
    rememberFile: FunctionReference<'mutation', 'internal', { storageId: string }, null>
    markTimer: FunctionReference<'mutation', 'internal', Record<string, never>, null>
  }>
}>).restoreProof

export const countRecords = query({
  args: {}, returns: v.number(),
  handler: async (ctx) => (await ctx.db.query('restoreProofRecords').collect()).length,
})

export const seed = mutation({
  args: {}, returns: v.null(),
  handler: async (ctx): Promise<null> => {
    if (await ctx.db.query('restoreProofRecords').first()) throw new Error('proof_already_seeded')
    for (let ordinal = 0; ordinal < 1_007; ordinal++) {
      await ctx.db.insert('restoreProofRecords', {
        ordinal, value: `record-${ordinal}`, fractional: ordinal + 0.125,
        integer: -9_007_199_254_740_993n, bytes: new Uint8Array([0, 255, ordinal % 256]).buffer,
        special: { nan: NaN, infinity: Infinity, negativeZero: -0 },
      })
    }
    const threadId = await createThread(ctx, components.agent, { title: 'Restore proof' })
    await saveMessages(ctx, components.agent, {
      threadId, messages: [{ role: 'user', content: 'Synthetic restore message' }],
    })
    const scheduledId = await ctx.scheduler.runAfter(86_400_000, proof.markTimer, {})
    await ctx.db.insert('restoreProofControl', { threadId, scheduledId, timerRuns: 0 })
    return null
  },
})

export const markTimer = mutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const control = await ctx.db.query('restoreProofControl').unique()
    if (!control) throw new Error('proof_control_missing')
    await ctx.db.patch(control._id, { timerRuns: control.timerRuns + 1 })
    return null
  },
})

export const rememberFile = mutation({
  args: { storageId: v.id('_storage') }, returns: v.null(),
  handler: async (ctx, args) => {
    const control = await ctx.db.query('restoreProofControl').unique()
    if (!control) throw new Error('proof_control_missing')
    await ctx.db.patch(control._id, { storageId: args.storageId })
    return null
  },
})

export const storeFile = action({
  args: {}, returns: v.id('_storage'),
  handler: async (ctx): Promise<GenericId<'_storage'>> => {
    const bytes = Uint8Array.from({ length: 1_031 }, (_, index) => index % 256)
    const storageId = await ctx.storage.store(new Blob([bytes], { type: 'application/octet-stream' }))
    await ctx.runMutation(proof.rememberFile, { storageId })
    return storageId
  },
})

export const inspect = query({
  args: {},
  returns: v.object({
    records: v.number(), typedValuesValid: v.boolean(), firstValue: v.string(), oldestRecordId: v.string(),
    threadTitle: v.string(), messageCount: v.number(), messagesComplete: v.boolean(),
    storageId: v.string(), timerRuns: v.number(), scheduledCallbackPresent: v.boolean(),
  }),
  handler: async (ctx): Promise<{
    records: number; typedValuesValid: boolean; firstValue: string; oldestRecordId: string; threadTitle: string
    messageCount: number; messagesComplete: boolean; storageId: string; timerRuns: number
    scheduledCallbackPresent: boolean
  }> => {
    const rows = await ctx.db.query('restoreProofRecords').collect()
    const control = await ctx.db.query('restoreProofControl').unique()
    if (!control?.storageId) throw new Error('proof_control_missing')
    const thread = await getThreadMetadata(ctx, components.agent, { threadId: control.threadId })
    const messages = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
      threadId: control.threadId, order: 'asc', paginationOpts: { cursor: null, numItems: 100 },
    })
    return {
      records: rows.length,
      typedValuesValid: rows.every((row) => row.integer === -9_007_199_254_740_993n
        && row.fractional === row.ordinal + 0.125 && Number.isNaN(row.special.nan)
        && row.special.infinity === Infinity && Object.is(row.special.negativeZero, -0)
        && new Uint8Array(row.bytes).join(',') === `0,255,${row.ordinal % 256}`),
      firstValue: rows.find((row) => row.ordinal === 0)?.value ?? 'missing',
      oldestRecordId: rows[0]?._id ?? 'missing',
      threadTitle: thread.title ?? '', messageCount: messages.page.length, messagesComplete: messages.isDone,
      storageId: control.storageId, timerRuns: control.timerRuns,
      scheduledCallbackPresent: await ctx.db.system.get(control.scheduledId) !== null,
    }
  },
})

export const readFile = action({
  args: { storageId: v.id('_storage') }, returns: v.object({ bytes: v.number(), sha256: v.string() }),
  handler: async (ctx, args) => {
    const file = await ctx.storage.get(args.storageId)
    if (!file) throw new Error('proof_file_missing')
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return { bytes: file.size, sha256: [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('') }
  },
})

export const corrupt = mutation({
  args: { kind: v.union(v.literal('old_record'), v.literal('missing_record'), v.literal('extra_record'), v.literal('component')) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const control = await ctx.db.query('restoreProofControl').unique()
    const row = await ctx.db.query('restoreProofRecords').first()
    if (!control || !row) throw new Error('proof_control_missing')
    if (args.kind === 'component') {
      await updateThreadMetadata(ctx, components.agent, { threadId: control.threadId, patch: { title: 'Changed' } })
    } else if (args.kind === 'old_record') await ctx.db.patch(row._id, { value: 'changed' })
    else if (args.kind === 'missing_record') await ctx.db.delete(row._id)
    else {
      const { _id: _discardedId, _creationTime: _discardedTime, ...fields } = row
      await ctx.db.insert('restoreProofRecords', { ...fields, ordinal: 1_008 })
    }
    return null
  },
})

export const deleteFile = mutation({
  args: { storageId: v.id('_storage') }, returns: v.null(),
  handler: async (ctx, args) => { await ctx.storage.delete(args.storageId); return null },
})
