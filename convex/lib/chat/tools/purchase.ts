import { createTool, type ToolCtx } from '@convex-dev/agent'
import type { ActionCtx } from '../../../_generated/server'
import { makeFunctionReference } from 'convex/server'
import type { Value } from 'convex/values'
import { z } from 'zod'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ToolQuoteInput } from '@/modules/capability-execution/quote'
import type { CallResult } from '@/modules/capability-execution/call-contracts'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import type { QuoteResult } from '../../capabilityExecution/quotes/contracts'
import { contractFor, descriptionFor, failure, type ReserveChatTool } from './contracts'
import { projectedModelFacingOutput } from './output'

const quoteRef = makeFunctionReference<'action', {
  authority: TrustedChatAuthority; operationKey: string; correlationId: string;
  toolRef: string; input: Record<string, Value>
}, QuoteResult>('chatQuote:quote')
const callRef = makeFunctionReference<'action', {
  authority: TrustedChatAuthority; operationKey: string; correlationId: string;
  quoteRef: string; idempotencyKey: string
}, CallResult>('chatCall:call')
const payableAdmissionRef = makeFunctionReference<'query', {
  authority: TrustedChatAuthority; toolRef: string
}, boolean>('chatTurns:authorizePayableTool')

export function createPurchaseTools(authority: TrustedChatAuthority & { kind: 'agent_key' }, reserve: ReserveChatTool) {
  const toolQuoteContract = contractFor('tool.quote')
  const callContract = contractFor('tool.call')
  return {
      [CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote']]: createTool({
        description: descriptionFor(toolQuoteContract),
        inputSchema: toolQuoteContract.schema as z.ZodType<ToolQuoteInput>,
        execute: async (ctx: ToolCtx, input: ToolQuoteInput) => {
          const denied = reserve('tool.quote')
          if (denied !== null) return denied
          if (!await ctx.runQuery(payableAdmissionRef, { authority, toolRef: input.toolRef })) {
            return failure('tool.quote', 'turn_stopped')
          }
          const commandDigest = canonicalDigest({
            turnRef: authority.turnRef,
            credentialId: authority.credentialLocator,
            operationRef: input.toolRef,
            input: input.input,
          } as StableHashValue)
          const result = await ctx.runAction(quoteRef, {
            authority,
            operationKey: commandDigest,
            correlationId: `chat-inspect-corr:${commandDigest}`,
            toolRef: input.toolRef,
            input: structuredClone(input.input) as Record<string, Value>,
          })
          return projectedModelFacingOutput(
            'tool.quote',
            toolQuoteContract.outputSchema,
            () => result,
          )
        },
      }),
      [CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.call']]: createTool({
        description: `${descriptionFor(callContract)} Obtain the exact Quote first with ${CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote']}.`,
        inputSchema: z.strictObject({
          quoteRef: z.string().regex(/^operation-commitment:v1:[0-9a-f]{64}$/u),
        }),
        execute: async (ctx: ToolCtx, input: { quoteRef: string }) => {
          const denied = reserve('tool.call')
          if (denied !== null) return denied
          const commandDigest = canonicalDigest({
            turnRef: authority.turnRef,
            credentialId: authority.credentialLocator,
            commitmentRef: input.quoteRef,
          } as StableHashValue)
          const idempotencyKey = `chat-invoke:${commandDigest}`
          const result = await ctx.runAction(callRef, {
            authority,
            operationKey: input.quoteRef,
            correlationId: `chat-invoke-corr:${commandDigest}`,
            quoteRef: input.quoteRef,
            idempotencyKey,
          })
          return projectedModelFacingOutput(
            'tool.call',
            callContract.outputSchema,
            () => result,
          )
        },
      }),
  }
}

/** Card Quote then Call. Call stops at the existing owner approval; it does not settle. */
export async function quoteThenCallFromCard(
  ctx: ActionCtx,
  authority: TrustedChatAuthority & { kind: 'agent_key' },
  toolRef: string,
  input: Record<string, Value>,
): Promise<{ quote: QuoteResult; call?: CallResult } | null> {
  if (!await ctx.runQuery(payableAdmissionRef, { authority, toolRef })) return null
  const commandDigest = canonicalDigest({
    turnRef: authority.turnRef,
    credentialId: authority.credentialLocator,
    operationRef: toolRef,
    input,
  } as StableHashValue)
  const quote = await ctx.runAction(quoteRef, {
    authority,
    operationKey: commandDigest,
    correlationId: `chat-inspect-corr:${commandDigest}`,
    toolRef,
    input: structuredClone(input),
  })
  if (quote.kind !== 'committed') return { quote }
  const callDigest = canonicalDigest({
    turnRef: authority.turnRef,
    credentialId: authority.credentialLocator,
    commitmentRef: quote.quoteRef,
  } as StableHashValue)
  const call = await ctx.runAction(callRef, {
    authority,
    operationKey: quote.quoteRef,
    correlationId: `chat-invoke-corr:${callDigest}`,
    quoteRef: quote.quoteRef,
    idempotencyKey: `chat-invoke:${callDigest}`,
  })
  return { quote, call }
}
