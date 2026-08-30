import type { LanguageModelV4 } from '@ai-sdk/provider'
import { mockModel } from '@convex-dev/agent'
import { getFunctionName, makeFunctionReference } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { components, internal } from '../../convex/_generated/api'
import type { ActionCtx } from '../../convex/_generated/server'
import { streamAnonymousChatResponse } from '../../convex/chatAnonymous'
import { createConvexServerFunctionAssertion } from '../../src/lib/server/convex-source'
import type { CustomerRequestServiceAssertion } from '../../src/modules/agent-access/service-auth-envelope'
import type * as ModelGatewayPublic from '@/modules/model-gateway/public'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'

const modelInjection = vi.hoisted(() => ({
  failModelConstruction: false,
  overrideModel: undefined as LanguageModelV4 | undefined,
}))

// The anonymous stream closure builds its model internally, so tests inject at
// this seam: a synchronous throw between config resolution and streamText
// return (the diagnosed live failure mode), or a fake model for the success path.
vi.mock('@/modules/model-gateway/public', async (importOriginal) => {
  const actual = await importOriginal<typeof ModelGatewayPublic>()
  return {
    ...actual,
    openRouterModel: (...args: Parameters<typeof actual.openRouterModel>) => {
      if (modelInjection.overrideModel !== undefined) return modelInjection.overrideModel
      if (modelInjection.failModelConstruction) {
        throw new Error('injected model construction failure')
      }
      return actual.openRouterModel(...args)
    },
  }
})

const ANONYMOUS_CHAT_PROXY_SECRET = 'anonymous-chat-proxy-test-secret-01'
const anonymousChatAdmissionKey = (salt: string): string =>
  `ip:sha256:${salt.repeat(64)}:sha256:${'b'.repeat(64)}`

function anonymousChatRequest(salt: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ae-chat-proxy-secret': ANONYMOUS_CHAT_PROXY_SECRET,
      'x-ae-chat-admission-key': anonymousChatAdmissionKey(salt),
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Find a weather operation' }] }),
  }
}

const testEnvKeys = ['AE_CHAT_PROXY_SECRET', 'OPENROUTER_API_KEY', 'AE_LLM_MODEL'] as const

function setTestEnv(values: Partial<Record<(typeof testEnvKeys)[number], string>>): () => void {
  const previous: Partial<Record<(typeof testEnvKeys)[number], string | undefined>> = {}
  for (const key of testEnvKeys) {
    previous[key] = process.env[key]
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return () => {
    for (const key of testEnvKeys) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
const admitAnonymousEdge = makeFunctionReference<'mutation', {
  key: string
  serviceAuth: CustomerRequestServiceAssertion
}, Readonly<{
  kind: 'admitted' | 'limited' | 'refused'
  retryAfter?: number
  code?: 'authentication_required'
}>>('chatAdmission:admitAnonymousEdge')
const admitHttp = makeFunctionReference<'mutation', {
  name: string
  key: string
}, Readonly<{ ok: boolean; retryAfter?: number }>>('rateLimit:admitHttp')

describe('anonymous operation chat transport', () => {
  it('streams from a fake model without creating Agent threads or messages', async () => {
    const backend = convexTestWithMarketComponents()
    const streamed = await backend.action(async (ctx) => {
      const queries: string[] = []
      const mutations: string[] = []
      const observedCtx = new Proxy(ctx, {
        get(target, property, receiver) {
          if (property === 'runQuery') {
            return (...args: Parameters<ActionCtx['runQuery']>) => {
              queries.push(getFunctionName(args[0]))
              return Reflect.apply(target.runQuery, target, args)
            }
          }
          if (property === 'runMutation') {
            return (...args: Parameters<ActionCtx['runMutation']>) => {
              mutations.push(getFunctionName(args[0]))
              return Reflect.apply(target.runMutation, target, args)
            }
          }
          return Reflect.get(target, property, receiver) as unknown
        },
      }) as ActionCtx
      const response = await streamAnonymousChatResponse(
        observedCtx,
        [{ role: 'user', content: 'Find a weather operation' }],
        mockModel({
          content: [{ type: 'text', text: 'A weather Operation is available.' }],
        }),
      )
      return { body: await response.text(), queries, mutations }
    })
    const [anonymousThreads, sentinelThreads] = await backend.run((ctx) => Promise.all([
      ctx.runQuery(components.agent.threads.listThreadsByUserId, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      ctx.runQuery(components.agent.threads.listThreadsByUserId, {
        userId: 'anonymous-ephemeral',
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ]))

    expect(streamed.body).toContain('"delta":" Operation"')
    expect(streamed.body).toContain('"delta":" available."')
    expect(streamed.queries).toEqual([])
    expect(streamed.mutations).toEqual([])
    expect(anonymousThreads.page).toEqual([])
    expect(sentinelThreads.page).toEqual([])
  })

  it('keeps the edge and Convex backstop admissions in independent hourly buckets', async () => {
    const previousServerKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN =
      'anonymous-chat-admission-test-token-at-least-32-characters'
    const backend = convexTestWithMarketComponents()
    const key = `ip:sha256:${'a'.repeat(64)}:sha256:${'b'.repeat(64)}`
    try {
      for (const name of ['chat-submit', 'chat-anonymous', 'chat-anonymous-edge']) {
        await expect(backend.mutation(admitHttp, { name, key })).rejects.toThrow()
      }
      const unsigned = {
        principalId: 'ae:server-function',
        ownerId: 'ae:server-function',
        credentialId: 'ae:server-function',
        scopes: ['chat_anonymous:admit'],
        issuedAt: Date.now(),
        signature: 'unsigned',
      }
      await expect(backend.mutation(admitAnonymousEdge, { key, serviceAuth: unsigned }))
        .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
      const forged = await createConvexServerFunctionAssertion({
        operation: 'chatAdmission.admitAnonymousEdge',
        scope: 'chat_anonymous:admit',
        command: { key: `${key}:forged` },
      })
      await expect(backend.mutation(admitAnonymousEdge, { key, serviceAuth: forged }))
        .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
      const serviceAuth = await createConvexServerFunctionAssertion({
        operation: 'chatAdmission.admitAnonymousEdge',
        scope: 'chat_anonymous:admit',
        command: { key },
      })
      await expect(backend.mutation(admitAnonymousEdge, { key, serviceAuth }))
        .resolves.toMatchObject({ kind: 'admitted' })
      await expect(backend.mutation(internal.rateLimit.admit, {
        name: 'chat-anonymous',
        key,
      })).resolves.toMatchObject({ ok: true })

      for (let index = 1; index < 30; index += 1) {
        await expect(backend.mutation(admitAnonymousEdge, { key, serviceAuth }))
          .resolves.toMatchObject({ kind: 'admitted' })
        await expect(backend.mutation(internal.rateLimit.admit, {
          name: 'chat-anonymous',
          key,
        })).resolves.toMatchObject({ ok: true })
      }
      await expect(backend.mutation(admitAnonymousEdge, { key, serviceAuth }))
        .resolves.toMatchObject({ kind: 'limited' })
      await expect(backend.mutation(internal.rateLimit.admit, {
        name: 'chat-anonymous',
        key,
      })).resolves.toMatchObject({ ok: false })
    } finally {
      if (previousServerKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
      else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServerKey
    }
  })

  it('answers chat_model_unconfigured when the model credential is absent', async () => {
    const restoreEnv = setTestEnv({
      AE_CHAT_PROXY_SECRET: ANONYMOUS_CHAT_PROXY_SECRET,
    })
    const backend = convexTestWithMarketComponents()
    try {
      const response = await backend.fetch('/chat/anonymous', anonymousChatRequest('c'))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({ code: 'chat_model_unconfigured' })
    } finally {
      restoreEnv()
    }
  })

  it('answers chat_stream_failed and logs a sanitized error when stream setup throws', async () => {
    const restoreEnv = setTestEnv({
      AE_CHAT_PROXY_SECRET: ANONYMOUS_CHAT_PROXY_SECRET,
      OPENROUTER_API_KEY: 'test-openrouter-key-not-a-real-credential',
    })
    modelInjection.failModelConstruction = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const backend = convexTestWithMarketComponents()
    try {
      const response = await backend.fetch('/chat/anonymous', anonymousChatRequest('d'))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({ code: 'chat_stream_failed' })
      expect(errorSpy).toHaveBeenCalledTimes(1)
      const [prefix, logged] = errorSpy.mock.calls[0] ?? []
      expect(prefix).toBe('[chat-anonymous] stream failed')
      expect(logged).toBeInstanceOf(Error)
      expect((logged as Error).message).toBe('injected model construction failure')
      expect((logged as Error).name).toBe('Error')
    } finally {
      errorSpy.mockRestore()
      modelInjection.failModelConstruction = false
      restoreEnv()
    }
  })

  it('keeps the proxied stream success path unchanged when the model resolves', async () => {
    const restoreEnv = setTestEnv({
      AE_CHAT_PROXY_SECRET: ANONYMOUS_CHAT_PROXY_SECRET,
      OPENROUTER_API_KEY: 'test-openrouter-key-not-a-real-credential',
    })
    modelInjection.overrideModel = mockModel({
      content: [{ type: 'text', text: 'A weather Operation is available.' }],
    })
    const backend = convexTestWithMarketComponents()
    try {
      const response = await backend.fetch('/chat/anonymous', anonymousChatRequest('e'))
      expect(response.status).toBe(200)
      const body = await response.text()
      expect(body).toContain('"delta":" Operation"')
      expect(body).toContain('"delta":" available."')
    } finally {
      modelInjection.overrideModel = undefined
      restoreEnv()
    }
  })
})
