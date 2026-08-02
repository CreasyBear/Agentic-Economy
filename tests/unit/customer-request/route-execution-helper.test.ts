import { describe, expect, it } from 'vitest'

import { parseBoundedJson } from '@/modules/common/bounded-json'
import { exportState } from '@/modules/customer-request/route-execution/journal'

describe('customer-request route execution helpers', () => {
  it('parses valid JSON while rejecting malformed and over-depth values', () => {
    expect(parseBoundedJson('{"status":"ok","count":2}')).toEqual({ status: 'ok', count: 2 })
    expect(parseBoundedJson('not-json')).toBeUndefined()

    let deepJson = 'null'
    for (let depth = 0; depth < 65; depth += 1) deepJson = `[${deepJson}]`
    expect(parseBoundedJson(deepJson)).toBeUndefined()
  })

  it('projects every persisted attempt state through the module seam', () => {
    const projections = [
      ['queued', 'queued'],
      ['dispatched', 'contacting'],
      ['accepted', 'awaiting_result'],
      ['succeeded', 'completed'],
      ['failed', 'failed'],
      ['outcome_unknown', 'outcome_unknown'],
      ['cancelled', 'cancelled'],
    ] as const

    for (const [state, expected] of projections) expect(exportState(state)).toBe(expected)
  })
})
