import { afterEach, describe, expect, it, vi } from 'vitest'

import { runInspectPlanCommand } from '../../../tools/ae/commands/inspect-plan'
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

describe('anonymous Operation inspect-plan CLI', () => {
  it('posts exact refs to the canonical inspect-plan route without auth', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInspectPlanCommand(refs, options)).rejects.toMatchObject({
      kind: 'NOT_FOUND',
      code: 'operation_not_found',
      exitCode: 1,
    } satisfies Partial<CliFailure>)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/inspect-plan')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ operationRefs: refs })
  })

  it.each([
    { label: 'no refs', args: [] },
    {
      label: 'five refs',
      args: [
        ...refs,
        `operation:v1:${'c'.repeat(64)}`,
        `operation:v1:${'d'.repeat(64)}`,
        `operation:v1:${'e'.repeat(64)}`,
      ],
    },
  ])('rejects $label before network work', async ({ args }) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInspectPlanCommand(args, options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'inspect-plan-usage',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
