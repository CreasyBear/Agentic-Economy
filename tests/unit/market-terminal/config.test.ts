import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  configPath,
  listStoredConnections,
  mcpConfigPath,
  readStoredConnection,
  removeStoredConnection,
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
      profile: 'market',
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

  it('lists and removes exact-origin connections without returning bearer material', () => {
    storeConnection({
      baseUrl: 'https://z.example',
      accessToken: 'secret-z',
      scope: 'market_operations:invoke',
    })
    storeConnection({
      baseUrl: 'https://a.example',
      accessToken: 'secret-a',
      scope: 'market_supply:manage',
    })

    const listed = listStoredConnections()
    expect(listed.map(({ origin }) => origin)).toEqual(['https://a.example', 'https://z.example'])
    expect(JSON.stringify(listed)).not.toContain('secret-')

    expect(removeStoredConnection('https://a.example')).toMatchObject({
      origin: 'https://a.example',
      removed: true,
    })
    expect(readStoredConnection('https://a.example')).toBeUndefined()
    expect(readStoredConnection('https://z.example')?.accessToken).toBe('secret-z')
    expect(removeStoredConnection('https://a.example')).toMatchObject({ removed: false })
    expect(statSync(configPath()).mode & 0o777).toBe(0o600)
  })

  it('keeps buyer and supplier credentials as separate profiles for one origin', () => {
    storeConnection({ baseUrl: 'https://market.example', accessToken: 'buyer-secret', scope: 'market_operations:invoke' })
    storeConnection({ baseUrl: 'https://market.example', accessToken: 'supplier-secret', scope: 'market_supply:manage' })

    expect(resolveAgentAccessCredential('https://market.example', 'market_operations:invoke')?.accessToken).toBe('buyer-secret')
    expect(resolveAgentAccessCredential('https://market.example', 'market_supply:manage')?.accessToken).toBe('supplier-secret')
    expect(listStoredConnections().map(({ profile }) => profile)).toEqual(['market', 'supplier'])

    expect(removeStoredConnection('https://market.example', 'supplier')).toMatchObject({ removed: true })
    expect(readStoredConnection('https://market.example', 'market')?.accessToken).toBe('buyer-secret')
    expect(readStoredConnection('https://market.example', 'supplier')).toBeUndefined()
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
