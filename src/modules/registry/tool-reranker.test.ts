import { afterEach, describe, expect, it, vi } from 'vitest'
import { dependencyBreaker } from '@/lib/observability/circuit-breaker'
import { JevUnavailableError } from '@/modules/decision-engine/contracts'

const gateway = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@/modules/decision-engine/public', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  executeDecisionGateway: gateway.execute,
}))

import { rankCompactDirectoryRows } from './tool-reranker'

const rows = [{ title: 'Weather', summary: 'weather forecast api', provider: 'x' }] as never

describe('rankCompactDirectoryRows breaker', () => {
  afterEach(() => vi.restoreAllMocks())

  it('stops calling Jev and logs no error once open', async () => {
    gateway.execute.mockRejectedValue(new JevUnavailableError('service_unavailable'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    for (let i = 0; i < 5; i++) await rankCompactDirectoryRows(rows, 'weather forecast')
    expect(gateway.execute).toHaveBeenCalledTimes(5)
    warn.mockClear()
    const result = await rankCompactDirectoryRows(rows, 'weather forecast')
    expect(result.verdict).toBe('matched')
    expect(gateway.execute).toHaveBeenCalledTimes(5)
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    void dependencyBreaker
  })
})
