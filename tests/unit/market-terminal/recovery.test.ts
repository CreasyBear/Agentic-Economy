import { afterEach, describe, expect, it, vi } from 'vitest'

import { listMcpActions, mcpToolName } from '@/modules/actions'
import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST } from '@/modules/agent-access/contract'
import { operationReconciliationEvidenceSchema } from '@/modules/capability-execution/operation-recovery.actions'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import { runCancelCommand } from '../../../tools/ae/commands/cancel'
import { runInvokeCommand } from '../../../tools/ae/commands/invoke'
import { runManifestCommand } from '../../../tools/ae/commands/manifest'
import { runRecoverCommand } from '../../../tools/ae/commands/recover'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'

const baseOptions: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  apply: false,
}

const completed = {
  kind: 'completed' as const,
  invocationRef: 'invocation:one',
  operationRef: 'operation:v1:test',
  output: { value: 1 },
  evidenceHash: 'sha256:evidence',
  usage: {
    usageRef: 'usage:one',
    observedAt: 100,
    chargeState: 'free_tier' as const,
    priceDigest: 'sha256:price',
    amount: { currency: 'USD', units: '0', exponent: 2 },
  },
}

const evidenceMaterial = {
  kind: 'action_invocation_reconciliation' as const,
  version: 1 as const,
  evidenceRef: 'evidence:one',
  source: 'provider:one',
  invocationRef: 'invocation:one',
  attemptRef: 'attempt:one',
  effectGeneration: 1,
  resolution: 'not_released' as const,
  observedAt: '2026-08-09T00:00:00.000Z',
}
const evidence = { ...evidenceMaterial, digest: canonicalDigest(evidenceMaterial) }

function capture(stream: NodeJS.WriteStream): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(stream, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return { read: () => writes.join(''), restore: () => spy.mockRestore() }
}
function setApiKey(value: string, origin = baseOptions.baseUrl): void {
  process.env.AE_API_KEY = value
  process.env.AE_API_KEY_ORIGIN = new URL(origin).origin
}


afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

describe('CLI operation recovery projections', () => {
  it('publishes the anonymous direct-keyless MCP contract from the action registry', async () => {
    const output = capture(process.stdout)
    try {
      await runManifestCommand([], baseOptions)
    } finally {
      output.restore()
    }

    const directAction = listMcpActions().find((action) => action.id === 'operation.execute')
    if (directAction === undefined) throw new Error('operation.execute is not registered on the MCP surface')
    const manifest = JSON.parse(output.read()) as {
      directKeyless: {
        action: string
        contractVersion: string
        mcpTool: string
        authentication: string
        requiresOperationRef: boolean
        inputJsonSchema?: { required?: readonly string[] }
        outputJsonSchema?: Record<string, unknown>
        invocationContract: unknown
      }
    }
    expect(manifest.directKeyless).toMatchObject({
      action: directAction.id,
      contractVersion: directAction.invocationContract.version,
      mcpTool: mcpToolName(directAction),
      authentication: 'none',
      requiresOperationRef: true,
      inputJsonSchema: expect.any(Object),
      outputJsonSchema: expect.any(Object),
      invocationContract: directAction.invocationContract,
    })
    expect(manifest.directKeyless.inputJsonSchema?.required).toContain('operationRef')
  })

  it('publishes a schema-valid recovery example with digest and identity rules', async () => {
    const output = capture(process.stdout)
    try {
      await runManifestCommand([], baseOptions)
    } finally {
      output.restore()
    }

    const manifest = JSON.parse(output.read()) as {
      commands: {
        recover: { summary: string; guidance: readonly string[] }
        demand: {
          commands: {
            ask: { args: string; summary: string; guidance: readonly string[] }
          }
        }
      }
      coldLoop: readonly string[]
      payment: {
        providerQuotedAmount: { field: string; exact: boolean }
        agenticEconomyFee: { field: string; rate: string; feeBps: number }
        totalBuyerAuthorization: { field: string; exact: boolean }
        network: string
        asset: { symbol: string; name: string; address: string }
      }
      approval: { deviceFlow: string }
      polling: { oauth: { intervalSeconds: number; waitOn: readonly string[] } }
      recovery: { statusFirst: boolean; reconcile: string }
      receipt: { location: readonly string[]; referenceField: string }
      ownerContinuations: {
        fund: { path: string; anchor: string; agentCredential: string }
        revoke: { path: string; anchor: string; agentCredential: string }
      }
      gateway: {
        idempotency: {
          commandField: string
          commandFieldRequired: boolean
          location: string
          requiredFor: readonly string[]
          header?: unknown
          precedence?: unknown
        }
        oauth: {
          requestedScope: string
          deviceFlow: readonly { order: number }[]
          apiKey: { result: string; usage: string; originEnvironmentVariable: string; originBinding: string }
          revocation: string
        }
      }
      evidence: {
        recovery: {
          example: Record<string, unknown>
          digestMaterialRule: string
          invocationRefIdentityRule: string
        }
      }
    }
    expect(manifest.commands.recover.summary).toContain('not a replay')
    expect(manifest.commands.recover.guidance.join(' ')).toContain('genuinely uncertain')
    expect(manifest.commands.recover.guidance.join(' ')).toContain('canonical evidence')
    expect(manifest.coldLoop).toEqual(['search', 'inspect', 'connect', 'fund', 'invoke', 'status', 'cancel/recover', 'receipt', 'revoke'])
    expect(manifest.payment).toMatchObject({
      providerQuotedAmount: { field: 'commercial.priceBreakdown.providerQuotedAmount', exact: true },
      agenticEconomyFee: { field: 'commercial.priceBreakdown.agenticEconomyFee', rate: '10%', feeBps: 1_000 },
      totalBuyerAuthorization: { field: 'commercial.priceBreakdown.totalBuyerAuthorization', exact: true },
      network: 'eip155:8453',
      asset: { symbol: 'USDC', name: 'Official USDC on Base', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
    })
    expect(manifest.approval.deviceFlow).toContain('verification_uri')
    expect(manifest.polling.oauth).toMatchObject({ intervalSeconds: expect.any(Number), waitOn: ['authorization_pending'] })
    expect(manifest.recovery).toMatchObject({ statusFirst: true, reconcile: expect.stringContaining('genuinely uncertain') })
    expect(manifest.receipt).toMatchObject({
      location: ['invoke.receipt', 'status.receipt', 'status.result.receipt', 'recover.receipt'],
      referenceField: 'receipt.receiptRef',
    })
    expect(manifest.ownerContinuations).toMatchObject({
      fund: { path: '/agent-access', anchor: '#fund', agentCredential: 'not_used' },
      revoke: { path: '/agent-access', anchor: '#revoke', agentCredential: 'not_used' },
    })
    expect(manifest.commands.demand.commands.ask.args).toContain('--thread-id')
    expect(manifest.commands.demand.commands.ask.summary).toContain('same thread')
    expect(manifest.commands.demand.commands.ask.guidance.join(' ')).toContain('follow-up')
    expect(manifest.gateway.idempotency).toMatchObject({
      commandField: 'idempotencyKey',
      commandFieldRequired: true,
      location: 'body.idempotencyKey',
      requiredFor: ['operation.invoke', 'operation.cancel', 'operation.reconcile'],
    })
    expect(manifest.gateway.idempotency).not.toHaveProperty('header')
    expect(manifest.gateway.idempotency).not.toHaveProperty('precedence')
    expect(output.read()).not.toContain('advanced reconcile')
    const recovery = manifest.evidence.recovery
    expect(operationReconciliationEvidenceSchema.safeParse(recovery.example).success).toBe(true)
    const { digest, ...material } = recovery.example
    expect(digest).toBe(canonicalDigest(material))
    expect(recovery.digestMaterialRule).toContain('all evidence fields except digest')
    expect(recovery.invocationRefIdentityRule).toContain('evidence.invocationRef')
    expect(manifest.gateway.oauth.requestedScope).toBe(
      AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.scope,
    )
    expect(manifest.gateway.oauth.deviceFlow.map(({ order }) => order)).toEqual([1, 2, 3, 4, 5])
    expect(manifest.gateway.oauth.apiKey.result).toContain('access_token')
    expect(manifest.gateway.oauth.apiKey.usage).toContain('AE_API_KEY')
    expect(manifest.gateway.oauth.apiKey.originEnvironmentVariable).toBe('AE_API_KEY_ORIGIN')
    expect(manifest.gateway.oauth.apiKey.originBinding).toContain('new URL(--base-url).origin')
    expect(manifest.gateway.oauth.revocation).toContain('/agent-access#revoke')
    expect(manifest.gateway.oauth.revocation).toContain('does not revoke through an agent credential')
  })
  it('runs accepted -> status -> terminal with canonical JSON and one stdout value per command', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'pending',
        invocationRef: 'invocation:one',
        operationRef: 'operation:v1:test',
        retryAfterMs: 100,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'found',
        invocationRef: 'invocation:one',
        operationRef: 'operation:v1:test',
        state: 'terminal',
        result: completed,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runInvokeCommand(['operation:v1:test', '{}'], { ...baseOptions, idempotencyKey: 'idem:one', wait: true })
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toEqual({
      ...completed,
      idempotencyKey: 'idem:one',
      nextCommand: 'npm run -s ae -- status invocation:one',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('projects cancel over the canonical route and keeps the recovery output schema', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      invocationRef: 'invocation:one',
      operationRef: 'operation:v1:test',
      state: 'cancelled',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runCancelCommand(['invocation:one'], { ...baseOptions, idempotencyKey: 'cancel:one' })
    } finally {
      output.restore()
    }

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/operations/invocation%3Aone/cancel')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'cancel:one' })
    expect(JSON.parse(output.read())).toMatchObject({ kind: 'found', state: 'cancelled' })
  })


  it('returns nonzero recovery detail when transport is uncertain, preserving the same identity', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('socket timeout'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInvokeCommand(['operation:v1:test', '{}'], { ...baseOptions, idempotencyKey: 'idem:one' })).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'operation-transport-unknown',
      detail: {
        operationRef: 'operation:v1:test',
        recovery: 'Repeat invoke with the same idempotency identity.',
        identityPreserved: true,
      },
    } satisfies Partial<CliFailure>)
  })
  it('does not echo invalid recovery identities in human or JSON error projections', async () => {
    let thrown: unknown
    try {
      await runRecoverCommand(
        ['invocation:TOPSECRET', JSON.stringify(evidence)],
        { ...baseOptions, idempotencyKey: 'recover:TOPSECRET' },
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CliFailure)
    if (!(thrown instanceof CliFailure)) return
    expect(thrown.kind).toBe('INVALID_ARGUMENT')
    expect(thrown.code).toBe('recover-input')
    expect(thrown.message).not.toContain('TOPSECRET')
    expect(JSON.stringify({ kind: thrown.kind, code: thrown.code, message: thrown.message, detail: thrown.detail }))
      .not.toContain('TOPSECRET')
  })

  it('does not echo recovery identities after a connection refusal', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(
      new Error('connect ECONNREFUSED https://user:TOPSECRET@market.example/path?TOPSECRET#TOPSECRET'),
    )
    vi.stubGlobal('fetch', fetchMock)

    let thrown: unknown
    try {
      await runRecoverCommand(
        ['invocation:one', JSON.stringify(evidence)],
        { ...baseOptions, idempotencyKey: 'recover:TOPSECRET' },
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CliFailure)
    if (!(thrown instanceof CliFailure)) return
    expect(thrown.kind).toBe('UNAVAILABLE')
    expect(thrown.code).toBe('operation-reconcile-transport-unknown')
    expect(thrown.message).not.toContain('TOPSECRET')
    expect(JSON.stringify({ kind: thrown.kind, code: thrown.code, message: thrown.message, detail: thrown.detail }))
      .not.toContain('TOPSECRET')
  })

  it('preserves a structured 503 refusal instead of relabelling it as unknown transport', async () => {
    setApiKey('ae-test-caller-key')
    const problem = {
      type: 'about:blank',
      title: 'Unavailable',
      status: 503,
      kind: 'UNAVAILABLE',
      code: 'provider_unavailable',
      detail: 'The provider is unavailable.',
      retryable: true,
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(problem), {
      status: 503,
      headers: { 'content-type': 'application/problem+json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInvokeCommand(['operation:v1:test', '{}'], { ...baseOptions, idempotencyKey: 'idem:503' }))
      .rejects.toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'provider_unavailable',
        retryable: true,
        message: '/api/v1/operations/call returned 503: Unavailable',
      } satisfies Partial<CliFailure>)
  })


  it('requires an explicit idempotency key for human and JSON invoke without random fallback', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(completed), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID')

    await expect(runInvokeCommand(['operation:v1:test', '{}'], baseOptions)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'idempotency-key-required',
    } satisfies Partial<CliFailure>)
    await expect(runInvokeCommand(['operation:v1:test', '{}'], { ...baseOptions, json: false })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'idempotency-key-required',
    } satisfies Partial<CliFailure>)

    expect(randomUuid).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('recovers through the canonical root command with positional evidence', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      invocationRef: 'invocation:one',
      operationRef: 'operation:v1:test',
      state: 'terminal',
      result: completed,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runRecoverCommand(['invocation:one', JSON.stringify(evidence)], {
        ...baseOptions,
        idempotencyKey: 'recover:one',
      })
    } finally {
      output.restore()
    }

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/operations/invocation%3Aone/reconcile')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'recover:one', evidence })
    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'found',
      invocationRef: 'invocation:one',
      result: completed,
    })
  })
})
