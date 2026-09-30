import { createThread, saveMessage, syncStreams, updateThreadMetadata, vStreamArgs } from '@convex-dev/agent'
import { ConvexError } from 'convex/values'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { MARKET_TOOLS_CALL_SCOPE } from '../../../../src/modules/agent-access/contract'
import { components, internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import { ACTIVE_CHAT_GENERATION_MS, isChatThreadBusy, normalizeChatThreadTitle, requireChatOwner, resolveOwnerChatActor, type TurnActor } from '../threads/listing'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveCurrentAgentAuthority } from '../../capabilityExecution/callLifecycle/agentCallAuthority'
import { resolveCanonicalAgentContext } from '../../authority/canonicalAgent/authority'
import { requireSourceRead, requireSourceWrite } from '../../security/sourceWrite/admission'
import { type SourceWriteArgs } from '../../security/sourceWrite/contracts'
import { chatThreadBelongsToPrincipal, readPrincipalChatThread } from '../threads/ownership'
import { assertAdmission } from '../../platform/rateLimit'
import { expireStaleTurn } from './recovery'


export type KeyTurnPrincipal = Readonly<{
  kind: 'agent_key'
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: string[]
  authorityMode: 'read_only' | 'approval_required' | 'spending_policy' | 'unrestricted_test_only'
}>

export type KeyTurnProof = SourceWriteArgs & Readonly<{
  operationKey: string
  correlationId: string
}>
export type PublicTurnPrincipal = Readonly<{ kind: 'clerk' }> | KeyTurnPrincipal

export async function resolveTurnActor(
  ctx: QueryCtx | MutationCtx,
  principal: PublicTurnPrincipal,
  proof: Partial<KeyTurnProof>,
  write: boolean,
): Promise<TurnActor> {
  if (principal.kind === 'agent_key') {
    if (proof.operationKey === undefined || proof.correlationId === undefined) {
      throw new Error('unauthenticated')
    }
    return await authenticateKeyTurn(ctx, principal, proof as KeyTurnProof, write)
  }
  const owner = await requireChatOwner(ctx)
  return {
    kind: 'clerk_owner', principalRef: owner.canonicalPrincipalRef,
    accountRef: owner.canonicalAccountRef,
    authority: {
      principalRef: owner.canonicalPrincipalRef,
      accountRef: owner.canonicalAccountRef,
      revision: owner.authorityRevision,
      provenance: owner.authorityProvenance,
    },
  }
}

export async function ownerReadableActor(
  ctx: QueryCtx | MutationCtx,
  principal: PublicTurnPrincipal,
  turnRef: string,
  proof: Partial<KeyTurnProof>,
  write: boolean,
): Promise<TurnActor> {
  if (principal.kind !== 'clerk') return await resolveTurnActor(ctx, principal, proof, write)
  const row = await ctx.db.query('chatTurns')
    .withIndex('by_turnRef', q => q.eq('turnRef', turnRef)).unique()
  if (row?.origin !== 'owner_chat') return await resolveTurnActor(ctx, principal, proof, write)
  const actor = await resolveOwnerChatActor(ctx)
  if (actor === null || row.credentialLocator !== actor.credentialLocator
    || row.grantRef !== actor.grantRef) throw new Error('turn_not_found')
  return actor
}

export async function authorizeKeyTurnGeneration(
  ctx: QueryCtx,
  args: Readonly<{ turnRef: string; threadId: string; promptMessageId: string }>,
) {
  const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', args.turnRef)).unique()
  if (turn === null || turn.principalKind !== 'agent_key' || turn.threadId !== args.threadId
    || turn.promptMessageId !== args.promptMessageId || turn.credentialLocator === undefined
    || turn.grantRef === undefined || turn.cancelRequestedAt !== undefined
    || turn.state === 'canceled' || turn.state === 'failed'
    || turn.state === 'completed' || turn.state === 'rejected') return null
  const row = await ctx.db.query('chatThreads')
    .withIndex('by_threadId', q => q.eq('threadId', args.threadId)).unique()
  if (row === null || !chatThreadBelongsToPrincipal(row, turn.accountRef, 'agent_key', turn.principalRef)
    || row.activePromptMessageId !== args.promptMessageId) return null
  const canonical = await resolveCanonicalAgentContext(ctx, turn.credentialLocator, Date.now())
  if (canonical === null || canonical.principalRef !== turn.principalRef
    || canonical.accountRef !== turn.accountRef) return null
  const stored = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', q => q.eq('credentialId', canonical.credentialLocator)).unique()
  if (stored === null || stored.lifecycle !== 'active' || stored.principalId !== turn.principalRef
    || stored.ownerId !== turn.accountRef) return null
  if ((turn.origin === 'owner_chat') !== (stored.applicationRef === 'ae-owner-chat')
    || (turn.origin === 'owner_chat' && stored.authorityMode !== 'spending_policy')) return null
  const candidate = {
    principalId: canonical.principalRef, ownerId: canonical.accountRef,
    credentialId: turn.credentialLocator, applicationRef: stored.applicationRef,
    environment: stored.environment, scopes: stored.scopes, authorityMode: stored.authorityMode,
  }
  const current = await resolveCurrentAgentAuthority(ctx, candidate, Date.now(), { kind: 'receipt_list' })
  if (current === null || current.grantRef !== turn.grantRef) return null
  return { ownerId: turn.accountRef, authority: {
    kind: 'agent_key' as const, turnRef: turn.turnRef, credentialLocator: turn.credentialLocator,
    applicationRef: stored.applicationRef, environment: stored.environment,
    scopes: current.principal.scopes, grantRef: current.grantRef,
  } }
}


const DEFAULT_CHAT_TITLE = 'New conversation'
const MAX_PROMPT_LENGTH = 2_000

export function normalizedTurnPrompt(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/gu, ' ')
  if (normalized.length === 0 || Array.from(normalized).length > MAX_PROMPT_LENGTH) {
    throw new Error('invalid_input')
  }
  return normalized
}

export async function authenticateKeyTurn(
  ctx: MutationCtx | QueryCtx,
  principal: KeyTurnPrincipal,
  proof: KeyTurnProof,
  write: boolean,
): Promise<TurnActor> {
  const admitted = write
    ? await requireSourceWrite(ctx as MutationCtx, proof, 'protected_action')
    : await requireSourceRead(proof, 'protected_action')
  if (admitted.kind !== 'accepted') throw new Error('unauthenticated')
  if (!principal.scopes.includes(MARKET_TOOLS_CALL_SCOPE)) throw new Error('permission_denied')
  if (principal.applicationRef === 'ae-owner-chat') throw new Error('permission_denied')
  const current = await resolveCurrentAgentAuthority(ctx, principal, Date.now(), { kind: 'receipt_list' })
  const canonical = await resolveCanonicalAgentContext(ctx, principal.credentialId, Date.now())
  if (current === null || canonical === null
    || current.principal.principalId !== canonical.principalRef
    || current.principal.ownerId !== canonical.accountRef
    || current.principal.credentialId !== principal.credentialId) throw new Error('unauthenticated')
  return {
    kind: 'agent_key', principalRef: canonical.principalRef, accountRef: canonical.accountRef,
    credentialLocator: canonical.credentialLocator, grantRef: current.grantRef,
  }
}

export async function requirePrincipalTurn(
  ctx: Pick<QueryCtx, 'db'>,
  turnRef: string,
  actor: TurnActor,
): Promise<Doc<'chatTurns'>> {
  const turn = await ctx.db.query('chatTurns')
    .withIndex('by_turnRef', (q) => q.eq('turnRef', turnRef)).unique()
  if (turn === null || turn.principalKind !== actor.kind
    || turn.principalRef !== actor.principalRef || turn.accountRef !== actor.accountRef) {
    throw new Error('turn_not_found')
  }
  return turn
}

export async function reserveAndStartTurn(
  ctx: MutationCtx,
  input: Readonly<{ actor: TurnActor; threadId: string | undefined; prompt: string; clientTurnId: string;
    searchContinuation?: { query: string; cursor: string; inputJson: string } }>,
): Promise<{ threadId: string; turnRef: string; promptMessageId: string; state: Doc<'chatTurns'>['state']; sequence: number; deadlineAt?: number }> {
  const prompt = normalizedTurnPrompt(input.prompt)
  if (input.clientTurnId.trim().length === 0 || input.clientTurnId.length > 200) throw new Error('invalid_input')
  const materialDigest = canonicalDigest({
    format: 'chat-turn-material:v1', prompt, threadId: input.threadId ?? null,
    searchContinuation: input.searchContinuation ?? null,
    principalKind: input.actor.kind, accountRef: input.actor.accountRef,
    credentialLocator: input.actor.credentialLocator ?? null,
  })
  const previous = await ctx.db.query('chatTurns')
    .withIndex('by_principalRef_and_clientTurnId', (q) => q
      .eq('principalRef', input.actor.principalRef).eq('clientTurnId', input.clientTurnId)).unique()
  if (previous !== null) {
    if (previous.materialDigest !== materialDigest) throw new Error('turn_idempotency_conflict')
    if (previous.threadId === undefined || previous.promptMessageId === undefined || previous.sequence === undefined) {
      throw new Error('turn_reservation_incomplete')
    }
    const streamAdmission = await assertAdmission(ctx, {
      name: 'chat-stream',
      key: input.actor.principalRef,
    })
    if (!streamAdmission.ok) {
      throw new ConvexError({ code: 'rate_limited', retryAfter: streamAdmission.retryAfter })
    }
    return {
      threadId: previous.threadId, turnRef: previous.turnRef,
      promptMessageId: previous.promptMessageId, state: previous.state, sequence: previous.sequence,
      ...(previous.deadlineAt === undefined ? {} : { deadlineAt: previous.deadlineAt }),
    }
  }
  const admission = await assertAdmission(ctx, {
    name: 'chat-submit',
    key: input.actor.accountRef,
  })
  if (!admission.ok) throw new ConvexError({ code: 'rate_limited', retryAfter: admission.retryAfter })
  const now = Date.now()
  const deadlineAt = now + ACTIVE_CHAT_GENERATION_MS
  const turnRef = `turn_${crypto.randomUUID()}`
  // Reservation is deliberately first: a retry cannot create a second agent thread.
  const reservationId = await ctx.db.insert('chatTurns', {
    turnRef, principalKind: input.actor.kind, principalRef: input.actor.principalRef,
    accountRef: input.actor.accountRef,
    ...(input.actor.credentialLocator === undefined ? {} : { credentialLocator: input.actor.credentialLocator }),
    ...(input.actor.origin === undefined ? {} : { origin: input.actor.origin }),
    ...(input.actor.grantRef === undefined ? {} : { grantRef: input.actor.grantRef }),
    ...(input.searchContinuation === undefined ? {} : { searchContinuation: input.searchContinuation }),
    clientTurnId: input.clientTurnId, materialDigest, deadlineAt,
    state: 'submitted', modelCostTrackingVersion: 1, createdAt: now, updatedAt: now,
  })
  let row: Doc<'chatThreads'>
  if (input.threadId === undefined) {
    const threadId = await createThread(ctx, components.agent, {
      userId: input.actor.accountRef, title: DEFAULT_CHAT_TITLE,
    })
    const rowId = await ctx.db.insert('chatThreads', {
      threadId, ownerId: input.actor.accountRef,
      principalKind: input.actor.kind, principalRef: input.actor.principalRef,
      title: DEFAULT_CHAT_TITLE, updatedAt: now,
    })
    const created = await ctx.db.get(rowId)
    if (created === null) throw new Error('chat_thread_create_failed')
    row = created
  } else {
    row = await readPrincipalChatThread(
      ctx, input.threadId, input.actor.accountRef, input.actor.kind, input.actor.principalRef,
    )
  }
  if (isChatThreadBusy(row, now)) throw new Error('thread_busy')
  const latest = await ctx.db.query('chatTurns')
    .withIndex('by_threadId_and_sequence', (q) => q.eq('threadId', row.threadId))
    .order('desc').first()
  if (row.activePromptMessageId !== undefined
    && latest?.promptMessageId === row.activePromptMessageId
    && latest.cancelRequestedAt === undefined
    && !['completed', 'failed', 'canceled', 'rejected'].includes(latest.state)) {
    const staleDeadlineAt = latest.deadlineAt
      ?? (row.activeStartedAt === undefined ? undefined : row.activeStartedAt + ACTIVE_CHAT_GENERATION_MS)
    if (staleDeadlineAt !== undefined && staleDeadlineAt <= now) {
      await expireStaleTurn(ctx, {
        turnRef: latest.turnRef, promptMessageId: latest.promptMessageId,
        expectedDeadlineAt: staleDeadlineAt, now,
      })
    } else {
      await ctx.db.patch(latest._id, { state: 'canceled', cancelRequestedAt: now, updatedAt: now })
    }
  }
  const sequence = (latest?.sequence ?? 0) + 1
  const { messageId: promptMessageId } = await saveMessage(ctx, components.agent, {
    threadId: row.threadId, userId: input.actor.accountRef, prompt,
  })
  const title = row.title === DEFAULT_CHAT_TITLE ? normalizeChatThreadTitle(prompt) : row.title
  if (title !== row.title) {
    await updateThreadMetadata(ctx, components.agent, { threadId: row.threadId, patch: { title } })
  }
  await ctx.db.patch(row._id, {
    title, activePromptMessageId: promptMessageId, activeStartedAt: now, updatedAt: now,
  })
  await ctx.db.patch(reservationId, {
    threadId: row.threadId, sequence, promptMessageId, updatedAt: now,
  })
  await ctx.scheduler.runAfter(ACTIVE_CHAT_GENERATION_MS, internal.chatTurns.finishTurn, {
    turnRef, promptMessageId, state: 'failed', failureReason: 'generation_timed_out',
    expectedDeadlineAt: deadlineAt,
  })
  if (input.actor.authority !== undefined) {
    await ctx.scheduler.runAfter(0, internal.chatGenerate.generate, {
      threadId: row.threadId, promptMessageId, turnRef, authority: input.actor.authority, deadlineAt,
    })
  } else {
    await ctx.scheduler.runAfter(0, internal.chatGenerate.generate, {
      threadId: row.threadId, promptMessageId, turnRef, deadlineAt,
    })
  }
  return { threadId: row.threadId, turnRef, promptMessageId, state: 'submitted', sequence, deadlineAt }
}

/** @convex-dev/agent owns storage; Turn only scopes its published stream cursor. */
export async function readTurnStreams(
  ctx: QueryCtx,
  turn: Doc<'chatTurns'> & { threadId: string; promptMessageId: string },
  streamArgs: typeof vStreamArgs.type,
) {
  const [prompt] = await ctx.runQuery(components.agent.messages.getMessagesByIds, {
    messageIds: [turn.promptMessageId],
  })
  const nextTurn = await ctx.db.query('chatTurns')
    .withIndex('by_threadId_and_sequence', q => q.eq('threadId', turn.threadId)
      .gt('sequence', turn.sequence ?? 0)).order('asc').first()
  const [nextPrompt] = nextTurn?.promptMessageId === undefined ? [null]
    : await ctx.runQuery(components.agent.messages.getMessagesByIds, {
      messageIds: [nextTurn.promptMessageId],
    })
  if (prompt === null || prompt === undefined || prompt.threadId !== turn.threadId
    || prompt.message?.role !== 'user') throw new Error('turn_prompt_not_found')
  const listed = await syncStreams(ctx, components.agent, {
    threadId: turn.threadId, streamArgs: { kind: 'list', startOrder: prompt.order },
    includeStatuses: ['streaming', 'finished', 'aborted'],
  })
  const messages = listed?.kind === 'list'
    ? listed.messages.filter(message => message.order >= prompt.order
      && (nextPrompt == null || message.order < nextPrompt.order)) : []
  const recovered = await settledTurnText(ctx, turn, prompt.order, nextPrompt?.order, messages)
  if (recovered !== null) messages.push(recovered.message)
  if (streamArgs?.kind !== 'deltas') return { kind: 'list' as const, messages }
  const allowed = new Set(messages.map(message => message.streamId))
  if (streamArgs.cursors.some(cursor => !allowed.has(cursor.streamId))) {
    throw new Error('turn_stream_not_found')
  }
  const nativeCursors = streamArgs.cursors.filter(cursor => cursor.streamId !== recovered?.message.streamId)
  const deltas = nativeCursors.length === 0 ? undefined : await syncStreams(ctx, components.agent, {
    threadId: turn.threadId, streamArgs: { kind: 'deltas', cursors: nativeCursors },
  })
  const persisted = deltas?.kind === 'deltas' ? deltas.deltas : []
  if (recovered !== null && streamArgs.cursors.some(cursor =>
    cursor.streamId === recovered.message.streamId && cursor.cursor === 0)) {
    persisted.push({
      streamId: recovered.message.streamId, start: 0, end: 1,
      parts: [
        { type: 'text-start', id: recovered.message.streamId },
        { type: 'text-delta', id: recovered.message.streamId, delta: recovered.text },
        { type: 'text-end', id: recovered.message.streamId },
      ],
    })
  }
  return { kind: 'deltas' as const, deltas: persisted }
}

async function settledTurnText(
  ctx: QueryCtx,
  turn: Doc<'chatTurns'> & { threadId: string },
  promptOrder: number,
  nextPromptOrder: number | undefined,
  streams: readonly { streamId: string; order: number; status: 'streaming' | 'finished' | 'aborted' }[],
): Promise<{ message: { streamId: string; order: number; stepOrder: number; status: 'finished' }; text: string } | null> {
  if (!['completed', 'input-required', 'failed'].includes(turn.state)
    || !streams.some(message => message.status === 'finished')) return null
  const native = await syncStreams(ctx, components.agent, {
    threadId: turn.threadId,
    streamArgs: { kind: 'deltas', cursors: streams.map(message => ({ streamId: message.streamId, cursor: 0 })) },
  })
  const nativeText = native?.kind === 'deltas'
    ? native.deltas.flatMap(delta => delta.parts).filter((part): part is { type: 'text-delta'; delta: string } =>
      typeof part === 'object' && part !== null && 'type' in part && part.type === 'text-delta'
      && 'delta' in part && typeof part.delta === 'string').map(part => part.delta).join('')
    : ''
  const response = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
    threadId: turn.threadId, order: 'desc', paginationOpts: { cursor: null, numItems: 100 },
  })
  const text = response.page
    .filter(message => message.message?.role === 'assistant' && message.order >= promptOrder
      && (nextPromptOrder === undefined || message.order < nextPromptOrder))
    .reverse().map(message => message.text ?? '').filter(Boolean).join('\n')
  if (text.length === 0 || !text.startsWith(nativeText) || text === nativeText) return null
  const streamId = `${turn.turnRef}:settled-answer`
  return {
    message: { streamId, order: promptOrder, stepOrder: Number.MAX_SAFE_INTEGER, status: 'finished' },
    text: text.slice(nativeText.length),
  }
}
