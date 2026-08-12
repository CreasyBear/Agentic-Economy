import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { buildAnswerRunReport, type FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import { parsePublicThreadProjection } from '@/modules/answer-thread/public'
import {
  answerThreadShareAccessId,
  answerThreadShareVerifier,
} from '@/modules/answer-thread/internal/share-token'
import {
  createSourceWriteAdmission,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import { writeStoredThreadRecords } from '@/components/ae/chat/thread-records-store'
import { buildSharedThreadSeo } from '@/modules/seo/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { handleIssueAnswerThreadShareRequest, handleRevokeAnswerThreadShareRequest } from '@/routes/api.answer.threads.$threadId.share'
import { loadSharedThreadRouteReadback } from '@/routes/s.$shareToken'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  readSessionCookieFromResponse,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'
import { convexModules as modules } from '../helpers/convex-fixtures'

const SHARE_SOURCE_WRITE_SECRET = 'answer-thread-share-source-write-secret'
const SHARE_SECRET = 'answer-thread-share-keyring-secret-32-characters'
const SHARE_KEY_ID = 'answer-thread-share-test-v1'
const SHARE_SOURCE_REQUEST = {
  method: 'POST',
  initiatorOrigin: 'http://127.0.0.1:3024',
  targetOrigin: 'http://127.0.0.1:3024',
  targetPath: '/api/answer/turn',
  targetQuery: '',
} as const
const previousSourceWriteSecret = process.env.AE_SOURCE_WRITE_SECRET
const previousShareSecret = process.env.AE_ANSWER_THREAD_SHARE_SECRET
const previousShareKeyId = process.env.AE_ANSWER_THREAD_SHARE_KEY_ID

describe('public thread share route', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    restoreEnvironment('AE_SOURCE_WRITE_SECRET', previousSourceWriteSecret)
    restoreEnvironment('AE_ANSWER_THREAD_SHARE_SECRET', previousShareSecret)
    restoreEnvironment('AE_ANSWER_THREAD_SHARE_KEY_ID', previousShareKeyId)
    vi.unstubAllGlobals()
  })

  it('loads the public projection and OG tags without auth', async () => {
    const canonicalBaseUrl = 'https://share.agentic.test'
    const store = createAnswerThreadTestStore()
    const resetPort = installAnswerThreadTestPort(store)
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair. The business confirms timing, price, availability, and the work.',
        whatToDoNow: 'Open the provider page and send an inquiry when published. The business confirms timing, price, availability, and the work.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousCanonicalBaseUrl = process.env.AE_CANONICAL_BASE_URL

    try {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
      process.env.AE_CANONICAL_BASE_URL = canonicalBaseUrl

        const turnResponse = await handleAnswerTurnRequest(
          new Request(`${canonicalBaseUrl}/api/answer/turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-AE-Turn-Key': 'share:emergency-plumber-parramatta' },
            body: JSON.stringify({ query: 'emergency plumber parramatta' }),
          }),
        )
        await turnResponse.text()
        const sessionCookie = readSessionCookieFromResponse(turnResponse)
        expect(sessionCookie.length).toBeGreaterThan(0)

        const threadId = [...store.threads.values()].at(0)?.threadId
        expect(threadId).toBeDefined()

        // Issue the share grant through the current owner API, then read the
        // projection through the token-only public route seam.
        const shareResponse = await handleIssueAnswerThreadShareRequest(
          new Request(`${canonicalBaseUrl}/api/answer/threads/${encodeURIComponent(threadId as string)}/share`, {
            method: 'POST',
            headers: { cookie: sessionCookieHeader(sessionCookie) },
          }),
          threadId as string,
        )
        expect(shareResponse.status).toBe(200)
        const shareBody = (await shareResponse.json()) as { sharePath: string }
        expect(shareBody.sharePath).toMatch(/^\/s\/[0-9a-f]{64}$/)
        const shareToken = shareBody.sharePath.slice('/s/'.length)

        const routeReadback = await loadSharedThreadRouteReadback(
          shareToken,
          new Request(`${canonicalBaseUrl}${shareBody.sharePath}`),
        )
        expect(routeReadback.projection).not.toBeNull()
        if (routeReadback.projection === null) {
          throw new Error('Expected a public shared thread projection.')
        }
        const projection = routeReadback.projection
        expect(projection.threadId).toBe(threadId)
        expect(projection.title).toBe('emergency plumber parramatta')
        expect(projection.turns.length).toBeGreaterThanOrEqual(1)

        const firstTurn = projection.turns.at(0)
        const seo = buildSharedThreadSeo({
          threadId: projection.threadId,
          shareToken,
          title: projection.title,
          ...(firstTurn === undefined ? {} : { firstTurnOneLine: firstTurn.oneLine }),
          options: { canonicalBaseUrl },
        })

        expect(routeReadback.seo).toEqual(seo)
        expect(seo.canonicalUrl).toBe(`${canonicalBaseUrl}/s/${shareToken}`)
        expect(seo.shareToken).toBe(shareToken)
        expect(seo.indexDirective).toBe('noindex')
        expect(seo.ogType).toBe('article')
        expect(seo.title).toContain('Agentic Economy')
        // Share copy must stay boundary-honest.
        expect(seo.description).not.toMatch(/book now|booking confirmed|pay now|payment required/i)
        expect(server.requests.length).toBeLessThanOrEqual(3)
      } finally {
        restoreOpenRouter()
        await server.close()
        if (previousLocalRegistry === undefined) {
          delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
        } else {
          process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
        }
        if (previousCanonicalBaseUrl === undefined) {
          delete process.env.AE_CANONICAL_BASE_URL
        } else {
          process.env.AE_CANONICAL_BASE_URL = previousCanonicalBaseUrl
        }
        resetPort()
      }
  })

  it('returns unavailable for an unknown share token without auth', async () => {
    const store = createAnswerThreadTestStore()
    const resetPort = installAnswerThreadTestPort(store)

    try {
      const shareToken = 'a'.repeat(64)
      const readback = await loadSharedThreadRouteReadback(
        shareToken,
        new Request(`https://ae.example/s/${shareToken}`),
      )
      expect(readback.projection).toBeNull()
      expect(readback.unavailable).toBe(true)
    } finally {
      resetPort()
    }
  })
  it('conceals share issue and revoke without an owner cookie', async () => {
    const issueResponse = await handleIssueAnswerThreadShareRequest(
      new Request('https://ae.example/api/answer/threads/thread-no-cookie/share', { method: 'POST' }),
      'thread-no-cookie',
    )
    expect(issueResponse.status).toBe(404)
    expect(await issueResponse.json()).toMatchObject({ code: 'thread_not_found' })

    const revokeResponse = await handleRevokeAnswerThreadShareRequest(
      new Request('https://ae.example/api/answer/threads/thread-no-cookie/share', { method: 'DELETE' }),
      'thread-no-cookie',
    )
    expect(revokeResponse.status).toBe(404)
    expect(await revokeResponse.json()).toMatchObject({ code: 'thread_not_found' })
  })

  it('keeps an active Convex share URL stable, revokes immediately, and remints after revoke', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SHARE_SOURCE_WRITE_SECRET
    process.env.AE_ANSWER_THREAD_SHARE_SECRET = SHARE_SECRET
    process.env.AE_ANSWER_THREAD_SHARE_KEY_ID = SHARE_KEY_ID
    const backend = convexTest(schema, modules)
    const threadId = 'thread-share-lifecycle'
    const sessionId = 'session-share-lifecycle-owner'
    await insertThread(backend, threadId, sessionId, 'Share lifecycle')

    const first = await issueShare(backend, threadId, sessionId, 'share:lifecycle:issue:first')
    const second = await issueShare(backend, threadId, sessionId, 'share:lifecycle:issue:second')
    expect(second).toEqual(first)
    expect(`/s/${second.shareToken}`).toBe(`/s/${first.shareToken}`)

    const firstRows = await readShareRows(backend, threadId)
    expect(firstRows).toHaveLength(1)
    const firstRow = firstRows[0]
    if (firstRow === undefined) throw new Error('Expected the active share row.')
    expect(firstRow).toMatchObject({
      threadId,
      accessId: answerThreadShareAccessId(first.shareToken),
      generation: 1,
      verifier: answerThreadShareVerifier(first.shareToken, SHARE_SECRET),
      keyId: SHARE_KEY_ID,
      status: 'active',
    })
    expect(JSON.stringify(firstRow)).not.toContain(first.shareToken)
    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: first.shareToken,
    })).resolves.not.toBeNull()

    await expect(revokeShare(backend, threadId, sessionId, 'share:lifecycle:revoke:first')).resolves.toEqual({
      threadId,
      revoked: true,
    })
    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: first.shareToken,
    })).resolves.toBeNull()
    await expect(revokeShare(backend, threadId, sessionId, 'share:lifecycle:revoke:repeat')).resolves.toEqual({
      threadId,
      revoked: false,
    })

    const reissued = await issueShare(backend, threadId, sessionId, 'share:lifecycle:issue:reissue')
    expect(reissued.shareToken).not.toBe(first.shareToken)
    expect(`/s/${reissued.shareToken}`).not.toBe(`/s/${first.shareToken}`)
    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: first.shareToken,
    })).resolves.toBeNull()
    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: reissued.shareToken,
    })).resolves.not.toBeNull()

    const reissuedRows = await readShareRows(backend, threadId)
    expect(reissuedRows).toHaveLength(1)
    expect(reissuedRows[0]).toMatchObject({
      accessId: answerThreadShareAccessId(reissued.shareToken),
      generation: 2,
      verifier: answerThreadShareVerifier(reissued.shareToken, SHARE_SECRET),
      keyId: SHARE_KEY_ID,
      status: 'active',
    })
    expect(JSON.stringify(reissuedRows[0])).not.toContain(reissued.shareToken)
  })

  it('keeps foreign owners and share credentials out of owner operations, then deletes the grant', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SHARE_SOURCE_WRITE_SECRET
    process.env.AE_ANSWER_THREAD_SHARE_SECRET = SHARE_SECRET
    process.env.AE_ANSWER_THREAD_SHARE_KEY_ID = SHARE_KEY_ID
    const backend = convexTest(schema, modules)
    const threadId = 'thread-share-authority'
    const ownerSessionId = 'session-share-authority-owner'
    const foreignSessionId = 'session-share-authority-foreign'
    await insertThread(backend, threadId, ownerSessionId, 'Share authority')
    const issued = await issueShare(backend, threadId, ownerSessionId, 'share:authority:issue')

    await expect(issueShare(backend, threadId, foreignSessionId, 'share:authority:foreign:issue')).rejects.toThrow('thread_forbidden')
    await expect(revokeShare(backend, threadId, foreignSessionId, 'share:authority:foreign:revoke')).rejects.toThrow('thread_forbidden')

    await expect(backend.query(api.answerThreads.listSessionThreads, {
      pseudonymousSessionId: issued.shareToken,
      limit: 20,
    })).resolves.toEqual({ threads: [] })
    await expect(backend.query(api.answerThreads.getOwnedThreadProjection, {
      threadId,
      pseudonymousSessionId: issued.shareToken,
    })).resolves.toBeNull()
    await expect(backend.mutation(api.answerThreads.reserveAnswerTurn, await shareAdmission({
      sessionId: issued.shareToken,
      requestedThreadScope: threadId,
      query: 'credential follow-up must fail',
      requestDigest: 'share-credential-follow-up-digest',
      reservationKey: 'share:authority:credential:follow-up',
      title: 'credential follow-up must fail',
      operationKey: 'share:authority:credential:follow-up',
      correlationId: 'share:authority:credential:follow-up',
    }))).resolves.toEqual({ kind: 'refused', reason: 'thread_forbidden' })
    await expect(backend.mutation(api.answerThreads.stopAnswerTurn, await shareAdmission({
      sessionId: issued.shareToken,
      threadId,
      turnId: 'share-credential-turn',
      operationKey: 'share:authority:credential:stop',
      correlationId: 'share:authority:credential:stop',
    }))).resolves.toEqual({ kind: 'not_found' })
    await expect(revokeShare(backend, threadId, issued.shareToken, 'share:authority:credential:revoke')).rejects.toThrow('thread_forbidden')
    await expect(issueShare(backend, threadId, issued.shareToken, 'share:authority:credential:issue')).rejects.toThrow('thread_forbidden')
    await expect(backend.mutation(api.answerThreads.deleteAnswerThread, await shareAdmission({
      threadId,
      pseudonymousSessionId: issued.shareToken,
      operationKey: 'share:authority:credential:delete',
      correlationId: 'share:authority:credential:delete',
    }))).rejects.toThrow('thread_forbidden')

    await expect(backend.mutation(api.answerThreads.deleteAnswerThread, await shareAdmission({
      threadId,
      pseudonymousSessionId: ownerSessionId,
      operationKey: 'share:authority:owner:delete',
      correlationId: 'share:authority:owner:delete',
    }))).resolves.toEqual({ threadId })
    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: issued.shareToken,
    })).resolves.toBeNull()
    await expect(readShareRows(backend, threadId)).resolves.toEqual([])
  })

  it('fails closed for wrong and removed share keyring entries', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SHARE_SOURCE_WRITE_SECRET
    process.env.AE_ANSWER_THREAD_SHARE_SECRET = SHARE_SECRET
    process.env.AE_ANSWER_THREAD_SHARE_KEY_ID = SHARE_KEY_ID
    const backend = convexTest(schema, modules)
    const threadId = 'thread-share-keyring'
    const sessionId = 'session-share-keyring-owner'
    await insertThread(backend, threadId, sessionId, 'Share keyring')
    const issued = await issueShare(backend, threadId, sessionId, 'share:keyring:issue')

    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: issued.shareToken,
    })).resolves.not.toBeNull()
    process.env.AE_ANSWER_THREAD_SHARE_SECRET = `${SHARE_SECRET}-wrong`
    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: issued.shareToken,
    })).resolves.toBeNull()

    process.env.AE_ANSWER_THREAD_SHARE_SECRET = SHARE_SECRET
    delete process.env.AE_ANSWER_THREAD_SHARE_KEY_ID
    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: issued.shareToken,
    })).resolves.toBeNull()
  })

  it('keeps the actual shared projection sanitized around private turn and tool rows', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SHARE_SOURCE_WRITE_SECRET
    process.env.AE_ANSWER_THREAD_SHARE_SECRET = SHARE_SECRET
    process.env.AE_ANSWER_THREAD_SHARE_KEY_ID = SHARE_KEY_ID
    const backend = convexTest(schema, modules)
    const threadId = 'thread-share-sanitized'
    const sessionId = 'session-share-sanitized-owner'
    const turnId = 'turn-share-sanitized'
    const shareTokenMarker = 'private-share-token-marker'
    await insertThread(backend, threadId, sessionId, 'Share sanitized')
    await backend.run(async (ctx) => {
      await ctx.db.insert('answerTurns', {
        turnId,
        threadId,
        seq: 1,
        query: 'safe public query',
        intent: 'refine_search',
        evidenceJson: projectionEvidenceJson('private-snapshot-hash'),
        snapshotHash: 'private-snapshot-hash',
        proseJson: JSON.stringify({
          oneLine: 'Safe public answer',
          summary: 'Safe public summary',
          nextStep: 'Safe public next step',
        }),
        artifactKindsJson: '[]',
        status: 'complete',
        errorCopyId: 'private-error-copy',
        createdAt: 2,
      })
      await ctx.db.insert('answerToolCalls', {
        toolCallId: 'tool-call-share-sanitized',
        turnId,
        seq: 1,
        toolId: 'registry.search',
        inputJson: JSON.stringify({ private: shareTokenMarker }),
        resultSummaryJson: JSON.stringify({ private: 'private-tool-summary' }),
        resultJson: JSON.stringify({ private: 'private-tool-result' }),
        resultHash: 'private-tool-result-hash',
        status: 'complete',
        createdAt: 2,
      })
    })
    const issued = await issueShare(backend, threadId, sessionId, 'share:sanitized:issue')
    const encodedShared = await backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: issued.shareToken,
    })
    const shared = encodedShared === null
      ? null
      : parsePublicThreadProjection(JSON.parse(encodedShared))
    expect(shared).toMatchObject({
      threadId,
      title: 'Share sanitized',
      turns: [{
        turnId,
        seq: 1,
        query: 'safe public query',
        status: 'complete',
        oneLine: 'Safe public answer',
      }],
    })
    const serialized = JSON.stringify(shared)
    expect(serialized).not.toContain(issued.shareToken)
    expect(serialized).not.toContain(sessionId)
    expect(serialized).not.toContain('private-snapshot-hash')
    expect(serialized).not.toContain('private-error-copy')
    expect(serialized).not.toContain('private-share-token-marker')
    expect(serialized).not.toContain('private-tool-summary')
    expect(serialized).not.toContain('private-tool-result')
    expect(serialized).not.toContain('private-tool-result-hash')
    expect(serialized).not.toContain('evidenceJson')
    expect(serialized).not.toContain('proseJson')
  })

  it('keeps share credentials out of recent-thread session storage', () => {
    const shareToken = 'b'.repeat(64)
    const storage = new Map<string, string>()
    vi.stubGlobal('window', {
      sessionStorage: {
        setItem(key: string, value: string) {
          storage.set(key, value)
        },
        getItem(key: string) {
          return storage.get(key) ?? null
        },
      },
    })
    writeStoredThreadRecords([Object.assign({
      threadId: 'thread-share-storage',
      pseudonymousSessionId: 'session-share-storage-owner',
      title: 'Share storage',
      createdAt: 1,
      updatedAt: 2,
    }, { shareToken })])

    const serialized = storage.get('ae.recentThreads.v1') ?? ''
    expect(serialized).not.toContain(shareToken)
    expect(JSON.parse(serialized)).toEqual([{
      threadId: 'thread-share-storage',
      pseudonymousSessionId: '',
      title: 'Share storage',
      createdAt: 1,
      updatedAt: 2,
    }])
  })
})

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

type SourceWriteCommand = {
  operationKey: string
  correlationId: string
  [key: string]: unknown
}

async function shareAdmission<T extends SourceWriteCommand>(command: T, nonce = command.operationKey) {
  const sourceWriteRequest: SourceWriteAdmissionRequest = {
    ...SHARE_SOURCE_REQUEST,
    bodyDigest: sourceWriteCommandBodyDigest(command),
  }
  return {
    ...command,
    sourceWriteRequest,
    sourceWrite: await createSourceWriteAdmission({
      env: { AE_SOURCE_WRITE_SECRET: SHARE_SOURCE_WRITE_SECRET },
      request: sourceWriteRequest,
      scope: 'answer_thread',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
      nonce,
    }),
  }
}

async function insertThread(
  backend: TestConvex<typeof schema>,
  threadId: string,
  pseudonymousSessionId: string,
  title: string,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('answerThreads', {
      threadId,
      pseudonymousSessionId,
      title,
      createdAt: 1,
      updatedAt: 1,
    })
  })
}

async function issueShare(
  backend: TestConvex<typeof schema>,
  threadId: string,
  pseudonymousSessionId: string,
  operationKey: string,
) {
  return backend.mutation(api.answerThreads.issueAnswerThreadShare, await shareAdmission({
    threadId,
    pseudonymousSessionId,
    operationKey,
    correlationId: operationKey,
  }))
}

async function revokeShare(
  backend: TestConvex<typeof schema>,
  threadId: string,
  pseudonymousSessionId: string,
  operationKey: string,
) {
  return backend.mutation(api.answerThreads.revokeAnswerThreadShare, await shareAdmission({
    threadId,
    pseudonymousSessionId,
    operationKey,
    correlationId: operationKey,
  }))
}

async function readShareRows(backend: TestConvex<typeof schema>, threadId: string) {
  return backend.run(async (ctx) =>
    ctx.db
      .query('answerThreadShares')
      .withIndex('by_threadId', (query) => query.eq('threadId', threadId))
      .collect(),
  )
}

function projectionEvidenceJson(snapshotHash: string): string {
  const evidence: FrozenTurnEvidenceDraft = {
    providers: [],
    allowedSlugs: [],
    agentJsonUrl: '',
    toolCalls: [],
    timings: [],
    workLog: [],
  }
  return JSON.stringify({
    ...evidence,
    answerRun: buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash,
      evidence,
    }),
  })
}
