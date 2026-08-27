import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST } from '@/modules/agent-access/contract'
import { listOperationRouteDescriptors } from '@/modules/actions'
import {
  AGENT_ACCESS_OAUTH_ERROR_VALUES,
  AGENT_ACCESS_POLL_INTERVAL_SECONDS,
  type AgentAccessOAuthClient,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthStore,
} from '@/modules/agent-access/oauth-state'
import { handleOAuthRegisterPost } from '@/lib/server/agent-access-oauth-api'

import type { CliOptions } from '../../../tools/ae/lib/args'
import { runConnectCommand } from '../../../tools/ae/commands/connect'
import { runManifestCommand } from '../../../tools/ae/commands/manifest'

type JsonRecord = Record<string, unknown>

const cliOptions: CliOptions = { baseUrl: 'https://ae.example', json: true, help: false, allowWrite: false }

function captureStdout(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return { read: () => writes.join(''), restore: () => spy.mockRestore() }
}

function oauthStore(): AgentAccessOAuthStore {
  const clients = new Map<string, AgentAccessOAuthClient>()
  return {
    async insertGrant(_grant: AgentAccessOAuthGrant) {},
    async getGrantByHash() { return null },
    async getGrantByRef() { return null },
    async updateGrant() { return null },
    async insertClient(client) { clients.set(client.clientId, client) },
    async getClient(clientId) { return clients.get(clientId) ?? null },
  }
}

async function manifestJson(): Promise<JsonRecord> {
  const output = captureStdout()
  try {
    await runManifestCommand([], { ...cliOptions, technical: true })
    return JSON.parse(output.read()) as JsonRecord
  } finally {
    output.restore()
  }
}

async function compactManifestJson(): Promise<JsonRecord> {
  const output = captureStdout()
  try {
    await runManifestCommand([], cliOptions)
    return JSON.parse(output.read()) as JsonRecord
  } finally {
    output.restore()
  }
}


describe('market terminal manifest OAuth contract', () => {
  it('uses a compact decision contract by default and keeps schemas behind technical mode', async () => {
    const compact = await compactManifestJson()
    const serialized = JSON.stringify(compact)

    expect(new TextEncoder().encode(serialized).length).toBeLessThan(16 * 1024)
    expect(serialized).not.toContain('inputJsonSchema')
    expect(serialized).not.toContain('outputJsonSchema')
    expect(compact.fullContract).toBe('ae manifest --technical --json')
    expect((compact.call as JsonRecord).connected).toMatchObject({ transport: 'operation.invoke:v1' })
  })

  it('serializes the registration request accepted by the OAuth handler', async () => {
    const manifest = await manifestJson()
    const oauth = (manifest.gateway as JsonRecord).oauth as JsonRecord
    const flow = oauth.deviceFlow as readonly JsonRecord[]
    const registration = flow.find((step) => step.order === 1)

    expect(manifest.$schema).toBe('https://agentic-economy/market-terminal/manifest:v3')
    expect(registration).toMatchObject({
      method: 'POST',
      path: '/oauth/register',
      media: { request: 'application/json', response: 'application/json' },
      request: AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST,
    })

    const request = new Request('https://ae.example/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(registration?.request),
    })
    const gateway = manifest.gateway as JsonRecord
    const routes = gateway.routes as readonly JsonRecord[]
    expect(routes.map((entry) => (entry.route as JsonRecord).actionId)).toEqual(
      listOperationRouteDescriptors().map(({ actionId }) => actionId),
    )
    expect(routes.map((entry) => (entry.action as JsonRecord).mcpToolName)).toEqual(
      listOperationRouteDescriptors().map(({ mcpToolName: toolName }) => toolName),
    )
    const operationReads = ((manifest.anonymous as JsonRecord).operationReads as readonly JsonRecord[])
    expect(operationReads).toHaveLength(listOperationRouteDescriptors().length)
    for (const operationRead of operationReads) {
      const route = operationRead.route as JsonRecord
      const action = operationRead.action as JsonRecord
      expect(action.id).toBe(route.actionId)
      expect(action.invocationContract).toMatchObject({ version: expect.any(String) })
      expect(action.inputJsonSchema).toEqual(expect.any(Object))
      expect(action.outputJsonSchema).toEqual(expect.any(Object))
    }
    const response = await handleOAuthRegisterPost(request, { store: oauthStore(), now: () => 1_000 })
    expect(response.status).toBe(201)
  })

  it('keeps connect registration bytes and polling semantics equal to the manifest', async () => {
    const manifest = await manifestJson()
    const oauth = (manifest.gateway as JsonRecord).oauth as JsonRecord
    const flow = oauth.deviceFlow as readonly JsonRecord[]
    const registration = flow.find((step) => step.order === 1)
    const token = flow.find((step) => step.order === 4)
    const polling = token?.polling as JsonRecord
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push(init === undefined ? { input } : { input, init })
      if (calls.length === 1) return Response.json({ client_id: 'client-test' }, { status: 201 })
      if (calls.length === 2) return Response.json({
        device_code: 'device-test',
        user_code: 'USERTEST',
        verification_uri: 'https://ae.example/agent-access/authorize',
        expires_in: 60,
        interval: 1,
      })
      if (calls.length === 3) return Response.json({ access_token: 'token-test' })
      return Response.json({
        kind: 'refused',
        invocationRef: 'invocation:v1:connect-validation',
        code: 'invocation_not_found',
        retryable: false,
      })
    })
    const output = captureStdout()
    const configDirectory = mkdtempSync(join(tmpdir(), 'ae-cli-manifest-'))
    vi.stubEnv('AE_API_KEY', '')
    vi.stubEnv('AE_CONFIG_DIR', configDirectory)
    try {
      await runConnectCommand([], cliOptions)
    } finally {
      output.restore()
      fetch.mockRestore()
      vi.unstubAllEnvs()
      rmSync(configDirectory, { recursive: true, force: true })
    }

    const connectRequest = JSON.parse(String(calls[0]?.init?.body)) as unknown
    expect(connectRequest).toEqual(registration?.request)
    expect(JSON.stringify(connectRequest)).toBe(JSON.stringify(registration?.request))
    expect(oauth.grantType).toBe(AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.grant_types[0])
    expect(oauth.requestedScope).toBe(AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.scope)
    expect(polling.intervalSeconds).toBe(AGENT_ACCESS_POLL_INTERVAL_SECONDS)
    expect(polling.waitOn).toEqual(['authorization_pending'])
    expect(polling.increaseIntervalOn).toEqual(['slow_down'])
    expect(polling.stopOn).toEqual(AGENT_ACCESS_OAUTH_ERROR_VALUES.filter((error) => error !== 'authorization_pending' && error !== 'slow_down'))
  })
})
