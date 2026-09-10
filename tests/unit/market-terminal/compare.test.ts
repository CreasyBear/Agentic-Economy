import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCompareCommand } from '../../../tools/ae/commands/compare'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { commandUsage } from '../../../tools/ae/lib/help'
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

function tool(toolRef: string, providerName = 'Reference Services') {
  return {
    toolRef,
    capabilityId: 'reference.lookup',
    title: 'Reference quote',
    description: 'Look up one reference value.',
    provider: { name: providerName, slug: providerName.toLowerCase().replaceAll(' ', '-') },
    priceLabel: 'USD 1.25',
    healthStatus: 'operational' as const,
    listingTier: 'reviewed' as const,
  }
}

const result = {
  kind: 'ok' as const,
  schemaVersion: 'registry-tools:v3' as const,
  tools: [tool(refs[0]!)],
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('anonymous Tool compare CLI', () => {
  it('posts exact Tool refs to the canonical compare route without auth', async () => {
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

    await runCompareCommand(refs, { ...options, technical: true })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-tools/compare')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ toolRefs: refs })
    expect(JSON.parse(output.join(''))).toEqual({
      ...result,
      nextCommands: [{
        toolRef: refs[0],
        command: `ae describe ${refs[0]} --json --technical`,
      }],
    })
  })

  it('renders canonical comparison facts and gates technical identity behind --technical', async () => {
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk))
      return true
    })
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await runCompareCommand(refs, { ...options, json: false })
    const human = output.join('')
    expect(human).toContain('Reference Services — Reference quote')
    expect(human).toContain('indicative price: USD 1.25')
    expect(human).toContain('Choose one Provider, then describe its exact Tool:')
    expect(human).toContain(`ae describe ${refs[0]}`)

    output.length = 0
    await runCompareCommand(refs, { ...options, json: false, technical: true })
    const technical = output.join('')
    expect(technical).toContain(refs[0]!)
    expect(technical).toContain('schema: registry-tools:v3')
    expect(technical).toContain('capability=reference.lookup')
  })

  it('hands one exact Tool ref to describe without performing meaningless comparison work', async () => {
    expect(commandUsage('compare')).toBe(
      'ae compare <tool-ref> <tool-ref> [<tool-ref> ...]',
    )
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCompareCommand([refs[0]!], {
      ...options,
      baseUrl: 'http://[::1]:3024',
      baseUrlSource: 'flag',
      technical: true,
    })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'compare-needs-alternative',
      suggestion: 'Describe this Tool directly, or search for another Provider to compare.',
      nextCommand: `ae describe ${refs[0]} --base-url 'http://[::1]:3024' --json --technical`,
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns one exact describe continuation per Tool and preserves the selected origin and output mode', async () => {
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk))
      return true
    })
    const compared = {
      ...result,
      tools: [tool(refs[0]!), tool(refs[1]!, 'Alternative Services')],
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(compared), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    await runCompareCommand(refs, {
      ...options,
      baseUrl: 'http://[::1]:3024',
      baseUrlSource: 'flag',
      technical: true,
    })

    expect(JSON.parse(output.join(''))).toEqual({
      ...compared,
      nextCommands: refs.map((toolRef) => ({
        toolRef,
        command: `ae describe ${toolRef} --base-url 'http://[::1]:3024' --json --technical`,
      })),
    })
    expect(output.join('')).not.toMatch(/credential|password|secret|idempotency/iu)
  })

  it.each([
    { args: [], code: 'compare-usage' },
    { args: [refs[0]!, refs[1]!, refs[0]!, refs[1]!, refs[0]!], code: 'compare-usage' },
    { args: [refs[0]!, 'not-a-tool-ref'], code: 'compare-input' },
  ])('rejects malformed or out-of-bound refs before network work', async ({ args, code }) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCompareCommand(args, options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code,
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
