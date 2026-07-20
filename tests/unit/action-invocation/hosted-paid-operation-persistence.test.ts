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

describe('hosted paid-operation durable boundary', () => {
  it('keeps every growing Convex read indexed and bounded in the required load order', () => {
    const source = readFileSync('convex/hostedPaidOperation.ts', 'utf8')
    const header = source.indexOf("ctx.db.query('hostedPaidOperationHeaders')")
    const selectedSource = source.indexOf("ctx.db.query('hostedPaidOperationSources')")
    const control = source.indexOf("ctx.db.query('actionInvocationControls')")
    const attempt = source.indexOf("ctx.db.query('actionInvocationAttempts')")
    const payment = source.indexOf("ctx.db.query('hostedPaidOperationPayments')")
    const evidence = source.indexOf("ctx.db.query('hostedPaidOperationEvidenceReferences')")
    const history = source.indexOf("ctx.db.query('hostedPaidOperationCommands')")
    expect([header, selectedSource, control, attempt, payment, evidence, history])
      .toEqual([...new Set([header, selectedSource, control, attempt, payment, evidence, history])]
        .sort((left, right) => left - right))
    expect(source).toContain('.take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)')
    expect(source).toContain('.paginate(args.paginationOpts)')
    expect(source).not.toMatch(/\.collect\(|\.filter\(/u)
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

  it('rejects raw custody and evidence material and accepts only opaque digest references', () => {
    expect(isOpaqueHostedReference(`sha256:${'a'.repeat(64)}`)).toBe(true)
    expect(isOpaqueHostedReference('Bearer secret-token')).toBe(false)
    expect(() => createInMemoryHostedPaidOperationPort<Result>([{
      ...aggregate(),
      evidenceReferences: ['provider response body'],
    }])).toThrow('hosted_paid_operation_raw_material_forbidden')
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
        target: { provider: 'provider:paid' },
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
        materialInputs: { symbol: 'BTC' },
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
