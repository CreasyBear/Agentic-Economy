import { describe, expect, it } from 'vitest'

import { assertDecisionMapThreadOwner } from '@/modules/decision-map/internal/session-ownership'

const thread = { threadId: 'thread-1', pseudonymousSessionId: 'session-1' }

describe('decision-map session ownership', () => {
  it('accepts only the session that owns the exact answer thread', () => {
    expect(() => assertDecisionMapThreadOwner('thread-1', 'session-1', thread)).not.toThrow()
    expect(() => assertDecisionMapThreadOwner('thread-1', 'session-2', thread)).toThrow('thread_forbidden')
    expect(() => assertDecisionMapThreadOwner('thread-2', 'session-1', thread)).toThrow('thread_forbidden')
    expect(() => assertDecisionMapThreadOwner(undefined, 'session-1', null)).toThrow('thread_forbidden')
  })
})
