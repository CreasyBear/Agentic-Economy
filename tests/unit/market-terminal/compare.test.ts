import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCompareCommand } from '../../../tools/ae/commands/compare'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'

const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  apply: false,
}

const refs = [
  `operation:v1:${'a'.repeat(64)}`,
  `operation:v1:${'b'.repeat(64)}`,
]

const result = {
  kind: 'unavailable' as const,
  schemaVersion: 'registry-operations:v1' as const,
  reason: 'operation_not_found' as const,
  navigation: [],
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('anonymous Operation compare CLI', () => {
  it('posts exact refs to the canonical compare route without auth', async () => {
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk))
      return true
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await runCompareCommand(refs, options)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/compare')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ operationRefs: refs })
    expect(JSON.parse(output.join(''))).toEqual(result)
  })

  it('requires two exact refs before network work', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCompareCommand([refs[0]!], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'compare-usage',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
