import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST } from '@/modules/agent-access/contract'
import { findAction, listCallRouteDescriptors, listMcpActionDescriptors } from '@/modules/actions'
import { TOOL_MARKET_ACTION_ENTRIES } from '@/modules/registry/tool-entry'
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

    // Ceiling raised from 16384 to 18858 (current compact manifest size 17143 bytes, +10% headroom)
    // after the action-registry-derived manifest gained the `quote` command family.
    expect(new TextEncoder().encode(serialized).length).toBeLessThan(18_858)
    expect(serialized).not.toContain('inputJsonSchema')
    expect(serialized).not.toContain('outputJsonSchema')
    expect(compact.fullContract).toBe('ae manifest --technical --json')
    expect((compact.call as JsonRecord).connected).toMatchObject({ transport: 'tool.call:v1' })
    expect(compact.account).toMatchObject({
      disconnect: 'ae account disconnect',
      disconnectDefaultProfile: 'market',
      disconnectProvider: 'ae account disconnect provider',
    })
  })

  it('serializes the registration request accepted by the OAuth handler', async () => {
    const manifest = await manifestJson()
    const oauth = (manifest.gateway as JsonRecord).oauth as JsonRecord
    const flow = oauth.deviceFlow as readonly JsonRecord[]
    const registration = flow.find((step) => step.order === 1)

    expect(manifest.$schema).toBe('https://agentic-economy/market-terminal/manifest:v3')
    expect(manifest.protocol).toBe('agentic-economy.tool-terminal.v1')
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
      listCallRouteDescriptors().map(({ actionId }) => actionId),
    )
    expect(routes.map((entry) => (entry.action as JsonRecord).mcpToolName)).toEqual(
      listCallRouteDescriptors().map(({ mcpToolName: toolName }) => toolName),
    )
    const toolReads = ((manifest.anonymous as JsonRecord).toolReads as readonly JsonRecord[])
    expect(toolReads).toHaveLength(TOOL_MARKET_ACTION_ENTRIES.length)
    for (const toolRead of toolReads) {
      const route = toolRead.route as JsonRecord
      const action = toolRead.action as JsonRecord
      expect(action.id).toBe(route.actionId)
      expect(action.invocationContract).toMatchObject({ version: expect.any(String) })
      expect(action.inputJsonSchema).toEqual(expect.any(Object))
      expect(action.outputJsonSchema).toEqual(expect.any(Object))
    }
    const response = await handleOAuthRegisterPost(request, { store: oauthStore(), now: () => 1_000 })
    expect(response.status).toBe(201)
  })

  it('serializes registered Call and funding continuations without adding contracts to MCP descriptors', async () => {
    const manifest = await manifestJson()
    const account = manifest.account as JsonRecord
    const moneyRoutes = account.moneyRoutes as readonly JsonRecord[]
    const activity = moneyRoutes.find((route) => (route.action as JsonRecord).id === 'agentAccess.activity')

    expect(activity?.action).toMatchObject({
      id: 'agentAccess.activity',
      invocationContract: { safeContinuations: ['call.status'] },
    })
    expect(JSON.stringify(activity)).not.toContain('operation.status')

    const fundingStatus = findAction('funding.handoff.status')
    expect(fundingStatus?.invocationContract.safeContinuations).toEqual([
      'funding.handoff.status',
      'agentAccess.balance',
      'tool.quote',
    ])
    expect(fundingStatus?.boundaries.join(' ')).toMatch(/authority|Call/u)
    expect(fundingStatus?.boundaries.join(' ')).not.toMatch(/Mandate|Operation/u)

    for (const continuationId of [
      ...((findAction('agentAccess.activity')?.invocationContract.safeContinuations ?? [])),
      ...(fundingStatus?.invocationContract.safeContinuations ?? []),
    ]) {
      expect(findAction(continuationId), `${continuationId} continuation registration`).toBeDefined()
    }

    const fundingMcpDescriptor = listMcpActionDescriptors().find(({ id }) => id === 'funding.handoff.status')
    expect(fundingMcpDescriptor).toMatchObject({ id: 'funding.handoff.status' })
    expect(fundingMcpDescriptor).not.toHaveProperty('invocationContract')
    expect(JSON.stringify(fundingMcpDescriptor)).not.toMatch(/operation\.invoke|Mandate/u)
  })

  it.each([
    { scopes: ['market_tools:call'], environment: undefined },
    { scopes: ['market_tools:call', 'customer_requests:spending_policy'], environment: undefined },
    { scopes: ['market_tools:call'], environment: 'production' },
  ])('accepts the granted buyer scopes and requested environment $environment', async ({ scopes, environment }) => {
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
        kind: 'authenticated',
        principalRef: 'principal:test-agent',
        accountRef: 'account:test-owner',
        credentialId: 'credential:test-agent',
        applicationRef: 'agentic-economy',
        environment: environment ?? 'sandbox',
        scopes,
        authorityMode: 'spending_policy',
      })
    })
    const output = captureStdout()
    const configDirectory = mkdtempSync(join(tmpdir(), 'ae-cli-manifest-'))
    vi.stubEnv('AE_API_KEY', '')
    vi.stubEnv('AE_CONFIG_DIR', configDirectory)
    try {
      await runConnectCommand([], { ...cliOptions, ...(environment === undefined ? {} : { environment }) })
    } finally {
      output.restore()
      fetch.mockRestore()
      vi.unstubAllEnvs()
      rmSync(configDirectory, { recursive: true, force: true })
    }

    const deviceForm = new URLSearchParams(String(calls[1]?.init?.body))
    if (environment === 'production') expect(JSON.parse(deviceForm.get('authorization_details') ?? 'null')).toEqual([{
      type: 'agentic_economy_market_tools', environment: 'production', tool_access: 'all_admitted', tool_refs: [], expires_in_seconds: 604800,
    }])
    else expect(deviceForm.has('authorization_details')).toBe(false)
    const connectRequest = JSON.parse(String(calls[0]?.init?.body)) as unknown
    expect(connectRequest).toEqual(registration?.request)
    expect(JSON.stringify(connectRequest)).toBe(JSON.stringify(registration?.request))
    expect(oauth.grantType).toBe(AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.grant_types[0])
    expect(oauth.requestedScope).toBe(AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.scope)
    expect(polling.intervalSeconds).toBe(AGENT_ACCESS_POLL_INTERVAL_SECONDS)
    expect(polling.waitOn).toEqual(['authorization_pending'])
    expect(polling.increaseIntervalOn).toEqual(['slow_down'])
    expect(polling.stopOn).toEqual(AGENT_ACCESS_OAUTH_ERROR_VALUES.filter((error) => error !== 'authorization_pending' && error !== 'slow_down'))
    expect(calls[3]?.input).toBe('https://ae.example/api/v1/account')
    expect(new Headers(calls[3]?.init?.headers).get('Authorization')).toBe('Bearer token-test')
    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'connected',
      connectionState: 'ready_to_buy',
      principalRef: 'principal:test-agent',
      accountRef: 'account:test-owner',
      credentialId: 'credential:test-agent',
      authorityMode: 'spending_policy',
      ownerConnectionHref: 'https://ae.example/agent-access?caller=principal%3Atest-agent',
    })
    expect(output.read()).not.toContain('token-test')
  })
})
