import { planSuggestInputSchema, mercatorImportInputSchema } from '@/modules/capability-execution/plan/draft.schemas'
import { internal } from '../../../_generated/api'
import { planQuoteInputSchema } from '@/modules/capability-execution/plan/parse'
import { planReferenceInputSchema, parsePlanReadback } from '@/modules/capability-execution/plan/runtime.schemas'
import { createTool, type ToolCtx } from '@convex-dev/agent'
import type { ActionCtx } from '../../../_generated/server'
import { makeFunctionReference } from 'convex/server'
import type { Value } from 'convex/values'
import { z } from 'zod'
import type { ModelMessage } from 'ai'
import { latestUserRequest } from '@/modules/chat/search-presentation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { toolQuoteInputSchema, type ToolQuoteInput } from '@/modules/capability-execution/quote'
import { projectCallMachineResult, type CallResult } from '@/modules/capability-execution/call-contracts'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import type { QuoteResult } from '../../capabilityExecution/quotes/contracts'
import { contractFor, descriptionFor, failure, type ReserveChatTool } from './contracts'
import { projectedModelFacingOutput } from './output'
import { resolveCallableRef } from '../../capabilityExecution/quotes/quoteAction'

const quoteRef = makeFunctionReference<'action', {
  authority: TrustedChatAuthority; operationKey: string; correlationId: string;
  toolRef: string; input: Record<string, Value>
}, QuoteResult>('chatQuote:quote')
const callRef = makeFunctionReference<'action', {
  authority: TrustedChatAuthority; operationKey: string; correlationId: string;
  quoteRef: string; idempotencyKey: string; requireApproval?: boolean
}, CallResult>('chatCall:call')
const payableAdmissionRef = makeFunctionReference<'query', {
  authority: TrustedChatAuthority; toolRef: string
}, boolean>('chatTurns:authorizePayableTool')

const chatToolQuoteInputSchema = z.strictObject({
  toolRef: z.string().min(1).max(200),
  input: toolQuoteInputSchema.shape.input,
})

const CALL_ANSWER_WAIT_MS = 25_000
const CALL_POLL_MS = 750

const MAX_USER_REQUEST_CHARS = 4_000

/** The latest user message in full (not the 500-char search excerpt); empty when there is none. */
function userRequestText(messages: readonly ModelMessage[] | undefined): string {
  return latestUserRequest(messages, MAX_USER_REQUEST_CHARS) ?? ''
}

function pause(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

async function callableToolRef(ctx: ToolCtx | ActionCtx, ref: string): Promise<string | null> {
  const resolved = await resolveCallableRef(ctx, ref)
  return resolved.kind === 'ready' ? resolved.toolRef : null
}

export function createPurchaseTools(authority: TrustedChatAuthority & { kind: 'agent_key' }, reserve: ReserveChatTool) {
  const toolQuoteContract = contractFor('tool.quote')
  const callContract = contractFor('tool.call')
  const planQuoteContract = contractFor('tool.plan.quote')
  const planRunContract = contractFor('tool.plan.run')
  const planGetContract = contractFor('tool.plan.get')
  return {
      [CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.plan.suggest']]: createTool({
        description: descriptionFor(contractFor('tool.plan.suggest')), inputSchema: planSuggestInputSchema,
        execute: async (ctx: ToolCtx) => {
          const denied = reserve('tool.plan.suggest')
          if (denied !== null) return denied
          const result: unknown = JSON.parse(await ctx.runQuery(internal.capabilityPlanDrafts.suggest, {}))
          return projectedModelFacingOutput('tool.plan.suggest', contractFor('tool.plan.suggest').outputSchema, () => result)
        },
      }),
      [CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.plan.import']]: createTool({
        description: descriptionFor(contractFor('tool.plan.import')), inputSchema: mercatorImportInputSchema,
        execute: async (ctx: ToolCtx, input: z.infer<typeof mercatorImportInputSchema>) => {
          const denied = reserve('tool.plan.import')
          if (denied !== null) return denied
          const result: unknown = JSON.parse(await ctx.runQuery(internal.capabilityPlanDrafts.importMercator, { inputJson: JSON.stringify(input) }))
          return projectedModelFacingOutput('tool.plan.import', contractFor('tool.plan.import').outputSchema, () => result)
        },
      }),
      [CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.plan.quote']]: createTool({
        description: descriptionFor(planQuoteContract), inputSchema: planQuoteInputSchema,
        execute: async (ctx: ToolCtx, input: z.infer<typeof planQuoteInputSchema>, options?: { messages?: readonly ModelMessage[] }) => {
          const denied = reserve('tool.plan.quote')
          if (denied !== null) return denied
          // Plans run inside the caps without a per-Call owner gate, so every Tool must be named by the person.
          const requested = userRequestText(options?.messages)
          if (!input.plan.nodes.every((node) => requested.includes(node.toolRef))) return failure('tool.plan.quote', 'selected_tool_mismatch')
          const result = await ctx.runAction(internal.chatPlans.quote, { authority: { ...authority, scopes: [...authority.scopes] }, planJson: JSON.stringify(input.plan) })
          return projectedModelFacingOutput('tool.plan.quote', planQuoteContract.outputSchema, () => result)
        },
      }),
      [CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.plan.run']]: createTool({
        description: `${descriptionFor(planRunContract)} Obtain the sealed Plan with ${CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.plan.quote']}.`,
        inputSchema: planReferenceInputSchema.extend({ approvedTotalAudUnits: z.string().regex(/^(?:0|[1-9]\d{0,30})$/u) }),
        execute: async (ctx: ToolCtx, input: { planRef: string; approvedTotalAudUnits: string }) => {
          const denied = reserve('tool.plan.run')
          if (denied !== null) return denied
          const result = await ctx.runAction(internal.chatPlans.run, { ...input, authority: { ...authority, scopes: [...authority.scopes] } })
          return projectedModelFacingOutput('tool.plan.run', planRunContract.outputSchema, () => result)
        },
      }),
      [CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.plan.get']]: createTool({
        description: descriptionFor(planGetContract), inputSchema: planReferenceInputSchema,
        execute: async (ctx: ToolCtx, input: { planRef: string }) => {
          const denied = reserve('tool.plan.get')
          if (denied !== null) return denied
          const result = await ctx.runQuery(internal.chatPlans.get, { authority: { ...authority, scopes: [...authority.scopes] }, planRef: input.planRef })
          return projectedModelFacingOutput('tool.plan.get', planGetContract.outputSchema, () => parsePlanReadback(result))
        },
      }),
      [CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote']]: createTool({
        description: descriptionFor(toolQuoteContract),
        inputSchema: chatToolQuoteInputSchema as z.ZodType<ToolQuoteInput>,
        execute: async (ctx: ToolCtx, input: ToolQuoteInput) => {
          const denied = reserve('tool.quote')
          if (denied !== null) return denied
          const toolRef = await callableToolRef(ctx, input.toolRef)
          if (toolRef === null) return failure('tool.quote', 'tool_unavailable')
          if (!await ctx.runQuery(payableAdmissionRef, { authority, toolRef })) {
            return failure('tool.quote', 'turn_stopped')
          }
          const commandDigest = canonicalDigest({
            turnRef: authority.turnRef,
            credentialId: authority.credentialLocator,
            operationRef: toolRef,
            input: input.input,
          } as StableHashValue)
          const result = await ctx.runAction(quoteRef, {
            authority,
            operationKey: commandDigest,
            correlationId: `chat-inspect-corr:${commandDigest}`,
            toolRef,
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
        execute: async (ctx: ToolCtx, input: { quoteRef: string }, options?: { messages?: readonly ModelMessage[] }) => {
          const denied = reserve('tool.call')
          if (denied !== null) return denied
          const commandDigest = canonicalDigest({
            turnRef: authority.turnRef,
            credentialId: authority.credentialLocator,
            commitmentRef: input.quoteRef,
          } as StableHashValue)
          const idempotencyKey = `chat-invoke:${commandDigest}`
          const callArgs = {
            authority,
            operationKey: input.quoteRef,
            correlationId: `chat-invoke-corr:${commandDigest}`,
            quoteRef: input.quoteRef,
            idempotencyKey,
          }
          // Calls run on the worker. Replaying the same idempotent Call returns its stored
          // result, so wait briefly for the answer and let the model reply from it.
          let result = await ctx.runAction(callRef, callArgs)
          const deadline = Date.now() + CALL_ANSWER_WAIT_MS
          while (result.kind === 'pending' && Date.now() < deadline) {
            await pause(CALL_POLL_MS)
            result = await ctx.runAction(callRef, callArgs)
          }
          return projectedModelFacingOutput(
            'tool.call',
            callContract.outputSchema,
            () => projectCallMachineResult(result),
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
  const resolvedToolRef = await callableToolRef(ctx, toolRef)
  if (resolvedToolRef === null) return null
  if (!await ctx.runQuery(payableAdmissionRef, { authority, toolRef: resolvedToolRef })) return null
  const commandDigest = canonicalDigest({
    turnRef: authority.turnRef,
    credentialId: authority.credentialLocator,
    operationRef: resolvedToolRef,
    input,
  } as StableHashValue)
  const quote = await ctx.runAction(quoteRef, {
    authority,
    operationKey: commandDigest,
    correlationId: `chat-inspect-corr:${commandDigest}`,
    toolRef: resolvedToolRef,
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
