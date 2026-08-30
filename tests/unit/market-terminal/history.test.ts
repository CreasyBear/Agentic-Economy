import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runHistoryCommand } from '../../../tools/ae/commands/history'
import { storeConnection } from '../../../tools/ae/lib/config'
import type { CliOptions } from '../../../tools/ae/lib/args'

let directory = ''
const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  limit: '5',
  cursor: 'cursor:one',
  state: 'completed',
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ae-cli-history-'))
  process.env.AE_CONFIG_DIR = directory
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  storeConnection({ baseUrl: options.baseUrl, accessToken: 'buyer-secret', scope: 'market_operations:invoke' })
})

afterEach(() => {
  delete process.env.AE_CONFIG_DIR
  rmSync(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AE CLI invocation history', () => {
  it('lists exact owned invocation summaries with opaque pagination', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/operations?limit=5&cursor=cursor%3Aone&state=completed')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer buyer-secret')
      return Response.json({
        kind: 'available',
        items: [{
          invocationRef: 'invocation:one',
          operationRef: 'operation:one',
          state: 'completed',
          createdAt: 10,
          updatedAt: 20,
        }],
        hasMore: true,
        nextCursor: 'cursor:two',
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runHistoryCommand([], options)

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      items: [{ invocationRef: 'invocation:one' }],
      nextCursor: 'cursor:two',
    })
  })
})
