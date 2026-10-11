import { describe, expect, it, vi } from 'vitest'
import { CircuitOpenError, createCircuitBreaker } from './circuit-breaker'

describe('circuit breaker', () => {
  const setup = () => {
    let t = 0
    const breaker = createCircuitBreaker({ threshold: 5, openMs: 30_000, now: () => t })
    const fail = vi.fn(async () => { throw new Error('down') })
    return { breaker, fail, advance: (ms: number) => { t += ms } }
  }
  const trip = async (s: ReturnType<typeof setup>) => {
    for (let i = 0; i < 5; i++) await expect(s.breaker.run('a', s.fail)).rejects.toThrow('down')
  }

  it('opens after 5 failures and skips the call while open', async () => {
    const s = setup()
    await trip(s)
    await expect(s.breaker.run('a', s.fail)).rejects.toBeInstanceOf(CircuitOpenError)
    expect(s.fail).toHaveBeenCalledTimes(5)
    await expect(s.breaker.run('b', async () => 1)).resolves.toBe(1)
  })

  it('half-open probe closes on success', async () => {
    const s = setup()
    await trip(s)
    s.advance(30_000)
    await expect(s.breaker.run('a', async () => 'ok')).resolves.toBe('ok')
    await expect(s.breaker.run('a', async () => 'again')).resolves.toBe('again')
  })

  it('half-open probe re-opens on failure', async () => {
    const s = setup()
    await trip(s)
    s.advance(30_000)
    await expect(s.breaker.run('a', s.fail)).rejects.toThrow('down')
    await expect(s.breaker.run('a', s.fail)).rejects.toBeInstanceOf(CircuitOpenError)
  })
})
