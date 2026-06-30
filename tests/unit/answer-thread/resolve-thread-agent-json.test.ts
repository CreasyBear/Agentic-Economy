import { describe, expect, it } from 'vitest'

import { resolveThreadAgentJson } from '@/modules/answer-thread/public'

describe('resolveThreadAgentJson', () => {
  it('points the thread footer at the latest full search', () => {
    const resolved = resolveThreadAgentJson([
      { query: 'Locksmith open now Footscray' },
      { query: 'Emergency plumber Brunswick' },
    ])

    expect(resolved.needQuery).toBe('Emergency plumber Brunswick')
    expect(resolved.agentJsonUrl).toBe('/api/businesses/search?q=Emergency+plumber+Brunswick')
  })

  it('points narrow follow-up threads at the resolved registry search', () => {
    const resolved = resolveThreadAgentJson([
      { query: 'plumber' },
      { query: 'Narrow to Parramatta' },
    ])

    expect(resolved.needQuery).toBe('plumber Parramatta')
    expect(resolved.agentJsonUrl).toBe('/api/businesses/search?q=plumber+Parramatta')
  })
})
