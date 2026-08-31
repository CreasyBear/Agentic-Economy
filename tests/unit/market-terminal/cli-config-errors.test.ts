import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { spawnCli } from './cli-errors-harness'

const temporaryDirectories: string[] = []
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await new Promise<void>((resolve) => server.close(() => resolve()))))
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('AE CLI malformed configuration failures', () => {
  it('fails account, connect, and doctor with the same actionable redacted envelope', async () => {
    const privateMarker = 'FAKE_PRIVATE_CONFIG_VALUE_294d'
    const directory = mkdtempSync(join(tmpdir(), 'ae-cli-invalid-config-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'config.json')
    writeFileSync(path, `{ "accessToken": "${privateMarker}"`, 'utf8')

    const origin = await startHealthyServer()
    const env = cleanEnvironment(directory)
    const commands = [
      ['account', 'connections', '--base-url', origin, '--json'],
      ['connect', '--base-url', origin, '--json'],
      ['doctor', '--base-url', origin, '--json'],
    ] as const

    for (const command of commands) {
      const result = await spawnCli(command, { env })
      expect(result.status, command.join(' ')).toBe(1)
      expect(result.stderr, command.join(' ')).toBe('')
      expect(result.stdout, command.join(' ')).not.toContain(privateMarker)
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: 'FAILED_PRECONDITION',
        code: 'cli_config_invalid_json',
        message: `AE CLI configuration at ${path} is not valid JSON.`,
        detail: {
          configPath: path,
          reason: 'invalid_json',
        },
        exitCode: 1,
        suggestion: 'Repair or move the configuration file; AE left it unchanged and did not discard stored connections.',
        nextCommand: 'ae config --json',
      })
    }

    const inspection = await spawnCli(['config', '--base-url', origin, '--json'], { env })
    expect(inspection.status).toBe(0)
    expect(inspection.stderr).toBe('')
    expect(inspection.stdout).not.toContain(privateMarker)
    expect(JSON.parse(inspection.stdout)).toEqual({
      kind: 'config',
      baseUrl: { origin, source: 'flag' },
      paths: {
        config: path,
        mcp: join(directory, 'mcp.json'),
      },
      environmentOverrides: {
        AE_CLI_BASE_URL: false,
        AE_CANONICAL_BASE_URL: false,
        AE_API_KEY: false,
        AE_API_KEY_ORIGIN: false,
        AE_CONFIG_DIR: true,
        XDG_CONFIG_HOME: false,
        CONVEX_URL: false,
        VITE_CONVEX_URL: false,
      },
      config: { state: 'invalid', reason: 'invalid_json' },
      mcp: { present: false },
      connections: [],
    })
  }, 15_000)

  it('reports safe readable summaries and override presence without credential material', async () => {
    const privateMarker = 'FAKE_PRIVATE_CONFIG_VALUE_7b86'
    const mcpPrivateMarker = 'FAKE_PRIVATE_MCP_VALUE_d7af'
    const directory = mkdtempSync(join(tmpdir(), 'ae-cli-readable-config-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'config.json')
    writeFileSync(path, JSON.stringify({
      version: 1,
      connections: {
        'https://market.example': {
          accessToken: privateMarker,
          tokenType: 'Bearer',
          scope: 'market_operations:invoke',
          profile: 'market',
          connectedAt: '2026-08-30T00:00:00.000Z',
        },
      },
    }), 'utf8')
    writeFileSync(join(directory, 'mcp.json'), JSON.stringify({ Authorization: mcpPrivateMarker }), 'utf8')

    const env = cleanEnvironment(directory)
    env.AE_CLI_BASE_URL = 'https://market.example'
    const result = await spawnCli(['config', '--json'], { env })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(privateMarker)
    expect(result.stdout).not.toContain(mcpPrivateMarker)
    expect(result.stdout).not.toContain('accessToken')
    expect(result.stdout).not.toContain('Authorization')
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'config',
      baseUrl: { origin: 'https://market.example', source: 'AE_CLI_BASE_URL' },
      paths: {
        config: path,
        mcp: join(directory, 'mcp.json'),
      },
      environmentOverrides: {
        AE_CLI_BASE_URL: true,
        AE_CONFIG_DIR: true,
      },
      config: { state: 'ready' },
      mcp: { present: true },
      connections: [{
        origin: 'https://market.example',
        profile: 'market',
        scope: 'market_operations:invoke',
        connectedAt: '2026-08-30T00:00:00.000Z',
      }],
    })
  })
})

async function startHealthyServer(): Promise<string> {
  const server = createServer((request, response) => respondHealthy(request, response))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('test_server_address_unavailable')
  return `http://127.0.0.1:${address.port}`
}

function respondHealthy(request: IncomingMessage, response: ServerResponse): void {
  const origin = `http://${request.headers.host}`
  if (request.url === '/.well-known/ucp') {
    respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin })
    return
  }
  if (request.url === '/api/ready') {
    respondJson(response, { status: 'ready' })
    return
  }
  if (request.url === '/api/v1/release') {
    respondJson(response, { kind: 'ok', sourceRevision: 'a'.repeat(40) })
    return
  }
  respondJson(response, { kind: 'not_found' }, 404)
}

function respondJson(response: ServerResponse, body: unknown, status = 200): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

function cleanEnvironment(directory: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, AE_CONFIG_DIR: directory }
  delete env.AE_API_KEY
  delete env.AE_API_KEY_ORIGIN
  delete env.AE_CLI_BASE_URL
  delete env.AE_CANONICAL_BASE_URL
  delete env.CONVEX_URL
  delete env.VITE_CONVEX_URL
  return env
}
