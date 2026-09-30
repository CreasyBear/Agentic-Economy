import type { ToolCtx } from '@convex-dev/agent'
import type { ActionCtx } from '../../../_generated/server'
import { api } from '../../../_generated/api'

/**
 * Chat speaks directory listing ids (`registry:<hex>`) and operation refs. A listing id
 * resolves on demand to the operation that Quote and Call key on; null when it cannot.
 */
export async function callableToolRef(ctx: ToolCtx | ActionCtx, ref: string): Promise<string | null> {
  if (/^operation:v1:[0-9a-f]{64}$/u.test(ref)) return ref
  if (!ref.startsWith('registry:')) return null
  const detail = await ctx.runQuery(api.x402DirectoryIndex.detailById, { id: ref })
  if (detail.kind !== 'found') return null
  const resolved = await ctx.runAction(api.x402Directory.resolve, {
    resource: detail.item.entry.resource,
  })
  return resolved.kind === 'ready' ? resolved.toolRef : null
}
