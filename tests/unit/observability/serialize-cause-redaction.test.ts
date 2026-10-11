import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureBackendException, degradeBackend } from '@/lib/observability/degrade-backend'

describe('serializeCause redaction', () => {
  afterEach(() => vi.restoreAllMocks())

  it('redacts bearer tokens and key assignments in logged causes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cause = new Error('upstream failed Authorization: Bearer sk_live_abc123 api_key=SUPERSECRET')
    degradeBackend(cause, null, { site: 't', reason: 'source_unavailable' })
    captureBackendException('token=hunter2xyz')
    const out = spy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(out).not.toMatch(/sk_live_abc123|SUPERSECRET|hunter2xyz/)
    expect(out).toContain('[Filtered]')
  })

  it('redacts secrets inside object causes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    degradeBackend({ header: 'Authorization: Bearer sk_live_objsecret999' }, null, { site: 't', reason: 'source_unavailable' })
    expect(spy.mock.calls.map((c) => c.join(' ')).join('\n')).not.toMatch(/sk_live_objsecret999/)
  })

  it('redacts bare code= query params but not error_code or status code', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    captureBackendException('GET /cb?code=abc123&state=x error_code=42 status code 500')
    const out = spy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(out).not.toContain('abc123')
    expect(out).toContain('error_code=42')
    expect(out).toContain('status code')
  })
})
