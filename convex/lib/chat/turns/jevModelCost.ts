import type { ChatModelCostBinding } from '@/modules/chat/model-cost'
import type { JevInferenceObserver } from '@/modules/decision-engine/public'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'

/**
 * Requires a canonical turn/thread/prompt binding; mutations validate ownership.
 * Ensures durable begin is awaited before Jev I/O, and usage remains unpriced.
 * Invariant: this adapter retains no prompt, provider body or credential.
 * On violation: begin refuses I/O; the transport leaves failed observations pending.
 * Cost/benefit: one small binding adapter serves rerank and recommendation without
 * duplicating storage contracts or adding a separate accounting transport.
 */
export function createJevModelCostObserver(
  ctx: Pick<ActionCtx, 'runMutation'>,
  binding: ChatModelCostBinding,
  purpose: 'discovery_rerank' | 'discovery_recommendation',
): JevInferenceObserver {
  return {
    async beforeAttempt({ requestRef, requestedModel }): Promise<void> {
      await ctx.runMutation(internal.chatModelCost.begin, {
        ...binding, requestRef, requestedModel, source: 'jev', purpose,
      })
    },
    async afterAttempt({ requestRef, outcome, model, inputTokens, outputTokens }): Promise<void> {
      await ctx.runMutation(internal.chatModelCost.observe, {
        ...binding, requestRef,
        ...(model === undefined ? {} : { model }),
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(outputTokens === undefined ? {} : { outputTokens }),
        accounting: { status: 'unpriced', reason: outcome === 'completed' ? 'jev_usage_only' : 'request_failed' },
      })
    },
  }
}
