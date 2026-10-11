import { describe, expect, it } from 'vitest'

import { convexTestWithMarketComponents } from '../../../tests/helpers/convex-fixtures'
import { emitJourneyEvent } from './events'
import { readStalledPage } from './stalled'

describe('stalled min age', () => {
  it('treats an agent_connected account as stalled only after 24 hours', async () => {
    const backend = convexTestWithMarketComponents()
    const createdAt = await backend.run(async (ctx) => {
      await emitJourneyEvent(ctx, 'account:a', 'agent_connected')
      return (await ctx.db.query('journeyEvents').first())!.createdAt
    })
    const read = (now: number) => backend.run(ctx => readStalledPage(ctx, 'neverCalled', now, { numItems: 10, cursor: null }))
    expect((await read(createdAt + 24 * 3600_000 - 1)).page).toEqual([])
    expect((await read(createdAt + 24 * 3600_000 + 1)).page).toEqual([{ accountRef: 'account:a', since: createdAt }])
  })
})
