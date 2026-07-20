import { readFileSync } from 'node:fs'
import { convexTest, type TestConvex } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import schema from '../../../convex/schema'
import {
  createHostedPaidOperationServiceToken,
  HOSTED_PAID_OPERATION_AGENT_SCOPE,
  HOSTED_PAID_OPERATION_SERVICE_TOKEN_TTL_MS,
  verifyHostedPaidOperationServiceToken,
} from '@/modules/action-invocation/hosted-paid-operation-service-auth'
import type { PaidOperationProjection } from '@/modules/action-invocation/paid-operation-application-service'

const handler = readFileSync('convex/actionInvocationControl.ts', 'utf8')
const hostedGateway = readFileSync('convex/hostedPaidOperationGateway.ts', 'utf8')
const durableContract = readFileSync(
  'src/modules/action-invocation/internal/durable-contracts.ts',
  'utf8',
)
const moduleSchema = readFileSync(
  'src/modules/action-invocation/internal/convex-schema.ts',
  'utf8',
)
const discoveredModules = import.meta.glob('../../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules)
  .map(([path, load]) => [path.replace('../../../convex/', './'), load]))
type HostedBackend = TestConvex<typeof schema>

type GatewayResult =
  | Readonly<{ kind: 'accepted'; value: PaidOperationProjection }>
  | Readonly<{ kind: 'refused'; code: string }>

const authenticatedCreate = makeFunctionReference<
  'mutation',
  { providerKey: 'A' | 'B'; serviceToken?: string },
  | Readonly<{ kind: 'created'; invocationRef: string; expectedInvocationVersion: number }>
  | Readonly<{ kind: 'refused'; code: string }>
>('hostedPaidOperationGateway:authenticatedCreate')
const authenticatedInspect = makeFunctionReference<
  'query',
  { invocationRef: string; expectedInvocationVersion: number; serviceToken?: string },
  GatewayResult
>('hostedPaidOperationGateway:authenticatedInspect')
const authenticatedCommand = makeFunctionReference<
  'action',
  {
    invocationRef: string
    commandId: string
    expectedInvocationVersion: number
    command: 'authorize' | 'execute' | 'reconcile'
    accept?: boolean
    serviceToken?: string
  },
  GatewayResult
>('hostedPaidOperationGateway:authenticatedCommand')
const beginAuthenticatedExecute = makeFunctionReference<
  'mutation',
  {
    principalRef: string
    callerRef: string
    invocationRef: string
    commandId: string
    expectedInvocationVersion: number
  },
  | Readonly<{
      kind: 'ready'
      attemptRef: string
      effectGeneration: number
    }>
  | Readonly<{ kind: 'duplicate'; invocationVersion: number }>
  | Readonly<{ kind: 'refused'; code: string }>
>('hostedPaidOperationGateway:beginAuthenticatedExecute')
const recordMockEffect = makeFunctionReference<
  'mutation',
  {
    principalRef: string
    callerRef: string
    invocationRef: string
    attemptRef: string
    effectGeneration: number
    recordedAt: string
  },
  | Readonly<{ kind: 'recorded' | 'duplicate'; observation: unknown }>
  | Readonly<{ kind: 'refused'; code: string }>
>('hostedPaidOperation:recordMockEffect')

const ownerIdentity = {
  subject: 'paid-operation-owner',
  issuer: 'https://identity.test',
  tokenIdentifier: 'https://identity.test|paid-operation-owner',
}
const serviceKey = 'service-token-key-material-32-bytes-minimum'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('private Convex Action Invocation transaction contract', () => {
  it('accepts the module-owned current attempt write and replaces its current projection', () => {
    expect(durableContract).toContain('currentAttemptWrite?: DurableAttemptRow')
    expect(handler).toContain('currentAttemptWrite: v.optional(attemptRow)')
    expect(handler).toContain("withIndex('by_invocationRef_and_attemptRef'")
    expect(handler).toContain('ctx.db.replace(existingAttempt._id, attemptWrite)')
    expect(handler).not.toContain('newAttempt')

    const immutableRefusal = handler.indexOf("code: 'command_identity_conflict'")
    const monotonicRefusal = handler.indexOf(
      'args.row.invocationVersion <= current.invocationVersion',
    )
    const controlWrite = handler.indexOf("ctx.db.insert('actionInvocationControls'")
    expect(immutableRefusal).toBeGreaterThan(-1)
    expect(monotonicRefusal).toBeGreaterThan(immutableRefusal)
    expect(controlWrite).toBeGreaterThan(monotonicRefusal)
  })

  it('uses the shared transition validator and appends history without dropping it', () => {
    expect(moduleSchema).toContain('export const attemptTransitionValue = v.object({')
    expect(moduleSchema).toContain('attemptTransition: v.optional(attemptTransitionValue)')
    expect(handler).toContain('attemptTransitionValue,')
    expect(handler).toContain('attemptTransition: v.optional(attemptTransitionValue)')
    expect(handler).toMatch(/ctx\.db\.insert\('actionInvocationHistory',\s*\{\s*\.\.\.args\.history,/u)
  })

  it('exposes exact indexed reads required by the durable adapter', () => {
    expect(handler).toContain('export const readAttempt = internalQuery({')
    expect(handler).toContain('export const readHistoryCommand = internalQuery({')
    expect(handler).toContain("withIndex('by_invocationRef_and_commandId'")
  })
})

describe('authenticated hosted paid-operation intent gateway', () => {
  it('admits token-owned creation and cold-loads version one without exposing another owner', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const owner = backend.withIdentity(ownerIdentity)
    const created = await owner.mutation(authenticatedCreate, { providerKey: 'A' })
    expect(created).toMatchObject({
      kind: 'created',
      expectedInvocationVersion: 1,
    })
    if (created.kind !== 'created') return

    const inspected = await owner.query(authenticatedInspect, {
      invocationRef: created.invocationRef,
      expectedInvocationVersion: 1,
    })
    expect(inspected.kind).toBe('accepted')
    if (inspected.kind !== 'accepted') return
    expect(inspected.value.semantics).toMatchObject({
      identity: {
        invocationRef: created.invocationRef,
        expectedInvocationVersion: 1,
      },
      operation: { providerId: 'provider:a' },
      queryRelease: { state: 'not_released' },
      paymentSubmission: { state: 'not_submitted' },
      resultDelivery: { state: 'not_delivered' },
    })
    expect(inspected.value.semantics.continuations.map(({ kind }) => kind))
      .toEqual(['authorize'])
    expect(inspected.value.human.semanticDigest).toBe(inspected.value.agent.semanticDigest)

    const stranger = backend.withIdentity({
      subject: 'paid-operation-stranger',
      issuer: 'https://identity.test',
      tokenIdentifier: 'https://identity.test|paid-operation-stranger',
    })
    await expect(stranger.query(authenticatedInspect, {
      invocationRef: created.invocationRef,
      expectedInvocationVersion: 1,
    })).resolves.toEqual({ kind: 'refused', code: 'invocation_not_found' })

    const stored = await backend.run(async (ctx) => {
      const header = await ctx.db.query('hostedPaidOperationHeaders')
        .withIndex('by_invocationRef', (q) => q.eq('invocationRef', created.invocationRef))
        .unique()
      const control = await ctx.db.query('actionInvocationControls')
        .withIndex('by_invocationRef', (q) => q.eq('invocationRef', created.invocationRef))
        .unique()
      return { header, control }
    })
    expect(stored.header).toMatchObject({
      ownerPrincipalRef: ownerIdentity.subject,
      ownerCallerRef: ownerIdentity.tokenIdentifier,
      invocationVersion: 1,
    })
    expect(stored.control?.control.owner).toEqual({
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
    })
  })

  it('independently verifies a short-lived service token against the exact agent intent', async () => {
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
    const backend = convexTest(schema, modules)
    const principal = {
      principalRef: 'agent-owner:paid',
      callerRef: 'clerk_api_key:key:paid',
      credentialId: 'key:paid',
      scopes: [HOSTED_PAID_OPERATION_AGENT_SCOPE],
    } as const
    await admitPrincipal(backend, principal.principalRef)
    const issuedAt = Date.now()
    const intent = { kind: 'create' as const, providerKey: 'A' as const }
    const serviceToken = await createHostedPaidOperationServiceToken({
      key: serviceKey,
      principal,
      intent,
      issuedAt,
    })

    expect(serviceToken).not.toMatch(
      /agent-owner:paid|clerk_api_key|key:paid|ak_[A-Za-z0-9_-]*/u,
    )
    await expect(verifyHostedPaidOperationServiceToken({
      key: serviceKey,
      serviceToken,
      intent,
      now: issuedAt + 1,
    })).resolves.toMatchObject({
      principalRef: principal.principalRef,
      callerRef: principal.callerRef,
      credentialId: principal.credentialId,
      scopes: principal.scopes,
    })
    await expect(verifyHostedPaidOperationServiceToken({
      key: serviceKey,
      serviceToken,
      intent: { kind: 'create', providerKey: 'B' },
      now: issuedAt + 1,
    })).resolves.toBeUndefined()
    await expect(verifyHostedPaidOperationServiceToken({
      key: `${serviceKey}:wrong`,
      serviceToken,
      intent,
      now: issuedAt + 1,
    })).resolves.toBeUndefined()
    await expect(verifyHostedPaidOperationServiceToken({
      key: serviceKey,
      serviceToken,
      intent,
      now: issuedAt + HOSTED_PAID_OPERATION_SERVICE_TOKEN_TTL_MS + 1,
    })).resolves.toBeUndefined()

    const created = await backend.mutation(authenticatedCreate, {
      providerKey: 'A',
      serviceToken,
    })
    expect(created).toMatchObject({
      kind: 'created',
      expectedInvocationVersion: 1,
    })
    await expect(backend.mutation(authenticatedCreate, {
      providerKey: 'B',
      serviceToken,
    })).resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
  })

  it('CAS-authorizes exact current authority and executes one labelled mock effect once', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const owner = backend.withIdentity(ownerIdentity)
    const created = await createFor(owner, 'A')

    const authorized = await owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:authorize:a',
      expectedInvocationVersion: 1,
      command: 'authorize',
      accept: true,
    })
    expect(authorized.kind).toBe('accepted')
    if (authorized.kind !== 'accepted') return
    expect(authorized.value.semantics.identity.expectedInvocationVersion).toBe(2)
    expect(authorized.value.semantics.continuations.map(({ kind }) => kind)).toEqual(['execute'])

    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:authorize:a',
      expectedInvocationVersion: 1,
      command: 'authorize',
      accept: false,
    })).resolves.toEqual({ kind: 'refused', code: 'command_identity_conflict' })
    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:stale:a',
      expectedInvocationVersion: 1,
      command: 'execute',
    })).resolves.toEqual({ kind: 'refused', code: 'stale_invocation_version' })

    const executed = await owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:execute:a',
      expectedInvocationVersion: 2,
      command: 'execute',
    })
    expect(executed.kind).toBe('accepted')
    if (executed.kind !== 'accepted') return
    expect(executed.value.semantics).toMatchObject({
      identity: { expectedInvocationVersion: 5 },
      queryRelease: { state: 'released' },
      paymentSubmission: { state: 'observed' },
      settlement: {
        state: 'settled',
        amount: { currency: 'USD', amountMinor: 1 },
      },
      resultDelivery: { state: 'valid' },
    })
    expect(executed.value.semantics.continuations.map(({ kind }) => kind)).toEqual(['inspect'])
    expect(executed.value.human.semanticDigest).toBe(executed.value.agent.semanticDigest)

    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:execute:a',
      expectedInvocationVersion: 2,
      command: 'execute',
    })).resolves.toEqual(executed)
    const durable = await effectFacts(backend, created.invocationRef)
    expect(durable).toMatchObject({
      invocationVersion: 5,
      currentEffectGeneration: 1,
      attemptCount: 1,
      effectCount: 1,
      evidenceCount: 1,
      admissionReservationState: 'released',
      admissionCounterActive: 0,
    })
    expect(durable.attempts[0]).toMatchObject({
      effectGeneration: 1,
      release: { state: 'released' },
      outcome: { state: 'returned' },
    })
    expect(durable.effects[0]).toMatchObject({
      effectGeneration: 1,
      effect: 'released',
      payment: 'settled',
      delivery: 'returned',
    })
    expect(await effectFacts(backend, created.invocationRef)).toEqual(durable)
  })

  it('persists pre-release uncertainty, refuses cold replay, and reconciles from server evidence only', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const owner = backend.withIdentity(ownerIdentity)
    const created = await createFor(owner, 'B')
    await authorize(owner, created.invocationRef, 'command:authorize:b')

    const uncertain = await owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:execute:b',
      expectedInvocationVersion: 2,
      command: 'execute',
    })
    expect(uncertain.kind).toBe('accepted')
    if (uncertain.kind !== 'accepted') return
    expect(uncertain.value.semantics).toMatchObject({
      identity: { expectedInvocationVersion: 5 },
      queryRelease: { state: 'unknown' },
      paymentSubmission: { state: 'possibly_submitted' },
      settlement: { state: 'unknown' },
      resultDelivery: { state: 'not_delivered' },
    })
    expect(uncertain.value.semantics.continuations.map(({ kind }) => kind))
      .toEqual(['reconcile'])

    const beforeReplay = await effectFacts(backend, created.invocationRef)
    expect(beforeReplay).toMatchObject({
      effectCount: 1,
      admissionReservationState: 'active',
      admissionCounterActive: 1,
    })
    expect(beforeReplay.effects[0]).toMatchObject({
      effect: 'released',
      payment: 'settled',
      delivery: 'response_lost',
    })
    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:execute:b',
      expectedInvocationVersion: 2,
      command: 'execute',
    })).resolves.toEqual(uncertain)
    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:execute:b:new',
      expectedInvocationVersion: 5,
      command: 'execute',
    })).resolves.toEqual({ kind: 'refused', code: 'continuation_not_allowed' })
    expect(await effectFacts(backend, created.invocationRef)).toEqual(beforeReplay)

    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:reconcile:forged',
      expectedInvocationVersion: 5,
      command: 'reconcile',
      evidence: { resolution: 'released' },
    } as never)).rejects.toThrow()
    expect((await effectFacts(backend, created.invocationRef)).invocationVersion).toBe(5)

    const reconciled = await owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:reconcile:b',
      expectedInvocationVersion: 5,
      command: 'reconcile',
    })
    expect(reconciled.kind).toBe('accepted')
    if (reconciled.kind !== 'accepted') return
    expect(reconciled.value.semantics).toMatchObject({
      identity: { expectedInvocationVersion: 6 },
      queryRelease: { state: 'released' },
      paymentSubmission: { state: 'observed' },
      settlement: {
        state: 'settled',
        amount: { currency: 'USD', amountMinor: 1 },
      },
      resultDelivery: { state: 'not_delivered' },
    })
    expect(reconciled.value.semantics.continuations.map(({ kind }) => kind))
      .toEqual(['inspect'])
    expect(reconciled.value.human.semanticDigest).toBe(reconciled.value.agent.semanticDigest)
    const afterReconcile = await effectFacts(backend, created.invocationRef)
    expect(afterReconcile).toMatchObject({
      attemptCount: 1,
      effectCount: 1,
      admissionReservationState: 'released',
      admissionCounterActive: 0,
    })
    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:reconcile:b',
      expectedInvocationVersion: 5,
      command: 'reconcile',
    })).resolves.toEqual(reconciled)
    expect(await effectFacts(backend, created.invocationRef)).toEqual(afterReconcile)
  })

  it('reconciles a crash cut before the mock mutation as not released and not submitted', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const owner = backend.withIdentity(ownerIdentity)
    const created = await createFor(owner, 'A')
    await authorize(owner, created.invocationRef, 'command:authorize:crash')

    const begun = await backend.mutation(beginAuthenticatedExecute, {
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
      invocationRef: created.invocationRef,
      commandId: 'command:execute:crash',
      expectedInvocationVersion: 2,
    })
    expect(begun.kind).toBe('ready')
    if (begun.kind !== 'ready') return
    const afterBegin = await effectFacts(backend, created.invocationRef)
    expect(afterBegin).toMatchObject({
      invocationVersion: 4,
      attemptCount: 1,
      effectCount: 0,
      admissionReservationState: 'active',
      admissionCounterActive: 1,
    })

    const reconciled = await owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:reconcile:crash',
      expectedInvocationVersion: 4,
      command: 'reconcile',
    })
    expect(reconciled.kind).toBe('accepted')
    if (reconciled.kind !== 'accepted') return
    expect(reconciled.value.semantics).toMatchObject({
      identity: { expectedInvocationVersion: 5 },
      queryRelease: { state: 'not_released' },
      paymentSubmission: { state: 'not_submitted' },
      settlement: { state: 'no_evidence' },
      resultDelivery: { state: 'not_delivered' },
    })
    expect(reconciled.value.semantics).not.toMatchObject({
      queryRelease: { state: 'released' },
      settlement: { state: 'settled' },
    })
    expect(await effectFacts(backend, created.invocationRef)).toMatchObject({
      invocationVersion: 5,
      attemptCount: 1,
      effectCount: 0,
      admissionReservationState: 'active',
      admissionCounterActive: 1,
    })
  })

  it('rechecks a disabled trial before pre-release while preserving inspect and lifecycle rules', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const owner = backend.withIdentity(ownerIdentity)
    const created = await createFor(owner, 'A')
    await authorize(owner, created.invocationRef, 'command:authorize:disabled')
    await setOwnerPolicyEnabled(backend, false)

    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:execute:disabled',
      expectedInvocationVersion: 2,
      command: 'execute',
    })).resolves.toEqual({ kind: 'refused', code: 'trial_disabled' })
    const inspected = await owner.query(authenticatedInspect, {
      invocationRef: created.invocationRef,
      expectedInvocationVersion: 2,
    })
    expect(inspected.kind).toBe('accepted')
    if (inspected.kind !== 'accepted') return
    expect(inspected.value.semantics.continuations.map(({ kind }) => kind)).toEqual(['execute'])
    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:reconcile:disabled',
      expectedInvocationVersion: 2,
      command: 'reconcile',
    })).resolves.toEqual({ kind: 'refused', code: 'continuation_not_allowed' })
    expect(await effectFacts(backend, created.invocationRef)).toMatchObject({
      invocationVersion: 2,
      attemptCount: 0,
      effectCount: 0,
      admissionReservationState: 'active',
      admissionCounterActive: 1,
    })
  })

  it('atomically refuses the effect when the kill switch changes after pre-release persistence', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const owner = backend.withIdentity(ownerIdentity)
    const created = await createFor(owner, 'A')
    await authorize(owner, created.invocationRef, 'command:authorize:disable-race')
    const begun = await backend.mutation(beginAuthenticatedExecute, {
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
      invocationRef: created.invocationRef,
      commandId: 'command:execute:disable-race',
      expectedInvocationVersion: 2,
    })
    expect(begun.kind).toBe('ready')
    if (begun.kind !== 'ready') return
    await setOwnerPolicyEnabled(backend, false)

    await expect(backend.mutation(recordMockEffect, {
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
      invocationRef: created.invocationRef,
      attemptRef: begun.attemptRef,
      effectGeneration: begun.effectGeneration,
      recordedAt: '2026-07-20T00:00:00.000Z',
    })).resolves.toEqual({ kind: 'refused', code: 'trial_disabled_or_inactive' })
    expect(await effectFacts(backend, created.invocationRef)).toMatchObject({
      invocationVersion: 4,
      effectCount: 0,
      admissionReservationState: 'active',
      admissionCounterActive: 1,
    })

    const reconciled = await owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:reconcile:disable-race',
      expectedInvocationVersion: 4,
      command: 'reconcile',
    })
    expect(reconciled.kind).toBe('accepted')
    if (reconciled.kind !== 'accepted') return
    expect(reconciled.value.semantics).toMatchObject({
      queryRelease: { state: 'not_released' },
      paymentSubmission: { state: 'not_submitted' },
    })
    expect(await effectFacts(backend, created.invocationRef)).toMatchObject({
      invocationVersion: 5,
      effectCount: 0,
      admissionReservationState: 'active',
      admissionCounterActive: 1,
    })
  })

  it('releases admission exactly once when authority is refused with no continuation', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const owner = backend.withIdentity(ownerIdentity)
    const created = await createFor(owner, 'A')

    const refused = await owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:authority-refused',
      expectedInvocationVersion: 1,
      command: 'authorize',
      accept: false,
    })
    expect(refused.kind).toBe('accepted')
    if (refused.kind !== 'accepted') return
    expect(refused.value.semantics.continuations.map(({ kind }) => kind)).toEqual(['inspect'])
    const released = await effectFacts(backend, created.invocationRef)
    expect(released).toMatchObject({
      invocationVersion: 2,
      attemptCount: 0,
      effectCount: 0,
      admissionReservationState: 'released',
      admissionCounterActive: 0,
    })
    await expect(owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:authority-refused',
      expectedInvocationVersion: 1,
      command: 'authorize',
      accept: false,
    })).resolves.toEqual(refused)
    expect(await effectFacts(backend, created.invocationRef)).toEqual(released)
  })

  it('keeps every public validator intent-only and refuses caller state fields', async () => {
    expect(hostedGateway).not.toMatch(
      /export const authenticated(?:CreateInitial|Transact|ReserveAdmission|LoadComplete|Identity)/u,
    )
    const createArgs = publicArgs('authenticatedCreate')
    const inspectArgs = publicArgs('authenticatedInspect')
    const commandArgs = publicArgs('authenticatedCommand')
    expect(createArgs).toMatch(/providerKey/u)
    expect(inspectArgs).toMatch(/invocationRef[\s\S]*expectedInvocationVersion/u)
    expect(commandArgs).toMatch(
      /invocationRef[\s\S]*commandId[\s\S]*expectedInvocationVersion[\s\S]*command[\s\S]*accept/u,
    )
    expect(`${createArgs}\n${inspectArgs}\n${commandArgs}`).not.toMatch(
      /\b(?:owner|principal|authority|selectedSource|payment|result|evidence|resolution)\w*\b/iu,
    )

    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(ownerIdentity)
    await expect(owner.mutation(authenticatedCreate, {
      providerKey: 'A',
      ownerPrincipalRef: 'caller:forged',
    } as never)).rejects.toThrow()
    for (const forbidden of ['principalRef', 'authority', 'payment', 'result', 'evidence', 'resolution']) {
      await expect(owner.action(authenticatedCommand, {
        invocationRef: 'invocation:forged',
        commandId: `command:${forbidden}`,
        expectedInvocationVersion: 1,
        command: 'reconcile',
        [forbidden]: true,
      } as never)).rejects.toThrow()
    }
  })
})

function publicArgs(symbol: string): string {
  const match = hostedGateway.match(new RegExp(
    `export const ${symbol} = (?:mutation|query|action)\\(\\{\\n\\s*args: \\{([\\s\\S]*?)\\n\\s*\\},\\n\\s*handler:`,
    'u',
  ))
  if (match?.[1] === undefined) throw new Error(`Missing public args for ${symbol}.`)
  return match[1]
}

async function admitOwner(backend: HostedBackend) {
  await admitPrincipal(backend, ownerIdentity.subject)
}

async function admitPrincipal(backend: HostedBackend, principalRef: string) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
      policyRef: 'phase-3c-hosted-paid-operation-trial',
      enabled: true,
      principalRef,
      totalLimit: 3,
      concurrencyLimit: 1,
      rateLimit: 2,
      policyDigest: `sha256:${'a'.repeat(64)}`,
      sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
      admissionEndsAt: '9999-12-30T00:00:00.000Z',
      retainThrough: '9999-12-31T00:00:00.000Z',
      killSwitchOwner: 'operator:phase3c',
      recordedAt: '2026-07-20T00:00:00.000Z',
    })
  })
}

async function setOwnerPolicyEnabled(backend: HostedBackend, enabled: boolean) {
  await backend.run(async (ctx) => {
    const policy = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', 'phase-3c-hosted-paid-operation-trial')
          .eq('principalRef', ownerIdentity.subject))
      .unique()
    if (policy === null) throw new Error('hosted_paid_operation_test_policy_missing')
    await ctx.db.patch(policy._id, { enabled })
  })
}

async function createFor(
  owner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
  providerKey: 'A' | 'B',
) {
  const created = await owner.mutation(authenticatedCreate, { providerKey })
  if (created.kind !== 'created') throw new Error(`Creation refused: ${created.code}.`)
  return created
}

async function authorize(
  owner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
  invocationRef: string,
  commandId: string,
) {
  const result = await owner.action(authenticatedCommand, {
    invocationRef,
    commandId,
    expectedInvocationVersion: 1,
    command: 'authorize',
    accept: true,
  })
  if (result.kind !== 'accepted') throw new Error(`Authorization refused: ${result.code}.`)
  return result
}

async function effectFacts(
  backend: HostedBackend,
  invocationRef: string,
) {
  return await backend.run(async (ctx) => {
    const header = await ctx.db.query('hostedPaidOperationHeaders')
      .withIndex('by_invocationRef', (q) => q.eq('invocationRef', invocationRef))
      .unique()
    const attempts = await ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptNumber', (q) => q.eq('invocationRef', invocationRef))
      .take(4)
    const evidence = attempts[0] === undefined
      ? []
      : await ctx.db.query('hostedPaidOperationEvidenceReferences')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
          q.eq('invocationRef', invocationRef)
            .eq('attemptRef', attempts[0]!.attemptRef)
            .eq('effectGeneration', attempts[0]!.effectGeneration))
        .take(4)
    const effects = await ctx.db.query('hostedPaidOperationMockEffects')
      .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
        q.eq('invocationRef', invocationRef))
      .take(4)
    const reservation = header === null
      ? null
      : await ctx.db.query('hostedPaidOperationAdmissionReservations')
        .withIndex('by_reservationRef', (q) =>
          q.eq('reservationRef', header.admissionReservationRef))
        .unique()
    const counter = reservation === null
      ? null
      : await ctx.db.query('hostedPaidOperationAdmissionCounters')
        .withIndex('by_policyRef_and_principalRef', (q) =>
          q.eq('policyRef', reservation.policyRef)
            .eq('principalRef', reservation.principalRef))
        .unique()
    return {
      invocationVersion: header?.invocationVersion,
      currentEffectGeneration: header?.currentEffectGeneration,
      attemptCount: attempts.length,
      effectCount: effects.length,
      evidenceCount: evidence.length,
      admissionReservationState: reservation?.state,
      admissionCounterActive: counter?.active,
      attempts: attempts.map(({ _id, _creationTime, recordedAt, ...attempt }) => attempt),
      effects: effects.map(({ _id, _creationTime, ...effect }) => effect),
    }
  })
}
