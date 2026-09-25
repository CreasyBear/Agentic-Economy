import { saveMessage, saveMessages } from '@convex-dev/agent'
import { describe, expect, it, vi } from 'vitest'
import { api, components, internal } from '../../convex/_generated/api'
import {
  convexTestWithMarketComponents, createTestAgentPrincipal, publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'

const principal = { kind: 'clerk' as const }

describe.sequential('durable chat Turns', () => {
  it('reserves before creating a thread and replays the same client turn exactly once', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef, canonicalPrincipalRef } = await publishedBusinessOwner(backend, 'turn-replay')
    const args = { principal, clientTurnId: 'same-client-turn', prompt: 'Find weather Tools' }
    const first = await owner.mutation(api.chatTurns.startTurn, args)
    const replay = await owner.mutation(api.chatTurns.startTurn, args)
    expect(replay).toEqual(first)
    expect(first.state).toBe('submitted')
    expect(first.sequence).toBe(1)
    const [threads, turns] = await backend.run(async ctx => Promise.all([
      ctx.db.query('chatThreads').withIndex('by_ownerId_and_updatedAt', q =>
        q.eq('ownerId', canonicalAccountRef)).collect(),
      ctx.db.query('chatTurns').withIndex('by_principalRef_and_clientTurnId', q =>
        q.eq('principalRef', canonicalPrincipalRef).eq('clientTurnId', args.clientTurnId)).collect(),
    ]))
    expect(threads).toHaveLength(1)
    expect(turns).toHaveLength(1)
    expect(threads[0]?.threadId).toBe(first.threadId)
    await expect(owner.mutation(api.chatTurns.startTurn, {
      ...args, prompt: 'Buy weather Tools',
    })).rejects.toMatchObject({ data: { code: 'turn_conflict' } })
    const unchanged = await backend.run(ctx => ctx.db.query('chatThreads')
      .withIndex('by_ownerId_and_updatedAt', q => q.eq('ownerId', canonicalAccountRef)).collect())
    expect(unchanged).toHaveLength(1)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try { await backend.finishAllScheduledFunctions(() => undefined) } finally { error.mockRestore() }
  })

  it('isolates Turn status and deltas by principal and keeps cancellation fenced', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(backend, 'turn-owner')
    const { owner: other } = await publishedBusinessOwner(backend, 'turn-other')
    const turn = await owner.mutation(api.chatTurns.startTurn, {
      principal, clientTurnId: 'cancel-this', prompt: 'A weather search',
    })
    await expect(other.query(api.chatTurns.readTurn, {
      principal, turnRef: turn.turnRef,
    })).rejects.toMatchObject({ data: { code: 'turn_not_found' } })
    await expect(other.query(api.chatTurns.readDeltas, {
      principal, turnRef: turn.turnRef, streamArgs: { kind: 'list' },
    })).rejects.toMatchObject({ data: { code: 'turn_not_found' } })
    await expect(other.mutation(api.chatTurns.cancelTurn, {
      principal, turnRef: turn.turnRef,
    })).rejects.toMatchObject({ data: { code: 'turn_not_found' } })
    expect(await owner.query(api.chatTurns.readDeltas, {
      principal, turnRef: turn.turnRef, streamArgs: { kind: 'list' },
    })).toMatchObject({ turnRef: turn.turnRef, sequence: 1, streams: { kind: 'list' } })
    expect(await owner.mutation(api.chatTurns.cancelTurn, {
      principal, turnRef: turn.turnRef,
    })).toEqual({ kind: 'stopped', turnRef: turn.turnRef, inFlightEffects: [] })
    expect(await backend.mutation(internal.chatTurns.finishTurn, {
      turnRef: turn.turnRef, promptMessageId: turn.promptMessageId, state: 'completed',
    })).toBe(false)
    expect(await owner.query(api.chatTurns.readTurn, {
      principal, turnRef: turn.turnRef,
    })).toMatchObject({ state: 'canceled', inFlightCallRefs: [],
      threadId: turn.threadId, sequence: turn.sequence })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try { await backend.finishAllScheduledFunctions(() => undefined) } finally { error.mockRestore() }
  })

  it('returns stable codes for invalid and fenced public Turn commands', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(backend, 'turn-error-contract')
    const first = await owner.mutation(api.chatTurns.startTurn, {
      principal, clientTurnId: 'first', prompt: 'Find a Tool',
    })
    await expect(owner.mutation(api.chatTurns.startTurn, {
      principal, clientTurnId: 'second', threadId: first.threadId, prompt: 'Buy a Tool',
    })).rejects.toMatchObject({ data: { code: 'turn_fenced' } })
    await expect(owner.mutation(api.chatTurns.startTurn, {
      principal, clientTurnId: 'invalid-prompt', prompt: ' ',
    })).rejects.toMatchObject({ data: { code: 'turn_invalid' } })
    await expect(owner.mutation(api.chatTurns.startTurn, {
      principal, clientTurnId: ' ', prompt: 'Find a Tool',
    })).rejects.toMatchObject({ data: { code: 'turn_invalid' } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try { await backend.finishAllScheduledFunctions(() => undefined) } finally { error.mockRestore() }
  })

  it('reads finished deltas for one Turn without exposing a later Turn on the same thread', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'turn-stream-scope')
    const first = await owner.mutation(api.chatTurns.startTurn, {
      principal, clientTurnId: 'one', prompt: 'First prompt',
    })
    await backend.mutation(internal.chatMessages.clearActiveGeneration, {
      threadId: first.threadId, promptMessageId: first.promptMessageId,
    })
    await backend.run(ctx => saveMessage(ctx, components.agent, {
      threadId: first.threadId, userId: canonicalAccountRef, prompt: 'Other context before next Turn',
    }))
    const second = await owner.mutation(api.chatTurns.startTurn, {
      principal, threadId: first.threadId, clientTurnId: 'two', prompt: 'Second prompt',
    })
    const [firstMessage, secondMessage] = await backend.run(ctx =>
      ctx.runQuery(components.agent.messages.getMessagesByIds, {
        messageIds: [first.promptMessageId, second.promptMessageId],
      }))
    if (firstMessage == null || secondMessage == null) throw new Error('prompt_missing')
    const firstStream = await backend.mutation(components.agent.streams.create, {
      threadId: first.threadId, order: firstMessage.order + 1, stepOrder: 1,
    })
    const secondStream = await backend.mutation(components.agent.streams.create, {
      threadId: second.threadId, order: secondMessage.order, stepOrder: 1,
    })
    await backend.mutation(components.agent.streams.addDelta, {
      streamId: firstStream, start: 0, end: 1,
      parts: [{ type: 'text-delta', id: 'first', delta: 'first-only' }],
    })
    await backend.mutation(components.agent.streams.addDelta, {
      streamId: secondStream, start: 0, end: 1,
      parts: [{ type: 'text-delta', id: 'second', delta: 'second-only' }],
    })
    await backend.mutation(components.agent.streams.finish, { streamId: firstStream })
    const firstList = await owner.query(api.chatTurns.readDeltas, {
      principal, turnRef: first.turnRef, streamArgs: { kind: 'list' },
    })
    expect(firstList.streams).toMatchObject({ kind: 'list', messages: [{ streamId: firstStream, status: 'finished' }] })
    expect(await owner.query(api.chatTurns.readDeltas, {
      principal, turnRef: first.turnRef,
      streamArgs: { kind: 'deltas', cursors: [{ streamId: firstStream, cursor: 0 }] },
    })).toMatchObject({ streams: { kind: 'deltas',
      deltas: [{ streamId: firstStream, parts: [{ delta: 'first-only' }] }] } })
    await expect(owner.query(api.chatTurns.readDeltas, {
      principal, turnRef: first.turnRef,
      streamArgs: { kind: 'deltas', cursors: [{ streamId: secondStream, cursor: 0 }] },
    })).rejects.toMatchObject({ data: { code: 'turn_not_found' } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try { await backend.finishAllScheduledFunctions(() => undefined) } finally { error.mockRestore() }
  })

  it('recovers settled assistant text when the agent finishes before flushing text chunks', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'turn-missing-text')
    const turn = await owner.mutation(api.chatTurns.startTurn, {
      principal, clientTurnId: 'missing-text', prompt: 'Say hello',
    })
    const [prompt] = await backend.run(ctx => ctx.runQuery(components.agent.messages.getMessagesByIds, {
      messageIds: [turn.promptMessageId],
    }))
    if (prompt == null) throw new Error('prompt_missing')
    const streamId = await backend.mutation(components.agent.streams.create, {
      threadId: turn.threadId, order: prompt.order, stepOrder: 1,
    })
    await backend.mutation(components.agent.streams.addDelta, {
      streamId, start: 0, end: 1, parts: [{ type: 'reasoning-delta', id: 'reason', delta: 'Hidden.' }],
    })
    await backend.mutation(components.agent.streams.finish, { streamId })
    await backend.run(ctx => saveMessages(ctx, components.agent, {
      threadId: turn.threadId, userId: canonicalAccountRef, promptMessageId: turn.promptMessageId,
      messages: [{ role: 'assistant', content: 'Hello there.' }],
    }))
    await backend.mutation(internal.chatTurns.finishTurn, {
      turnRef: turn.turnRef, promptMessageId: turn.promptMessageId, state: 'completed',
    })
    const listed = await owner.query(api.chatTurns.readDeltas, {
      principal, turnRef: turn.turnRef, streamArgs: { kind: 'list' },
    })
    if (listed.streams.kind !== 'list') throw new Error('expected_stream_list')
    const answer = listed.streams.messages.find((message: { streamId: string }) => message.streamId !== streamId)
    if (answer === undefined) throw new Error('answer_missing')
    const received = await owner.query(api.chatTurns.readDeltas, {
      principal, turnRef: turn.turnRef,
      streamArgs: { kind: 'deltas', cursors: [
        { streamId, cursor: 0 }, { streamId: answer.streamId, cursor: 0 },
      ] },
    })
    if (received.streams.kind !== 'deltas') throw new Error('expected_stream_deltas')
    expect(received.streams.deltas.flatMap((delta: { parts: readonly unknown[] }) => delta.parts)).toContainEqual({
      type: 'text-delta', id: expect.any(String), delta: 'Hello there.',
    })
    expect(await owner.query(api.chatTurns.readDeltas, {
      principal, turnRef: turn.turnRef,
      streamArgs: { kind: 'deltas', cursors: [{ streamId: answer.streamId, cursor: 1 }] },
    })).toMatchObject({ streams: { kind: 'deltas', deltas: [] } })
    await backend.mutation(internal.chatMessages.clearActiveGeneration, {
      threadId: turn.threadId, promptMessageId: turn.promptMessageId,
    })
    const later = await owner.mutation(api.chatTurns.startTurn, {
      principal, threadId: turn.threadId, clientTurnId: 'later', prompt: 'Second question',
    })
    const laterStream = await backend.mutation(components.agent.streams.create, {
      threadId: later.threadId, order: prompt.order + 1, stepOrder: 1,
    })
    await backend.run(ctx => saveMessages(ctx, components.agent, {
      threadId: later.threadId, userId: canonicalAccountRef, promptMessageId: later.promptMessageId,
      messages: [{ role: 'assistant', content: 'Other answer.' }],
    }))
    await expect(owner.query(api.chatTurns.readDeltas, {
      principal, turnRef: turn.turnRef,
      streamArgs: { kind: 'deltas', cursors: [{ streamId: laterStream, cursor: 0 }] },
    })).rejects.toMatchObject({ data: { code: 'turn_not_found' } })
    const replay = await owner.query(api.chatTurns.readDeltas, {
      principal, turnRef: turn.turnRef,
      streamArgs: { kind: 'deltas', cursors: [{ streamId: answer.streamId, cursor: 0 }] },
    })
    expect(replay.streams).toMatchObject({ kind: 'deltas',
      deltas: [{ parts: [{ type: 'text-start' }, { type: 'text-delta', delta: 'Hello there.' }, { type: 'text-end' }] }] })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try { await backend.finishAllScheduledFunctions(() => undefined) } finally { error.mockRestore() }
  })

  it('admits only signed key Turns and binds their read and cancellation to the live credential', async () => {
    const backend = convexTestWithMarketComponents()
    const { principal: key, principalId, grantRef } = await createTestAgentPrincipal(backend, 'turn-key')
    const principal = { kind: 'agent_key' as const, ...key }
    const unsigned = {
      principal, clientTurnId: 'signed-turn', prompt: 'Find a weather Tool',
      operationKey: 'chat-turn.start', correlationId: 'turn-key-first',
    }
    await expect(backend.mutation(api.chatTurns.startTurn, unsigned))
      .rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    const first = await backend.mutation(api.chatTurns.startTurn,
      await withSourceWrite('protected_action', unsigned))
    const replay = await backend.mutation(api.chatTurns.startTurn,
      await withSourceWrite('protected_action', { ...unsigned, correlationId: 'turn-key-replay' }))
    expect(replay).toEqual(first)
    const keyRows = await backend.run(ctx => ctx.db.query('chatTurns')
      .withIndex('by_principalRef_and_clientTurnId', q => q
        .eq('principalRef', principalId).eq('clientTurnId', 'signed-turn')).collect())
    expect(keyRows).toHaveLength(1)
    expect(keyRows[0]).toMatchObject({ grantRef, credentialLocator: key.credentialId })
    const read = { principal, turnRef: first.turnRef,
      operationKey: 'chat-turn.read', correlationId: 'turn-key-read' }
    await expect(backend.query(api.chatTurns.readTurn, read))
      .rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    expect(await backend.query(api.chatTurns.readTurn,
      await withSourceWrite('protected_action', read))).toMatchObject({
      threadId: first.threadId, state: 'submitted', sequence: 1,
    })
    await expect(backend.query(api.chatTurns.readTurn,
      await withSourceWrite('protected_action', {
        ...read, principal: { ...principal, scopes: [] }, correlationId: 'turn-key-scope',
      }))).rejects.toMatchObject({ data: { code: 'permission_denied' } })
    const { principal: otherKey } = await createTestAgentPrincipal(backend, 'turn-key-other')
    const foreign = { ...read, principal: { kind: 'agent_key' as const, ...otherKey },
      correlationId: 'turn-key-foreign' }
    const generation = await backend.query(internal.chatTurns.authorizeKeyGeneration, {
      turnRef: first.turnRef, threadId: first.threadId, promptMessageId: first.promptMessageId,
    })
    expect(generation).toMatchObject({ ownerId: key.ownerId, authority: {
      turnRef: first.turnRef, credentialLocator: key.credentialId, grantRef,
    } })
    if (generation === null) throw new Error('key_generation_unavailable')
    const payable = { authority: generation.authority, toolRef: `operation:v1:${'a'.repeat(64)}` }
    expect(await backend.query(internal.chatTurns.authorizePayableTool, payable)).toBe(true)
    await expect(backend.query(api.chatTurns.readTurn,
      await withSourceWrite('protected_action', foreign)))
      .rejects.toMatchObject({ data: { code: 'turn_not_found' } })
    await expect(backend.mutation(api.chatTurns.cancelTurn,
      await withSourceWrite('protected_action', { ...foreign, operationKey: 'chat-turn.cancel' })))
      .rejects.toMatchObject({ data: { code: 'turn_not_found' } })
    const cancel = { ...read, operationKey: 'chat-turn.cancel', correlationId: 'turn-key-cancel' }
    await backend.mutation(api.chatTurns.cancelTurn, await withSourceWrite('protected_action', cancel))
    expect(await backend.query(api.chatTurns.readTurn,
      await withSourceWrite('protected_action', { ...read, correlationId: 'turn-key-after-cancel' })))
      .toMatchObject({ state: 'canceled', cancelRequestedAt: expect.any(Number) })
    expect(await backend.query(internal.chatTurns.authorizeKeyGeneration, {
      turnRef: first.turnRef, threadId: first.threadId, promptMessageId: first.promptMessageId,
    })).toBeNull()
    expect(await backend.query(internal.chatTurns.authorizePayableTool, payable)).toBe(false)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try { await backend.finishAllScheduledFunctions(() => undefined) } finally { error.mockRestore() }
  })

  it('rate-limits new key Turns and separately caps replay streams per principal', async () => {
    const backend = convexTestWithMarketComponents()
    const { principal: key } = await createTestAgentPrincipal(backend, 'turn-key-rate')
    const principal = { kind: 'agent_key' as const, ...key }
    const submit = async (index: number) => backend.mutation(api.chatTurns.startTurn,
      await withSourceWrite('protected_action', {
        principal, clientTurnId: `rate-${index}`, prompt: 'Find a weather Tool',
        operationKey: 'chat-turn.start', correlationId: `rate-${index}`,
      }))
    const first = await submit(0)
    for (let index = 0; index < 30; index += 1) expect(await submit(0)).toEqual(first)
    await expect(submit(0)).rejects.toMatchObject({
      data: { code: 'rate_limited', retryAfter: expect.any(Number) },
    })
    for (let index = 1; index < 30; index += 1) await submit(index)
    await expect(submit(30)).rejects.toMatchObject({
      data: { code: 'rate_limited', retryAfter: expect.any(Number) },
    })
    const rows = await backend.run(ctx => ctx.db.query('chatTurns')
      .withIndex('by_principalRef_and_clientTurnId', q => q
        .eq('principalRef', key.principalId).eq('clientTurnId', 'rate-30')).collect())
    expect(rows).toEqual([])
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try { await backend.finishAllScheduledFunctions(() => undefined) } finally { error.mockRestore() }
  })

  it('keeps the old sendMessage result while persisting its Turn', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(backend, 'legacy-turn')
    const sent = await owner.mutation(internal.chatMessages.sendMessage, { prompt: 'Legacy chat prompt' })
    expect(sent).toEqual({ threadId: expect.any(String), promptMessageId: expect.any(String) })
    const rows = await backend.run(ctx => ctx.db.query('chatTurns')
      .withIndex('by_threadId_and_sequence', q => q.eq('threadId', sent.threadId)).collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ promptMessageId: sent.promptMessageId,
      principalKind: 'clerk_owner', state: 'submitted', sequence: 1 })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try { await backend.finishAllScheduledFunctions(() => undefined) } finally { error.mockRestore() }
  })
})
