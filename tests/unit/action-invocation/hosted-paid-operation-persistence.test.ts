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
import { createHostedPaidOperationPaymentProposal } from '@/modules/action-invocation/hosted-paid-operation-payment-proposal'
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
  | {
      kind: 'admitted'
      reservationRef: string
      environment?: { name: string; evidenceClass: string; claimCeiling: string }
    }
  | { kind: 'refused'; code: string }
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
const configurePhase3CAdmission = makeFunctionReference<
  'mutation',
  {
    evaluatorPrincipalRef: string
    sourceRevision: string
    totalLimit: number
    concurrencyLimit: number
    rateLimit: number
    admissionEndsAt: string
    retainThrough: string
    killSwitchOwner: string
    recordedAt: string
  },
  | { kind: 'configured'; policyDigest: string }
  | { kind: 'refused'; code: string }
>('hostedPaidOperation:configurePhase3CAdmission')
const disablePhase3CAdmission = makeFunctionReference<
  'mutation',
  { evaluatorPrincipalRef: string; policyDigest: string; killSwitchOwner: string },
  | { kind: 'disabled'; policyDigest: string }
  | { kind: 'refused'; code: string }
>('hostedPaidOperation:disablePhase3CAdmission')
const phase3CAdmissionStatus = makeFunctionReference<
  'query',
  { evaluatorPrincipalRef: string },
  Record<string, unknown>
>('hostedPaidOperation:phase3CAdmissionStatus')

describe('hosted paid-operation durable boundary', () => {
  it('atomically creates and cold-loads the exact typed provider-bound aggregate', async () => {
    const initial = initialAggregate()
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const policyDigest = `sha256:${'a'.repeat(64)}`
      await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
        policyRef: 'policy:trial',
        enabled: true,
        principalRef: initial.invocation.owner.principalRef,
        totalLimit: 3,
        concurrencyLimit: 1,
        rateLimit: 2,
        policyDigest,
        sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
        admissionEndsAt: '2026-07-21T00:00:00.000Z',
        retainThrough: '2026-07-22T00:00:00.000Z',
        killSwitchOwner: 'operator:phase3c',
        recordedAt: '2026-07-20T00:00:00.000Z',
      })
      await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
        reservationRef: 'trial-reservation:1',
        policyRef: 'policy:trial',
        principalRef: initial.invocation.owner.principalRef,
        policyDigest,
        state: 'active',
        updatedAt: '2026-07-20T00:00:00.000Z',
      })
      await ctx.db.insert('hostedPaidOperationAdmissionCounters', {
        policyRef: 'policy:trial',
        principalRef: initial.invocation.owner.principalRef,
        policyDigest,
        currentWindowKey: 'window:creation',
        admittedTotal: 1,
        active: 1,
        admittedInWindow: 1,
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
    await backend.run(async (ctx) => {
      const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
        .withIndex('by_policyRef_and_principalRef', (q) =>
          q.eq('policyRef', 'policy:trial')
            .eq('principalRef', initial.invocation.owner.principalRef))
        .unique()
      if (counter === null) throw new Error('test_counter_missing')
      await ctx.db.patch(counter._id, { active: 0 })
    })
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

  it('creates no aggregate rows when a prior reservation counter is missing, drifted, or out of bounds', async () => {
    for (const corruption of ['missing', 'digest', 'bounds'] as const) {
      const backend = convexTest(schema, modules)
      const initial = initialAggregate()
      const policyDigest = `sha256:${'a'.repeat(64)}`
      const command = convexInitialCommand(initial, {
        creationCommandId: `creation:counter:${corruption}`,
        creationCommandDigest: `sha256:${'d'.repeat(64)}`,
        reservationRef: `trial-reservation:${corruption}`,
        recordedAt: '2026-07-20T00:00:00.000Z',
      })
      await backend.run(async (ctx) => {
        await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
          policyRef: 'policy:trial',
          enabled: true,
          principalRef: initial.invocation.owner.principalRef,
          totalLimit: 3,
          concurrencyLimit: 1,
          rateLimit: 2,
          policyDigest,
          sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
          admissionEndsAt: '9999-12-30T00:00:00.000Z',
          retainThrough: '9999-12-31T00:00:00.000Z',
          killSwitchOwner: 'operator:phase3c',
          recordedAt: '2026-07-20T00:00:00.000Z',
        })
        await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
          reservationRef: command.reservationRef,
          policyRef: 'policy:trial',
          principalRef: initial.invocation.owner.principalRef,
          policyDigest,
          state: 'active',
          updatedAt: '2026-07-20T00:00:00.000Z',
        })
        if (corruption !== 'missing') {
          await ctx.db.insert('hostedPaidOperationAdmissionCounters', {
            policyRef: 'policy:trial',
            principalRef: initial.invocation.owner.principalRef,
            policyDigest: corruption === 'digest'
              ? `sha256:${'b'.repeat(64)}`
              : policyDigest,
            currentWindowKey: 'window:creation',
            admittedTotal: corruption === 'bounds' ? 4 : 1,
            active: 1,
            admittedInWindow: 1,
            updatedAt: '2026-07-20T00:00:00.000Z',
          })
        }
      })

      await expect(backend.mutation(createInitial, command)).resolves.toEqual({
        kind: 'refused',
        code: 'admission_reservation_invalid',
      })
      const rows = await backend.run(async (ctx) => ({
        header: await ctx.db.query('hostedPaidOperationHeaders')
          .withIndex('by_invocationRef', (q) => q.eq('invocationRef', command.invocationRef))
          .unique(),
        source: await ctx.db.query('hostedPaidOperationSources')
          .withIndex('by_invocationRef_and_sourceRef', (q) =>
            q.eq('invocationRef', command.invocationRef))
          .take(1),
        control: await ctx.db.query('actionInvocationControls')
          .withIndex('by_invocationRef', (q) => q.eq('invocationRef', command.invocationRef))
          .unique(),
        payment: await ctx.db.query('hostedPaidOperationPayments')
          .withIndex('by_invocationRef_and_paymentIdentifier', (q) =>
            q.eq('invocationRef', command.invocationRef))
          .take(1),
        command: await ctx.db.query('hostedPaidOperationCommands')
          .withIndex('by_commandId', (q) => q.eq('commandId', command.creationCommandId))
          .unique(),
      }))
      expect(rows).toEqual({
        header: null,
        source: [],
        control: null,
        payment: [],
        command: null,
      })
    }
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

  it('keeps only terminal legacy rows inspectable when durable proposal truth is absent', async () => {
    const { paymentProposal: _nonterminalProposal, ...nonterminal } = aggregate({
      control: { state: 'reconciliation_required', attemptRef: 'attempt:1' },
    })
    const nonterminalPort = createInMemoryHostedPaidOperationPort<Result>([nonterminal])
    await expect(nonterminalPort.loadComplete({
      owner: nonterminal.invocation.owner,
      invocationRef: nonterminal.invocation.invocationRef,
    })).resolves.toEqual({ kind: 'aggregate_incomplete', reason: 'payment_proposal_missing' })

    const { paymentProposal: _terminalProposal, ...terminal } = aggregate({
      control: { state: 'terminal' },
    })
    const terminalPort = createInMemoryHostedPaidOperationPort<Result>([terminal])
    await expect(terminalPort.loadComplete({
      owner: terminal.invocation.owner,
      invocationRef: terminal.invocation.invocationRef,
    })).resolves.toMatchObject({ kind: 'loaded' })
  })

  it('fails closed when persisted proposal material is incomplete or mismatches its digest', async () => {
    const current = aggregate()
    for (const paymentProposal of [
      { ...current.paymentProposal!, providerEndpoint: 'https://tampered.invalid/btc-usd' },
      { ...current.paymentProposal!, providerEndpoint: undefined },
    ]) {
      const corrupt = { ...current, paymentProposal } as HostedPaidOperationAggregate<Result>
      const port = createInMemoryHostedPaidOperationPort<Result>([corrupt])
      await expect(port.loadComplete({
        owner: corrupt.invocation.owner,
        invocationRef: corrupt.invocation.invocationRef,
      })).resolves.toEqual({ kind: 'aggregate_incomplete', reason: 'payment_proposal_invalid' })
    }
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

  it('refuses a valid replacement proposal and preserves the original through cold load', async () => {
    const current = aggregate()
    const originalProposal = current.paymentProposal!
    const { proposalDigest: originalDigest, ...proposalMaterial } = originalProposal
    const replacementProposal = createHostedPaidOperationPaymentProposal({
      ...proposalMaterial,
      providerEndpoint: 'https://replacement.invalid/btc-usd',
    })
    expect(replacementProposal.proposalDigest).not.toBe(originalDigest)

    const port = createInMemoryHostedPaidOperationPort<Result>([current])
    await expect(port.transact({
      owner: current.invocation.owner,
      invocationRef: current.invocation.invocationRef,
      commandId: 'command:replace-proposal',
      commandDigest: 'sha256:replace-proposal',
      expectedInvocationVersion: current.invocation.invocationVersion,
      next: {
        ...current,
        invocation: {
          ...current.invocation,
          invocationVersion: current.invocation.invocationVersion + 1,
        },
        paymentProposal: replacementProposal,
      },
    })).resolves.toEqual({ kind: 'refused', code: 'aggregate_incomplete' })

    const coldPort = createInMemoryHostedPaidOperationPort<Result>(port.exportDurableFixture())
    const cold = await coldPort.loadComplete({
      owner: current.invocation.owner,
      invocationRef: current.invocation.invocationRef,
    })
    expect(cold.kind).toBe('loaded')
    if (cold.kind !== 'loaded') return
    expect(cold.aggregate.paymentProposal?.proposalDigest).toBe(originalDigest)
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

  it('configures exactly one bounded Phase3C evaluator policy and disables it by digest and owner', async () => {
    const invalidBackend = convexTest(schema, modules)
    const backend = convexTest(schema, modules)
    const configuration = {
      evaluatorPrincipalRef: 'principal:phase3c-evaluator',
      sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
      totalLimit: 3,
      concurrencyLimit: 1,
      rateLimit: 3,
      admissionEndsAt: '2026-07-21T00:00:00.000Z',
      retainThrough: '2026-07-22T00:00:00.000Z',
      killSwitchOwner: 'operator:phase3c',
      recordedAt: '2026-07-20T00:00:00.000Z',
    }
    for (const invalid of [
      { ...configuration, totalLimit: 4 },
      { ...configuration, concurrencyLimit: 2 },
      { ...configuration, rateLimit: 4 },
      { ...configuration, admissionEndsAt: '2026-07-19T00:00:00.000Z' },
      { ...configuration, sourceRevision: 'not-a-revision' },
    ]) {
      await expect(invalidBackend.mutation(configurePhase3CAdmission, invalid))
        .resolves.toEqual({ kind: 'refused', code: 'policy_invalid' })
    }
    await expect(invalidBackend.query(phase3CAdmissionStatus, {
      evaluatorPrincipalRef: configuration.evaluatorPrincipalRef,
    })).resolves.toEqual({ kind: 'unconfigured' })

    const currentPolicyRef = 'phase-3c-hosted-paid-operation-trial:g6'
    const priorGenerations = [
      {
        policyRef: 'phase-3c-hosted-paid-operation-trial',
        policyDigest: `sha256:${'e'.repeat(64)}`,
        reservationRef: 'reservation:phase3c-pre-authority-failure',
        enabled: false,
        active: 0,
        reservationState: 'released',
        sourceRevision: 'f1d57784a621f3769d8006300705188fb65f0568',
      },
      {
        policyRef: 'phase-3c-hosted-paid-operation-trial:g2',
        policyDigest: `sha256:${'f'.repeat(64)}`,
        reservationRef: 'reservation:phase3c-authorized-failure',
        enabled: true,
        active: 1,
        reservationState: 'active',
        sourceRevision: '0c00f56d252522739fa4a5926638eb82e9c1ef9d',
      },
      {
        policyRef: 'phase-3c-hosted-paid-operation-trial:g3',
        policyDigest: `sha256:${'d'.repeat(64)}`,
        reservationRef: 'reservation:phase3c-uncertainty-failure',
        enabled: false,
        active: 1,
        reservationState: 'active',
        sourceRevision: '10635cceeaace76327ae0292758456a84d12d659',
      },
      {
        policyRef: 'phase-3c-hosted-paid-operation-trial:g4',
        policyDigest: `sha256:${'c'.repeat(64)}`,
        reservationRef: 'reservation:phase3c-actor-proof-failure',
        enabled: false,
        active: 0,
        reservationState: 'released',
        sourceRevision: '8b17e045ce27184597153e2cc7b8b81874125b09',
      },
      {
        policyRef: 'phase-3c-hosted-paid-operation-trial:g5',
        policyDigest: `sha256:${'b'.repeat(64)}`,
        reservationRef: 'reservation:phase3c-persisted-proposal-failure',
        enabled: false,
        active: 0,
        reservationState: 'released',
        sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
      },
    ] as const
    await backend.run(async (ctx) => {
      for (const prior of priorGenerations) {
        await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
          policyRef: prior.policyRef,
          enabled: prior.enabled,
          principalRef: configuration.evaluatorPrincipalRef,
          totalLimit: 3,
          concurrencyLimit: 1,
          rateLimit: 3,
          policyDigest: prior.policyDigest,
          sourceRevision: prior.sourceRevision,
          admissionEndsAt: configuration.admissionEndsAt,
          retainThrough: configuration.retainThrough,
          killSwitchOwner: configuration.killSwitchOwner,
          recordedAt: '2026-07-20T00:00:00.000Z',
        })
        await ctx.db.insert('hostedPaidOperationAdmissionCounters', {
          policyRef: prior.policyRef,
          principalRef: configuration.evaluatorPrincipalRef,
          policyDigest: prior.policyDigest,
          currentWindowKey: 'window:prior',
          admittedTotal: 1,
          active: prior.active,
          admittedInWindow: 1,
          updatedAt: '2026-07-20T00:00:00.000Z',
        })
        await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
          reservationRef: prior.reservationRef,
          policyRef: prior.policyRef,
          principalRef: configuration.evaluatorPrincipalRef,
          policyDigest: prior.policyDigest,
          state: prior.reservationState,
          updatedAt: '2026-07-20T00:00:00.000Z',
        })
      }
    })

    const configured = await backend.mutation(configurePhase3CAdmission, configuration)
    expect(configured.kind).toBe('configured')
    if (configured.kind !== 'configured') return
    await backend.run(async (ctx) => {
      for (const prior of priorGenerations) {
        const priorPolicy = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
          .withIndex('by_policyRef_and_principalRef', (q) =>
            q.eq('policyRef', prior.policyRef)
              .eq('principalRef', configuration.evaluatorPrincipalRef))
          .unique()
        const priorCounter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
          .withIndex('by_policyRef_and_principalRef', (q) =>
            q.eq('policyRef', prior.policyRef)
              .eq('principalRef', configuration.evaluatorPrincipalRef))
          .unique()
        const priorReservation = await ctx.db.query('hostedPaidOperationAdmissionReservations')
          .withIndex('by_reservationRef', (q) => q.eq('reservationRef', prior.reservationRef))
          .unique()
        expect(priorPolicy?.enabled).toBe(false)
        expect(priorCounter?.active).toBe(0)
        expect(priorReservation?.state).toBe('released')
      }
    })
    await expect(backend.mutation(configurePhase3CAdmission, configuration))
      .resolves.toEqual(configured)
    const reservation = await backend.mutation(reserveAdmission, {
      policyRef: currentPolicyRef,
      principalRef: configuration.evaluatorPrincipalRef,
      windowKey: 'window:configuration',
      commandId: 'admission:configuration',
      recordedAt: '2026-07-20T00:01:00.000Z',
    })
    expect(reservation).toMatchObject({
      kind: 'admitted',
      environment: {
        name: 'hosted-labelled-mock-sandbox-candidate',
        evidenceClass: 'hosted_labelled_mock_candidate',
        claimCeiling: 'pending_authenticated_exact_revision_readback',
      },
    })
    await expect(backend.mutation(configurePhase3CAdmission, {
      ...configuration,
      admissionEndsAt: '2026-07-21T12:00:00.000Z',
    })).resolves.toEqual({ kind: 'refused', code: 'policy_conflict' })
    await expect(backend.mutation(configurePhase3CAdmission, {
      ...configuration,
      evaluatorPrincipalRef: 'principal:second-evaluator',
    })).resolves.toEqual({ kind: 'refused', code: 'policy_conflict' })
    const status = await backend.query(phase3CAdmissionStatus, {
      evaluatorPrincipalRef: configuration.evaluatorPrincipalRef,
    })
    expect(status).toMatchObject({
      kind: 'configured',
      policyDigest: configured.policyDigest,
      sourceRevision: configuration.sourceRevision,
      state: 'enabled',
      bounds: { total: 3, concurrency: 1, rate: 3 },
      counters: { admittedTotal: 1, activeReservations: 1, admittedInWindow: 1 },
    })
    expect(JSON.stringify(status)).not.toMatch(
      /phase3c-evaluator|operator:phase3c|credential|evidence|secret/u,
    )

    await expect(backend.mutation(disablePhase3CAdmission, {
      evaluatorPrincipalRef: configuration.evaluatorPrincipalRef,
      policyDigest: `sha256:${'f'.repeat(64)}`,
      killSwitchOwner: configuration.killSwitchOwner,
    })).resolves.toEqual({ kind: 'refused', code: 'policy_disable_mismatch' })
    await expect(backend.mutation(disablePhase3CAdmission, {
      evaluatorPrincipalRef: configuration.evaluatorPrincipalRef,
      policyDigest: configured.policyDigest,
      killSwitchOwner: 'operator:wrong',
    })).resolves.toEqual({ kind: 'refused', code: 'policy_disable_mismatch' })
    const disabled = {
      kind: 'disabled' as const,
      policyDigest: configured.policyDigest,
    }
    await expect(backend.mutation(disablePhase3CAdmission, {
      evaluatorPrincipalRef: configuration.evaluatorPrincipalRef,
      policyDigest: configured.policyDigest,
      killSwitchOwner: configuration.killSwitchOwner,
    })).resolves.toEqual(disabled)
    await expect(backend.mutation(disablePhase3CAdmission, {
      evaluatorPrincipalRef: configuration.evaluatorPrincipalRef,
      policyDigest: configured.policyDigest,
      killSwitchOwner: configuration.killSwitchOwner,
    })).resolves.toEqual(disabled)
    await expect(backend.query(phase3CAdmissionStatus, {
      evaluatorPrincipalRef: configuration.evaluatorPrincipalRef,
    })).resolves.toMatchObject({ state: 'disabled' })
  })

  it('refuses every parseable but noncanonical Phase3C policy timestamp', async () => {
    const configuration = {
      evaluatorPrincipalRef: 'principal:phase3c-evaluator',
      sourceRevision: '336db633491f569bee9704fabca09b63c392d349',
      totalLimit: 3,
      concurrencyLimit: 1,
      rateLimit: 3,
      admissionEndsAt: '2026-07-21T00:00:00.000Z',
      retainThrough: '2026-07-22T00:00:00.000Z',
      killSwitchOwner: 'operator:phase3c',
      recordedAt: '2026-07-20T00:00:00.000Z',
    }
    for (const invalid of [
      { ...configuration, recordedAt: '2026-07-20' },
      { ...configuration, recordedAt: '2026-07-20T00:00:00Z' },
      { ...configuration, admissionEndsAt: '2026-07-21T00:00:00.000' },
      { ...configuration, retainThrough: '07/22/2026' },
    ]) {
      const backend = convexTest(schema, modules)
      await expect(backend.mutation(configurePhase3CAdmission, invalid))
        .resolves.toEqual({ kind: 'refused', code: 'policy_invalid' })
      await expect(backend.query(phase3CAdmissionStatus, {
        evaluatorPrincipalRef: configuration.evaluatorPrincipalRef,
      })).resolves.toEqual({ kind: 'unconfigured' })
    }
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
    const initial = initialAggregate()
    const port = createInMemoryHostedPaidOperationPort<Result>([initial])
    const command = async () => {
      const next: HostedPaidOperationAggregate<Result> = {
        ...initial,
        invocation: {
          ...initial.invocation,
          invocationVersion: 2,
          acceptedAuthority: {
            kind: 'approve_each',
            authorityRef: initial.invocation.authority!.reference,
          },
          control: { state: 'authorized', decidedAt: '2026-07-20T00:01:00.000Z' },
        },
      }
      await port.transact({
        owner: initial.invocation.owner,
        invocationRef: initial.invocation.invocationRef,
        commandId: 'command:authorize',
        commandDigest: 'sha256:authorize',
        expectedInvocationVersion: 1,
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
      expectedInvocationVersion: 1,
    })
    const after = await warm.command({
      invocationRef: initial.invocation.invocationRef,
      expectedInvocationVersion: 1,
      command: { kind: 'authorize', accept: true },
    })
    expect(before.kind).toBe('accepted')
    expect(before.kind === 'accepted' && before.value.semantics).toMatchObject({
      paymentAuthorization: { state: 'not_created' },
      paymentSubmission: { state: 'not_submitted' },
      continuations: [expect.objectContaining({ kind: 'authorize' })],
    })
    expect(after.kind).toBe('accepted')
    if (after.kind !== 'accepted') return
    expect(after.value.semantics).toMatchObject({
      identity: { expectedInvocationVersion: 2 },
      paymentAuthorization: {
        state: 'created',
        paymentIdentifier: initial.paymentAttempt!.paymentIdentifier,
      },
      paymentSubmission: { state: 'not_submitted' },
      settlement: { state: 'no_evidence' },
      resultDelivery: { state: 'not_delivered' },
    })
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
      expectedInvocationVersion: 2,
    })
    expect(restored).toEqual(after)
    expect(restored.kind === 'accepted'
      && restored.value.human.semanticDigest).toBe(after.value.human.semanticDigest)
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
    paymentProposal: fixturePaymentProposal('payment:1'),
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
    paymentProposal: fixturePaymentProposal('payment:initial'),
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
      proposal: aggregate.paymentProposal,
      state: payment.state,
    },
  }
}

function fixturePaymentProposal(paymentIdentifier: string) {
  return createHostedPaidOperationPaymentProposal({
    paymentIdentifier,
    providerId: 'provider:paid',
    operationKey: 'paid-operation',
    operationRevision: 'revision:1',
    providerEndpoint: 'https://persisted.invalid/btc-usd',
    scheme: 'exact',
    network: 'eip155:84532',
    asset: 'USDC',
    payTo: 'provider:paid',
    amount: '1.00',
    challengeDigest: `sha256:${'d'.repeat(64)}`,
    authorizationDigest: `sha256:${'e'.repeat(64)}`,
    custodyRef: `sha256:${'b'.repeat(64)}`,
    preparedAt: '2026-07-20T00:00:00.000Z',
  })
}
