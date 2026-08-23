import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  configPath,
  mcpConfigPath,
  readStoredConnection,
  resolveAgentAccessCredential,
  storeConnection,
  storeMcpConnection,
} from '../../../tools/ae/lib/config'

let directory = ''

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ae-cli-config-'))
  process.env.AE_CONFIG_DIR = directory
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

afterEach(() => {
  delete process.env.AE_CONFIG_DIR
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  rmSync(directory, { recursive: true, force: true })
})

describe('AE CLI origin-bound connection store', () => {
  it('stores one token under its exact origin with user-only permissions', () => {
    storeConnection({
      baseUrl: 'https://market.example',
      accessToken: 'secret-one',
      scope: 'market_operations:invoke',
    })

    expect(readStoredConnection('https://market.example')).toMatchObject({
      accessToken: 'secret-one',
      tokenType: 'Bearer',
      scope: 'market_operations:invoke',
    })
    expect(readStoredConnection('https://other.example')).toBeUndefined()
    expect(statSync(directory).mode & 0o777).toBe(0o700)
    expect(statSync(configPath()).mode & 0o777).toBe(0o600)
  })

  it('prefers an explicit environment credential without leaking it into storage', () => {
    storeConnection({ baseUrl: 'https://market.example', accessToken: 'stored-secret' })
    process.env.AE_API_KEY = 'environment-secret'
    process.env.AE_API_KEY_ORIGIN = 'https://market.example'

    expect(resolveAgentAccessCredential('https://market.example')).toEqual({
      accessToken: 'environment-secret',
      origin: 'https://market.example',
      source: 'environment',
    })
    expect(readStoredConnection('https://market.example')?.accessToken).toBe('stored-secret')
  })

  it('writes an importable Streamable HTTP MCP connection with user-only permissions', () => {
    storeMcpConnection({ baseUrl: 'https://market.example', accessToken: 'mcp-secret' })

    const document = JSON.parse(readFileSync(mcpConfigPath(), 'utf8')) as {
      mcpServers: Record<string, { type: string; url: string; headers: { Authorization: string } }>
    }
    expect(document.mcpServers['agentic-economy']).toEqual({
      type: 'streamable-http',
      url: 'https://market.example/mcp',
      headers: { Authorization: 'Bearer mcp-secret' },
    })
    expect(statSync(mcpConfigPath()).mode & 0o777).toBe(0o600)
  })
})
