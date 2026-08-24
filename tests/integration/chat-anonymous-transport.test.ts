import { mockModel } from '@convex-dev/agent'
import { getFunctionName } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { components, internal } from '../../convex/_generated/api'
import type { ActionCtx } from '../../convex/_generated/server'
import { streamAnonymousChatResponse } from '../../convex/chatAnonymous'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'

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

  it('enforces thirty anonymous admissions per trusted hash each hour', async () => {
    const backend = convexTestWithMarketComponents()
    const key = `ip:sha256:${'a'.repeat(64)}:sha256:${'b'.repeat(64)}`
    for (let index = 0; index < 30; index += 1) {
      await expect(backend.mutation(internal.rateLimit.admit, {
        name: 'chat-anonymous',
        key,
      })).resolves.toMatchObject({ ok: true })
    }
    await expect(backend.mutation(internal.rateLimit.admit, {
      name: 'chat-anonymous',
      key,
    })).resolves.toMatchObject({ ok: false })
  })
})
