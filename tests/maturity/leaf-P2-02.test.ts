import { describe, expect, it } from 'vitest'

import {
  AUTHORITY_SURFACES,
  WORKLOAD_AUTHORITY_SURFACES,
  ConsequenceAuthorityBoundary,
} from '../../src/modules/authority/context/public'
import { createSurfaceAuthorityAdapters } from '../../src/lib/server/authority-boundary/public'

describe('P2-02 cross-surface authority contract', () => {
  it('declares every protected execution surface without an implicit internal exemption', () => {
    expect(AUTHORITY_SURFACES).toEqual([
      'http',
      'convex',
      'mcp',
      'cli',
      'callback',
      'worker',
      'job',
      'cron',
      'reconciliation',
    ])
    expect(WORKLOAD_AUTHORITY_SURFACES).toEqual([
      'callback',
      'worker',
      'job',
      'cron',
      'reconciliation',
    ])
    expect(typeof ConsequenceAuthorityBoundary).toBe('function')
    expect(typeof createSurfaceAuthorityAdapters).toBe('function')
    expect(AUTHORITY_SURFACES).not.toContain('internal')
    expect(AUTHORITY_SURFACES).not.toContain('superuser')
  })
})
