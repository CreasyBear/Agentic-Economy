import { afterEach, describe, expect, it, vi } from 'vitest'
import { callSecondaryLlmAdapter } from '@/modules/decision-engine/public'

const request = { state: { need: 'private buyer need' }, questions: { fits: { type: 'noul' as const } } }
afterEach(() => vi.restoreAllMocks())

describe('secondary inference usage and diagnostics', () => {
  it.each([
    [undefined, null, null],
    [{ prompt_tokens: 0, completion_tokens: 0 }, 0, 0],
    [{ prompt_tokens: 8 }, 8, null],
    [{ completion_tokens: 2 }, null, 2],
    [{ prompt_tokens: -1, completion_tokens: '2' }, null, null],
  ])('keeps usage honest for %j', async (usage, inputTokens, outputTokens) => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ model: 'provider/resolved', choices: [{ message: { content: JSON.stringify({ answers: { fits: { noul: 0.8 } } }) } }], usage }))
    const result = await callSecondaryLlmAdapter(request, { openrouterApiKey: 'test-secret', fetchImpl })
    expect(result.usage).toEqual({ inputTokens, outputTokens, estimatedCostAud: null })
    expect(result.model).toBe('provider/resolved')
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toMatchObject({ outcome: 'completed', outboundAttempts: 1, model: 'provider/resolved', modelSource: 'provider', usage: result.usage })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|test-secret/)
  })

  it.each([503, 200])('never logs or throws private response content for failure %s', async status => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider output test-secret', { status }))
    const error = await callSecondaryLlmAdapter(request, { openrouterApiKey: 'test-secret', fetchImpl }).catch(cause => cause)
    expect(error).toBeInstanceOf(Error)
    expect(JSON.stringify({ log: log.mock.calls, error: { message: error.message, cause: error.cause } })).not.toMatch(/private|test-secret/)
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toMatchObject({ outcome: 'failed', outboundAttempts: 1, usage: { inputTokens: null, outputTokens: null, estimatedCostAud: null } })
  })

  it('records cancellation without claiming zero cost', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(callSecondaryLlmAdapter(request, { openrouterApiKey: 'test-secret', fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new DOMException('private payload', 'AbortError')) })).rejects.toThrow('secondary_inference_failed')
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toMatchObject({ reason: 'cancelled', usage: { estimatedCostAud: null } })
  })

  it('keeps a successful result usable if the logging sink fails', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => { throw new Error('sink unavailable') })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"answers":{"fits":{"noul":0.8}}}' } }] }))
    await expect(callSecondaryLlmAdapter(request, { openrouterApiKey: 'test-secret', fetchImpl })).resolves.toMatchObject({ answers: { fits: { noul: 0.8 } } })
  })
})
