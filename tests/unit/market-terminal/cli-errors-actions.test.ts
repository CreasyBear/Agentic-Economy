import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { findAction, mcpToolName } from '@/modules/actions'
import { runActionCommand } from '../../../tools/ae/commands/actions'
import {
  captureStdout,
  restoreEnvironmentVariable,
  spawnCliSync,
  validSupplyPublishInput,
} from './cli-errors-harness'

describe('market-terminal CLI error contracts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('prints only JSON when a write action lacks --allow-write', () => {
    const result = spawnCliSync(['advanced', 'action', '--json'])

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'PERMISSION_DENIED',
      code: 'write_requires_allow',
      exitCode: 1,
    })
  }, 15_000)

  it('refuses MCP-only actions before generic CLI execution', async () => {
    const action = findAction('operation.execute')
    if (action === undefined) throw new Error('operation.execute action missing')
    const run = vi.spyOn(action, 'run')

    await expect(runActionCommand(['operation.execute', '{}'], {
      baseUrl: 'http://127.0.0.1:3000',
      json: true,
      help: false,
      allowWrite: false,
      apply: false,
    })).rejects.toMatchObject({
      kind: 'PERMISSION_DENIED',
      code: 'surface_not_allowed',
    })
    run.mockRestore()
  })

  it('redacts malformed action JSON in both human and JSON output', () => {
    const rawInput = '{"apiKey":"TOPSECRET",}'
    for (const json of [false, true]) {
      const result = spawnCliSync([
        'advanced',
        'action',
        rawInput,
        ...(json ? ['--json'] : []),
      ])

      expect(result.status).toBe(1)
      expect(result.signal).toBeNull()
      expect(result.stdout).not.toContain(rawInput)
      expect(result.stdout).not.toContain('TOPSECRET')
      expect(result.stderr).not.toContain(rawInput)
      expect(result.stderr).not.toContain('TOPSECRET')
      if (json) {
        expect(result.stderr).toBe('')
        expect(JSON.parse(result.stdout)).toMatchObject({
          kind: 'INVALID_ARGUMENT',
          code: 'action-input',
          message: 'Input must be valid JSON.',
          exitCode: 1,
        })
      } else {
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe('Input must be valid JSON.\n')
      }
    }
  }, 15_000)

  it('preserves typed missing-source failures for advanced policy', () => {
    const env = { ...process.env, CONVEX_URL: '', VITE_CONVEX_URL: '', VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: '' }
    const result = spawnCliSync(['advanced', 'policy', '--json'], { env })

    expect(result.status).toBe(1)
    expect(result.signal).toBeNull()
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'missing_convex_url',
      message: expect.stringContaining('CONVEX_URL'),
      exitCode: 1,
    })
    expect(result.stdout).not.toContain('Command failed.')
  }, 30_000)

  it('loads one file-backed environment for doctor and manifest', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ae-cli-env-'))
    const cliPath = resolve('tools/ae/cli.ts')
    const tsxLoader = resolve('node_modules/tsx/dist/loader.mjs')
    const tsconfigPath = resolve('tsconfig.json')
    writeFileSync(join(cwd, '.env.development'), 'VITE_CONVEX_URL=http://127.0.0.1:1\n')
    const env: NodeJS.ProcessEnv = { ...process.env, TSX_TSCONFIG_PATH: tsconfigPath }
    delete env.CONVEX_URL
    delete env.VITE_CONVEX_URL
    delete env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E

    try {
      const doctor = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, 'advanced', 'doctor', '--json'], {
        cwd,
        env,
        encoding: 'utf8',
      })
      expect(doctor.status).toBe(0)
      expect(JSON.parse(doctor.stdout).core).toEqual(expect.arrayContaining([
        { name: 'VITE_CONVEX_URL', status: 'configured' },
      ]))

      const manifest = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, 'manifest', '--json'], {
        cwd,
        env,
        encoding: 'utf8',
      })
      expect(manifest.status).toBe(0)
      expect(JSON.parse(manifest.stdout)).toMatchObject({
        protocol: 'agentic-economy.operation-terminal.v1',
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  }, 30_000)

  it('keeps failed human actions off stdout while preserving stderr diagnostics', () => {
    const env = {
      ...process.env,
      CONVEX_URL: '',
      VITE_CONVEX_URL: '',
      VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: '',
      NODE_ENV: 'development',
    }
    for (const args of [
      ['advanced', 'action', 'registry.list', '{"limit":1}'],
      ['advanced', 'action', 'customerRequest.confirm'],
    ]) {
      const result = spawnCliSync(args, { env })

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stdout).not.toContain('Running ')
      expect(result.stdout).not.toContain('authority:')
    }
  }, 30_000)

  it('prints a terminal Ran line only after a credentialed action succeeds', async () => {
    const action = findAction('operation.status')
    if (action === undefined) throw new Error('operation.status action missing')
    const run = vi.spyOn(action, 'run')
    const previousApiKey = process.env.AE_API_KEY
    const previousApiKeyOrigin = process.env.AE_API_KEY_ORIGIN
    process.env.AE_API_KEY = 'cli-test-key'
    process.env.AE_API_KEY_ORIGIN = 'https://market.example'
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 'cli-action',
      result: {
        structuredContent: {
          result: { kind: 'found', invocationRef: 'invocation:test' },
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()
    try {
      await runActionCommand(['operation.status', '{"invocationRef":"invocation:test"}'], {
        baseUrl: 'https://market.example',
        json: false,
        help: false,
        allowWrite: false,
        apply: false,
      })
      expect(run).not.toHaveBeenCalled()
    } finally {
      output.restore()
      run.mockRestore()
      restoreEnvironmentVariable('AE_API_KEY', previousApiKey)
      restoreEnvironmentVariable('AE_API_KEY_ORIGIN', previousApiKeyOrigin)
    }
    const stdout = output.read()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(stdout).toContain('Ran operation.status')
    expect(stdout).not.toContain('Running operation.status')
    expect(stdout).not.toContain('authority:')
    expect(stdout).toContain('result.kind = found')
  })

  it('dispatches credential-admitted CLI actions through authenticated MCP tools/call', async () => {
    const action = findAction('supply.publish')
    if (action === undefined) throw new Error('supply.publish action missing')
    const run = vi.spyOn(action, 'run')
    const previousApiKey = process.env.AE_API_KEY
    const previousApiKeyOrigin = process.env.AE_API_KEY_ORIGIN
    process.env.AE_API_KEY = 'cli-supply-key'
    process.env.AE_API_KEY_ORIGIN = 'https://market.example'
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 'cli-action',
      result: {
        structuredContent: {
          result: {
            kind: 'published',
            publicationRef: 'publication:test',
            publicationRevision: 1,
            operationRef: 'operation:test',
            lifecycle: { state: 'active', reasons: [] },
          },
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()
    try {
      await runActionCommand(['supply.publish', JSON.stringify(validSupplyPublishInput())], {
        baseUrl: 'https://market.example',
        json: false,
        help: false,
        allowWrite: true,
        apply: false,
      })
      expect(run).not.toHaveBeenCalled()
    } finally {
      output.restore()
      run.mockRestore()
      restoreEnvironmentVariable('AE_API_KEY', previousApiKey)
      restoreEnvironmentVariable('AE_API_KEY_ORIGIN', previousApiKeyOrigin)
    }
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://market.example/mcp')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer cli-supply-key')
    expect(JSON.parse(String(init?.body))).toEqual({
      jsonrpc: '2.0',
      id: 'cli-action',
      method: 'tools/call',
      params: {
        name: mcpToolName(action),
        arguments: {
          version: 'supply-publication:v1',
          businessId: 'business:test',
          offeringRef: 'offering:test',
          offeringRevision: 1,
          offeringSourceHash: 'hash:test',
          source: {},
          evidenceRefs: ['evidence:test'],
          idempotencyKey: 'idempotency-test',
        },
      },
    })
    expect(output.read()).toContain('Ran supply.publish')
  })

  it.each([
    ['missing origin', undefined, 'agent_access_key_origin_required'],
    ['mismatched origin', 'https://other.example', 'agent_access_key_origin_mismatch'],
  ] as const)('refuses credential-admitted CLI actions before fetch when %s', async (_label, origin, code) => {
    const previousApiKey = process.env.AE_API_KEY
    const previousApiKeyOrigin = process.env.AE_API_KEY_ORIGIN
    process.env.AE_API_KEY = 'cli-supply-key'
    if (origin === undefined) delete process.env.AE_API_KEY_ORIGIN
    else process.env.AE_API_KEY_ORIGIN = origin
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(runActionCommand(['supply.publish', JSON.stringify(validSupplyPublishInput())], {
        baseUrl: 'https://market.example',
        json: true,
        help: false,
        allowWrite: true,
        apply: false,
      })).rejects.toMatchObject({
        kind: 'INVALID_ARGUMENT',
        code,
      })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      restoreEnvironmentVariable('AE_API_KEY', previousApiKey)
      restoreEnvironmentVariable('AE_API_KEY_ORIGIN', previousApiKeyOrigin)
    }
  })

  it('keeps a credential-free CLI action on its local runner', async () => {
    const action = findAction('registry.search')
    if (action === undefined) throw new Error('registry.search action missing')
    if (action.credentialAdmission !== undefined) throw new Error('registry.search unexpectedly requires credentials')
    const originalSurfaces = Object.getOwnPropertyDescriptor(action, 'surfaces')
    if (originalSurfaces === undefined || originalSurfaces.configurable !== true) {
      throw new Error('registry.search surfaces property cannot be scoped for this test')
    }
    Object.defineProperty(action, 'surfaces', {
      ...originalSurfaces,
      value: [...action.surfaces, 'cli'],
    })
    const run = vi.spyOn(action, 'run').mockResolvedValue({ kind: 'listed' })
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()
    try {
      await runActionCommand(['registry.search', '{"query":"plumber"}'], {
        baseUrl: 'https://market.example',
        json: false,
        help: false,
        allowWrite: false,
        apply: false,
      })
      expect(run).toHaveBeenCalledOnce()
    } finally {
      output.restore()
      run.mockRestore()
      Object.defineProperty(action, 'surfaces', originalSurfaces)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    const stdout = output.read()
    expect(stdout).toContain('Ran registry.search')
    expect(stdout).toContain('result.kind = listed')
  })
})
