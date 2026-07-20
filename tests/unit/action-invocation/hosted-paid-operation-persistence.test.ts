import { readFileSync } from 'node:fs'
import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import {
  HOSTED_PAID_OPERATION_CHILD_CAP,
  createInMemoryHostedPaidOperationPort,
  isOpaqueHostedReference,
  type HostedPaidOperationAggregate,
} from '@/modules/action-invocation/hosted-paid-operation-port'
import { createHostedPaidOperationComposition } from '@/modules/action-invocation/hosted-paid-operation-composition'
import type { ActionResult } from '@/modules/common/action'

type Result = ActionResult & { ok: boolean }

const discoveredModules = import.meta.glob('../../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules)
  .map(([path, load]) => [path.replace('../../../convex/', './'), load]))
const reserveAdmission = makeFunctionReference<
  'mutation',
  {
    policyRef: string
    principalRef: string
    windowKey: string
    commandId: string
    recordedAt: string
  },
  { kind: 'admitted'; reservationRef: string } | { kind: 'refused'; code: string }
>('hostedPaidOperation:reserveAdmission')
const releaseAdmission = makeFunctionReference<
  'mutation',
  { reservationRef: string; recordedAt: string },
  { kind: 'released' | 'duplicate' } | { kind: 'refused'; code: string }
>('hostedPaidOperation:releaseAdmission')
const createInitial = makeFunctionReference<
  'mutation',
  {
    creationCommandId: string
    creationCommandDigest: string
    reservationRef: string
    invocationRef: string
    invocationVersion: number
    selectedSource: Record<string, unknown>
    control: Record<string, unknown>
    payment: Record<string, unknown>
    recordedAt: string
  },
  { kind: 'created' | 'duplicate' } | { kind: 'refused'; code: string }
>('hostedPaidOperation:createInitial')
const loadComplete = makeFunctionReference<
  'query',
  {
    ownerPrincipalRef: string
    ownerCallerRef: string
    invocationRef: string
    paginationOpts: { numItems: number; cursor: string | null }
  },
  { kind: string; aggregate?: HostedPaidOperationAggregate<Result>; reason?: string }
>('hostedPaidOperation:loadComplete')

describe('hosted paid-operation durable boundary', () => {
  it('atomically creates and cold-loads the exact typed provider-bound aggregate', async () => {
    const initial = initialAggregate()
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
        reservationRef: 'trial-reservation:1',
        policyRef: 'policy:trial',
        principalRef: initial.invocation.owner.principalRef,
        state: 'active',
        updatedAt: '2026-07-20T00:00:00.000Z',
      })
    })
    const command = convexInitialCommand(initial, {
      creationCommandId: 'creation:paid:1',
      creationCommandDigest: `sha256:${'d'.repeat(64)}`,
      reservationRef: 'trial-reservation:1',
      recordedAt: '2026-07-20T00:00:00.000Z',
    })

    await expect(backend.mutation(createInitial, command)).resolves.toEqual({ kind: 'created' })
    await expect(backend.mutation(createInitial, command)).resolves.toEqual({ kind: 'duplicate' })
    await expect(backend.mutation(createInitial, {
      ...command,
      creationCommandDigest: `sha256:${'e'.repeat(64)}`,
    })).resolves.toEqual({ kind: 'refused', code: 'creation_command_conflict' })
    await expect(backend.mutation(createInitial, {
      ...command,
      creationCommandId: 'creation:raw',
      selectedSource: {
        ...command.selectedSource,
        providerName: 'Bearer secret-token',
      },
    })).resolves.toEqual({ kind: 'refused', code: 'raw_material_forbidden' })
    await expect(backend.mutation(createInitial, {
      ...command,
      creationCommandId: 'creation:cap-plus-one',
      selectedSource: {
        ...command.selectedSource,
        presentation: {
          ...(command.selectedSource.presentation as { title: string; summary: string }),
          blocks: Array.from(
            { length: HOSTED_PAID_OPERATION_CHILD_CAP + 1 },
            (_, index) => ({ kind: 'text' as const, label: `Block ${index}`, value: 'bounded' }),
          ),
        },
      },
    })).resolves.toEqual({ kind: 'refused', code: 'aggregate_incomplete' })

    const cold = await backend.query(loadComplete, {
      ownerPrincipalRef: initial.invocation.owner.principalRef,
      ownerCallerRef: initial.invocation.owner.callerRef,
      invocationRef: initial.invocation.invocationRef,
      paginationOpts: { numItems: 20, cursor: null },
    })
    expect(cold).toEqual({ kind: 'loaded', aggregate: initial })
  })

  it('creates initial aggregates idempotently and refuses stale or conflicting lineage', async () => {
    const initial = initialAggregate()
    const port = createInMemoryHostedPaidOperationPort<Result>()
    const command = {
      creationCommandId: 'creation:paid:1',
      creationCommandDigest: `sha256:${'d'.repeat(64)}`,
      reservationRef: 'trial-reservation:1',
      aggregate: initial,
    } as const

    await expect(port.createInitial(command)).resolves.toEqual({ kind: 'created' })
    await expect(port.createInitial(command)).resolves.toEqual({ kind: 'duplicate' })
    await expect(port.createInitial({
      ...command,
      creationCommandDigest: `sha256:${'e'.repeat(64)}`,
    })).resolves.toEqual({ kind: 'refused', code: 'creation_command_conflict' })
    await expect(port.createInitial({
      ...command,
      creationCommandId: 'creation:paid:2',
      aggregate: {
        ...initial,
        header: { ...initial.header, selectedSourceRef: 'source:other' },
      },
    })).resolves.toEqual({ kind: 'refused', code: 'invocation_already_exists' })
  })

  it('keeps every growing Convex read indexed and bounded in the required load order', () => {
    const source = readFileSync('convex/hostedPaidOperation.ts', 'utf8')
    const loader = source.slice(
      source.indexOf('export const loadComplete'),
      source.indexOf('export const transact'),
    )
    const header = loader.indexOf("ctx.db.query('hostedPaidOperationHeaders')")
    const selectedSource = loader.indexOf("ctx.db.query('hostedPaidOperationSources')")
    const control = loader.indexOf("ctx.db.query('actionInvocationControls')")
    const attempt = loader.indexOf("ctx.db.query('actionInvocationAttempts')")
    const payment = loader.indexOf("ctx.db.query('hostedPaidOperationPayments')")
    const evidence = loader.indexOf("ctx.db.query('hostedPaidOperationEvidenceReferences')")
    const history = loader.indexOf("ctx.db.query('hostedPaidOperationCommands')")
    expect([header, selectedSource, control, attempt, payment, evidence, history])
      .toEqual([...new Set([header, selectedSource, control, attempt, payment, evidence, history])]
        .sort((left, right) => left - right))
    expect(loader).toContain('.take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)')
    expect(loader).toContain('.paginate(args.paginationOpts)')
    expect(loader).not.toMatch(/\.collect\(|\.filter\(/u)
  })

  it('fails closed rather than projecting a missing or cap-plus-one child aggregate', async () => {
    const complete = aggregate()
    const { paymentAttempt: _paymentAttempt, ...withoutPaymentAttempt } = complete
    const missing = createInMemoryHostedPaidOperationPort<Result>([{
      ...withoutPaymentAttempt,
      header: { ...complete.header, paymentAttemptRequired: true },
    }])
    await expect(missing.loadComplete({
      owner: complete.invocation.owner,
      invocationRef: complete.invocation.invocationRef,
    })).resolves.toEqual({ kind: 'aggregate_incomplete', reason: 'payment_attempt_missing' })

    const overCap = createInMemoryHostedPaidOperationPort<Result>([{
      ...complete,
      evidenceReferences: Array.from(
        { length: HOSTED_PAID_OPERATION_CHILD_CAP + 1 },
        (_, index) => `sha256:${String(index).padStart(64, '0')}`,
      ),
    }])
    await expect(overCap.loadComplete({
      owner: complete.invocation.owner,
      invocationRef: complete.invocation.invocationRef,
    })).resolves.toEqual({ kind: 'aggregate_incomplete', reason: 'evidence_reference_cap_exceeded' })
  })

  it('deduplicates a command and fences stale versions and effect generations', async () => {
    const initial = aggregate()
    const port = createInMemoryHostedPaidOperationPort<Result>([initial])
    const next = aggregate({ invocationVersion: 4 })
    const command = {
      owner: initial.invocation.owner,
      invocationRef: initial.invocation.invocationRef,
      commandId: 'command:execute',
      commandDigest: 'sha256:execute',
      expectedInvocationVersion: 3,
      expectedEffectGeneration: 1,
      next,
    } as const

    await expect(port.transact(command)).resolves.toEqual({
      kind: 'applied',
      invocationVersion: 4,
      effectGeneration: 1,
    })
    await expect(port.transact(command)).resolves.toEqual({
      kind: 'duplicate',
      invocationVersion: 4,
      effectGeneration: 1,
    })
    await expect(port.transact({
      ...command,
      commandId: 'command:stale',
      commandDigest: 'sha256:stale',
    })).resolves.toEqual({ kind: 'refused', code: 'stale_invocation_version' })
    expect(port.effectGenerationCount(initial.invocation.invocationRef)).toBe(1)
  })

  it('reserves evaluator admission atomically without granting consequence authority', async () => {
    const port = createInMemoryHostedPaidOperationPort<Result>([], {
      enabled: true,
      allowedPrincipals: ['principal:paid'],
      totalLimit: 1,
      concurrencyLimit: 1,
      rateLimit: 1,
    })
    const attempts = await Promise.all([
      port.reserveAdmission({ principalRef: 'principal:paid', windowKey: '2026-07-20T00:00Z' }),
      port.reserveAdmission({ principalRef: 'principal:paid', windowKey: '2026-07-20T00:00Z' }),
    ])
    expect(attempts.filter((result) => result.kind === 'admitted')).toHaveLength(1)
    expect(attempts.filter((result) => result.kind === 'refused')).toHaveLength(1)
    expect(attempts[0]).not.toHaveProperty('authority')
  })

  it('allows the same principal to inspect from a different authenticated caller', async () => {
    const initial = initialAggregate()
    const port = createInMemoryHostedPaidOperationPort<Result>([initial])

    await expect(port.loadComplete({
      owner: {
        principalRef: initial.invocation.owner.principalRef,
        callerRef: 'caller:paid-operation-api-key',
      },
      invocationRef: initial.invocation.invocationRef,
    })).resolves.toMatchObject({ kind: 'loaded' })

    await expect(port.loadComplete({
      owner: { principalRef: 'principal:other', callerRef: 'caller:other' },
      invocationRef: initial.invocation.invocationRef,
    })).resolves.toEqual({ kind: 'not_found' })
  })

  it('enforces Convex admission totals across windows and releases concurrency idempotently', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
        policyRef: 'policy:trial',
        enabled: true,
        principalRef: 'principal:paid',
        totalLimit: 2,
        concurrencyLimit: 1,
        rateLimit: 1,
        policyDigest: `sha256:${'a'.repeat(64)}`,
        sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
        admissionEndsAt: '2026-07-21T00:00:00.000Z',
        retainThrough: '2026-07-22T00:00:00.000Z',
        killSwitchOwner: 'operator:phase3c',
        recordedAt: '2026-07-20T00:00:00.000Z',
      })
    })
    const first = await backend.mutation(reserveAdmission, {
      policyRef: 'policy:trial',
      principalRef: 'principal:paid',
      windowKey: 'window:1',
      commandId: 'admission:1',
      recordedAt: '2026-07-20T00:00:00.000Z',
    })
    expect(first.kind).toBe('admitted')
    if (first.kind !== 'admitted') return
    await expect(backend.mutation(reserveAdmission, {
      policyRef: 'policy:trial',
      principalRef: 'principal:paid',
      windowKey: 'window:1',
      commandId: 'admission:2',
      recordedAt: '2026-07-20T00:00:01.000Z',
    })).resolves.toMatchObject({ kind: 'refused', code: 'concurrency_exhausted' })
    await expect(backend.mutation(releaseAdmission, {
      reservationRef: first.reservationRef,
      recordedAt: '2026-07-20T00:00:02.000Z',
    })).resolves.toEqual({ kind: 'released' })
    await expect(backend.mutation(releaseAdmission, {
      reservationRef: first.reservationRef,
      recordedAt: '2026-07-20T00:00:03.000Z',
    })).resolves.toEqual({ kind: 'duplicate' })
    await expect(backend.mutation(reserveAdmission, {
      policyRef: 'policy:trial',
      principalRef: 'principal:paid',
      windowKey: 'window:2',
      commandId: 'admission:2',
      recordedAt: '2026-07-20T00:01:00.000Z',
    })).resolves.toMatchObject({ kind: 'admitted' })
    await expect(backend.mutation(reserveAdmission, {
      policyRef: 'policy:trial',
      principalRef: 'principal:paid',
      windowKey: 'window:3',
      commandId: 'admission:3',
      recordedAt: '2026-07-20T00:02:00.000Z',
    })).resolves.toMatchObject({ kind: 'refused', code: 'total_exhausted' })
  })

  it('rejects raw custody and evidence material and accepts only opaque digest references', async () => {
    expect(isOpaqueHostedReference(`sha256:${'a'.repeat(64)}`)).toBe(true)
    expect(isOpaqueHostedReference('Bearer secret-token')).toBe(false)
    expect(() => createInMemoryHostedPaidOperationPort<Result>([{
      ...aggregate(),
      evidenceReferences: ['provider response body'],
    }])).toThrow('hosted_paid_operation_raw_material_forbidden')
    const port = createInMemoryHostedPaidOperationPort<Result>()
    await expect(port.createInitial({
      creationCommandId: 'creation:raw',
      creationCommandDigest: `sha256:${'d'.repeat(64)}`,
      reservationRef: 'trial-reservation:raw',
      aggregate: {
        ...initialAggregate(),
        interpretation: {
          ...initialAggregate().interpretation,
          resultDelivery: {
            state: 'invalid',
            code: 'Bearer secret-token',
            evidenceRefs: [],
          },
        },
      },
    })).rejects.toThrow('hosted_paid_operation_raw_material_forbidden')
  })

  it('reconstructs equal warm and cold semantics and reloads committed state after command', async () => {
    const base = aggregate()
    const {
      currentEffectGeneration: _currentEffectGeneration,
      ...headerWithoutEffectGeneration
    } = base.header
    const initial: HostedPaidOperationAggregate<Result> = {
      ...base,
      header: headerWithoutEffectGeneration,
      invocation: {
        ...base.invocation,
        control: { state: 'awaiting_authority' },
        attempts: [],
        observedResolution: { state: 'pending' },
      },
      paymentAttempt: {
        ...base.paymentAttempt!,
        state: 'prepared',
        evidenceRefs: [],
      },
    }
    const port = createInMemoryHostedPaidOperationPort<Result>([initial])
    const command = async () => {
      const next: HostedPaidOperationAggregate<Result> = {
        ...initial,
        invocation: {
          ...initial.invocation,
          invocationVersion: 4,
          control: { state: 'authorized', decidedAt: '2026-07-20T00:01:00.000Z' },
        },
      }
      await port.transact({
        owner: initial.invocation.owner,
        invocationRef: initial.invocation.invocationRef,
        commandId: 'command:authorize',
        commandDigest: 'sha256:authorize',
        expectedInvocationVersion: 3,
        next,
      })
      return next.invocation
    }
    const warm = createHostedPaidOperationComposition({
      actor: initial.invocation.owner,
      persistence: port,
      commands: {
        authorize: command,
        execute: async () => undefined,
        reconcile: async () => undefined,
      },
    })
    const before = await warm.inspect({
      invocationRef: initial.invocation.invocationRef,
      expectedInvocationVersion: 3,
    })
    const after = await warm.command({
      invocationRef: initial.invocation.invocationRef,
      expectedInvocationVersion: 3,
      command: { kind: 'authorize', accept: true },
    })
    expect(before.kind).toBe('accepted')
    expect(after.kind).toBe('accepted')
    if (after.kind !== 'accepted') return
    expect(after.value.semantics.identity.expectedInvocationVersion).toBe(4)
    expect(after.value.semantics.continuations.map((item) => item.kind)).toEqual(['execute'])

    const coldPort = createInMemoryHostedPaidOperationPort<Result>(port.exportDurableFixture())
    const cold = createHostedPaidOperationComposition({
      actor: initial.invocation.owner,
      persistence: coldPort,
      commands: {
        authorize: async () => undefined,
        execute: async () => undefined,
        reconcile: async () => undefined,
      },
    })
    const restored = await cold.inspect({
      invocationRef: initial.invocation.invocationRef,
      expectedInvocationVersion: 4,
    })
    expect(restored).toEqual(after)
  })

  it('exposes reconcile as the only continuation during uncertainty', async () => {
    const uncertain = aggregate({
      invocationVersion: 5,
      control: { state: 'reconciliation_required', attemptRef: 'attempt:1' },
    })
    const composition = createHostedPaidOperationComposition({
      actor: uncertain.invocation.owner,
      persistence: createInMemoryHostedPaidOperationPort<Result>([uncertain]),
      commands: {
        authorize: async () => undefined,
        execute: async () => undefined,
        reconcile: async () => undefined,
      },
    })
    const result = await composition.inspect({
      invocationRef: uncertain.invocation.invocationRef,
      expectedInvocationVersion: 5,
    })
    expect(result.kind === 'accepted'
      && result.value.semantics.continuations.map((item) => item.kind)).toEqual(['reconcile'])
  })
})

function aggregate(
  invocationChange: Partial<HostedPaidOperationAggregate<Result>['invocation']> = {},
): HostedPaidOperationAggregate<Result> {
  return {
    header: {
      ownerPrincipalRef: 'principal:paid',
      invocationRef: 'invocation:paid',
      selectedSourceRef: 'source:paid',
      paymentAttemptRequired: true,
      currentPaymentIdentifier: 'payment:1',
      currentEffectGeneration: 1,
      historyCursor: null,
      historyPageSize: 20,
    },
    invocation: {
      invocationRef: 'invocation:paid',
      invocationVersion: 3,
      environment: 'MOCK/DEVELOPMENT ONLY',
      persistence: 'durable_control',
      origin: { kind: 'standalone', callerRef: 'caller:paid', principalRef: 'principal:paid' },
      owner: { callerRef: 'caller:paid', principalRef: 'principal:paid' },
      action: { id: 'paid-operation', contractVersion: '1' },
      desired: { state: 'invoke' },
      prepared: {
        materialInputDigest: 'sha256:material',
        target: {
          providerId: 'provider:paid',
          sourceRef: 'source:paid',
          operationRevision: 'revision:1',
        },
        consequence: 'release paid query',
        dataUse: { fields: ['symbol'], limits: {} },
        preparedAt: '2026-07-20T00:00:00.000Z',
        freshUntil: '2026-07-20T01:00:00.000Z',
      },
      authority: { reference: 'authority:paid', expiresAt: '2026-07-20T01:00:00.000Z' },
      acceptedAuthority: { kind: 'approve_each', authorityRef: 'authority:paid' },
      attempts: [{
        attemptRef: 'attempt:1',
        attemptNumber: 1,
        actor: { callerRef: 'caller:paid', principalRef: 'principal:paid' },
        effectGeneration: 1,
        lease: { owner: 'worker:1', expiresAt: '2026-07-20T00:05:00.000Z' },
        idempotency: {
          operationKey: 'paid-operation',
          materialInputDigest: 'sha256:material',
          effectIdentity: 'effect:1',
        },
        release: { state: 'possibly_released' },
        outcome: {
          state: 'uncertain',
          retry: 'reconcile_before_retry',
          message: 'provider outcome unknown',
          reconciliationRequiredAt: '2026-07-20T00:02:00.000Z',
        },
      }],
      observedResolution: { state: 'threw', execution: 'runner_threw', message: 'provider_outcome_unknown' },
      freshness: { state: 'current', observedAt: '2026-07-20T00:00:00.000Z' },
      control: { state: 'reconciliation_required', attemptRef: 'attempt:1' },
      ...invocationChange,
    },
    paymentAttempt: {
      paymentIdentifier: 'payment:1',
      custodyRef: `sha256:${'b'.repeat(64)}`,
      state: 'reconciliation_required',
      evidenceRefs: [`sha256:${'c'.repeat(64)}`],
    },
    interpretation: {
      operation: {
        operationKey: 'paid-operation',
        providerId: 'provider:paid',
        providerName: 'Paid fixture provider',
        operationRevision: 'revision:1',
        materialInputs: { symbol: 'BTC', convert: 'USD' },
      },
      presentation: {
        title: 'Run paid operation',
        summary: 'Labelled local durable fixture.',
        blocks: [],
      },
      maximumAuthorizedCharge: { currency: 'USD', amountMinor: 100 },
      queryRecipient: 'provider:paid',
      resultDelivery: { state: 'not_delivered' },
      environment: {
        name: 'local-labelled-sandbox-fixture',
        evidenceClass: 'local_labelled_sandbox_fixture',
        claimCeiling: 'durable_fixture_mechanics_only',
      },
    },
    evidenceReferences: [`sha256:${'c'.repeat(64)}`],
    history: [{ commandId: 'command:prepare', invocationVersion: 3 }],
  }
}

function initialAggregate(): HostedPaidOperationAggregate<Result> {
  const current = aggregate()
  const { currentEffectGeneration: _effectGeneration, ...header } = current.header
  const { acceptedAuthority: _acceptedAuthority, ...invocation } = current.invocation
  return {
    ...current,
    header: { ...header, currentPaymentIdentifier: 'payment:initial' },
    invocation: {
      ...invocation,
      invocationVersion: 1,
      attempts: [],
      observedResolution: { state: 'pending' },
      control: { state: 'awaiting_authority' },
    },
    paymentAttempt: {
      paymentIdentifier: 'payment:initial',
      custodyRef: `sha256:${'b'.repeat(64)}`,
      state: 'prepared',
      evidenceRefs: [],
    },
    evidenceReferences: [],
    history: [],
  }
}

function convexInitialCommand(
  aggregate: HostedPaidOperationAggregate<Result>,
  command: Readonly<{
    creationCommandId: string
    creationCommandDigest: string
    reservationRef: string
    recordedAt: string
  }>,
) {
  const payment = aggregate.paymentAttempt!
  return {
    ...command,
    invocationRef: aggregate.invocation.invocationRef,
    invocationVersion: aggregate.invocation.invocationVersion,
    selectedSource: {
      sourceRef: aggregate.header.selectedSourceRef,
      providerId: aggregate.interpretation.operation.providerId,
      providerName: aggregate.interpretation.operation.providerName,
      operationKey: aggregate.interpretation.operation.operationKey,
      operationRevision: aggregate.interpretation.operation.operationRevision,
      materialInputDigest: aggregate.invocation.prepared!.materialInputDigest,
      materialInputs: aggregate.interpretation.operation.materialInputs,
      prepared: aggregate.invocation.prepared,
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
      prepared: aggregate.invocation.prepared,
      authority: aggregate.invocation.authority,
      acceptedAuthority: aggregate.invocation.acceptedAuthority,
      freshness: aggregate.invocation.freshness,
      control: aggregate.invocation.control,
    },
    payment: {
      attemptRef: 'creation',
      effectGeneration: 0,
      paymentIdentifier: payment.paymentIdentifier,
      custodyReference: {
        algorithm: 'sha256' as const,
        digest: payment.custodyRef.slice('sha256:'.length),
      },
      state: payment.state,
    },
  }
}
