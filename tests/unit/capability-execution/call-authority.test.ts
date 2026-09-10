import { describe, expect, it } from 'vitest'

import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import {
  buildCallAuthority,
  createCallApplication,
  type CallGrant,
  type CallRuntime,
} from '@/modules/capability-execution/call-authority'
import { validateCallAuthority } from '../../../convex/capabilityCallWorker'
import { buildDevelopmentPublishedToolEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'
import {
  createPublicToolRef,
  materializeRuntimePublishedTool,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const QUOTE_REF = `operation-commitment:v1:${'0'.repeat(64)}`
const DECISION_PRICE = { currency: 'AUD', exponent: 6, units: '1000000' } as const

const principal: AgentAccessPrincipal = {
  principalId: 'principal:authority-continuity',
  ownerId: 'owner:authority-continuity',
  credentialId: 'credential:authority-continuity',
  applicationRef: 'application:authority-continuity',
  environment: 'sandbox',
  scopes: ['market_tools:call'],
  authorityMode: 'approval_required',
}

const grant: CallGrant = {
  grantRef: 'grant:authority-continuity',
  principalId: principal.principalId,
  ownerId: principal.ownerId,
  applicationRef: principal.applicationRef,
  credentialId: principal.credentialId,
  environment: principal.environment,
  generation: 7,
  policyDigest: 'sha256:authority-policy',
  expiresAt: Number.MAX_SAFE_INTEGER,
  lifecycle: 'active',
  toolAccess: 'all_admitted',
  toolRefs: [],
}

function fixture() {
  const packet = buildDevelopmentPublishedToolEvidence()
  const now = Date.now()
  const operation = {
    ...packet.tool,
    readiness: {
      ...packet.tool.readiness,
      observedAt: now,
      validUntil: now + 60_000,
    },
  }
  const toolRef = createPublicToolRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
  return { operation, toolRef, descriptor: materializeRuntimePublishedTool(operation) }
}

function fixedFixture() {
  const packet = buildDevelopmentPublishedToolEvidence()
  const now = 1_757_000_000_000
  const operation = {
    ...packet.tool,
    readiness: {
      ...packet.tool.readiness,
      observedAt: now,
      validUntil: now + 60_000,
    },
  }
  const toolRef = createPublicToolRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
  return { now, operation, toolRef, descriptor: materializeRuntimePublishedTool(operation) }
}


describe('call authority continuity', () => {
  it('preserves approved basis identity and bounds through worker validation', () => {
    const { operation, toolRef, descriptor } = fixture()
    const input = { symbol: 'BTC', convert: 'USD' }
    const inputDigest = canonicalDigest(input)
    const now = Date.now()
    const authorityExpiresAt = new Date(now + 20_000).toISOString()
    const bases = [
      {
        principal,
        basis: { kind: 'approval_required' as const, authorityRef: 'authority:explicit:7' },
      },
      {
        principal: { ...principal, authorityMode: 'spending_policy' as const },
        basis: {
          kind: 'spending_policy_use' as const,
          spendingPolicyRef: 'mandate:bounded:7',
          spendingPolicyVersion: 2,
          spendingPolicyGeneration: grant.generation,
          authorityUseRef: 'authority-use:bounded:7',
          grantEvidenceRef: 'grant-evidence:bounded:7',
        },
      },
      {
        principal: { ...principal, authorityMode: 'unrestricted_test_only' as const },
        basis: {
          kind: 'spending_policy_use' as const,
          spendingPolicyRef: `agent-access-grant:${grant.grantRef}`,
          spendingPolicyVersion: 1,
          spendingPolicyGeneration: grant.generation,
          authorityUseRef: 'operation-authority-use:operation-invocation:authority-continuity',
          grantEvidenceRef: `agent-access-grant-evidence:${grant.policyDigest}`,
        },
      },
    ] as const

    for (const candidate of bases) {
      const persisted = buildCallAuthority({
        authority: { kind: 'approved', basis: candidate.basis, expiresAt: authorityExpiresAt },
        grant,
        operation,
        descriptor,
        toolRef,
        callRef: 'operation-invocation:authority-continuity',
        inputDigest,
        decisionPrice: DECISION_PRICE,
        now,
      })
      expect(persisted).toBeDefined()
      if (persisted === undefined) continue
      expect(persisted.acceptedBasis).toEqual(candidate.basis)
      expect(persisted.expiresAt).toBe(authorityExpiresAt)
      expect(persisted.limits).toEqual({ amount: DECISION_PRICE })
      expect(validateCallAuthority({
        authority: persisted,
        dispatch: {
          callRef: persisted.callRef,
          toolRef,
          inputDigest,
          grantGeneration: grant.generation,
        },
        grant,
        principal: candidate.principal,
        operation,
        descriptor,
        now,
      })).toEqual(DECISION_PRICE)
    }
  })

  it('keeps the call authority decision digest stable for fixed authority material', () => {
    const { now, operation, toolRef, descriptor } = fixedFixture()
    const input = { symbol: 'BTC', convert: 'USD' }
    const inputDigest = canonicalDigest(input)
    const basis = { kind: 'approval_required' as const, authorityRef: 'authority:explicit:7' }
    const persisted = buildCallAuthority({
      authority: {
        kind: 'approved',
        basis,
        expiresAt: new Date(now + 20_000).toISOString(),
      },
      grant,
      operation,
      descriptor,
      toolRef,
      callRef: 'operation-invocation:authority-material',
      inputDigest,
      decisionPrice: DECISION_PRICE,
      now,
    })

    expect(persisted).toBeDefined()
    if (persisted === undefined) return
    expect(persisted.acceptedBasis).toEqual(basis)
    expect(persisted.decisionDigest).toBe('sha256:a6593ac21dc320b6dc73b350feea4b5832f23f88ded0319037f5fe18d1e517f7')
    expect(validateCallAuthority({
      authority: persisted,
      dispatch: {
        callRef: persisted.callRef,
        toolRef,
        inputDigest,
        grantGeneration: grant.generation,
      },
      grant,
      principal,
      operation,
      descriptor,
      now,
    })).toEqual(DECISION_PRICE)
  })

  it('caps persisted authority expiry at the earliest authority, grant, and readiness bound', () => {
    const { operation, toolRef, descriptor } = fixture()
    const inputDigest = canonicalDigest({ symbol: 'BTC', convert: 'USD' })
    const now = Date.now()
    const cases = [
      { authorityMs: 20_000, grantMs: 30_000, readinessMs: 40_000 },
      { authorityMs: 40_000, grantMs: 20_000, readinessMs: 30_000 },
      { authorityMs: 40_000, grantMs: 30_000, readinessMs: 20_000 },
    ] as const

    for (const [index, candidate] of cases.entries()) {
      const persisted = buildCallAuthority({
        authority: {
          kind: 'approved',
          basis: { kind: 'approval_required', authorityRef: `authority:expiry-bound:${index}` },
          expiresAt: new Date(now + candidate.authorityMs).toISOString(),
        },
        grant: { ...grant, expiresAt: now + candidate.grantMs },
        operation: {
          ...operation,
          readiness: { ...operation.readiness, validUntil: now + candidate.readinessMs },
        },
        descriptor,
        toolRef,
        callRef: `operation-invocation:expiry-bound:${index}`,
        inputDigest,
        decisionPrice: DECISION_PRICE,
        now,
      })
      expect(persisted?.expiresAt).toBe(new Date(now + Math.min(
        candidate.authorityMs,
        candidate.grantMs,
        candidate.readinessMs,
      )).toISOString())
    }

    expect(buildCallAuthority({
      authority: {
        kind: 'approved',
        basis: { kind: 'approval_required', authorityRef: 'authority:expiry-bound-now' },
        expiresAt: new Date(now + 20_000).toISOString(),
      },
      grant: { ...grant, expiresAt: now + 30_000 },
      operation: {
        ...operation,
        readiness: { ...operation.readiness, validUntil: now },
      },
      descriptor,
      toolRef,
      callRef: 'operation-invocation:expiry-bound-now',
      inputDigest,
      decisionPrice: DECISION_PRICE,
      now,
    })).toBeUndefined()
  })

  it('maps unrestricted test approval to the spending-policy branch before dispatch', async () => {
    const { operation, toolRef, descriptor } = fixture()
    const fullYoloPrincipal: AgentAccessPrincipal = { ...principal, authorityMode: 'unrestricted_test_only' }
    let dispatchedAuthority: Parameters<NonNullable<CallRuntime['dispatch']>>[0]['authority'] | undefined
    const runtime: CallRuntime = {
      currentTool: async () => ({ operation, toolRef, descriptor }),
      recovery: {
        read: async () => {
          throw new Error('recovery_not_reached')
        },
        cancel: async () => {
          throw new Error('recovery_not_reached')
        },
        reconcile: async () => {
          throw new Error('recovery_not_reached')
        },
      },
      policy: {
        readGrant: async () => ({ kind: 'granted', grant }),
        evaluateAuthority: async () => ({
          kind: 'approved' as const,
          basis: { kind: 'approval_required' as const, authorityRef: 'authority:legacy-inspect' },
          expiresAt: new Date(Date.now() + 20_000).toISOString(),
        }),
      },
      idempotency: {
        reserve: async (reservation) => ({ kind: 'reserved' as const, reservation }),
        abandon: async () => ({ kind: 'abandoned' as const }),
      },
      dispatch: async (input) => {
        dispatchedAuthority = input.authority
        return { kind: 'enqueued' as const }
      },
    }

    const result = await createCallApplication(runtime).callTool({
      principal: fullYoloPrincipal,
      correlationId: 'correlation:full-yolo-authority',
      input: { quoteRef: QUOTE_REF, decisionPrice: DECISION_PRICE, toolRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:full-yolo-authority' },
    })

    expect(result.kind).toBe('pending')
    expect(dispatchedAuthority?.acceptedBasis).toEqual({
      kind: 'spending_policy_use',
      spendingPolicyRef: `agent-access-grant:${grant.grantRef}`,
      spendingPolicyVersion: 1,
      spendingPolicyGeneration: grant.generation,
      authorityUseRef: `operation-authority-use:${dispatchedAuthority?.callRef}`,
      grantEvidenceRef: `agent-access-grant-evidence:${grant.policyDigest}`,
    })
  })

  it('rejects expired or changed persisted authority before credential or transport admission', () => {
    const { operation, toolRef, descriptor } = fixture()
    const input = { symbol: 'BTC', convert: 'USD' }
    const inputDigest = canonicalDigest(input)
    const callRef = 'operation-invocation:authority-expiry'
    const now = Date.now()
    const persisted = buildCallAuthority({
      authority: {
        kind: 'approved',
        basis: { kind: 'approval_required', authorityRef: 'authority:expiry' },
        expiresAt: new Date(now + 20_000).toISOString(),
      },
      grant,
      operation,
      descriptor,
      toolRef,
      callRef,
      inputDigest,
      decisionPrice: DECISION_PRICE,
      now,
    })
    expect(persisted).toBeDefined()
    if (persisted === undefined) return
    expect(validateCallAuthority({
      authority: { ...persisted, expiresAt: new Date(now - 1).toISOString() },
      dispatch: { callRef, toolRef, inputDigest, grantGeneration: grant.generation },
      grant,
      principal,
      operation,
      descriptor,
      now,
    })).toBeUndefined()
    expect(validateCallAuthority({
      authority: { ...persisted, acceptedBasis: { kind: 'approval_required', authorityRef: 'authority:changed' } },
      dispatch: { callRef, toolRef, inputDigest, grantGeneration: grant.generation },
      grant,
      principal,
      operation,
      descriptor,
      now,
    })).toBeUndefined()
    expect(validateCallAuthority({
      authority: persisted,
      dispatch: { callRef, toolRef, inputDigest, grantGeneration: grant.generation },
      grant,
      principal,
      operation,
      descriptor,
      now,
    })).toEqual(DECISION_PRICE)
  })
})
