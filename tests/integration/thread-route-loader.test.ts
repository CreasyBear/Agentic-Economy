import { afterEach, describe, expect, it } from 'vitest'

import { Route } from '@/routes/t.$threadId'

describe('/t/$threadId route loader', () => {
  const previousConvexUrl = process.env.CONVEX_URL
  const previousPublicConvexUrl = process.env.VITE_CONVEX_URL

  afterEach(() => {
    restoreEnv('CONVEX_URL', previousConvexUrl)
    restoreEnv('VITE_CONVEX_URL', previousPublicConvexUrl)
  })

  it('does not strand a completed answer when the client transition cannot read Convex directly', async () => {
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    await expect(
      (Route.options.loader as (input: { params: { threadId: string } }) => Promise<unknown>)({
        params: { threadId: 'thr_missing_env' },
      }),
    ).resolves.toMatchObject({
      projection: null,
      seo: undefined,
    })
  })
})

function restoreEnv(name: 'CONVEX_URL' | 'VITE_CONVEX_URL', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
