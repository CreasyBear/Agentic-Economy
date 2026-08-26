import { afterEach, describe, expect, it, vi } from 'vitest'

const gatewayProbe = vi.hoisted(() => ({
  modelCalls: vi.fn(),
}))

vi.mock('@/modules/model-gateway/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/model-gateway/public')>()
  const { mockModel } = await import('@convex-dev/agent')
  return {
    ...actual,
    openRouterModel: vi.fn((...args: unknown[]) => {
      gatewayProbe.modelCalls(...args)
      return mockModel({
        content: [{ type: 'text', text: 'The current keyless Operation remains available.' }],
      })
    }),
  }
})

import { api, internal } from '../../convex/_generated/api'
import { sendMessage as sendMessageRegistration } from '../../convex/chatMessages'
import { createThread as createThreadRegistration } from '../../convex/chatThreads'
import { generate as chatGenerateRegistration } from '../../convex/chatGenerate'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../helpers/convex-fixtures'

async function drainExpectedUnavailableGeneration(
  backend: ReturnType<typeof convexTestWithMarketComponents>,
): Promise<void> {
  const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    await backend.finishAllScheduledFunctions(() => undefined)
  } finally {
    reported.mockRestore()
  }
}

describe('scheduled chat consequence authority', () => {
  afterEach(() => {
    vi.useRealTimers()
    gatewayProbe.modelCalls.mockClear()
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_CHAT_SHARE_SECRET
    delete process.env.AE_LLM_MODEL
    delete process.env.AE_SITE_URL
  })

  it('arms the exact verified generation and preserves the current account-scoped read', async () => {
    const backend = convexTestWithMarketComponents()
    await publishedBusinessOwner(backend, 'chat-authority-bootstrap')
    const expiresAt = (Math.floor(Date.now() / 1_000) + 60) * 1_000
    await backend.run(async (ctx) => {
      const credential = await ctx.db.query('credentials').first()
      if (credential === null) throw new Error('chat_credential_fixture_missing')
      await ctx.db.patch(credential._id, {
        issuedAt: expiresAt - 60_000,
        expiresAt,
        expiryMaterialization: undefined,
      })
    })
    const owner = backend.withIdentity({
      subject: 'user_chat-authority-bootstrap',
      issuer: 'https://identity.example',
      exp: expiresAt / 1_000,
    })

    await expect(owner.mutation(
      api.interactiveAuthority.materializeCurrentInteractiveAuthority,
      {},
    )).resolves.toBe(true)
    await expect(owner.query(api.chatThreads.listThreads, { now: 1 }))
      .resolves.toMatchObject({ page: [] })
    const credential = await backend.run((ctx) => ctx.db.query('credentials').first())
    expect(credential?.expiryMaterialization).toMatchObject({
      state: 'scheduled',
      credentialGeneration: credential?.generation,
      credentialExpiresAt: credential?.expiresAt,
      scheduleRef: expect.any(String),
    })
    const firstScheduleRef = credential?.expiryMaterialization?.scheduleRef
    await expect(owner.mutation(
      api.interactiveAuthority.materializeCurrentInteractiveAuthority,
      {},
    )).resolves.toBe(true)
    const replay = await backend.run(async (ctx) => {
      const current = await ctx.db.query('credentials').first()
      const db = ctx.db as unknown as {
        system: {
          query: (tableName: string) => {
            take: (limit: number) => Promise<Array<{ name?: string }>>
          }
        }
      }
      const scheduledFunctions = await db.system.query('_scheduled_functions').take(100)
      return {
        scheduleRef: current?.expiryMaterialization?.scheduleRef,
        expirySchedules: scheduledFunctions.filter(
          ({ name }) => name === 'interactiveCredentialLifecycle:expireInteractiveCredential',
        ).length,
      }
    })
    expect(replay).toEqual({ scheduleRef: firstScheduleRef, expirySchedules: 1 })
  })

  it('fails closed without materializing caller-shaped or conflicting credential facts', async () => {
    const anonymousBackend = convexTestWithMarketComponents()
    await expect(anonymousBackend.mutation(
      api.interactiveAuthority.materializeCurrentInteractiveAuthority,
      {},
    )).resolves.toBe(false)
    const unknownIdentity = anonymousBackend.withIdentity({
      subject: 'user_unknown_materialization',
      issuer: 'https://identity.example',
      exp: 8_000_000_000,
    })
    await expect(unknownIdentity.mutation(
      api.interactiveAuthority.materializeCurrentInteractiveAuthority,
      {},
    )).resolves.toBe(false)

    const mismatchBackend = convexTestWithMarketComponents()
    const { owner: mismatchedOwner } = await publishedBusinessOwner(
      mismatchBackend,
      'chat-materialization-mismatch',
    )
    await mismatchBackend.run(async (ctx) => {
      const credential = await ctx.db.query('credentials').first()
      if (credential === null) throw new Error('chat_credential_fixture_missing')
      await ctx.db.patch(credential._id, {
        expiresAt: credential.expiresAt - 1_000,
        expiryMaterialization: undefined,
      })
    })
    await expect(mismatchedOwner.mutation(
      api.interactiveAuthority.materializeCurrentInteractiveAuthority,
      {},
    )).resolves.toBe(false)

    const conflictBackend = convexTestWithMarketComponents()
    const { owner: conflictedOwner } = await publishedBusinessOwner(
      conflictBackend,
      'chat-materialization-conflict',
    )
    await conflictBackend.run(async (ctx) => {
      const credential = await ctx.db.query('credentials').first()
      if (credential === null) throw new Error('chat_credential_fixture_missing')
      await ctx.db.patch(credential._id, {
        expiryMaterialization: {
          state: 'scheduled',
          credentialGeneration: credential.generation,
          credentialExpiresAt: credential.expiresAt,
          scheduleNonce: 'sha256:caller-shaped-conflict',
          scheduleRef: 'scheduled:caller-shaped-conflict',
          materializedAt: 1,
        },
      })
    })
    await expect(conflictedOwner.mutation(
      api.interactiveAuthority.materializeCurrentInteractiveAuthority,
      {},
    )).resolves.toBe(false)

    for (const backend of [mismatchBackend, conflictBackend]) {
      const expirySchedules = await backend.run(async (ctx) => {
        const db = ctx.db as unknown as {
          system: {
            query: (tableName: string) => {
              take: (limit: number) => Promise<Array<{ name?: string }>>
            }
          }
        }
        return (await db.system.query('_scheduled_functions').take(100)).filter(
          ({ name }) => name === 'interactiveCredentialLifecycle:expireInteractiveCredential',
        ).length
      })
      expect(expirySchedules).toBe(0)
    }
  })

  it('denies exact expiry, revocation, and cross-account reads', async () => {
    vi.useFakeTimers()
    const expiryBackend = convexTestWithMarketComponents()
    await publishedBusinessOwner(expiryBackend, 'chat-exact-expiry')
    const expiresAt = Date.parse('2026-08-26T12:00:01.000Z')
    vi.setSystemTime(expiresAt - 1_000)
    await expiryBackend.run(async (ctx) => {
      const credential = await ctx.db.query('credentials').first()
      if (credential === null) throw new Error('chat_credential_fixture_missing')
      await ctx.db.patch(credential._id, {
        issuedAt: expiresAt - 60_000,
        expiresAt,
        expiryMaterialization: undefined,
      })
    })
    const expiringOwner = expiryBackend.withIdentity({
      subject: 'user_chat-exact-expiry',
      issuer: 'https://identity.example',
      exp: expiresAt / 1_000,
    })
    await expect(expiringOwner.mutation(
      api.interactiveAuthority.materializeCurrentInteractiveAuthority,
      {},
    )).resolves.toBe(true)
    const scheduled = await expiryBackend.run((ctx) => ctx.db.query('credentials').first())
    if (scheduled?.expiryMaterialization?.state !== 'scheduled') {
      throw new Error('chat_credential_expiry_not_scheduled')
    }
    vi.setSystemTime(expiresAt)
    await expect(expiryBackend.mutation(
      internal.interactiveCredentialLifecycle.expireInteractiveCredential,
      {
        bindingRef: scheduled.bindingRef,
        credentialRef: scheduled.credentialRef,
        expectedGeneration: scheduled.generation,
        expectedExpiresAt: expiresAt,
        scheduleNonce: scheduled.expiryMaterialization.scheduleNonce,
      },
    )).resolves.toEqual({ kind: 'expired' })
    await expect(expiringOwner.query(api.chatThreads.listThreads, {
      now: expiresAt,
    })).rejects.toThrow('unauthenticated')

    vi.useRealTimers()
    const revokedBackend = convexTestWithMarketComponents()
    const { owner: revokedOwner } = await publishedBusinessOwner(revokedBackend, 'chat-revoked-read')
    await revokedBackend.run(async (ctx) => {
      const credential = await ctx.db.query('credentials').first()
      if (credential === null) throw new Error('chat_credential_fixture_missing')
      await ctx.db.patch(credential._id, { lifecycle: 'revoked' })
    })
    await expect(revokedOwner.query(api.chatThreads.listThreads, {
      now: Date.now(),
    })).rejects.toThrow('unauthenticated')

    const crossAccountBackend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(crossAccountBackend, 'chat-account-a')
    const { owner: stranger } = await publishedBusinessOwner(crossAccountBackend, 'chat-account-b')
    const sent = await owner.mutation(api.chatMessages.sendMessage, { prompt: 'Account A only' })
    await expect(stranger.query(api.chatMessages.listMessages, {
      threadId: sent.threadId,
      paginationOpts: { cursor: null, numItems: 20 },
    })).rejects.toThrow('thread_not_found')
    await drainExpectedUnavailableGeneration(crossAccountBackend)
  })

  it('re-derives the exact current Principal and Account before generation', async () => {
    const backend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(backend, 'chat-scheduled-authority')
    const sent = await owner.mutation(api.chatMessages.sendMessage, { prompt: 'Bound chat request' })
    const authority = await readAuthority(backend, 'chat-scheduled-authority')

    await expect(backend.query(internal.chatMessages.authorizeScheduledGeneration, {
      threadId: sent.threadId,
      promptMessageId: sent.promptMessageId,
      authority,
    })).resolves.toEqual({ ownerId: authority.accountRef })

    const callerShapedAccount = {
      ...authority,
      accountRef: `acc_${'f'.repeat(32)}`,
    }
    await expect(backend.query(internal.chatMessages.authorizeScheduledGeneration, {
      threadId: sent.threadId,
      promptMessageId: sent.promptMessageId,
      authority: callerShapedAccount,
    })).resolves.toBeNull()

    await expect(backend.query(internal.chatMessages.authorizeScheduledGeneration, {
      threadId: sent.threadId,
      promptMessageId: 'caller-shaped-prompt',
      authority,
    })).resolves.toBeNull()
    await drainExpectedUnavailableGeneration(backend)
  })

  it('re-derives current Principal and Account before scheduled provider work', async () => {
    process.env.OPENROUTER_API_KEY = 'runtime-authority-regression-key'
    process.env.AE_LLM_MODEL = 'openai/gpt-oss-120b'
    process.env.AE_SITE_URL = 'https://agentic-economy.example.test'
    const admittedBackend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(admittedBackend, 'chat-runtime-generation')
    const sent = await owner.mutation(api.chatMessages.sendMessage, {
      prompt: 'Keep the existing keyless chat outcome',
    })

    await admittedBackend.finishAllScheduledFunctions(() => undefined)
    expect(gatewayProbe.modelCalls).toHaveBeenCalledTimes(1)
    const admittedMessages = await owner.query(api.chatMessages.listMessages, {
      threadId: sent.threadId,
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(admittedMessages.page.map(({ role }) => role)).toEqual(['user', 'assistant'])
    expect(admittedMessages.page.find(({ role }) => role === 'assistant')?.text)
      .toContain('current keyless Operation')
    const admittedAuthority = await readAuthority(admittedBackend, 'chat-runtime-generation')
    const modelCallsAfterSettledGeneration = gatewayProbe.modelCalls.mock.calls.length
    await expect(admittedBackend.action(internal.chatGenerate.generate, {
      threadId: sent.threadId,
      promptMessageId: sent.promptMessageId,
      authority: admittedAuthority,
    })).rejects.toThrow('chat_generation_authority_invalid')
    expect(gatewayProbe.modelCalls).toHaveBeenCalledTimes(modelCallsAfterSettledGeneration)
    const replayMessages = await owner.query(api.chatMessages.listMessages, {
      threadId: sent.threadId,
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(replayMessages.page.map(({ role }) => role)).toEqual(['user', 'assistant'])

    const deniedBackend = convexTestWithMarketComponents()
    const { owner: deniedOwner } = await publishedBusinessOwner(deniedBackend, 'chat-runtime-denied')
    const denied = await deniedOwner.mutation(api.chatMessages.sendMessage, {
      prompt: 'Do not reach provider work after authority drift',
    })
    const deniedAuthority = await readAuthority(deniedBackend, 'chat-runtime-denied')
    await deniedBackend.run(async (ctx) => {
      const principal = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', deniedAuthority.principalRef))
        .unique()
      if (principal === null) throw new Error('chat_principal_fixture_missing')
      await ctx.db.patch(principal._id, { revision: principal.revision + 1 })
    })

    const modelCallsBeforeDeniedGeneration = gatewayProbe.modelCalls.mock.calls.length

    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await deniedBackend.finishAllScheduledFunctions(() => undefined)
    } finally {
      reported.mockRestore()
    }
    expect(gatewayProbe.modelCalls).toHaveBeenCalledTimes(modelCallsBeforeDeniedGeneration)
    await expect(deniedOwner.query(api.chatThreads.getThread, {
      threadId: denied.threadId,
      now: Date.now(),
    })).resolves.toMatchObject({ busy: false })
  })

  it('passes optional gateway settings through the registered generation handler', async () => {
    process.env.OPENROUTER_API_KEY = 'runtime-authority-regression-key'
    process.env.AE_LLM_MODEL = 'openai/gpt-oss-120b'
    process.env.AE_SITE_URL = 'https://agentic-economy.example.test'
    const backend = convexTestWithMarketComponents()
    await publishedBusinessOwner(backend, 'chat-generation-settings')
    const authority = await readAuthority(backend, 'chat-generation-settings')
    const runQuery = vi.fn(async () => null)
    const runMutation = vi.fn(async () => true)
    const handler = (chatGenerateRegistration as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler

    await expect(handler({ runQuery, runMutation }, {
      threadId: 'thread:settings',
      promptMessageId: 'message:settings',
      authority,
    })).rejects.toThrow('chat_generation_authority_invalid')
    expect(runMutation).toHaveBeenCalledOnce()
    expect(gatewayProbe.modelCalls).not.toHaveBeenCalled()

    delete process.env.AE_LLM_MODEL
    delete process.env.AE_SITE_URL
    await expect(handler({ runQuery, runMutation }, {
      threadId: 'thread:default-settings',
      promptMessageId: 'message:default-settings',
      authority,
    })).rejects.toThrow('chat_generation_authority_invalid')
    expect(runMutation).toHaveBeenCalledTimes(2)
  })

  it.each(['revoked', 'expired'] as const)('denies a %s credential at consequence time', async (kind) => {
    const backend = convexTestWithMarketComponents()
    const slug = `chat-scheduled-${kind}`
    const { owner } = await publishedBusinessOwner(backend, slug)
    const sent = await owner.mutation(api.chatMessages.sendMessage, { prompt: 'Current authority only' })
    const authority = await readAuthority(backend, slug)
    await backend.run(async (ctx) => {
      const credential = await ctx.db.query('credentials')
        .withIndex('by_credentialRef', (query) => query.eq('credentialRef', authority.provenance.credentialRef))
        .unique()
      if (credential === null) throw new Error('chat_credential_fixture_missing')
      if (kind === 'revoked') {
        await ctx.db.patch(credential._id, { lifecycle: 'revoked' })
      } else {
        await ctx.db.patch(credential._id, {
          issuedAt: 0,
          expiresAt: 1,
          expiryMaterialization: {
            state: 'scheduled',
            credentialGeneration: credential.generation,
            credentialExpiresAt: 1,
            scheduleNonce: 'sha256:expired-chat-authority',
            scheduleRef: 'scheduled:expired-chat-authority',
            materializedAt: 1,
          },
        })
      }
    })

    await expect(backend.query(internal.chatMessages.authorizeScheduledGeneration, {
      threadId: sent.threadId,
      promptMessageId: sent.promptMessageId,
      authority,
    })).resolves.toBeNull()
    await drainExpectedUnavailableGeneration(backend)
  })

  it('preserves the complete account-scoped thread lifecycle through public handlers', async () => {
    process.env.AE_CHAT_SHARE_SECRET = 'chat-thread-lifecycle-share-secret-32-bytes'
    const backend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(backend, 'chat-thread-lifecycle')

    const defaultThread = await owner.mutation(api.chatThreads.createThread, {})
    expect(defaultThread).toMatchObject({ title: 'New conversation', busy: false })
    const emptyThread = await owner.mutation(api.chatThreads.createThread, { title: '   ' })
    expect(emptyThread.title).toBe('New conversation')
    const titledThread = await owner.mutation(api.chatThreads.createThread, {
      title: `  ${'a'.repeat(100)}  `,
    })
    expect(Array.from(titledThread.title)).toHaveLength(80)

    await expect(owner.query(api.chatThreads.getThread, {
      threadId: titledThread.threadId,
      now: Date.now(),
    })).resolves.toMatchObject({ threadId: titledThread.threadId, busy: false })
    await expect(owner.query(api.chatThreads.listThreads, { now: Date.now() }))
      .resolves.toMatchObject({ page: expect.arrayContaining([
        expect.objectContaining({ threadId: defaultThread.threadId }),
        expect.objectContaining({ threadId: emptyThread.threadId }),
        expect.objectContaining({ threadId: titledThread.threadId }),
      ]) })
    await expect(owner.query(api.chatThreads.listThreads, {
      paginationOpts: { cursor: null, numItems: 2 },
      now: Date.now(),
    })).resolves.toMatchObject({ page: expect.any(Array) })

    for (const numItems of [0, 51, 1.5]) {
      await expect(owner.query(api.chatThreads.listThreads, {
        paginationOpts: { cursor: null, numItems },
        now: Date.now(),
      })).rejects.toThrow('chat_thread_page_size_invalid')
    }

    await expect(owner.query(api.chatThreads.searchThreads, {
      query: '   ',
      now: Date.now(),
    })).resolves.toMatchObject({ page: expect.any(Array) })
    await expect(owner.query(api.chatThreads.searchThreads, {
      query: 'aaaa',
      paginationOpts: { cursor: null, numItems: 20 },
      now: Date.now(),
    })).resolves.toMatchObject({ page: [expect.objectContaining({ threadId: titledThread.threadId })] })

    await expect(owner.mutation(api.chatThreads.renameThread, {
      threadId: titledThread.threadId,
      title: '   ',
    })).rejects.toThrow('thread_title_invalid')
    await expect(owner.mutation(api.chatThreads.renameThread, {
      threadId: titledThread.threadId,
      title: '  Renamed   account thread  ',
    })).resolves.toMatchObject({ title: 'Renamed account thread', busy: false })

    const busy = await owner.mutation(api.chatMessages.sendMessage, {
      threadId: titledThread.threadId,
      prompt: 'Keep this account thread busy',
    })
    await expect(owner.mutation(api.chatThreads.deleteThread, {
      threadId: titledThread.threadId,
    })).rejects.toThrow('thread_busy')
    await backend.mutation(internal.chatMessages.clearActiveGeneration, {
      threadId: busy.threadId,
      promptMessageId: busy.promptMessageId,
    })
    await owner.mutation(api.chatShares.issueShare, { threadId: titledThread.threadId })
    await expect(owner.mutation(api.chatThreads.deleteThread, {
      threadId: titledThread.threadId,
    })).resolves.toBeNull()
    await expect(owner.query(api.chatThreads.getThread, {
      threadId: titledThread.threadId,
      now: Date.now(),
    })).rejects.toThrow('thread_not_found')
    await drainExpectedUnavailableGeneration(backend)
  })

  it('reports durable chat-row insertion loss through the same registered handlers', async () => {
    const slug = 'chat-row-insertion-loss'
    const backend = convexTestWithMarketComponents()
    await publishedBusinessOwner(backend, slug)
    const identity = {
      subject: `user_${slug}`,
      issuer: 'https://identity.example',
      tokenIdentifier: `https://identity.example|user_${slug}`,
      exp: 8_000_000_000,
    }
    const createHandler = (createThreadRegistration as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const sendHandler = (sendMessageRegistration as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler

    const invokeWithLostInsertedRow = async (
      handler: (ctx: unknown, args: unknown) => Promise<unknown>,
      args: unknown,
    ) => await backend.run(async (ctx) => {
      const db = new Proxy(ctx.db, {
        get(target, property, receiver) {
          if (property === 'get') return async () => null
          const value = Reflect.get(target, property, receiver) as unknown
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      const runtimeCtx = new Proxy(ctx, {
        get(target, property, receiver) {
          if (property === 'auth') return { getUserIdentity: async () => identity }
          if (property === 'db') return db
          const value = Reflect.get(target, property, receiver) as unknown
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      return await handler(runtimeCtx, args)
    })

    await expect(invokeWithLostInsertedRow(createHandler, {}))
      .rejects.toThrow('chat_thread_create_failed')
    await expect(invokeWithLostInsertedRow(sendHandler, { prompt: 'Durable row required' }))
      .rejects.toThrow('chat_thread_create_failed')
  })
})

async function readAuthority(
  backend: ReturnType<typeof convexTestWithMarketComponents>,
  slug: string,
): Promise<InteractiveBusinessAuthorityContext> {
  return await backend.run(async (ctx) => {
    const tokenIdentifier = `https://identity.example|user_${slug}`
    const binding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', 'clerk/user')
        .eq('providerIdentifier', tokenIdentifier))
      .unique()
    if (binding === null) throw new Error('chat_binding_fixture_missing')
    const credential = await ctx.db.query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
        .eq('bindingRef', binding.bindingRef)
        .eq('generation', binding.credentialGeneration)
        .eq('lifecycle', 'active'))
      .unique()
    const principal = await ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
      .unique()
    const ownership = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) => query
        .eq('ownerPrincipalRef', binding.principalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (credential === null || principal === null || ownership === null) {
      throw new Error('chat_authority_fixture_missing')
    }
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', ownership.accountRef))
      .unique()
    const owner = await ctx.db.query('owners')
      .withIndex('by_canonicalPrincipalRef_and_canonicalAccountRef', (query) => query
        .eq('canonicalPrincipalRef', binding.principalRef)
        .eq('canonicalAccountRef', ownership.accountRef))
      .unique()
    if (account === null || owner === null) throw new Error('chat_account_fixture_missing')
    return {
      principalRef: binding.principalRef as InteractiveBusinessAuthorityContext['principalRef'],
      accountRef: account.accountRef as InteractiveBusinessAuthorityContext['accountRef'],
      legacyOwnerId: String(owner._id),
      legacyOwnerLocator: owner.clerkUserId,
      revision: {
        binding: binding.revision,
        credential: credential.revision,
        principal: principal.revision,
        account: account.revision,
        access: ownership.revision,
        currentOwnership: ownership.revision,
        currentOwnerPrincipal: principal.revision,
        compatibilityUpdatedAt: owner.updatedAt,
      },
      provenance: {
        providerNamespace: 'clerk/user',
        bindingRef: binding.bindingRef,
        credentialRef: credential.credentialRef,
        credentialGeneration: credential.generation,
        accessKind: 'ownership',
        accessRef: ownership.ownershipRef as InteractiveBusinessAuthorityContext['provenance']['accessRef'],
        currentOwnershipRef: ownership.ownershipRef as InteractiveBusinessAuthorityContext['provenance']['currentOwnershipRef'],
        resolvedAt: 1,
      },
    }
  })
}
