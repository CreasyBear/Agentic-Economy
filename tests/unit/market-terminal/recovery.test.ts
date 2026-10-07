import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST,
  MARKET_TOOLS_CALL_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
} from '@/modules/agent-access/contract'
import { callMachineResultSchema, callNextSchema, projectCallMachineResult } from '@/modules/capability-execution/call-contracts'
import { projectCallRecoveryNext, callReconciliationEvidenceSchema } from '@/modules/capability-execution/call-recovery.actions'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import { runCancelCommand } from '../../../tools/ae/commands/cancel'
import { runCallCommand } from '../../../tools/ae/commands/call'
import { runManifestCommand } from '../../../tools/ae/commands/manifest'
import { runRecoverCommand } from '../../../tools/ae/commands/recover'
import { renderStatusResult, requireAgentAccessKey, runStatusCommand } from '../../../tools/ae/commands/status'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'
import { runCliInProcess } from './cli-errors-harness'

// The cold-loop case runs the real CLI argv entry once per advertised step to
// prove each one is actually registered on the routing table in cli.ts (the
// direct runCallCommand/runManifestCommand imports elsewhere in this file
// bypass that table). No env override is needed here, so this runs in-process
// via runCliInProcess instead of spawning a bundle subprocess per step.
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
const CALL_REF = `operation-invocation:v1:${'c'.repeat(64)}`
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
    args: { quoteRef: COMMITMENT_REF, idempotencyKey: `call:${COMMITMENT_REF}` },
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

const x402EvidenceMaterial = {
  kind: 'x402_payment_reconciliation' as const, version: 1 as const,
  evidenceRef: 'evidence:payment', source: 'provider:one', invocationRef: 'invocation:one', attemptRef: 'attempt:one',
  effectGeneration: 1, operationRef: OPERATION_REF, inputDigest: 'sha256:input', requestDigest: 'sha256:request',
  transportObservationDigest: 'sha256:transport', paymentObservationDigest: 'sha256:payment', providerRef: 'provider:one',
  paymentIdentifier: 'payment:one', reservationRef: 'reservation:one', challengeDigest: 'sha256:challenge',
  amount: { currency: 'USDC', units: '1000000', exponent: 6 }, settlementStatus: 'settled' as const,
  paymentResponseDigest: 'sha256:response', transactionHash: `0x${'4'.repeat(64)}`, observedAt: evidenceMaterial.observedAt,
}
const x402Evidence = { ...x402EvidenceMaterial, digest: canonicalDigest(x402EvidenceMaterial) }

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
  it('refuses recovery commands without a credential for either required scope', () => {
    for (const scope of [MARKET_TOOLS_CALL_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE]) {
      let thrown: unknown
      try {
        requireAgentAccessKey('account status', baseOptions, scope)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(CliFailure)
      expect(thrown).toMatchObject({ kind: 'UNAUTHENTICATED', code: 'agent_access_key_required' })
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
    expect(manifest.commands.recover.summary).toContain('uncertain')
    expect(manifest.commands.recover.guidance.join(' ')).toContain('genuinely uncertain')
    expect(manifest.commands.recover.guidance.join(' ')).toContain('canonical evidence')
    expect(manifest.commands.recover.guidance.join(' ')).toContain('does not replay a known result')
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
      const help = await runCliInProcess(['help', step, '--json'])
      expect(help.status, `${step} CLI help exit`).toBe(0)
      expect(help.stderr, `${step} CLI help stderr`).toBe('')
      expect(JSON.parse(help.stdout)).toMatchObject({ kind: 'HELP', command: step })
    }
  })
  it('keeps historical Call evidence readable without advertising an invalid runnable reference', () => {
    const historical = { kind: 'pending' as const, callRef: 'invocation:historical', toolRef: OPERATION_REF, retryAfterMs: 100 }
    const projected = callMachineResultSchema.parse(projectCallMachineResult(historical))
    expect(projected).toMatchObject({ kind: 'pending', callRef: historical.callRef, next: [] })
    expect(projectCallRecoveryNext({ kind: 'found', callRef: historical.callRef, version: 1, toolRef: OPERATION_REF, state: 'in_progress' })).toEqual([])
    expect(callNextSchema.safeParse({ action: 'call.status', args: { callRef: historical.callRef }, authority: 'same_principal' }).success).toBe(false)
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
        callRef: CALL_REF,
        toolRef: OPERATION_REF,
        retryAfterMs: 100,
        next: [{ action: 'call.status', args: { callRef: CALL_REF }, authority: 'same_principal', retryAfterMs: 100 }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'found',
        callRef: CALL_REF,
        version: 1,
        toolRef: OPERATION_REF,
        state: 'terminal',
        result: { ...completed, callRef: CALL_REF },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runCallCommand([OPERATION_REF], { ...baseOptions, input: '{}', idempotencyKey: 'idem:one', wait: true })
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toEqual({ ...completed, callRef: CALL_REF, recoveryRef: expect.stringMatching(/^[0-9a-f-]{36}$/u) })
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

  it.each(['terminal', 'cancelled'] as const)(
    'does not continue a finished %s Call in Journey status',
    async (state) => {
      setApiKey('ae-test-caller-key')
      const output = capture(process.stdout)
      const recovery = {
        kind: 'found',
        callRef: CALL_REF,
        version: 1,
        toolRef: OPERATION_REF,
        state,
        ...(state === 'terminal' ? { result: completed } : {}),
      }
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
        kind: 'call',
        ref: CALL_REF,
        principalRef: `prn_${'a'.repeat(32)}`,
        recovery,
        workState: state === 'terminal' ? 'completed' : 'canceled',
        next: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      vi.stubGlobal('fetch', fetchMock)

      try {
        await runStatusCommand([CALL_REF], baseOptions)
      } finally {
        output.restore()
      }

      expect(JSON.parse(output.read())).toMatchObject({
        kind: 'call', ref: CALL_REF, recovery, next: [],
      })
      const [url, init] = fetchMock.mock.calls[0]!
      expect(url).toBe(`https://market.example/api/v1/status/${encodeURIComponent(CALL_REF)}`)
      expect(init?.method).toBe('GET')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    },
  )

  it('preserves a canonical Journey status snapshot in JSON without a circular continuation', async () => {
    setApiKey('ae-test-caller-key')
    const output = capture(process.stdout)
    const recovery = {
      kind: 'found',
      callRef: CALL_REF,
      version: 1,
      toolRef: OPERATION_REF,
      state: 'terminal',
      result: completed,
    }
    const snapshot = {
      kind: 'call',
      ref: CALL_REF,
      principalRef: `prn_${'a'.repeat(32)}`,
      recovery,
      workState: 'completed',
      next: [],
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(snapshot), {
      status: 200, headers: { 'content-type': 'application/json' },
    })))

    try {
      await runStatusCommand([CALL_REF], baseOptions)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toEqual(snapshot)
  })

  it('keeps legacy Call reconciliation review safe in machine output', () => {
    const output = capture(process.stdout)
    try {
      renderStatusResult('Call status', CALL_REF, {
        kind: 'found', callRef: CALL_REF, version: 1, toolRef: OPERATION_REF, state: 'reconciliation_required',
        next: [{ action: 'call.status', args: { callRef: CALL_REF, afterVersion: 1 }, authority: 'same_principal' }],
      }, baseOptions)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toMatchObject({
      state: 'reconciliation_required',
      nextCommand: `ae status ${CALL_REF} --json`,
    })
  })

  it('preserves recorded insufficient credit without inventing an owner funding operation', () => {
    const output = capture(process.stdout)
    try {
      renderStatusResult('Call status', CALL_REF, {
        kind: 'found', callRef: CALL_REF, version: 1, toolRef: OPERATION_REF, state: 'terminal',
        usage: {
          usageRef: 'usage:credit', observedAt: 100, chargeState: 'insufficient_credit',
          amount: { currency: 'USD', units: '100', exponent: 2 }, priceDigest: 'sha256:price',
        },
      }, baseOptions)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).not.toHaveProperty('nextCommand')
  })

  it('fails an unknown Call without inventing another machine operation', () => {
    const output = capture(process.stdout)
    let exitCode: number
    try {
      exitCode = renderStatusResult('Call status', CALL_REF, {
        kind: 'refused', callRef: CALL_REF, code: 'invocation_not_found', retryable: false,
      }, baseOptions)
    } finally {
      output.restore()
    }

    expect(exitCode).toBe(1)
    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'refused', code: 'invocation_not_found',
    })
  })

  it('points a missing status argument at command help', async () => {
    await expect(runStatusCommand([], baseOptions)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT', code: 'status-usage', nextCommand: 'ae help status',
    } satisfies Partial<CliFailure>)
  })

  it('refuses a malformed Call ref before requesting status', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await expect(runStatusCommand(['invocation:one'], baseOptions)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT', code: 'status-usage', nextCommand: 'ae history --json',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows recorded insufficient credit without inventing funding or status commands', () => {
    const output = capture(process.stdout)
    try {
      renderStatusResult('Call status', CALL_REF, {
        kind: 'found', callRef: CALL_REF, version: 1, toolRef: OPERATION_REF, state: 'terminal',
        usage: {
          usageRef: 'usage:credit', observedAt: 100, chargeState: 'insufficient_credit',
          amount: { currency: 'USD', units: '100', exponent: 2 }, priceDigest: 'sha256:price',
        },
      }, { ...baseOptions, json: false })
    } finally {
      output.restore()
    }

    expect(output.read()).not.toContain('next: ae account balance')
    expect(output.read()).not.toContain(`next: ae status ${CALL_REF}`)
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

  it.each([evidence, x402Evidence])('recovers through the canonical root command with $kind positional evidence', async (evidence) => {
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

  it.each([
    { ...x402Evidence, digest: 'sha256:incorrect' },
    { ...x402Evidence, invocationRef: 'invocation:other', digest: canonicalDigest({ ...x402EvidenceMaterial, invocationRef: 'invocation:other' }) },
  ])('refuses invalid x402 recovery evidence before sending a request', async (invalidEvidence) => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await expect(runRecoverCommand(['invocation:one', JSON.stringify(invalidEvidence)], {
      ...baseOptions, idempotencyKey: 'recover:one',
    })).rejects.toMatchObject({ kind: 'INVALID_ARGUMENT' })
    expect(fetchMock).not.toHaveBeenCalled()
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
