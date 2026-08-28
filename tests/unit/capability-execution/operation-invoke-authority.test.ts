import { describe, expect, it } from 'vitest'

import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import {
  buildOperationInvokeAuthority,
  createOperationInvokeApplication,
  type OperationInvokeGrant,
  type OperationInvokeRuntime,
} from '@/modules/capability-execution/operation-invoke'
import { validateOperationInvokeAuthority } from '../../../convex/capabilityOperationInvocationWorker'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import {
  createPublicOperationRef,
  materializeRuntimePublishedOperation,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const principal: AgentAccessPrincipal = {
  principalId: 'principal:authority-continuity',
  ownerId: 'owner:authority-continuity',
  credentialId: 'credential:authority-continuity',
  applicationRef: 'application:authority-continuity',
  environment: 'sandbox',
  scopes: ['market_operations:invoke'],
  authorityMode: 'approve_each',
}

const grant: OperationInvokeGrant = {
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
  operationAccess: 'all_admitted',
}

function fixture() {
  const packet = buildDevelopmentPublishedOperationEvidence()
  const now = Date.now()
  const operation = {
    ...packet.operation,
    readiness: {
      ...packet.operation.readiness,
      observedAt: now,
      validUntil: now + 60_000,
    },
  }
  const operationRef = createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
  return { operation, operationRef, descriptor: materializeRuntimePublishedOperation(operation) }
}


describe('operation.invoke authority continuity', () => {
  it('preserves approved basis identity and bounds through worker validation', () => {
    const { operation, operationRef, descriptor } = fixture()
    const input = { symbol: 'BTC', convert: 'USD' }
    const inputDigest = canonicalDigest(input)
    const now = Date.now()
    const authorityExpiresAt = new Date(now + 20_000).toISOString()
    const bases = [
      {
        principal,
        basis: { kind: 'approve_each' as const, authorityRef: 'authority:explicit:7' },
      },
      {
        principal: { ...principal, authorityMode: 'bounded_mandate' as const },
        basis: {
          kind: 'standing_mandate_use' as const,
          mandateRef: 'mandate:bounded:7',
          mandateVersion: 2,
          mandateGeneration: grant.generation,
          authorityUseRef: 'authority-use:bounded:7',
          grantEvidenceRef: 'grant-evidence:bounded:7',
        },
      },
      {
        principal: { ...principal, authorityMode: 'full_yolo' as const },
        basis: {
          kind: 'standing_mandate_use' as const,
          mandateRef: `agent-access-grant:${grant.grantRef}`,
          mandateVersion: 1,
          mandateGeneration: grant.generation,
          authorityUseRef: 'operation-authority-use:operation-invocation:authority-continuity',
          grantEvidenceRef: `agent-access-grant-evidence:${grant.policyDigest}`,
        },
      },
    ] as const

    for (const candidate of bases) {
      const persisted = buildOperationInvokeAuthority({
        authority: { kind: 'approved', basis: candidate.basis, expiresAt: authorityExpiresAt },
        grant,
        operation,
        descriptor,
        operationRef,
        invocationRef: 'operation-invocation:authority-continuity',
        inputDigest,
        now,
      })
      expect(persisted).toBeDefined()
      if (persisted === undefined) continue
      expect(persisted.acceptedBasis).toEqual(candidate.basis)
      expect(persisted.expiresAt).toBe(authorityExpiresAt)
      expect(persisted.limits).toEqual({ amount: descriptor.price.kind === 'fixed' ? descriptor.price.amount : undefined })
      expect(validateOperationInvokeAuthority({
        authority: persisted,
        dispatch: {
          invocationRef: persisted.invocationRef,
          operationRef,
          inputDigest,
          grantGeneration: grant.generation,
        },
        grant,
        principal: candidate.principal,
        operation,
        descriptor,
        now,
      })).toEqual(descriptor.price.kind === 'fixed' ? descriptor.price.amount : undefined)
    }
  })

  it('caps persisted authority expiry at the earliest authority, grant, and readiness bound', () => {
    const { operation, operationRef, descriptor } = fixture()
    const inputDigest = canonicalDigest({ symbol: 'BTC', convert: 'USD' })
    const now = Date.now()
    const cases = [
      { authorityMs: 20_000, grantMs: 30_000, readinessMs: 40_000 },
      { authorityMs: 40_000, grantMs: 20_000, readinessMs: 30_000 },
      { authorityMs: 40_000, grantMs: 30_000, readinessMs: 20_000 },
    ] as const

    for (const [index, candidate] of cases.entries()) {
      const persisted = buildOperationInvokeAuthority({
        authority: {
          kind: 'approved',
          basis: { kind: 'approve_each', authorityRef: `authority:expiry-bound:${index}` },
          expiresAt: new Date(now + candidate.authorityMs).toISOString(),
        },
        grant: { ...grant, expiresAt: now + candidate.grantMs },
        operation: {
          ...operation,
          readiness: { ...operation.readiness, validUntil: now + candidate.readinessMs },
        },
        descriptor,
        operationRef,
        invocationRef: `operation-invocation:expiry-bound:${index}`,
        inputDigest,
        now,
      })
      expect(persisted?.expiresAt).toBe(new Date(now + Math.min(
        candidate.authorityMs,
        candidate.grantMs,
        candidate.readinessMs,
      )).toISOString())
    }

    expect(buildOperationInvokeAuthority({
      authority: {
        kind: 'approved',
        basis: { kind: 'approve_each', authorityRef: 'authority:expiry-bound-now' },
        expiresAt: new Date(now + 20_000).toISOString(),
      },
      grant: { ...grant, expiresAt: now + 30_000 },
      operation: {
        ...operation,
        readiness: { ...operation.readiness, validUntil: now },
      },
      descriptor,
      operationRef,
      invocationRef: 'operation-invocation:expiry-bound-now',
      inputDigest,
      now,
    })).toBeUndefined()
  })

  it('maps full_yolo approval to the standing-mandate branch before dispatch', async () => {
    const { operation, operationRef, descriptor } = fixture()
    const fullYoloPrincipal: AgentAccessPrincipal = { ...principal, authorityMode: 'full_yolo' }
    let dispatchedAuthority: Parameters<NonNullable<OperationInvokeRuntime['dispatch']>>[0]['authority'] | undefined
    const runtime: OperationInvokeRuntime = {
      currentOperation: async () => ({ operation, operationRef, descriptor }),
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
          basis: { kind: 'approve_each' as const, authorityRef: 'authority:legacy-inspect' },
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

    const result = await createOperationInvokeApplication(runtime).invokeOperation({
      principal: fullYoloPrincipal,
      correlationId: 'correlation:full-yolo-authority',
      input: { operationRef, input: { symbol: 'BTC', convert: 'USD' }, idempotencyKey: 'idem:full-yolo-authority' },
    })

    expect(result.kind).toBe('pending')
    expect(dispatchedAuthority?.acceptedBasis).toEqual({
      kind: 'standing_mandate_use',
      mandateRef: `agent-access-grant:${grant.grantRef}`,
      mandateVersion: 1,
      mandateGeneration: grant.generation,
      authorityUseRef: `operation-authority-use:${dispatchedAuthority?.invocationRef}`,
      grantEvidenceRef: `agent-access-grant-evidence:${grant.policyDigest}`,
    })
  })

  it('rejects expired or changed persisted authority before credential or transport admission', () => {
    const { operation, operationRef, descriptor } = fixture()
    const input = { symbol: 'BTC', convert: 'USD' }
    const inputDigest = canonicalDigest(input)
    const invocationRef = 'operation-invocation:authority-expiry'
    const now = Date.now()
    const persisted = buildOperationInvokeAuthority({
      authority: {
        kind: 'approved',
        basis: { kind: 'approve_each', authorityRef: 'authority:expiry' },
        expiresAt: new Date(now + 20_000).toISOString(),
      },
      grant,
      operation,
      descriptor,
      operationRef,
      invocationRef,
      inputDigest,
      now,
    })
    expect(persisted).toBeDefined()
    if (persisted === undefined) return
    expect(validateOperationInvokeAuthority({
      authority: { ...persisted, expiresAt: new Date(now - 1).toISOString() },
      dispatch: { invocationRef, operationRef, inputDigest, grantGeneration: grant.generation },
      grant,
      principal,
      operation,
      descriptor,
      now,
    })).toBeUndefined()
    expect(validateOperationInvokeAuthority({
      authority: { ...persisted, acceptedBasis: { kind: 'approve_each', authorityRef: 'authority:changed' } },
      dispatch: { invocationRef, operationRef, inputDigest, grantGeneration: grant.generation },
      grant,
      principal,
      operation,
      descriptor,
      now,
    })).toBeUndefined()
    expect(validateOperationInvokeAuthority({
      authority: persisted,
      dispatch: { invocationRef, operationRef, inputDigest, grantGeneration: grant.generation },
      grant,
      principal,
      operation,
      descriptor,
      now,
    })).toEqual(descriptor.price.kind === 'fixed' ? descriptor.price.amount : undefined)
  })
})
