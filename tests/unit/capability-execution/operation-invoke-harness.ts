import type {
  OperationInvokeGrant,
  OperationInvokeRuntime,
} from '@/modules/capability-execution/operation-invoke'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import {
  createPublicOperationRef,
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
} from '@/modules/capability-supply/public'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { projectOuterResult } from '../../../convex/capabilityOperationInvocationWorker'

export const principal: AgentAccessPrincipal = {
  principalId: 'principal:test',
  ownerId: 'owner:test',
  credentialId: 'credential:test',
  applicationRef: 'application:test',
  environment: 'sandbox',
  scopes: ['market_operations:invoke'],
  authorityMode: 'approve_each',
}

export const grant: OperationInvokeGrant = {
  grantRef: 'grant:test',
  principalId: principal.principalId,
  ownerId: principal.ownerId,
  applicationRef: principal.applicationRef,
  credentialId: principal.credentialId,
  environment: principal.environment,
  generation: 1,
  policyDigest: 'sha256:test-policy',
  expiresAt: Number.MAX_SAFE_INTEGER,
  lifecycle: 'active',
  operationAccess: 'all_admitted',
}

export function fixture(runtimeEnvironment: AgentAccessPrincipal['environment'] = 'sandbox') {
  const evidence = buildDevelopmentPublishedOperationEvidence()
  const operation = runtimeEnvironment === 'sandbox'
    ? evidence.operation
    : materializePublishedOperation({
        ...evidence.sourceMaterial,
        publication: {
          ...evidence.sourceMaterial.publication,
          runtimeEnvironment,
        },
      })
  const operationWithCurrentReadiness = {
    ...operation,
    readiness: {
      ...operation.readiness,
      validUntil: Date.now() + 60_000,
    },
  }
  const operationRef = createPublicOperationRef({
    operationId: operationWithCurrentReadiness.operationId,
    publicationRef: operationWithCurrentReadiness.identity.publicationRef,
    publicationRevision: operationWithCurrentReadiness.identity.publicationRevision,
    contractRef: operationWithCurrentReadiness.contract.ref,
  })
  return {
    operation: operationWithCurrentReadiness,
    operationRef,
    descriptor: materializeRuntimePublishedOperation(operationWithCurrentReadiness),
  }
}

export type RuntimeOverrides = Partial<Omit<OperationInvokeRuntime, 'currentOperation'>> & {
  currentOperation?: NonNullable<OperationInvokeRuntime['currentOperation']>
  withoutCurrentOperation?: boolean
}

export function runtime(
  overrides: RuntimeOverrides = {},
  runtimeEnvironment: AgentAccessPrincipal['environment'] = 'sandbox',
): OperationInvokeRuntime {
  const { operation, operationRef, descriptor } = fixture(runtimeEnvironment)
  const base: OperationInvokeRuntime = {
    policy: {
      readGrant: async () => ({ kind: 'granted', grant }),
      evaluateAuthority: async ({ operationRef: requestedOperationRef, descriptor: currentDescriptor }) => ({
        kind: 'needs_authority',
        authorityRequest: {
          kind: 'approve_each',
          operationRef: requestedOperationRef,
          consequence: currentDescriptor.consequenceClass,
          retryClass: currentDescriptor.retryClass,
          dataFields: currentDescriptor.materialInputPointers,
        },
      }),
    },
    idempotency: {
      reserve: async (input) => ({ kind: 'reserved', reservation: input }),
      abandon: async () => ({ kind: 'abandoned' as const }),
    },
    currentOperation: async () => ({ operation, operationRef, descriptor }),
    createAdapter: async () => {
      throw new Error('adapter_not_reached_in_preflight_test')
    },
    sourceCommands: {
      leaseOwner: (_host, invocationRef) => `operation-invoke:${invocationRef}`,
      reconciliationEvidence: () => undefined,
    },
  }
  const { withoutCurrentOperation, ...overrideValues } = overrides
  const merged: OperationInvokeRuntime = { ...base, ...overrideValues }
  if (withoutCurrentOperation !== true) return merged
  const { currentOperation: _currentOperation, ...runtimeWithoutCurrentOperation } = merged
  return runtimeWithoutCurrentOperation
}

export function outerDispatch(operationRef: string): Parameters<typeof projectOuterResult>[1] {
  return {
    invocationRef: 'operation-invocation:test',
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    credentialId: principal.credentialId,
    applicationRef: principal.applicationRef,
    environment: principal.environment,
    state: 'pending',
    operationRef,
    idempotencyKey: 'idem:test',
    inputDigest: 'sha256:test-input',
    requestDigest: 'sha256:test-request',
    grantGeneration: 1,
    policyDigest: grant.policyDigest,
    grantExpiresAt: grant.expiresAt,
    grantRef: grant.grantRef,
    operationJson: '{}',
    inputJson: '{}',
  }
}

export function canonicalProjectionSnapshot(operationRef: string, operationId: string, contractVersion: number) {
  const invocationRef = 'operation-invocation:test'
  const attemptRef = `operation-attempt:${invocationRef}:1`
  const recordedAt = '2026-08-09T00:00:00.000Z'
  const leaseExpiresAt = '2026-08-09T00:01:00.000Z'
  const actor = { callerRef: principal.credentialId, principalRef: principal.principalId }
  return {
    control: {
      invocationRef,
      invocationVersion: 1,
      sourceRef: `operation-invocation-source:${invocationRef}`,
      control: {
        invocationRef,
        invocationVersion: 1,
        origin: { kind: 'standalone' as const, ...actor },
        owner: actor,
        action: { id: operationId, contractVersion: String(contractVersion) },
        desired: { state: 'invoke' as const },
        authority: { reference: 'authority:test', expiresAt: leaseExpiresAt },
        acceptedAuthority: { kind: 'approve_each' as const, authorityRef: 'authority:test' },
        freshness: { state: 'current' as const, observedAt: recordedAt },
        control: {
          state: 'leased' as const,
          attemptRef,
          effectGeneration: 1,
          leaseOwner: 'operation-worker:test',
          leaseExpiresAt,
          release: 'not_started' as const,
        },
      },
      currentAttemptRef: attemptRef,
      currentEffectGeneration: 1,
      updatedAt: recordedAt,
    },
    attempt: {
      invocationRef,
      attemptRef,
      attemptNumber: 1,
      actor,
      effectGeneration: 1,
      lease: { owner: 'operation-worker:test', expiresAt: leaseExpiresAt },
      idempotency: {
        operationKey: operationRef,
        materialInputDigest: 'sha256:test-input',
        effectIdentity: 'sha256:test-effect',
      },
      release: { state: 'not_released' as const },
      outcome: { state: 'running' as const },
      recordedAt,
    },
  }
}

export function validOutput() {
  return {
    data: {
      BTC: {
        symbol: 'BTC',
        quote: {
          USD: {
            price: 1,
            last_updated: '2026-08-09T00:00:00.000Z',
          },
        },
      },
    },
  }
}
