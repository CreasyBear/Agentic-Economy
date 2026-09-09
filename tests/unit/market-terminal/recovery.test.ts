import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST,
  MARKET_TOOLS_CALL_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
} from '@/modules/agent-access/contract'
import { callReconciliationEvidenceSchema } from '@/modules/capability-execution/call-recovery.actions'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import { runCancelCommand } from '../../../tools/ae/commands/cancel'
import { runCallCommand } from '../../../tools/ae/commands/call'
import { runManifestCommand } from '../../../tools/ae/commands/manifest'
import { runRecoverCommand } from '../../../tools/ae/commands/recover'
import { requireAgentAccessKey } from '../../../tools/ae/commands/status'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'
import { spawnCliSync } from './cli-errors-harness'

// The cold-loop case spawns the real CLI once per advertised step to prove each
// one is actually registered, at roughly a second per process under tsx. Keep
// the per-step spawns and allow the wall-clock they need.
vi.setConfig({ testTimeout: 30_000 })

const baseOptions: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  apply: false,
}

const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
const COMMITMENT_REF = `operation-commitment:v1:${'b'.repeat(64)}`
let testConfigDirectory: string
beforeEach(() => {
  testConfigDirectory = mkdtempSync(join(tmpdir(), 'ae-recovery-test-'))
  vi.stubEnv('AE_CONFIG_DIR', testConfigDirectory)
})
const inspection = {
  kind: 'committed' as const,
  quoteRef: COMMITMENT_REF,
  toolRef: OPERATION_REF,
  toolVersion: 1,
  expiresAt: 1_000,
  normalizedInput: {},
  price: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
  account: {
    accountRef: 'account:one',
    available: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
  },
  budget: {
    principalRef: 'principal:one',
    maximumPerCall: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
  },
  policyRefs: ['policy:sandbox'],
  evidenceDigest: 'sha256:evidence',
  continuation: {
    action: 'tool.call' as const,
    method: 'POST' as const,
    path: '/api/v1/tools/call' as const,
    input: { quoteRef: COMMITMENT_REF, idempotencyKey: `call:${COMMITMENT_REF}` },
  },
}

const completed = {
  kind: 'completed' as const,
  callRef: 'invocation:one',
  toolRef: OPERATION_REF,
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
  vi.unstubAllEnvs()
  rmSync(testConfigDirectory, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

describe('CLI Call recovery projections', () => {

  it('inspects existing connections before authorizing a recovery identity', () => {
    for (const [scope, nextCommand] of [
      [MARKET_TOOLS_CALL_SCOPE, 'ae account connections'],
      [MARKET_SUPPLY_MANAGE_SCOPE, 'ae account connections'],
    ] as const) {
      try {
        requireAgentAccessKey('account status', baseOptions, scope)
        throw new Error('missing_credential_should_refuse')
      } catch (error) {
        expect(error).toBeInstanceOf(CliFailure)
        expect((error as CliFailure).nextCommand).toBe(nextCommand)
      }
    }
  })

  it('publishes a schema-valid recovery example with digest and identity rules', async () => {
    const output = capture(process.stdout)
    try {
      await runManifestCommand([], { ...baseOptions, technical: true })
    } finally {
      output.restore()
    }

    const manifest = JSON.parse(output.read()) as {
      commands: {
        recover: { summary: string; guidance: readonly string[] }
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
          callRefIdentityRule: string
        }
      }
    }
    expect(manifest.commands.recover.summary).toContain('not a replay')
    expect(manifest.commands.recover.guidance.join(' ')).toContain('genuinely uncertain')
    expect(manifest.commands.recover.guidance.join(' ')).toContain('canonical evidence')
    expect(manifest.coldLoop).toEqual(['search', 'describe', 'connect', 'call', 'history', 'status', 'wait'])
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
      location: ['call.receipt', 'status.receipt', 'status.result.receipt', 'recover.receipt'],
      referenceField: 'receipt.receiptRef',
    })
    expect(manifest.ownerContinuations).toMatchObject({
      fund: { path: '/owner/credit', anchor: '#fund', agentCredential: 'not_used' },
      revoke: { path: '/agent-access', anchor: '#revoke', agentCredential: 'not_used' },
    })
    expect(manifest.gateway.idempotency).toMatchObject({
      commandField: 'idempotencyKey',
      commandFieldRequired: true,
      location: 'body.idempotencyKey',
      requiredFor: ['tool.call', 'call.cancel', 'call.reconcile'],
    })
    expect(manifest.gateway.idempotency).not.toHaveProperty('header')
    expect(manifest.gateway.idempotency).not.toHaveProperty('precedence')
    expect(output.read()).not.toContain('advanced reconcile')
    const recovery = manifest.evidence.recovery
    expect(callReconciliationEvidenceSchema.safeParse(recovery.example).success).toBe(true)
    const { digest, ...material } = recovery.example
    expect(digest).toBe(canonicalDigest(material))
    expect(recovery.digestMaterialRule).toContain('all evidence fields except digest')
    expect(recovery.callRefIdentityRule).toContain('historical evidence.invocationRef')
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

  it('keeps every advertised cold-loop step on an actually registered CLI root', async () => {
    const output = capture(process.stdout)
    try {
      await runManifestCommand([], { ...baseOptions, technical: true })
    } finally {
      output.restore()
    }
    const technical = JSON.parse(output.read()) as { coldLoop: readonly string[] }

    const compactOutput = capture(process.stdout)
    try {
      await runManifestCommand([], baseOptions)
    } finally {
      compactOutput.restore()
    }
    const compact = JSON.parse(compactOutput.read()) as { coldLoop: readonly string[] }

    expect(compact.coldLoop).toEqual(['search', 'describe', 'call', 'history', 'status', 'wait'])
    for (const step of new Set([...technical.coldLoop, ...compact.coldLoop])) {
      const help = spawnCliSync(['help', step, '--json'])
      expect(help.status, `${step} CLI help exit`).toBe(0)
      expect(help.stderr, `${step} CLI help stderr`).toBe('')
      expect(JSON.parse(help.stdout)).toMatchObject({ kind: 'HELP', command: step })
    }
  })
  it('runs accepted -> status -> terminal with canonical JSON and one stdout value per command', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...inspection,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'pending',
        callRef: 'invocation:one',
        toolRef: OPERATION_REF,
        retryAfterMs: 100,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'found',
        callRef: 'invocation:one',
        version: 1,
        toolRef: OPERATION_REF,
        state: 'terminal',
        result: completed,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runCallCommand([OPERATION_REF], { ...baseOptions, input: '{}', idempotencyKey: 'idem:one', wait: true })
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toEqual({ ...completed, recoveryRef: expect.stringMatching(/^[0-9a-f-]{36}$/u) })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('projects cancel over the canonical route and keeps the recovery output schema', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      callRef: 'invocation:one',
      version: 1,
      toolRef: OPERATION_REF,
      state: 'cancelled',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runCancelCommand(['invocation:one'], { ...baseOptions, idempotencyKey: 'cancel:one' })
    } finally {
      output.restore()
    }

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/calls/invocation%3Aone/cancel')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'cancel:one' })
    expect(JSON.parse(output.read())).toMatchObject({ kind: 'found', state: 'cancelled' })
  })

  it.each(['terminal', 'cancelled', 'invalidated'] as const)(
    'does not render a circular status continuation for a found %s status',
    async (state) => {
      setApiKey('ae-test-caller-key')
      const output = capture(process.stdout)
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
        kind: 'found',
        callRef: 'invocation:one',
        version: 1,
        toolRef: OPERATION_REF,
        state,
        ...(state === 'terminal' ? { result: completed } : {}),
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      vi.stubGlobal('fetch', fetchMock)

      try {
        const { runStatusCommand } = await import('../../../tools/ae/commands/status')
        await runStatusCommand(['invocation:one'], { ...baseOptions, json: false })
      } finally {
        output.restore()
      }

      expect(output.read()).not.toContain('next: ae status invocation:one')
    },
  )

  it('keeps terminal JSON canonical without adding a circular next command', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      callRef: 'invocation:one',
      version: 1,
      toolRef: OPERATION_REF,
      state: 'terminal',
      result: completed,
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    try {
      const { runStatusCommand } = await import('../../../tools/ae/commands/status')
      await runStatusCommand(['invocation:one'], baseOptions)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).not.toHaveProperty('nextCommand')
  })

  it('returns one safe reconciliation review command in machine output', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      callRef: 'invocation:one',
      version: 1,
      toolRef: OPERATION_REF,
      state: 'reconciliation_required',
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    try {
      const { runStatusCommand } = await import('../../../tools/ae/commands/status')
      await runStatusCommand(['invocation:one'], baseOptions)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toMatchObject({
      state: 'reconciliation_required',
      nextCommand: 'ae help recover --json',
      warning: 'The external effect may have started. Reconcile before retrying.',
    })
  })

  it('returns the funding command for insufficient credit in machine output', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      callRef: 'invocation:one',
      version: 1,
      toolRef: OPERATION_REF,
      state: 'terminal',
      usage: {
        usageRef: 'usage:credit',
        observedAt: 100,
        chargeState: 'insufficient_credit',
        amount: { currency: 'USD', units: '100', exponent: 2 },
        priceDigest: 'sha256:price',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    try {
      const { runStatusCommand } = await import('../../../tools/ae/commands/status')
      await runStatusCommand(['invocation:one'], baseOptions)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toMatchObject({
      nextCommand: 'ae account balance --json',
    })
  })

  it('fails an unknown Call and points status at history instead of itself', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'refused',
      callRef: 'invocation:missing',
      code: 'invocation_not_found',
      retryable: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    let exitCode: number
    try {
      const { runStatusCommand } = await import('../../../tools/ae/commands/status')
      exitCode = await runStatusCommand(['invocation:missing'], baseOptions)
    } finally {
      output.restore()
    }

    expect(exitCode).toBe(1)
    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'refused',
      code: 'invocation_not_found',
      nextCommand: 'ae history --json',
    })
  })

  it('uses top-level status usage to point insufficient credit at account funding', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      callRef: 'invocation:one',
      version: 1,
      toolRef: OPERATION_REF,
      state: 'terminal',
      usage: {
        usageRef: 'usage:credit',
        observedAt: 100,
        chargeState: 'insufficient_credit',
        amount: { currency: 'USD', units: '100', exponent: 2 },
        priceDigest: 'sha256:price',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    try {
      const { runStatusCommand } = await import('../../../tools/ae/commands/status')
      await runStatusCommand(['invocation:one'], { ...baseOptions, json: false })
    } finally {
      output.restore()
    }

    expect(output.read()).toContain('next: ae account balance')
    expect(output.read()).not.toContain('next: ae status invocation:one')
  })


  it('returns nonzero recovery detail when transport is uncertain, preserving the same identity', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(inspection), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockRejectedValueOnce(new Error('socket timeout'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCallCommand([OPERATION_REF], { ...baseOptions, input: '{}', idempotencyKey: 'idem:one' })).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'call-transport-unknown',
      detail: {
        toolRef: OPERATION_REF,
        recovery: 'Resume the retained purchase; do not create a new Call.',
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
    expect(thrown.code).toBe('call-reconcile-transport-unknown')
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
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(inspection), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(problem), {
        status: 503,
        headers: { 'content-type': 'application/problem+json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCallCommand([OPERATION_REF], { ...baseOptions, input: '{}', idempotencyKey: 'idem:503' }))
      .rejects.toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'provider_unavailable',
        retryable: true,
        message: '/api/v1/tools/call returned 503: Unavailable',
      } satisfies Partial<CliFailure>)
  })


  it('generates a durable idempotency key when call omits one', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(inspection), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completed), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const output = capture(process.stdout)
    try {
      await runCallCommand([OPERATION_REF], { ...baseOptions, input: '{}' })
    } finally {
      output.restore()
    }
    const result = JSON.parse(output.read()) as Record<string, unknown>
    expect(result).not.toHaveProperty('idempotencyKey')
    const [, init] = fetchMock.mock.calls[1]!
    const request = JSON.parse(String(init?.body)) as { idempotencyKey: string }
    expect(request.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('recovers through the canonical root command with positional evidence', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      callRef: 'invocation:one',
      version: 1,
      toolRef: OPERATION_REF,
      state: 'terminal',
      result: completed,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runRecoverCommand(['invocation:one', JSON.stringify(evidence)], {
        ...baseOptions,
        baseUrlSource: 'flag',
        idempotencyKey: 'recover:one',
      })
    } finally {
      output.restore()
    }

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/calls/invocation%3Aone/reconcile')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'recover:one', evidence })
    const rendered = output.read()
    expect(JSON.parse(rendered)).toMatchObject({
      kind: 'found',
      callRef: 'invocation:one',
      toolRef: OPERATION_REF,
      result: completed,
      nextCommand: 'ae status invocation:one --base-url https://market.example --json',
    })
    expect(rendered).not.toContain('recover:one')
  })

  it('never prints recovery idempotency material in human output', async () => {
    setApiKey('ae-test-caller-key')
    const stdout = capture(process.stdout)
    const stderr = capture(process.stderr)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      callRef: 'invocation:one',
      version: 1,
      toolRef: OPERATION_REF,
      state: 'terminal',
      result: completed,
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    try {
      await runRecoverCommand(['invocation:one', JSON.stringify(evidence)], {
        ...baseOptions,
        json: false,
        idempotencyKey: 'FAKE_RECOVERY_IDEMPOTENCY_SENTINEL',
      })
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(stdout.read()).not.toContain('FAKE_RECOVERY_IDEMPOTENCY_SENTINEL')
    expect(stderr.read()).not.toContain('FAKE_RECOVERY_IDEMPOTENCY_SENTINEL')
  })
})
