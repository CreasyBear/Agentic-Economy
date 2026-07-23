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
import {
  HOSTED_PAID_OPERATION_CHILD_CAP,
  type HostedPaidOperationAggregate,
} from '@/modules/action-invocation/hosted-paid-operation-port'
import type { PaidOperationProjection } from '@/modules/action-invocation/paid-operation-application-service'
import {
  projectHostedPaidOperationCardInput,
  projectHostedPaidOperationCardPresentation,
} from '@/modules/action-invocation/paid-operation-card-contract'
import type { ActionResult } from '@/modules/common/action'

const handler = readFileSync('convex/actionInvocationControl.ts', 'utf8')
const hostedGateway = readFileSync('convex/hostedPaidOperationGateway.ts', 'utf8')
const hostedPersistence = readFileSync('convex/hostedPaidOperation.ts', 'utf8')
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
const beginAuthenticatedReconcile = makeFunctionReference<
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
      aggregate: HostedPaidOperationAggregate<ActionResult>
      commandDigest: string
    }>
  | Readonly<{ kind: 'duplicate'; invocationVersion: number }>
  | Readonly<{ kind: 'refused'; code: string }>
>('hostedPaidOperationGateway:beginAuthenticatedReconcile')
const transact = makeFunctionReference<
  'mutation',
  Record<string, unknown>,
  | Readonly<{
      kind: 'applied' | 'duplicate'
      invocationVersion: number
      effectGeneration?: number
    }>
  | Readonly<{ kind: 'refused'; code: string }>
>('hostedPaidOperation:transact')
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
const readMockEffectObservation = makeFunctionReference<
  'query',
  {
    principalRef: string
    callerRef: string
    invocationRef: string
    attemptRef: string
    effectGeneration: number
  },
  | Readonly<{ kind: 'observed'; observation: unknown }>
  | Readonly<{ kind: 'refused'; code: string }>
>('hostedPaidOperation:readMockEffectObservation')
const disablePhase3CAdmission = makeFunctionReference<
  'mutation',
  { evaluatorPrincipalRef: string; policyDigest: string; killSwitchOwner: string },
  | Readonly<{ kind: 'disabled'; policyDigest: string }>
  | Readonly<{ kind: 'refused'; code: string }>
>('hostedPaidOperation:disablePhase3CAdmission')
const phase3CHostedProofObservation = makeFunctionReference<
  'query',
  { invocationRefs: string[] },
  | Readonly<{
      kind: 'observed'
      policy: Record<string, unknown>
      counters: Record<string, unknown>
      invocations: readonly Record<string, unknown>[]
      observationDigest: string
    }>
  | Readonly<{ kind: 'refused'; code: string }>
>('hostedPaidOperation:phase3CHostedProofObservation')
const recordPhase3CDeploymentReceipt = makeFunctionReference<
  'mutation',
  {
    sourceRevision: string
    sourceTree: string
    githubRunId: string
    githubRunAttempt: number
    sourceClockTimestamp: string
  },
  Readonly<{ kind: 'recorded' | 'duplicate'; deploymentName: string }>
    | Readonly<{ kind: 'refused'; code: string }>
>('hostedPaidOperation:recordPhase3CDeploymentReceipt')

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
      environment: {
        name: 'hosted-labelled-mock-sandbox-candidate',
        evidenceClass: 'hosted_labelled_mock_candidate',
        claimCeiling: 'pending_authenticated_exact_revision_readback',
      },
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
      const source = await ctx.db.query('hostedPaidOperationSources')
        .withIndex('by_invocationRef_and_sourceRef', (q) =>
          q.eq('invocationRef', created.invocationRef))
        .unique()
      const payment = await ctx.db.query('hostedPaidOperationPayments')
        .withIndex('by_invocationRef_and_paymentIdentifier', (q) =>
          q.eq('invocationRef', created.invocationRef))
        .unique()
      const reservation = header === null
        ? null
        : await ctx.db.query('hostedPaidOperationAdmissionReservations')
          .withIndex('by_reservationRef', (q) =>
            q.eq('reservationRef', header.admissionReservationRef))
          .unique()
      return { header, control, source, payment, reservation }
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
    expect(stored.source?.environment).toEqual(inspected.value.semantics.environment)
    expect(stored.payment).toMatchObject({
      proposal: {
        paymentIdentifier: stored.payment?.paymentIdentifier,
        providerId: 'provider:a',
        operationKey: 'btc-usd-a',
        operationRevision: '1',
        providerEndpoint: 'https://sandbox-a.invalid/btc-usd',
        proposalDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    })
    expect(stored.reservation?.policyDigest).toBe(`sha256:${'a'.repeat(64)}`)
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

  it('keeps one principal usable across sessions and an API key with actual caller attribution', async () => {
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const creator = backend.withIdentity(ownerIdentity)
    const secondSessionIdentity = {
      ...ownerIdentity,
      tokenIdentifier: 'https://identity.test|paid-operation-owner:session-2',
    }
    const secondSession = backend.withIdentity(secondSessionIdentity)
    const created = await createFor(creator, 'B')

    await expect(secondSession.query(authenticatedInspect, {
      invocationRef: created.invocationRef,
      expectedInvocationVersion: 1,
    })).resolves.toMatchObject({ kind: 'accepted' })

    const apiKeyCaller = {
      principalRef: ownerIdentity.subject,
      callerRef: 'clerk_api_key:key:paid-operation',
      credentialId: 'key:paid-operation',
      scopes: [HOSTED_PAID_OPERATION_AGENT_SCOPE],
    } as const
    const authorizeIntent = {
      kind: 'command' as const,
      invocationRef: created.invocationRef,
      commandId: 'command:multi-caller:authorize',
      expectedInvocationVersion: 1,
      command: 'authorize' as const,
      accept: true,
    }
    const authorizeToken = await createHostedPaidOperationServiceToken({
      key: serviceKey,
      principal: apiKeyCaller,
      intent: authorizeIntent,
      issuedAt: Date.now(),
    })
    const authorized = await backend.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: authorizeIntent.commandId,
      expectedInvocationVersion: 1,
      command: 'authorize',
      accept: true,
      serviceToken: authorizeToken,
    })
    expect(authorized).toEqual({ kind: 'accepted', value: expect.anything() })

    const executeIntent = {
      kind: 'command' as const,
      invocationRef: created.invocationRef,
      commandId: 'command:multi-caller:execute',
      expectedInvocationVersion: 2,
      command: 'execute' as const,
    }
    const executeToken = await createHostedPaidOperationServiceToken({
      key: serviceKey,
      principal: apiKeyCaller,
      intent: executeIntent,
      issuedAt: Date.now(),
    })
    const uncertain = await backend.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: executeIntent.commandId,
      expectedInvocationVersion: 2,
      command: 'execute',
      serviceToken: executeToken,
    })
    expect(uncertain).toMatchObject({
      kind: 'accepted',
      value: {
        semantics: {
          identity: { expectedInvocationVersion: 5 },
          continuations: [{ kind: 'reconcile', requiredInput: [] }],
        },
      },
    })
    await expect(backend.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: executeIntent.commandId,
      expectedInvocationVersion: 2,
      command: 'execute',
      serviceToken: executeToken,
    })).resolves.toEqual(uncertain)
    expect(await effectFacts(backend, created.invocationRef)).toMatchObject({
      attemptCount: 1,
      effectCount: 1,
    })

    const reconciled = await secondSession.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:multi-caller:reconcile',
      expectedInvocationVersion: 5,
      command: 'reconcile',
    })
    expect(reconciled).toMatchObject({
      kind: 'accepted',
      value: { semantics: { identity: { expectedInvocationVersion: 6 } } },
    })
    await expect(secondSession.query(authenticatedInspect, {
      invocationRef: created.invocationRef,
      expectedInvocationVersion: 6,
    })).resolves.toEqual(reconciled)

    const durable = await backend.run(async (ctx) => {
      const header = await ctx.db.query('hostedPaidOperationHeaders')
        .withIndex('by_invocationRef', (q) => q.eq('invocationRef', created.invocationRef))
        .unique()
      const control = await ctx.db.query('actionInvocationControls')
        .withIndex('by_invocationRef', (q) => q.eq('invocationRef', created.invocationRef))
        .unique()
      const attempts = await ctx.db.query('actionInvocationAttempts')
        .withIndex('by_invocationRef_and_attemptNumber', (q) =>
          q.eq('invocationRef', created.invocationRef))
        .take(2)
      const commands = await ctx.db.query('hostedPaidOperationCommands')
        .withIndex('by_invocationRef_and_commandId', (q) =>
          q.eq('invocationRef', created.invocationRef))
        .take(10)
      return { header, control, attempts, commands }
    })
    expect(durable.header).toMatchObject({
      ownerPrincipalRef: ownerIdentity.subject,
      ownerCallerRef: ownerIdentity.tokenIdentifier,
    })
    expect(durable.control?.control.owner).toEqual({
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
    })
    expect(durable.attempts[0]?.actor).toEqual({
      principalRef: ownerIdentity.subject,
      callerRef: apiKeyCaller.callerRef,
    })
    expect(durable.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        commandId: authorizeIntent.commandId,
        principalRef: ownerIdentity.subject,
        callerRef: apiKeyCaller.callerRef,
      }),
      expect.objectContaining({
        commandId: 'command:multi-caller:reconcile',
        principalRef: ownerIdentity.subject,
        callerRef: secondSessionIdentity.tokenIdentifier,
      }),
    ]))

    const stranger = backend.withIdentity({
      subject: 'paid-operation-stranger',
      issuer: ownerIdentity.issuer,
      tokenIdentifier: 'https://identity.test|paid-operation-stranger',
    })
    await expect(stranger.query(authenticatedInspect, {
      invocationRef: created.invocationRef,
      expectedInvocationVersion: 6,
    })).resolves.toEqual({ kind: 'refused', code: 'invocation_not_found' })
    await expect(stranger.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:multi-caller:reconcile',
      expectedInvocationVersion: 5,
      command: 'reconcile',
    })).resolves.toEqual({ kind: 'refused', code: 'invocation_not_found' })
    const attempt = durable.attempts[0]
    expect(attempt).toBeDefined()
    if (attempt === undefined) return
    await expect(backend.query(readMockEffectObservation, {
      principalRef: 'paid-operation-stranger',
      callerRef: 'known-caller',
      invocationRef: created.invocationRef,
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
    })).resolves.toEqual({ kind: 'refused', code: 'invocation_not_found' })
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
    expect(authorized.value.semantics).toMatchObject({
      identity: { expectedInvocationVersion: 2 },
      paymentAuthorization: { state: 'created' },
      paymentSubmission: { state: 'not_submitted' },
      settlement: { state: 'no_evidence' },
      resultDelivery: { state: 'not_delivered' },
    })
    expect(authorized.value.semantics.continuations.map(({ kind }) => kind)).toEqual(['execute'])
    const versionTwo = await owner.query(authenticatedInspect, {
      invocationRef: created.invocationRef,
      expectedInvocationVersion: 2,
    })
    expect(versionTwo).toEqual(authorized)
    const card = projectHostedPaidOperationCardInput(
      authorized.value,
      'authenticated-convex-local-fixture',
    )
    expect(projectHostedPaidOperationCardPresentation(
      authorized.value.semantics,
      card,
    ).label).toBe('Payment prepared')

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
      proposalDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
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
    await expect(backend.mutation(recordMockEffect, {
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
      invocationRef: created.invocationRef,
      attemptRef: begun.attemptRef,
      effectGeneration: begun.effectGeneration,
      recordedAt: '2026-07-20T00:00:01.000Z',
    })).resolves.toEqual({ kind: 'refused', code: 'effect_lineage_not_current' })
    expect((await effectFacts(backend, created.invocationRef)).effectCount).toBe(0)
  })

  it('atomically refuses a stale trusted not-released observation when the effect wins the race', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const owner = backend.withIdentity(ownerIdentity)
    const created = await createFor(owner, 'A')
    await authorize(owner, created.invocationRef, 'command:authorize:effect-race')
    const begun = await backend.mutation(beginAuthenticatedExecute, {
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
      invocationRef: created.invocationRef,
      commandId: 'command:execute:effect-race',
      expectedInvocationVersion: 2,
    })
    expect(begun.kind).toBe('ready')
    if (begun.kind !== 'ready') return
    const reconciliation = await backend.mutation(beginAuthenticatedReconcile, {
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
      invocationRef: created.invocationRef,
      commandId: 'command:reconcile:effect-race',
      expectedInvocationVersion: 4,
    })
    expect(reconciliation.kind).toBe('ready')
    if (reconciliation.kind !== 'ready') return
    await expect(backend.query(readMockEffectObservation, {
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
      invocationRef: created.invocationRef,
      attemptRef: begun.attemptRef,
      effectGeneration: begun.effectGeneration,
    })).resolves.toMatchObject({
      kind: 'observed',
      observation: { effect: 'not_released', payment: 'not_submitted' },
    })
    await expect(backend.mutation(recordMockEffect, {
      principalRef: ownerIdentity.subject,
      callerRef: ownerIdentity.tokenIdentifier,
      invocationRef: created.invocationRef,
      attemptRef: begun.attemptRef,
      effectGeneration: begun.effectGeneration,
      recordedAt: '2026-07-20T00:00:01.000Z',
    })).resolves.toMatchObject({
      kind: 'recorded',
      observation: { effect: 'released', payment: 'settled' },
    })

    await expect(backend.mutation(transact, convexTransactionCommand({
      ownerPrincipalRef: ownerIdentity.subject,
      ownerCallerRef: ownerIdentity.tokenIdentifier,
      commandId: 'command:reconcile:effect-race',
      commandDigest: reconciliation.commandDigest,
      expectedInvocationVersion: 4,
      aggregate: reconciliation.aggregate,
      trustedObservationGuard: {
        kind: 'mock_effect_absent',
        attemptRef: begun.attemptRef,
        effectGeneration: begun.effectGeneration,
      },
      recordedAt: '2026-07-20T00:00:02.000Z',
    }))).resolves.toEqual({ kind: 'refused', code: 'trusted_observation_changed' })
    await expect(backend.mutation(transact, convexTransactionCommand({
      ownerPrincipalRef: ownerIdentity.subject,
      ownerCallerRef: ownerIdentity.tokenIdentifier,
      commandId: 'command:reconcile:effect-race',
      commandDigest: reconciliation.commandDigest,
      expectedInvocationVersion: 4,
      aggregate: reconciliation.aggregate,
      trustedObservationGuard: {
        kind: 'mock_effect_digest',
        attemptRef: begun.attemptRef,
        effectGeneration: begun.effectGeneration,
        observationDigest: `sha256:${'f'.repeat(64)}`,
      },
      recordedAt: '2026-07-20T00:00:02.000Z',
    }))).resolves.toEqual({ kind: 'refused', code: 'trusted_observation_changed' })
    expect(await effectFacts(backend, created.invocationRef)).toMatchObject({
      invocationVersion: 4,
      currentEffectGeneration: 1,
      attemptCount: 1,
      effectCount: 1,
    })

    const reconciled = await owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: 'command:reconcile:effect-race',
      expectedInvocationVersion: 4,
      command: 'reconcile',
    })
    expect(reconciled).toMatchObject({
      kind: 'accepted',
      value: {
        semantics: {
          identity: { expectedInvocationVersion: 5 },
          queryRelease: { state: 'released' },
          paymentSubmission: { state: 'observed' },
          continuations: [{ kind: 'inspect' }],
        },
      },
    })
    expect(await effectFacts(backend, created.invocationRef)).toMatchObject({
      invocationVersion: 5,
      currentEffectGeneration: 1,
      attemptCount: 1,
      effectCount: 1,
    })
  })

  it('rechecks a disabled trial before pre-release while preserving inspect and lifecycle rules', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend)
    const owner = backend.withIdentity(ownerIdentity)
    const created = await createFor(owner, 'A')
    await authorize(owner, created.invocationRef, 'command:authorize:disabled')
    await expect(backend.mutation(disablePhase3CAdmission, {
      evaluatorPrincipalRef: ownerIdentity.subject,
      policyDigest: `sha256:${'a'.repeat(64)}`,
      killSwitchOwner: 'operator:phase3c',
    })).resolves.toEqual({
      kind: 'disabled',
      policyDigest: `sha256:${'a'.repeat(64)}`,
    })

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

  it('refuses counter digest or bound drift before execute changes durable invocation state', async () => {
    const corruptions = [
      { policyDigest: `sha256:${'b'.repeat(64)}` },
      { admittedTotal: 0 },
      { admittedTotal: 4 },
      { active: 2 },
      { admittedInWindow: 0 },
      { admittedInWindow: 3 },
      { admittedTotal: 1.5 },
    ] as const
    for (const [index, corruption] of corruptions.entries()) {
      const backend = convexTest(schema, modules)
      await admitOwner(backend)
      const owner = backend.withIdentity(ownerIdentity)
      const created = await createFor(owner, 'A')
      await authorize(owner, created.invocationRef, `command:authorize:counter:${index}`)
      await backend.run(async (ctx) => {
        const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
          .withIndex('by_policyRef_and_principalRef', (q) =>
            q.eq('policyRef', 'phase-3c-hosted-paid-operation-trial:g6')
              .eq('principalRef', ownerIdentity.subject))
          .unique()
        if (counter === null) throw new Error('test_counter_missing')
        await ctx.db.patch(counter._id, corruption)
      })

      await expect(owner.action(authenticatedCommand, {
        invocationRef: created.invocationRef,
        commandId: `command:execute:counter:${index}`,
        expectedInvocationVersion: 2,
        command: 'execute',
      })).resolves.toEqual({ kind: 'refused', code: 'trial_disabled' })
      expect(await effectFacts(backend, created.invocationRef)).toMatchObject({
        invocationVersion: 2,
        attemptCount: 0,
        effectCount: 0,
      })
    }
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
    await expect(backend.mutation(disablePhase3CAdmission, {
      evaluatorPrincipalRef: ownerIdentity.subject,
      policyDigest: `sha256:${'a'.repeat(64)}`,
      killSwitchOwner: 'operator:phase3c',
    })).resolves.toMatchObject({ kind: 'disabled' })

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

  it('atomically refuses expired or digest-drifted effect admission and preserves recovery', async () => {
    for (const drift of ['expired', 'reservation_digest', 'counter_digest'] as const) {
      const backend = convexTest(schema, modules)
      await admitOwner(backend)
      const owner = backend.withIdentity(ownerIdentity)
      const created = await createFor(owner, 'A')
      await authorize(owner, created.invocationRef, `command:authorize:${drift}`)
      const begun = await backend.mutation(beginAuthenticatedExecute, {
        principalRef: ownerIdentity.subject,
        callerRef: ownerIdentity.tokenIdentifier,
        invocationRef: created.invocationRef,
        commandId: `command:execute:${drift}`,
        expectedInvocationVersion: 2,
      })
      expect(begun.kind).toBe('ready')
      if (begun.kind !== 'ready') continue
      await backend.run(async (ctx) => {
        const header = await ctx.db.query('hostedPaidOperationHeaders')
          .withIndex('by_invocationRef', (q) => q.eq('invocationRef', created.invocationRef))
          .unique()
        if (header === null) throw new Error('test_header_missing')
        const reservation = await ctx.db.query('hostedPaidOperationAdmissionReservations')
          .withIndex('by_reservationRef', (q) =>
            q.eq('reservationRef', header.admissionReservationRef))
          .unique()
        if (reservation === null) throw new Error('test_reservation_missing')
        if (drift === 'expired') {
          const policy = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
            .withIndex('by_policyRef_and_principalRef', (q) =>
              q.eq('policyRef', reservation.policyRef)
                .eq('principalRef', reservation.principalRef))
            .unique()
          if (policy === null) throw new Error('test_policy_missing')
          await ctx.db.patch(policy._id, { admissionEndsAt: '2026-07-19T00:00:00.000Z' })
        } else if (drift === 'reservation_digest') {
          await ctx.db.patch(reservation._id, { policyDigest: `sha256:${'b'.repeat(64)}` })
        } else {
          const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
            .withIndex('by_policyRef_and_principalRef', (q) =>
              q.eq('policyRef', reservation.policyRef)
                .eq('principalRef', reservation.principalRef))
            .unique()
          if (counter === null) throw new Error('test_counter_missing')
          await ctx.db.patch(counter._id, { policyDigest: `sha256:${'c'.repeat(64)}` })
        }
      })
      await expect(backend.mutation(recordMockEffect, {
        principalRef: ownerIdentity.subject,
        callerRef: ownerIdentity.tokenIdentifier,
        invocationRef: created.invocationRef,
        attemptRef: begun.attemptRef,
        effectGeneration: begun.effectGeneration,
        recordedAt: drift === 'expired'
          ? '1900-01-01T00:00:00.000Z'
          : '2026-07-20T00:00:00.000Z',
      })).resolves.toEqual({ kind: 'refused', code: 'trial_disabled_or_inactive' })
      expect(await effectFacts(backend, created.invocationRef)).toMatchObject({
        invocationVersion: 4,
        effectCount: 0,
      })
      const inspected = await owner.query(authenticatedInspect, {
        invocationRef: created.invocationRef,
        expectedInvocationVersion: 4,
      })
      expect(inspected).toMatchObject({ kind: 'accepted' })
      if (drift === 'expired') {
        const reconciled = await owner.action(authenticatedCommand, {
          invocationRef: created.invocationRef,
          commandId: 'command:reconcile:expired',
          expectedInvocationVersion: 4,
          command: 'reconcile',
        })
        expect(reconciled).toMatchObject({
          kind: 'accepted',
          value: {
            semantics: {
              queryRelease: { state: 'not_released' },
              paymentSubmission: { state: 'not_submitted' },
            },
          },
        })
      }
    }
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

  it('classifies a final persistence refusal after release as update-not-confirmed', () => {
    const executeStart = hostedGateway.indexOf('async function executeAuthenticatedIntent')
    const executeSource = hostedGateway.slice(
      executeStart,
      hostedGateway.indexOf('async function reconcileAuthenticatedIntent'),
    )

    expect(executeStart).toBeGreaterThan(-1)
    expect(executeSource).toContain('releaseSignal.wasReleased()')
    expect(executeSource).toContain("kind: 'update_not_confirmed'")
    expect(executeSource).not.toMatch(
      /if \(persisted\.kind === 'refused'\) return persisted/u,
    )
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

  it('keeps the Phase3C proof observation internal, exact-ref-only, bounded, and sanitized', async () => {
    const queryStart = hostedPersistence.indexOf('export const phase3CHostedProofObservation')
    const querySource = hostedPersistence.slice(
      queryStart,
      hostedPersistence.indexOf('export const readMockEffectObservation'),
    )
    expect(queryStart).toBeGreaterThan(-1)
    expect(querySource).toContain('export const phase3CHostedProofObservation = internalQuery')
    expect(querySource).toContain(".withIndex('by_policyRef'")
    expect(querySource).toContain('.take(2)')
    expect(querySource).toContain(".withIndex('by_ownerPrincipalRef_and_invocationRef'")
    expect(querySource).toContain(".withIndex('by_policyRef_and_principalRef_and_reservationRef'")
    expect(querySource).toContain('.take(PHASE3C_PROOF_HEADER_CAP + 1)')
    expect(querySource).toContain('const priorHeadersSafe = observedHeaders.every')
    expect(querySource).toContain('.take(4)')
    expect(querySource).toContain('.take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)')
    expect(querySource).not.toMatch(
      /\.collect\(|\.filter\(|scheduler|\.custodyReference\b|\.evidenceReference\b/iu,
    )
    expect(hostedGateway).not.toContain('phase3CHostedProofObservation')

    const backend = convexTest(schema, modules)
    await expect(backend.query(phase3CHostedProofObservation, {
      invocationRefs: [],
    })).resolves.toEqual({ kind: 'refused', code: 'invocation_ref_count_invalid' })
    await expect(backend.query(phase3CHostedProofObservation, {
      invocationRefs: ['invocation:1', 'invocation:2', 'invocation:3', 'invocation:4'],
    })).resolves.toEqual({ kind: 'refused', code: 'invocation_ref_count_invalid' })
    await expect(backend.query(phase3CHostedProofObservation, {
      invocationRefs: ['invocation:1', 'invocation:1'],
    })).resolves.toEqual({ kind: 'refused', code: 'invocation_ref_count_invalid' })
  })

  it('records one exact deployment receipt from live Convex metadata and refuses drift', async () => {
    expect(moduleSchema).toContain('hostedPaidOperationDeploymentReceipts: defineTable')
    expect(moduleSchema).toContain(".index('by_receiptRef', ['receiptRef'])")
    expect(hostedPersistence).toContain(
      'export const recordPhase3CDeploymentReceipt = internalMutation',
    )
    expect(hostedPersistence).toContain('await ctx.meta.getDeploymentMetadata()')
    expect(hostedPersistence).not.toMatch(/deploymentName:\s*v\.string\(\)/u)

    const backend = convexTest(schema, modules)
    const args = {
      sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
      sourceTree: 'bf3769890c9940ae259fab9777fdca8b25f686d7',
      githubRunId: '123456789',
      githubRunAttempt: 1,
      sourceClockTimestamp: '2026-07-21T00:00:00.000Z',
    }
    const first = await backend.mutation(recordPhase3CDeploymentReceipt, args)
    expect(first.kind).toBe('recorded')
    await expect(backend.mutation(recordPhase3CDeploymentReceipt, args)).resolves.toMatchObject({
      kind: 'duplicate',
    })
    await expect(backend.mutation(recordPhase3CDeploymentReceipt, {
      ...args,
      sourceRevision: 'f'.repeat(40),
    })).resolves.toEqual({ kind: 'refused', code: 'deployment_receipt_conflict' })
  })

  it('observes exactly three closed one-effect invocations and refuses missing or inconsistent rows', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend, 3)
    const owner = backend.withIdentity(ownerIdentity)
    const first = await runCompletedEffect(owner, 'A', 'human-agent-a')
    const second = await runCompletedEffect(owner, 'A', 'agent-a')
    const third = await runCompletedEffect(owner, 'B', 'goblin-b')
    const invocationRefs = [first.invocationRef, second.invocationRef, third.invocationRef]

    await backend.run(async (ctx) => {
      const currentHeader = await ctx.db.query('hostedPaidOperationHeaders')
        .withIndex('by_invocationRef', (q) => q.eq('invocationRef', first.invocationRef))
        .unique()
      if (currentHeader === null) throw new Error('test_header_missing')
      const {
        _id: _currentHeaderId,
        _creationTime: _currentHeaderCreationTime,
        ...retainedHeader
      } = currentHeader
      const priorPolicyDigest = `sha256:${'e'.repeat(64)}`
      const priorPolicyRef = 'phase-3c-hosted-paid-operation-trial'
      const priorReservationRef = 'reservation:retained-pre-authority'
      await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
        policyRef: priorPolicyRef,
        enabled: false,
        principalRef: ownerIdentity.subject,
        totalLimit: 3,
        concurrencyLimit: 1,
        rateLimit: 3,
        policyDigest: priorPolicyDigest,
        sourceRevision: 'f1d57784a621f3769d8006300705188fb65f0568',
        admissionEndsAt: '2026-07-21T05:52:44.000Z',
        retainThrough: '2026-08-21T00:00:00.000Z',
        killSwitchOwner: 'operator:phase3c',
        recordedAt: '2026-07-21T01:52:44.000Z',
      })
      await ctx.db.insert('hostedPaidOperationAdmissionCounters', {
        policyRef: priorPolicyRef,
        principalRef: ownerIdentity.subject,
        policyDigest: priorPolicyDigest,
        currentWindowKey: '2026-07-21T01',
        admittedTotal: 1,
        active: 0,
        admittedInWindow: 1,
        updatedAt: '2026-07-21T02:00:00.000Z',
      })
      await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
        reservationRef: priorReservationRef,
        policyRef: priorPolicyRef,
        principalRef: ownerIdentity.subject,
        policyDigest: priorPolicyDigest,
        state: 'released',
        updatedAt: '2026-07-21T02:00:00.000Z',
      })
      await ctx.db.insert('hostedPaidOperationHeaders', {
        ...retainedHeader,
        invocationRef: 'invocation:retained-pre-authority',
        invocationVersion: 1,
        admissionReservationRef: priorReservationRef,
        updatedAt: '2026-07-21T01:57:50.212Z',
      })
      const priorAuthorizedPolicyRef = 'phase-3c-hosted-paid-operation-trial:g2'
      const priorAuthorizedDigest = `sha256:${'f'.repeat(64)}`
      const priorAuthorizedReservationRef = 'reservation:retained-authorized'
      await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
        policyRef: priorAuthorizedPolicyRef,
        enabled: false,
        principalRef: ownerIdentity.subject,
        totalLimit: 3,
        concurrencyLimit: 1,
        rateLimit: 3,
        policyDigest: priorAuthorizedDigest,
        sourceRevision: '0c00f56d252522739fa4a5926638eb82e9c1ef9d',
        admissionEndsAt: '2026-07-21T06:26:06.000Z',
        retainThrough: '2026-08-21T00:00:00.000Z',
        killSwitchOwner: 'operator:phase3c',
        recordedAt: '2026-07-21T02:26:06.000Z',
      })
      await ctx.db.insert('hostedPaidOperationAdmissionCounters', {
        policyRef: priorAuthorizedPolicyRef,
        principalRef: ownerIdentity.subject,
        policyDigest: priorAuthorizedDigest,
        currentWindowKey: '2026-07-21T02',
        admittedTotal: 1,
        active: 0,
        admittedInWindow: 1,
        updatedAt: '2026-07-21T02:31:00.000Z',
      })
      await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
        reservationRef: priorAuthorizedReservationRef,
        policyRef: priorAuthorizedPolicyRef,
        principalRef: ownerIdentity.subject,
        policyDigest: priorAuthorizedDigest,
        state: 'released',
        updatedAt: '2026-07-21T02:31:00.000Z',
      })
      await ctx.db.insert('hostedPaidOperationHeaders', {
        ...retainedHeader,
        invocationRef: 'invocation:retained-authorized',
        invocationVersion: 2,
        admissionReservationRef: priorAuthorizedReservationRef,
        updatedAt: '2026-07-21T02:29:43.941Z',
      })
      const priorUncertaintyPolicyRef = 'phase-3c-hosted-paid-operation-trial:g3'
      const priorUncertaintyDigest = `sha256:${'d'.repeat(64)}`
      await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
        policyRef: priorUncertaintyPolicyRef,
        enabled: false,
        principalRef: ownerIdentity.subject,
        totalLimit: 3,
        concurrencyLimit: 1,
        rateLimit: 3,
        policyDigest: priorUncertaintyDigest,
        sourceRevision: '10635cceeaace76327ae0292758456a84d12d659',
        admissionEndsAt: '2026-07-21T06:52:20.000Z',
        retainThrough: '2026-08-21T00:00:00.000Z',
        killSwitchOwner: 'operator:phase3c',
        recordedAt: '2026-07-21T02:52:20.000Z',
      })
      await ctx.db.insert('hostedPaidOperationAdmissionCounters', {
        policyRef: priorUncertaintyPolicyRef,
        principalRef: ownerIdentity.subject,
        policyDigest: priorUncertaintyDigest,
        currentWindowKey: '2026-07-21T02',
        admittedTotal: 3,
        active: 0,
        admittedInWindow: 3,
        updatedAt: '2026-07-21T03:00:00.000Z',
      })
      for (const [index, version] of [5, 5, 5].entries()) {
        const reservationRef = `reservation:retained-g3:${index + 1}`
        await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
          reservationRef,
          policyRef: priorUncertaintyPolicyRef,
          principalRef: ownerIdentity.subject,
          policyDigest: priorUncertaintyDigest,
          state: 'released',
          updatedAt: '2026-07-21T03:00:00.000Z',
        })
        await ctx.db.insert('hostedPaidOperationHeaders', {
          ...retainedHeader,
          invocationRef: `invocation:retained-g3:${index + 1}`,
          invocationVersion: version,
          admissionReservationRef: reservationRef,
          updatedAt: `2026-07-21T02:54:0${index + 6}.000Z`,
        })
      }
      const priorActorProofPolicyRef = 'phase-3c-hosted-paid-operation-trial:g4'
      const priorActorProofDigest = `sha256:${'c'.repeat(64)}`
      await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
        policyRef: priorActorProofPolicyRef,
        enabled: false,
        principalRef: ownerIdentity.subject,
        totalLimit: 3,
        concurrencyLimit: 1,
        rateLimit: 3,
        policyDigest: priorActorProofDigest,
        sourceRevision: '8b17e045ce27184597153e2cc7b8b81874125b09',
        admissionEndsAt: '2026-07-21T07:09:53.000Z',
        retainThrough: '2026-08-21T00:00:00.000Z',
        killSwitchOwner: 'operator:phase3c',
        recordedAt: '2026-07-21T03:09:53.000Z',
      })
      await ctx.db.insert('hostedPaidOperationAdmissionCounters', {
        policyRef: priorActorProofPolicyRef,
        principalRef: ownerIdentity.subject,
        policyDigest: priorActorProofDigest,
        currentWindowKey: '2026-07-21T03',
        admittedTotal: 3,
        active: 0,
        admittedInWindow: 3,
        updatedAt: '2026-07-21T03:17:00.000Z',
      })
      for (const [index, version] of [5, 5, 6].entries()) {
        const reservationRef = `reservation:retained-g4:${index + 1}`
        await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
          reservationRef,
          policyRef: priorActorProofPolicyRef,
          principalRef: ownerIdentity.subject,
          policyDigest: priorActorProofDigest,
          state: 'released',
          updatedAt: '2026-07-21T03:17:00.000Z',
        })
        await ctx.db.insert('hostedPaidOperationHeaders', {
          ...retainedHeader,
          invocationRef: `invocation:retained-g4:${index + 1}`,
          invocationVersion: version,
          admissionReservationRef: reservationRef,
          updatedAt: `2026-07-21T03:16:0${index + 4}.000Z`,
        })
      }
    })

    const observed = await backend.query(phase3CHostedProofObservation, { invocationRefs })
    expect(observed.kind).toBe('observed')
    if (observed.kind !== 'observed') return
    expect(observed.policy).toMatchObject({
      enabled: true,
      bounds: { total: 3, concurrency: 1, rate: 3 },
    })
    expect(observed.counters).toMatchObject({
      admittedTotal: 3,
      activeReservations: 0,
      admittedInWindow: 3,
    })
    expect(observed).toMatchObject({
      cohort: { headers: 3, reservations: 3 },
      deployment: {
        current: expect.objectContaining({ name: expect.any(String) }),
        receipt: expect.objectContaining({
          sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
          sourceTree: 'bf3769890c9940ae259fab9777fdca8b25f686d7',
          githubRepository: 'CreasyBear/Agentic-Economy',
          githubRef: 'main',
          githubWorkflow: '.github/workflows/kernel-release-gate.yml',
          githubJob: 'Phase 3C exact-revision Convex deployment',
          githubStep: 'Record Phase 3C Convex deployment receipt',
        }),
      },
    })
    expect(observed.invocations).toHaveLength(3)
    expect(observed.invocations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: 'provider:a',
        counts: expect.objectContaining({ attempts: 1, effects: 1 }),
      }),
      expect.objectContaining({
        providerId: 'provider:b',
        currentTruth: expect.objectContaining({
          payment: 'settled',
          delivery: 'not_delivered',
          observedResolution: 'pending',
        }),
        counts: expect.objectContaining({ attempts: 1, effects: 1 }),
      }),
    ]))
    expect(observed.invocations.flatMap((invocation) => invocation.commands))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          commandIdDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        }),
      ]))
    expect(observed.observationDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(JSON.stringify(observed)).not.toMatch(
      /paid-operation-owner|identity\.test|"(?:custodyReference|evidenceReference)":|Bearer|api[_-]?key|session[_-]?token/iu,
    )

    await expect(backend.query(phase3CHostedProofObservation, {
      invocationRefs: [...invocationRefs.slice(0, 2), 'invocation:missing'],
    })).resolves.toEqual({ kind: 'refused', code: 'proof_header_cohort_mismatch' })

    await backend.run(async (ctx) => {
      const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
        .withIndex('by_policyRef_and_principalRef', (q) =>
          q.eq('policyRef', 'phase-3c-hosted-paid-operation-trial:g6')
            .eq('principalRef', ownerIdentity.subject))
        .unique()
      if (counter === null) throw new Error('test_counter_missing')
      await ctx.db.patch(counter._id, { admittedTotal: 2 })
    })
    await expect(backend.query(phase3CHostedProofObservation, {
      invocationRefs,
    })).resolves.toEqual({ kind: 'refused', code: 'proof_rows_inconsistent' })
  })

  it('refuses hidden headers, sources, payments, reservations, and identity cross-link drift', async () => {
    const corruptions: Array<Readonly<{
      expectedCode: string
      apply: (backend: HostedBackend, invocationRefs: readonly string[]) => Promise<void>
    }>> = [
      {
        expectedCode: 'proof_header_cohort_mismatch',
        apply: async (backend, invocationRefs) => {
          await backend.run(async (ctx) => {
            const header = await ctx.db.query('hostedPaidOperationHeaders')
              .withIndex('by_invocationRef', (q) => q.eq('invocationRef', invocationRefs[0]!))
              .unique()
            if (header === null) throw new Error('test_header_missing')
            const {
              _id: _ignoredId,
              _creationTime: _ignoredCreationTime,
              ...row
            } = header
            await ctx.db.insert('hostedPaidOperationHeaders', {
              ...row,
              invocationRef: 'invocation:hidden-fourth',
            })
          })
        },
      },
      {
        expectedCode: 'proof_row_cardinality_mismatch',
        apply: async (backend, invocationRefs) => {
          await backend.run(async (ctx) => {
            const rows = await ctx.db.query('hostedPaidOperationSources')
              .withIndex('by_invocationRef_and_sourceRef', (q) =>
                q.eq('invocationRef', invocationRefs[0]!))
              .take(1)
            if (rows[0] === undefined) throw new Error('test_source_missing')
            const {
              _id: _ignoredId,
              _creationTime: _ignoredCreationTime,
              ...row
            } = rows[0]
            await ctx.db.insert('hostedPaidOperationSources', {
              ...row,
              sourceRef: 'source:hidden-second',
              prepared: {
                ...row.prepared,
                target: { ...row.prepared.target, sourceRef: 'source:hidden-second' },
              },
            })
          })
        },
      },
      {
        expectedCode: 'proof_row_cardinality_mismatch',
        apply: async (backend, invocationRefs) => {
          await backend.run(async (ctx) => {
            const rows = await ctx.db.query('hostedPaidOperationPayments')
              .withIndex('by_invocationRef_and_paymentIdentifier', (q) =>
                q.eq('invocationRef', invocationRefs[0]!))
              .take(1)
            if (rows[0] === undefined) throw new Error('test_payment_missing')
            const {
              _id: _ignoredId,
              _creationTime: _ignoredCreationTime,
              ...row
            } = rows[0]
            await ctx.db.insert('hostedPaidOperationPayments', {
              ...row,
              paymentIdentifier: 'payment:hidden-second',
            })
          })
        },
      },
      {
        expectedCode: 'proof_reservation_cohort_mismatch',
        apply: async (backend) => {
          await backend.run(async (ctx) => {
            const rows = await ctx.db.query('hostedPaidOperationAdmissionReservations')
              .withIndex('by_policyRef_and_principalRef_and_reservationRef', (q) =>
                q.eq('policyRef', 'phase-3c-hosted-paid-operation-trial:g6')
                  .eq('principalRef', ownerIdentity.subject))
              .take(1)
            if (rows[0] === undefined) throw new Error('test_reservation_missing')
            const {
              _id: _ignoredId,
              _creationTime: _ignoredCreationTime,
              ...row
            } = rows[0]
            await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
              ...row,
              reservationRef: 'reservation:hidden-orphan',
            })
          })
        },
      },
      {
        expectedCode: 'proof_rows_inconsistent',
        apply: async (backend, invocationRefs) => {
          await backend.run(async (ctx) => {
            const control = await ctx.db.query('actionInvocationControls')
              .withIndex('by_invocationRef', (q) => q.eq('invocationRef', invocationRefs[0]!))
              .unique()
            if (control === null) throw new Error('test_control_missing')
            await ctx.db.patch(control._id, {
              control: {
                ...control.control,
                owner: { ...control.control.owner, callerRef: 'caller:drifted' },
              },
            })
          })
        },
      },
      {
        expectedCode: 'proof_rows_inconsistent',
        apply: async (backend, invocationRefs) => {
          await backend.run(async (ctx) => {
            const effects = await ctx.db.query('hostedPaidOperationMockEffects')
              .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
                q.eq('invocationRef', invocationRefs[0]!))
              .take(1)
            if (effects[0] === undefined) throw new Error('test_effect_missing')
            await ctx.db.patch(effects[0]._id, { paymentIdentifier: 'payment:drifted' })
          })
        },
      },
    ]

    for (const corruption of corruptions) {
      const cohort = await completedProofCohort()
      await corruption.apply(cohort.backend, cohort.invocationRefs)
      await expect(cohort.backend.query(phase3CHostedProofObservation, {
        invocationRefs: [...cohort.invocationRefs],
      })).resolves.toEqual({ kind: 'refused', code: corruption.expectedCode })
    }
  })

  it('scopes retained identity digests to the exact random invocation cohort', async () => {
    const first = await completedProofCohort()
    const second = await completedProofCohort()
    const firstObservation = await first.backend.query(phase3CHostedProofObservation, {
      invocationRefs: [...first.invocationRefs],
    })
    const secondObservation = await second.backend.query(phase3CHostedProofObservation, {
      invocationRefs: [...second.invocationRefs],
    })
    expect(firstObservation.kind).toBe('observed')
    expect(secondObservation.kind).toBe('observed')
    if (firstObservation.kind !== 'observed' || secondObservation.kind !== 'observed') return
    expect(firstObservation.policy.principalDigest)
      .not.toBe(secondObservation.policy.principalDigest)
    expect(firstObservation.invocations[0]!.ownerCallerDigest)
      .not.toBe(secondObservation.invocations[0]!.ownerCallerDigest)
  })

  it('refuses missing, source-drifted, or deployment-drifted receipts', async () => {
    for (const drift of ['missing', 'source', 'deployment'] as const) {
      const cohort = await completedProofCohort()
      await cohort.backend.run(async (ctx) => {
        const rows = await ctx.db.query('hostedPaidOperationDeploymentReceipts')
          .withIndex('by_receiptRef', (q) =>
            q.eq('receiptRef', 'phase3c-paid-operation-exact-revision-deployment:g6'))
          .take(2)
        if (rows[0] === undefined) throw new Error('test_deployment_receipt_missing')
        if (drift === 'missing') await ctx.db.delete(rows[0]._id)
        if (drift === 'source') await ctx.db.patch(rows[0]._id, { sourceRevision: 'f'.repeat(40) })
        if (drift === 'deployment') {
          await ctx.db.patch(rows[0]._id, { deploymentName: 'wrong-deployment' })
        }
      })
      await expect(cohort.backend.query(phase3CHostedProofObservation, {
        invocationRefs: [...cohort.invocationRefs],
      })).resolves.toEqual({
        kind: 'refused',
        code: drift === 'missing'
          ? 'proof_deployment_receipt_not_exact'
          : drift === 'deployment'
            ? 'proof_deployment_receipt_mismatch'
            : 'proof_rows_inconsistent',
      })
    }
  })

  it('enumerates hidden prior command, attempt, and effect rows instead of reading only current state', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend, 3)
    const owner = backend.withIdentity(ownerIdentity)
    const completed = await runCompletedEffect(owner, 'A', 'hidden-prior')
    await backend.run(async (ctx) => {
      const currentAttempt = await ctx.db.query('actionInvocationAttempts')
        .withIndex('by_invocationRef_and_attemptNumber', (q) =>
          q.eq('invocationRef', completed.invocationRef))
        .take(1)
      if (currentAttempt[0] === undefined) throw new Error('test_attempt_missing')
      const {
        _id: _attemptId,
        _creationTime: _attemptCreationTime,
        ...attemptRow
      } = currentAttempt[0]
      const currentEffect = await ctx.db.query('hostedPaidOperationMockEffects')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
          q.eq('invocationRef', completed.invocationRef))
        .take(1)
      if (currentEffect[0] === undefined) throw new Error('test_effect_missing')
      const {
        _id: _effectId,
        _creationTime: _effectCreationTime,
        ...effectRow
      } = currentEffect[0]
      await ctx.db.insert('actionInvocationAttempts', {
        ...attemptRow,
        attemptRef: 'attempt:hidden-prior',
        attemptNumber: 0,
        effectGeneration: 0,
      })
      await ctx.db.insert('hostedPaidOperationMockEffects', {
        ...effectRow,
        attemptRef: 'attempt:hidden-prior',
        effectGeneration: 0,
      })
      await ctx.db.insert('hostedPaidOperationCommands', {
        invocationRef: completed.invocationRef,
        commandId: 'command:hidden-prior',
        commandDigest: `sha256:${'f'.repeat(64)}`,
        invocationVersion: 0,
        effectGeneration: 0,
        principalRef: ownerIdentity.subject,
        callerRef: ownerIdentity.tokenIdentifier,
        recordedAt: '2026-07-20T00:00:00.000Z',
      })
    })

    const observed = await backend.query(phase3CHostedProofObservation, {
      invocationRefs: [completed.invocationRef],
    })
    expect(observed.kind).toBe('observed')
    if (observed.kind !== 'observed') return
    expect(observed.invocations[0]).toMatchObject({
      counts: { attempts: 2, effects: 2 },
      attempts: expect.arrayContaining([
        expect.objectContaining({ attemptNumber: 0, effectGeneration: 0 }),
      ]),
      effects: expect.arrayContaining([
        expect.objectContaining({ effectGeneration: 0 }),
      ]),
      commands: expect.arrayContaining([
        expect.objectContaining({ invocationVersion: 0, effectGeneration: 0 }),
      ]),
    })
  })

  it('refuses a cap-plus-one proof child instead of projecting a partial observation', async () => {
    const backend = convexTest(schema, modules)
    await admitOwner(backend, 3)
    const owner = backend.withIdentity(ownerIdentity)
    const completed = await runCompletedEffect(owner, 'A', 'child-cap')
    await backend.run(async (ctx) => {
      for (let index = 0; index <= HOSTED_PAID_OPERATION_CHILD_CAP; index += 1) {
        await ctx.db.insert('hostedPaidOperationCommands', {
          invocationRef: completed.invocationRef,
          commandId: `proof-cap:${index}`,
          commandDigest: `sha256:${String(index).padStart(64, '0')}`,
          invocationVersion: 5,
          principalRef: ownerIdentity.subject,
          callerRef: ownerIdentity.tokenIdentifier,
          recordedAt: '2026-07-20T00:00:00.000Z',
        })
      }
    })
    await expect(backend.query(phase3CHostedProofObservation, {
      invocationRefs: [completed.invocationRef],
    })).resolves.toEqual({ kind: 'refused', code: 'proof_child_cap_exceeded' })
  })
})

function convexTransactionCommand(input: Readonly<{
  ownerPrincipalRef: string
  ownerCallerRef: string
  commandId: string
  commandDigest: string
  expectedInvocationVersion: number
  aggregate: HostedPaidOperationAggregate<ActionResult>
  trustedObservationGuard:
    | Readonly<{
        kind: 'mock_effect_absent'
        attemptRef: string
        effectGeneration: number
      }>
    | Readonly<{
        kind: 'mock_effect_digest'
        attemptRef: string
        effectGeneration: number
        observationDigest: string
      }>
  recordedAt: string
}>): Record<string, unknown> {
  const aggregate = input.aggregate
  const prepared = aggregate.invocation.prepared
  const authority = aggregate.invocation.authority
  const attempt = aggregate.invocation.attempts.at(-1)
  const payment = aggregate.paymentAttempt
  const proposal = aggregate.paymentProposal
  if (prepared === undefined || authority === undefined || attempt === undefined
    || payment === undefined || proposal === undefined) {
    throw new Error('test_transaction_aggregate_incomplete')
  }
  const opaque = (reference: string) => ({
    algorithm: 'sha256' as const,
    digest: reference.slice('sha256:'.length),
  })
  return {
    ownerPrincipalRef: input.ownerPrincipalRef,
    ownerCallerRef: input.ownerCallerRef,
    invocationRef: aggregate.invocation.invocationRef,
    commandId: input.commandId,
    commandDigest: input.commandDigest,
    expectedInvocationVersion: input.expectedInvocationVersion,
    expectedEffectGeneration: attempt.effectGeneration,
    nextInvocationVersion: input.expectedInvocationVersion + 1,
    nextEffectGeneration: attempt.effectGeneration,
    selectedSource: {
      sourceRef: aggregate.header.selectedSourceRef,
      providerId: aggregate.interpretation.operation.providerId,
      providerName: aggregate.interpretation.operation.providerName,
      operationKey: aggregate.interpretation.operation.operationKey,
      operationRevision: aggregate.interpretation.operation.operationRevision,
      materialInputDigest: prepared.materialInputDigest,
      materialInputs: aggregate.interpretation.operation.materialInputs,
      prepared,
      presentation: aggregate.interpretation.presentation,
      maximumAuthorizedCharge: aggregate.interpretation.maximumAuthorizedCharge,
      queryRecipient: aggregate.interpretation.queryRecipient,
      resultDelivery: aggregate.interpretation.resultDelivery,
      environment: aggregate.interpretation.environment,
      observedResolution: aggregate.invocation.observedResolution,
    },
    control: {
      origin: aggregate.invocation.origin,
      owner: aggregate.invocation.owner,
      action: aggregate.invocation.action,
      desired: aggregate.invocation.desired,
      prepared,
      authority,
      acceptedAuthority: aggregate.invocation.acceptedAuthority,
      freshness: aggregate.invocation.freshness,
      control: aggregate.invocation.control,
    },
    currentAttempt: {
      attemptRef: attempt.attemptRef,
      attemptNumber: attempt.attemptNumber,
      effectGeneration: attempt.effectGeneration,
      actor: attempt.actor,
      idempotency: attempt.idempotency,
      lease: attempt.lease,
      release: attempt.release,
      outcome: attempt.outcome,
    },
    payment: {
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
      paymentIdentifier: payment.paymentIdentifier,
      custodyReference: opaque(payment.custodyRef),
      proposal,
      state: payment.state,
      ...(payment.settledAmount === undefined
        ? {}
        : {
            settledCurrency: payment.settledAmount.currency,
            settledAmountMinor: payment.settledAmount.amountMinor,
          }),
    },
    evidenceReferences: aggregate.evidenceReferences.map((reference) => ({
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
      evidenceKind: 'hosted-sandbox-observation',
      evidenceReference: opaque(reference),
    })),
    trustedObservationGuard: input.trustedObservationGuard,
    submissionStarted: false,
    releaseAdmission: false,
    recordedAt: input.recordedAt,
  }
}

function publicArgs(symbol: string): string {
  const match = hostedGateway.match(new RegExp(
    `export const ${symbol} = (?:mutation|query|action)\\(\\{\\n\\s*args: \\{([\\s\\S]*?)\\n\\s*\\},\\n\\s*handler:`,
    'u',
  ))
  if (match?.[1] === undefined) throw new Error(`Missing public args for ${symbol}.`)
  return match[1]
}

async function admitOwner(backend: HostedBackend, rateLimit = 2) {
  await admitPrincipal(backend, ownerIdentity.subject, rateLimit)
}

async function admitPrincipal(backend: HostedBackend, principalRef: string, rateLimit = 2) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
      policyRef: 'phase-3c-hosted-paid-operation-trial:g6',
      enabled: true,
      principalRef,
      totalLimit: 3,
      concurrencyLimit: 1,
      rateLimit,
      policyDigest: `sha256:${'a'.repeat(64)}`,
      sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
      admissionEndsAt: '9999-12-30T00:00:00.000Z',
      retainThrough: '9999-12-31T00:00:00.000Z',
      killSwitchOwner: 'operator:phase3c',
      recordedAt: '2026-07-20T00:00:00.000Z',
    })
  })
  const receipt = await backend.mutation(recordPhase3CDeploymentReceipt, {
    sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
    sourceTree: 'bf3769890c9940ae259fab9777fdca8b25f686d7',
    githubRunId: '123456789',
    githubRunAttempt: 1,
    sourceClockTimestamp: '2026-07-21T00:00:00.000Z',
  })
  if (receipt.kind === 'refused') throw new Error(`Receipt refused: ${receipt.code}.`)
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

async function runCompletedEffect(
  owner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
  providerKey: 'A' | 'B',
  commandPrefix: string,
) {
  const created = await createFor(owner, providerKey)
  await authorize(owner, created.invocationRef, `command:authorize:${commandPrefix}`)
  const executed = await owner.action(authenticatedCommand, {
    invocationRef: created.invocationRef,
    commandId: `command:execute:${commandPrefix}`,
    expectedInvocationVersion: 2,
    command: 'execute',
  })
  if (executed.kind !== 'accepted') throw new Error(`Execution refused: ${executed.code}.`)
  if (providerKey === 'B') {
    const reconciled = await owner.action(authenticatedCommand, {
      invocationRef: created.invocationRef,
      commandId: `command:reconcile:${commandPrefix}`,
      expectedInvocationVersion: 5,
      command: 'reconcile',
    })
    if (reconciled.kind !== 'accepted') {
      throw new Error(`Reconciliation refused: ${reconciled.code}.`)
    }
  }
  return created
}

async function completedProofCohort(): Promise<Readonly<{
  backend: HostedBackend
  invocationRefs: readonly [string, string, string]
}>> {
  const backend = convexTest(schema, modules)
  await admitOwner(backend, 3)
  const owner = backend.withIdentity(ownerIdentity)
  const first = await runCompletedEffect(owner, 'A', 'cohort-human-a')
  const second = await runCompletedEffect(owner, 'A', 'cohort-agent-a')
  const third = await runCompletedEffect(owner, 'B', 'cohort-goblin-b')
  return {
    backend,
    invocationRefs: [first.invocationRef, second.invocationRef, third.invocationRef],
  }
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
