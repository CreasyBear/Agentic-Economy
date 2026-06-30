import { describe, expect, it } from 'vitest'

import { resolveIntentRoute } from '@/modules/answer-thread/internal/intent-router'
import { FollowUpIntentValues } from '@/modules/answer-thread/answer-thread.schema'

describe('resolveIntentRoute — exhaustive intent routing', () => {
  it('maps every FollowUpIntent to a deterministic route', () => {
    expect(resolveIntentRoute('refine_search').kind).toBe('tool_search')
    expect(resolveIntentRoute('filter_known').kind).toBe('frozen_filter')
    expect(resolveIntentRoute('compare_known').kind).toBe('frozen_compare')
    expect(resolveIntentRoute('explain_boundary').kind).toBe('boundary_explain')
    expect(resolveIntentRoute('unsupported').kind).toBe('unsupported')
  })

  it('covers every declared FollowUpIntent value (compile-time exhaustive)', () => {
    // If a new FollowUpIntent variant is added without a router case, the
    // switch in resolveIntentRoute stops returning IntentRoute and this test
    // also fails to cover the new value.
    for (const intent of FollowUpIntentValues) {
      expect(resolveIntentRoute(intent).kind).toBeTruthy()
    }
  })

  it('only the refine_search route exposes registry tools', () => {
    expect(resolveIntentRoute('refine_search').kind).toBe('tool_search')
    for (const intent of FollowUpIntentValues) {
      if (intent === 'refine_search') {
        continue
      }
      expect(resolveIntentRoute(intent).kind).not.toBe('tool_search')
    }
  })
})
