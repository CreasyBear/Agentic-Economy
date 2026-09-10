import { describe, expect, it } from 'vitest'

import {
  issueSpendingPolicy,
  restoreSpendingPolicyStore,
  createDevelopmentSpendingPolicyGrantVerifier,
  evaluateSpendingPolicy,
  authorityUseIntegrityValid,
  SpendingPolicyStore,
  type AuthorityUseMaterial,
  type SpendingPolicySnapshot,
} from '@/modules/action-execution/runtime'
import { executeDevelopmentProviderToolAction } from '../../../tools/dev/fixtures/provider-tool/development-provider-tool.actions'
import {
  providerToolActor,
  providerToolInput,
  developmentProviderToolNow,
} from '../../../tools/dev/fixtures/provider-tool/development-provider-tool-fixture'
import { createDevelopmentProviderToolProvider } from '../../../tools/dev/fixtures/provider-tool/development-provider-tool-provider'
import { runProviderToolExecution } from '../../../tools/dev/fixtures/provider-tool/development-provider-tool-runner'
import { createDevelopmentProviderToolSpendingPolicyService } from '../../../tools/dev/fixtures/provider-tool/development-provider-tool-spending-policy'

const now = developmentProviderToolNow()
const principalRef = 'request-owner:mock:request:mandated'
const callerRef = 'request:mock:request:mandated'
const legacyV1HeldCapacitySnapshot = Object.freeze({
  format: 'ae.action-invocation-standing-mandate-store:v1',
  mandates: [{
    spendingPolicyRef: 'legacy:v1:mandate',
    version: 1,
    generation: 1,
    grantorRef: 'legacy:grantor',
    principalRef: 'legacy:principal',
    delegateRef: 'legacy:delegate',
    callerRef: 'legacy:caller',
    issuedAt: '2026-07-19T04:00:00.000Z',
    scope: {
      objective: 'Execute one bounded provider operation.',
      action: { id: 'provider_operation.executeDevelopmentCancellable', version: 'v1' },
      providerRefs: ['legacy:provider'],
      recipientRefs: ['legacy:provider'],
      purposes: ['create_development_effect'],
      allowedDataFields: ['customer.name'],
      maximumSpend: { currency: 'AUD', units: '0', exponent: 2 },
      maximumActionCount: 2,
      maximumConcurrentReservations: 1,
      startsAt: '2026-07-19T04:00:00.000Z',
      expiresAt: '2026-07-19T05:00:00.000Z',
      permittedFallbacks: ['none'],
      riskCeiling: 'legacy_zero_charge',
    },
    format: 'ae.action-invocation-standing-mandate:v1',
    mode: 'spending_policy',
    revoked: false,
    digest: 'sha256:ecac4f0b3193e4bfa965be0cdae8d9e8d34f75dacd39eddbfec4ec2c7f60c8d5',
  }],
  grants: [{
    format: 'ae.verified-standing-mandate-grant:v1',
    evidenceRef: 'legacy:evidence',
    verifierRef: 'legacy:verifier',
    source: 'legacy:authenticated-principal:v1',
    environment: 'MOCK/DEVELOPMENT ONLY',
    spendingPolicyRef: 'legacy:v1:mandate',
    spendingPolicyVersion: 1,
    spendingPolicyGeneration: 1,
    grantorRef: 'legacy:grantor',
    principalRef: 'legacy:principal',
    delegateRef: 'legacy:delegate',
    callerRef: 'legacy:caller',
    scopeDigest: 'sha256:2d8ea833f2d2f062ebdecca0862c56575d7cf98a0d70f78aa9a6a6b730e7a891',
    spendingPolicyDigest: 'sha256:ecac4f0b3193e4bfa965be0cdae8d9e8d34f75dacd39eddbfec4ec2c7f60c8d5',
    issuedAt: '2026-07-19T04:00:00.000Z',
    verifiedAt: '2026-07-19T04:00:00.000Z',
    freshUntil: '2026-07-19T04:30:00.000Z',
    authenticated: true,
    cryptographicResult: 'valid',
    digest: 'sha256:7a302a2ae1adba5282440608b9d19beadd85896f447062008078aa0a2d29bde1',
  }],
  uses: [{
    authorityUseRef: 'legacy:use:held',
    spendingPolicyRef: 'legacy:v1:mandate',
    spendingPolicyVersion: 1,
    spendingPolicyGeneration: 1,
    callerRef: 'legacy:caller',
    principalRef: 'legacy:principal',
    delegateRef: 'legacy:delegate',
    executionRef: 'legacy:invocation:held',
    action: { id: 'provider_operation.executeDevelopmentCancellable', version: 'v1' },
    preparedMaterialDigest: 'sha256:legacy-prepared',
    providerRef: 'legacy:provider',
    recipientRef: 'legacy:provider',
    purpose: 'create_development_effect',
    dataFields: ['customer.name'],
    reservedSpend: { currency: 'AUD', units: '0', exponent: 2 },
    fallbackRef: null,
    risk: 'legacy_zero_charge',
    effectGeneration: 1,
    state: 'reserved',
    reservedAt: '2026-07-19T04:00:00.000Z',
    digest: 'sha256:29329d48475093c9368968d178b2017eefa3a58e988315be6cd67cea950b6f8a',
  }],
  exposureOffsets: [],
  policyDecisions: [],
} as const satisfies SpendingPolicySnapshot)

const spendingPolicyDecision = issueSpendingPolicy({
  spendingPolicyRef: 'mock:standing-mandate:operation',
  version: 1,
  generation: 1,
  grantorRef: 'mock:grantor:customer',
  principalRef,
  delegateRef: 'mock:delegate:agent',
  callerRef,
  issuedAt: now,
  scope: {
    objective: 'Complete suitable scheduled provider effects.',
    action: { id: executeDevelopmentProviderToolAction.id, version: 'v1' },
    providerRefs: ['mock:provider:calendar'],
    recipientRefs: ['mock:provider:calendar'],
    purposes: ['create_development_effect'],
    allowedDataFields: ['customer.name', 'customer.email'],
    maximumSpend: { currency: 'AUD', units: '0', exponent: 2 },
    maximumActionCount: 3,
    maximumConcurrentReservations: 1,
    startsAt: now,
    expiresAt: '2026-07-19T05:00:00.000Z',
    permittedFallbacks: ['none'],
    riskCeiling: 'development_provider_operation_zero_charge',
  },
})
if (spendingPolicyDecision.kind !== 'accepted') throw new Error(spendingPolicyDecision.code)
const spendingPolicy = spendingPolicyDecision.value

function use(overrides: Partial<AuthorityUseMaterial> = {}): AuthorityUseMaterial {
  return {
    authorityUseRef: 'mock:authority-use:1',
    spendingPolicyRef: spendingPolicy.spendingPolicyRef,
    spendingPolicyVersion: 1,
    spendingPolicyGeneration: 1,
    callerRef,
    principalRef,
    delegateRef: spendingPolicy.delegateRef,
    executionRef: 'mock:invocation:1',
    action: spendingPolicy.scope.action,
    preparedMaterialDigest: 'sha256:prepared',
    providerRef: 'mock:provider:calendar',
    recipientRef: 'mock:provider:calendar',
    purpose: 'create_development_effect',
    dataFields: ['customer.name', 'customer.email'],
    reservedSpend: { currency: 'AUD', units: '0', exponent: 2 },
    fallbackRef: null,
    risk: 'development_provider_operation_zero_charge',
    effectGeneration: 1,
    ...overrides,
  }
}

function issuedStore() {
  const store = new SpendingPolicyStore()
  const verifier = createDevelopmentSpendingPolicyGrantVerifier({
    admittedSpendingPolicyDigest: spendingPolicy.digest,
    evidenceRef: 'mock:grant-evidence:1',
    verifierRef: 'mock:grant-verifier:1',
    source: 'mock:authenticated-principal-grant:v1',
    freshUntil: '2026-07-19T04:30:00.000Z',
  })
  const admission = verifier(spendingPolicy, now)
  if (!admission.authenticated) throw new Error(admission.reason)
  expect(store.issue(spendingPolicy, admission, now).kind).toBe('accepted')
  return store
}

function providerToolSpendingPolicyService(store: SpendingPolicyStore) {
  return createDevelopmentProviderToolSpendingPolicyService({
    store,
    authenticatedDelegate: { delegateRef: spendingPolicy.delegateRef, callerRef, principalRef },
    now: developmentProviderToolNow,
  })
}

describe('Action execution bounded spending policy', () => {
  it.each([
    ['NaN spend', { maximumSpend: { currency: 'AUD', units: 'NaN', exponent: 2 } }],
    ['infinite spend', { maximumSpend: { currency: 'AUD', units: 'Infinity', exponent: 2 } }],
    ['fractional spend', { maximumSpend: { currency: 'AUD', units: '0.5', exponent: 2 } }],
    ['negative spend', { maximumSpend: { currency: 'AUD', units: '-1', exponent: 2 } }],
    ['unsafe spend', { maximumSpend: { currency: 'AUD', units: '0', exponent: Number.MAX_SAFE_INTEGER + 1 } }],
    ['invalid start', { startsAt: 'not-a-date' }],
    ['equal validity window', { startsAt: now, expiresAt: now }],
    ['reversed validity window', { startsAt: '2026-07-19T06:00:00.000Z' }],
  ])('refuses malformed spending policy material: %s', (_label, scopeOverride) => {
    expect(issueSpendingPolicy({
      spendingPolicyRef: 'mock:standing-mandate:invalid',
      version: 1,
      generation: 1,
      grantorRef: 'mock:grantor:customer',
      principalRef,
      delegateRef: 'mock:delegate:agent',
      callerRef,
      issuedAt: now,
      scope: { ...spendingPolicy.scope, ...scopeOverride },
    })).toEqual({ kind: 'refused', code: 'spending_policy_material_invalid' })
  })

  it.each([
    ['NaN', { currency: 'AUD', units: 'NaN', exponent: 2 }],
    ['infinite', { currency: 'AUD', units: 'Infinity', exponent: 2 }],
    ['fractional', { currency: 'AUD', units: '0.5', exponent: 2 }],
    ['negative', { currency: 'AUD', units: '-1', exponent: 2 }],
    ['unsafe', { currency: 'AUD', units: '0', exponent: Number.MAX_SAFE_INTEGER + 1 }],
  ] as const)(
    'refuses malformed reserved spend before it can change capacity: %s',
    (label, reservedSpend) => {
      const store = issuedStore()
      expect(store.reserve(use({
        authorityUseRef: `mock:authority-use:invalid:${label}`,
        reservedSpend,
      }), now)).toEqual({ kind: 'refused', code: 'spending_policy_material_invalid' })
      expect(store.capacity(spendingPolicy.spendingPolicyRef)).toMatchObject({
        reservedCount: 0,
        reservedSpend: { currency: 'AUD', units: '0', exponent: 2 },
      })
    },
  )

  it('restores valid v1 snapshots through a typed boundary and refuses malformed snapshots', () => {
    const restored = restoreSpendingPolicyStore(structuredClone(legacyV1HeldCapacitySnapshot))
    expect(restored.kind).toBe('accepted')
    expect(authorityUseIntegrityValid(legacyV1HeldCapacitySnapshot.uses[0]!)).toBe(true)

    const malformed = structuredClone(legacyV1HeldCapacitySnapshot) as unknown as {
      mandates: Array<{ scope: { maximumSpend: { units: string } } }>
    }
    malformed.mandates[0]!.scope.maximumSpend.units = 'NaN'
    expect(restoreSpendingPolicyStore(malformed)).toEqual({
      kind: 'refused',
      code: 'spending_policy_material_invalid',
    })
  })

  it('refuses malformed policy money before aggregate capacity arithmetic', () => {
    expect(evaluateSpendingPolicy({
      spendingPolicy,
      uses: [],
      policyDecisionRef: 'mock:policy:invalid-money',
      proposal: {
        objectiveRef: 'mock:objective:1',
        objective: spendingPolicy.scope.objective,
        sourceOptionRef: 'mock:option:1',
        materialDigest: 'sha256:prepared',
        authorityUseRef: 'mock:authority-use:policy',
        executionRef: 'mock:invocation:policy',
        action: spendingPolicy.scope.action,
        providerRef: spendingPolicy.scope.providerRefs[0]!,
        recipientRef: spendingPolicy.scope.recipientRefs[0]!,
        purpose: spendingPolicy.scope.purposes[0]!,
        dataFields: spendingPolicy.scope.allowedDataFields,
        spend: { currency: 'AUD', units: '-1', exponent: 2 },
        worstCaseLoss: { currency: 'AUD', units: '0', exponent: 2 },
        fallbackRef: 'none',
        risk: spendingPolicy.scope.riskCeiling,
      },
    })).toEqual({ kind: 'refused', code: 'spending_policy_material_invalid' })
  })

  it('retains v1 policy decision digest material across the execution key rename', () => {
    const decision = evaluateSpendingPolicy({
      spendingPolicy,
      uses: [],
      policyDecisionRef: 'mock:policy:byte-stable',
      proposal: {
        objectiveRef: 'mock:objective:byte-stable',
        objective: spendingPolicy.scope.objective,
        sourceOptionRef: 'mock:option:byte-stable',
        materialDigest: 'sha256:prepared',
        authorityUseRef: 'mock:authority-use:byte-stable',
        executionRef: 'mock:execution:byte-stable',
        action: spendingPolicy.scope.action,
        providerRef: spendingPolicy.scope.providerRefs[0]!,
        recipientRef: spendingPolicy.scope.recipientRefs[0]!,
        purpose: spendingPolicy.scope.purposes[0]!,
        dataFields: spendingPolicy.scope.allowedDataFields,
        spend: { currency: 'AUD', units: '0', exponent: 2 },
        worstCaseLoss: { currency: 'AUD', units: '0', exponent: 2 },
        fallbackRef: 'none',
        risk: spendingPolicy.scope.riskCeiling,
      },
    })
    if (decision.kind !== 'accepted') throw new Error(decision.code)
    expect(decision.value.digest)
      .toBe('sha256:34ce24fe704c82059dda9fb39b88c4eac906eeb25e036a39b914cf9c57d90a62')

    const issued = issuedStore()
    const snapshotWithDecision: SpendingPolicySnapshot = {
      ...issued.exportSnapshot(),
      policyDecisions: [decision.value],
    }
    const restored = restoreSpendingPolicyStore(structuredClone(snapshotWithDecision))
    expect(restored.kind).toBe('accepted')
    if (restored.kind !== 'accepted') throw new Error(restored.code)
    expect(restored.value.exportSnapshot().policyDecisions).toEqual([decision.value])

    const tampered = structuredClone(snapshotWithDecision)
    ;(tampered.policyDecisions![0] as { digest: string }).digest = 'sha256:tampered'
    expect(restoreSpendingPolicyStore(tampered)).toEqual({
      kind: 'refused',
      code: 'spending_policy_material_invalid',
    })
    expect(() => new SpendingPolicyStore(tampered))
      .toThrow('spending_policy_snapshot_policy_decision_refused')
  })

  it('loads a frozen valid v1 snapshot and enforces its held concurrency reservation', () => {
    const cold = new SpendingPolicyStore(structuredClone(legacyV1HeldCapacitySnapshot))
    expect(cold.reserve({
      authorityUseRef: 'legacy:use:second',
      spendingPolicyRef: 'legacy:v1:mandate',
      spendingPolicyVersion: 1,
      spendingPolicyGeneration: 1,
      callerRef: 'legacy:caller',
      principalRef: 'legacy:principal',
      delegateRef: 'legacy:delegate',
      executionRef: 'legacy:invocation:second',
      action: { id: 'provider_operation.executeDevelopmentCancellable', version: 'v1' },
      preparedMaterialDigest: 'sha256:legacy-prepared-second',
      providerRef: 'legacy:provider',
      recipientRef: 'legacy:provider',
      purpose: 'create_development_effect',
      dataFields: ['customer.name'],
      reservedSpend: { currency: 'AUD', units: '0', exponent: 2 },
      fallbackRef: null,
      risk: 'legacy_zero_charge',
      effectGeneration: 1,
    }, '2026-07-19T04:01:00.000Z')).toEqual({
      kind: 'refused',
      code: 'spending_policy_concurrency_exhausted',
    })
  })

  it('executes Request-owned and standalone tool through one spending policy and exact authority uses', async () => {
    const store = issuedStore()
    const service = providerToolSpendingPolicyService(store)
    const provider = createDevelopmentProviderToolProvider()
    const slot = await provider.availability()
    const requestOrigin = { kind: 'request_owned', requestRef: 'mock:request:mandated', revision: 1 } as const
    const standaloneOrigin = { kind: 'standalone', callerRef, principalRef } as const

    const runs = []
    for (const [index, origin] of [requestOrigin, standaloneOrigin].entries()) {
      const material = use({
        authorityUseRef: `mock:authority-use:origin:${index}`,
        executionRef: `replaced-by-runner:${index}`,
      })
      const run = await runProviderToolExecution({
        provider,
        operation: providerToolInput(slot, providerToolActor(origin).principalRef, `mock:operation:mandated:${index}`),
        origin,
        ref: `mandated:${index}`,
        spendingPolicy: {
          service,
          spendingPolicyRef: spendingPolicy.spendingPolicyRef,
          authorityUseRef: material.authorityUseRef,
        },
      })
      expect(run.view.observedResolution).toMatchObject({
        state: 'returned',
        result: { kind: 'effect_confirmed' },
      })
      expect(store.inspectUse(material.authorityUseRef)).toMatchObject({
        state: 'released',
        spendingPolicyGeneration: 1,
        executionRef: run.view.executionRef,
        preparedMaterialDigest: run.view.prepared?.materialInputDigest,
        effectGeneration: 1,
      })
      runs.push(run)
    }
    expect(store.capacity(spendingPolicy.spendingPolicyRef)).toMatchObject({
      consumedCount: 2,
      reservedCount: 0,
      consumedSpend: { currency: 'AUD', units: '0', exponent: 2 },
    })
    expect(provider.effectCount()).toBe(2)
    expect(runs.flatMap(({ events }) => events).filter(({ kind }) => kind === 'authority_decision')).toHaveLength(0)
    expect(runs.flatMap(({ events }) => events)
      .filter(({ kind }) => kind === 'spending_policy_authorization')).toHaveLength(2)
    const coldMandates = new SpendingPolicyStore(structuredClone(store.exportSnapshot()))
    expect(coldMandates.capacity(spendingPolicy.spendingPolicyRef).consumedCount).toBe(2)
    for (const run of runs) {
      expect((await run.tracer.coldResume(run.view.executionRef)).inspect(run.view.executionRef))
        .toMatchObject({
          executionRef: run.view.executionRef,
          observedResolution: { state: 'returned', result: { kind: 'effect_confirmed' } },
        })
    }
  })

  it('requires authenticated grant admission and refuses self-authored, stale, mismatched, and tampered evidence', () => {
    const store = new SpendingPolicyStore()
    const verifier = createDevelopmentSpendingPolicyGrantVerifier({
      admittedSpendingPolicyDigest: spendingPolicy.digest,
      evidenceRef: 'mock:grant-evidence:test',
      verifierRef: 'mock:grant-verifier:test',
      source: 'mock:authenticated-principal-grant:v1',
      freshUntil: '2026-07-19T04:30:00.000Z',
    })
    const grant = verifier(spendingPolicy, now)
    if (!grant.authenticated) throw new Error(grant.reason)
    expect(store.issue(spendingPolicy, { ...grant, principalRef: 'self-authored' }, now))
      .toEqual({ kind: 'refused', code: 'spending_policy_grant_unauthenticated' })
    expect(store.issue(spendingPolicy, grant, grant.freshUntil))
      .toEqual({ kind: 'refused', code: 'spending_policy_grant_unauthenticated' })
    expect(store.issue({ ...spendingPolicy, principalRef: 'mismatch' }, grant, now))
      .toEqual({ kind: 'refused', code: 'spending_policy_integrity_invalid' })
    expect(store.issue(spendingPolicy, { ...grant, digest: 'sha256:tampered' }, now))
      .toEqual({ kind: 'refused', code: 'spending_policy_grant_unauthenticated' })
  })

  it('derives actual actor and operation scope instead of trusting caller-supplied use material', async () => {
    const store = issuedStore()
    const provider = createDevelopmentProviderToolProvider()
    const slot = await provider.availability()
    const wrongActorService = createDevelopmentProviderToolSpendingPolicyService({
      store,
      authenticatedDelegate: {
        delegateRef: spendingPolicy.delegateRef,
        callerRef: 'mock:caller:wrong',
        principalRef,
      },
      now: developmentProviderToolNow,
    })
    await expect(runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, 'mock:operation:actual-actor-mismatch'),
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'actual-actor-mismatch',
      spendingPolicy: {
        service: wrongActorService,
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        authorityUseRef: 'mock:authority-use:actual-actor-mismatch',
      },
    })).rejects.toThrow('spending_policy_principal_mismatch')
    expect(provider.effectCount()).toBe(0)

    const service = providerToolSpendingPolicyService(store)
    await expect(runProviderToolExecution({
      provider,
      operation: {
        ...providerToolInput(slot, principalRef, 'mock:operation:actual-operation-mismatch'),
        disclosure: {
          fields: ['customer.name', 'customer.email'],
          recipient: 'mock:provider:wrong',
          purpose: 'create_development_effect',
        },
      },
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'actual-operation-mismatch',
      spendingPolicy: {
        service,
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        authorityUseRef: 'mock:authority-use:actual-operation-mismatch',
      },
    })).rejects.toThrow('spending_policy_recipient_mismatch')
    expect(provider.effectCount()).toBe(0)
  })

  it.each([
    ['stale_execution_version', { developmentAuthorizationVersionOverride: 99 }],
    ['stale_execution_version', { developmentAcquisitionVersionOverride: 99 }],
  ] as const)('compensates reserved capacity when %s refuses before release', async (code, override) => {
    const store = issuedStore()
    const service = providerToolSpendingPolicyService(store)
    const provider = createDevelopmentProviderToolProvider()
    const slot = await provider.availability()
    const authorityUseRef = `mock:authority-use:compensation:${Object.keys(override)[0]}`
    await expect(runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, `mock:operation:${authorityUseRef}`),
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: authorityUseRef,
      spendingPolicy: {
        service,
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        authorityUseRef,
        ...override,
      },
    })).rejects.toThrow(code)
    expect(provider.effectCount()).toBe(0)
    expect(store.inspectUse(authorityUseRef)).toMatchObject({ state: 'not_released' })
    expect(store.capacity(spendingPolicy.spendingPolicyRef)).toMatchObject({
      reservedCount: 0,
      reservedSpend: { currency: 'AUD', units: '0', exponent: 2 },
    })
  })

  it('reconstructs a cold in-flight release token and refuses missing or mismatched records', async () => {
    const store = issuedStore()
    const provider = createDevelopmentProviderToolProvider()
    const slot = await provider.availability()
    let coldStore: SpendingPolicyStore | undefined
    await runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, 'mock:operation:cold-in-flight'),
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'cold-in-flight',
      spendingPolicy: {
        service: providerToolSpendingPolicyService(store),
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        authorityUseRef: 'mock:authority-use:cold-in-flight',
        reconstructBeforeRelease: () => {
          coldStore = new SpendingPolicyStore(structuredClone(store.exportSnapshot()))
          return providerToolSpendingPolicyService(coldStore)
        },
      },
    })
    expect(coldStore?.inspectUse('mock:authority-use:cold-in-flight')).toMatchObject({ state: 'released' })
    expect(provider.effectCount()).toBe(1)
    const tampered = structuredClone(store.exportSnapshot())
    ;(tampered.uses[0] as { executionRef: string }).executionRef = 'tampered'
    expect(() => new SpendingPolicyStore(tampered))
      .toThrow('spending_policy_snapshot_authority_use_refused')
  })

  it('compensates a cold reconstruction failure before provider release', async () => {
    const store = issuedStore()
    const provider = createDevelopmentProviderToolProvider()
    const slot = await provider.availability()
    const authorityUseRef = 'mock:authority-use:reconstruction-failure'
    await expect(runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, 'mock:operation:reconstruction-failure'),
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'reconstruction-failure',
      spendingPolicy: {
        service: providerToolSpendingPolicyService(store),
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        authorityUseRef,
        reconstructBeforeRelease: () => providerToolSpendingPolicyService(store),
        throwDuringReconstruction: true,
      },
    })).rejects.toThrow('mock_cold_reconstruction_failed')
    expect(provider.effectCount()).toBe(0)
    expect(store.inspectUse(authorityUseRef)).toMatchObject({ state: 'not_released' })
    expect(store.capacity(spendingPolicy.spendingPolicyRef).reservedCount).toBe(0)
  })

  it('compensates an execution exception only with positive pre-release evidence', async () => {
    const store = issuedStore()
    const provider = createDevelopmentProviderToolProvider()
    const slot = await provider.availability()
    const authorityUseRef = 'mock:authority-use:pre-release-exception'
    await expect(runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, 'mock:operation:pre-release-exception'),
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'pre-release-exception',
      spendingPolicy: {
        service: providerToolSpendingPolicyService(store),
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        authorityUseRef,
        throwFromReleaseFenceBeforeProvider: true,
      },
    })).rejects.toThrow('mock_pre_release_infrastructure_fault')
    expect(provider.effectCount()).toBe(0)
    expect(store.inspectUse(authorityUseRef)).toMatchObject({ state: 'not_released' })
    expect(store.capacity(spendingPolicy.spendingPolicyRef).reservedCount).toBe(0)
  })

  it('holds uncertainty after an execution exception following provider release', async () => {
    const store = issuedStore()
    const service = providerToolSpendingPolicyService(store)
    const provider = createDevelopmentProviderToolProvider()
    const slot = await provider.availability()
    const authorityUseRef = 'mock:authority-use:post-release-exception'
    await expect(runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, 'mock:operation:post-release-exception'),
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'post-release-exception',
      corruptSourceResultAfterRelease: true,
      spendingPolicy: { service, spendingPolicyRef: spendingPolicy.spendingPolicyRef, authorityUseRef },
    })).rejects.toThrow('Source result digest mismatch')
    expect(provider.effectCount()).toBe(1)
    expect(store.inspectUse(authorityUseRef)).toMatchObject({ state: 'uncertain' })
    expect(store.capacity(spendingPolicy.spendingPolicyRef)).toMatchObject({ reservedCount: 1, consumedCount: 0 })
    await expect(runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, 'mock:operation:blocked-by-uncertainty'),
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'blocked-by-uncertainty',
      spendingPolicy: {
        service,
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        authorityUseRef: 'mock:authority-use:blocked-by-uncertainty',
      },
    })).rejects.toThrow('spending_policy_concurrency_exhausted')
    expect(provider.effectCount()).toBe(1)
  })

  it('validates exact settlement view and attempt and replays immutable terminal settlement', async () => {
    const store = issuedStore()
    const service = providerToolSpendingPolicyService(store)
    const provider = createDevelopmentProviderToolProvider()
    const slot = await provider.availability()
    const run = await runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, 'mock:operation:settlement-linkage'),
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'settlement-linkage',
      spendingPolicy: {
        service,
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        authorityUseRef: 'mock:authority-use:settlement-linkage',
      },
    })
    const original = store.inspectUse('mock:authority-use:settlement-linkage')
    expect(service.settleFromInvocation({
      authorityUseRef: 'mock:authority-use:settlement-linkage',
      view: run.view,
      attemptRef: 'wrong-attempt',
    })).toEqual({ kind: 'refused', code: 'authority_use_linkage_invalid' })
    expect(service.settleFromInvocation({
      authorityUseRef: 'mock:authority-use:settlement-linkage',
      view: { ...run.view, owner: { ...run.view.owner, principalRef: 'wrong' } },
      attemptRef: run.view.attempts[0]!.attemptRef,
    })).toEqual({ kind: 'refused', code: 'authority_use_linkage_invalid' })
    const replay = store.settle(
      'mock:authority-use:settlement-linkage',
      'released',
      '2026-07-19T04:59:59.000Z',
    )
    expect(replay).toEqual({ kind: 'accepted', value: original })
    expect(store.settle(
      'mock:authority-use:settlement-linkage',
      'not_released',
      '2026-07-19T04:59:59.000Z',
    )).toEqual({ kind: 'refused', code: 'authority_use_linkage_invalid' })
  })

  it.each([
    ['spending_policy_principal_mismatch', { principalRef: 'other' }],
    ['spending_policy_delegate_mismatch', { delegateRef: 'other' }],
    ['spending_policy_action_mismatch', { action: { id: 'other.action', version: 'v1' } }],
    ['spending_policy_provider_mismatch', { providerRef: 'other' }],
    ['spending_policy_recipient_mismatch', { recipientRef: 'other' }],
    ['spending_policy_purpose_mismatch', { purpose: 'other' }],
    ['spending_policy_data_widening', { dataFields: ['customer.name', 'customer.email', 'customer.phone'] }],
    ['spending_policy_currency_mismatch', { reservedSpend: { currency: 'USD', units: '0', exponent: 2 } }],
    ['spending_policy_spend_exceeded', { reservedSpend: { currency: 'AUD', units: '1', exponent: 2 } }],
    ['spending_policy_fallback_mismatch', { fallbackRef: 'other' }],
    ['spending_policy_risk_exceeded', { risk: 'higher' }],
    ['spending_policy_caller_mismatch', { callerRef: 'other' }],
  ] as const)('refuses %s scope widening', (code, override) => {
    const store = issuedStore()
    expect(store.reserve(use(override as Partial<AuthorityUseMaterial>), now)).toEqual({ kind: 'refused', code })
  })

  it('refuses expired mandates', () => {
    const store = issuedStore()
    expect(store.reserve(use(), spendingPolicy.scope.expiresAt))
      .toEqual({ kind: 'refused', code: 'spending_policy_expired' })
  })

  it('rechecks revocation immediately before provider release', async () => {
    const store = issuedStore()
    const service = providerToolSpendingPolicyService(store)
    const provider = createDevelopmentProviderToolProvider()
    const slot = await provider.availability()
    const origin = { kind: 'standalone', callerRef, principalRef } as const
    await expect(runProviderToolExecution({
      provider,
      operation: providerToolInput(slot, principalRef, 'mock:operation:revoke-before-release'),
      origin,
      ref: 'revoke-before-release',
      spendingPolicy: {
        service,
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        authorityUseRef: 'mock:authority-use:revoke-before-release',
        afterEffect: () => {
          store.revoke({
            spendingPolicyRef: spendingPolicy.spendingPolicyRef,
            expectedGeneration: 1,
            reason: 'Customer revoked before provider release.',
            revokedAt: '2026-07-19T04:00:01.000Z',
          })
        },
      },
    })).rejects.toThrow('authority_not_accepted')
    expect(provider.effectCount()).toBe(0)
    expect(store.inspectUse('mock:authority-use:revoke-before-release')).toMatchObject({ state: 'not_released' })
  })

  it('atomically refuses concurrent oversubscription and count exhaustion', () => {
    const store = issuedStore()
    expect(store.reserve(use(), now).kind).toBe('accepted')
    expect(store.reserve(use({ authorityUseRef: 'mock:authority-use:2' }), now))
      .toEqual({ kind: 'refused', code: 'spending_policy_concurrency_exhausted' })
    store.settle('mock:authority-use:1', 'released', now)
    for (const id of ['2', '3']) {
      expect(store.reserve(use({ authorityUseRef: `mock:authority-use:${id}` }), now).kind).toBe('accepted')
      store.settle(`mock:authority-use:${id}`, 'released', now)
    }
    expect(store.reserve(use({ authorityUseRef: 'mock:authority-use:4' }), now))
      .toEqual({ kind: 'refused', code: 'spending_policy_count_exhausted' })
  })

  it('fences revocation and stale generations without rewriting released effects', () => {
    const store = issuedStore()
    store.reserve(use(), now)
    store.settle('mock:authority-use:1', 'released', now)
    store.reserve(use({ authorityUseRef: 'mock:authority-use:before-revoke' }), now)
    const revoked = store.revoke({
      spendingPolicyRef: spendingPolicy.spendingPolicyRef,
      expectedGeneration: 1,
      reason: 'Customer stopped further operation.',
      revokedAt: '2026-07-19T04:01:00.000Z',
    })
    expect(revoked).toMatchObject({ kind: 'accepted', value: { generation: 2, revoked: { reason: expect.any(String) } } })
    expect(store.reserve(use({ authorityUseRef: 'mock:authority-use:2' }), '2026-07-19T04:02:00.000Z'))
      .toEqual({ kind: 'refused', code: 'spending_policy_revoked' })
    expect(store.inspectUse('mock:authority-use:1')).toMatchObject({ state: 'released', spendingPolicyGeneration: 1 })
  })

  it('holds uncertain capacity until reconciliation settlement and reconstructs cold', () => {
    const store = issuedStore()
    store.reserve(use(), now)
    store.settle('mock:authority-use:1', 'uncertain', now)
    expect(store.reserve(use({ authorityUseRef: 'mock:authority-use:2' }), now))
      .toEqual({ kind: 'refused', code: 'spending_policy_concurrency_exhausted' })
    const cold = new SpendingPolicyStore(structuredClone(store.exportSnapshot()))
    expect(cold.capacity(spendingPolicy.spendingPolicyRef)).toMatchObject({ consumedCount: 0, reservedCount: 1 })
    expect(cold.settle('mock:authority-use:1', 'released', '2026-07-19T04:03:00.000Z').kind).toBe('accepted')
    expect(cold.reserve(use({ authorityUseRef: 'mock:authority-use:2' }), '2026-07-19T04:04:00.000Z').kind)
      .toBe('accepted')
  })

  it('rejects checksummed-record tampering during cold reconstruction', () => {
    const store = issuedStore()
    store.reserve(use(), now)
    const snapshot = structuredClone(store.exportSnapshot())
    ;(snapshot.mandates[0] as { generation: number }).generation = 9
    expect(() => new SpendingPolicyStore(snapshot)).toThrow('spending_policy_snapshot_integrity_refused')
    const useSnapshot = structuredClone(store.exportSnapshot())
    ;(useSnapshot.uses[0] as { preparedMaterialDigest: string }).preparedMaterialDigest = 'sha256:tampered'
    expect(() => new SpendingPolicyStore(useSnapshot))
      .toThrow('spending_policy_snapshot_authority_use_refused')
  })
})
