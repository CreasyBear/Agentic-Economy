import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../src/modules/common/stable-hash'
import {
  createJitProviderConsequenceBoundary,
  providerConsequenceInvocationDigest,
  type CanonicalProviderConsequenceTicket,
  type ProviderConsequenceJournal,
} from '../../src/modules/capability-execution/invocation-worker/jitProviderConsequence'
import type {
  RouteTransportFetch,
  RouteTransportInvocation,
  RouteTransportObservation,
} from '../../src/modules/capability-supply/route-transport-runtime'
import {
  secretGeneration,
  secretRef,
  type InfisicalVaultConfiguration,
  type SecretPointer,
  type SecretPointerStore,
} from '../../src/modules/secrets/public'

import {
  collectProductionEvidence,
  type ProductionEvidenceRequest,
  type ProductionEvidenceSinkCollectors,
} from '../../src/modules/authority/recovery/public'
import {
  accountRef,
  principalRef,
} from '../../src/modules/principal-account/public'
import type { MeasuredProtectedSurfaceInventory } from '../../src/lib/server/authority-boundary/protected-surface-manifest'

const { getVercelOidcToken } = vi.hoisted(() => ({ getVercelOidcToken: vi.fn() }))
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken }))

const CONTRACT = '.planning/maturity-execution/contracts/phase-2-protected-surfaces.json'
const RUNTIME_TEST_REGISTRY = '.planning/maturity-execution/contracts/phase-2-authority-sink-runtime-tests.json'
const NOW = 2_000_000_000_000
const SECRET_REF = secretRef(`sec_${'1'.repeat(32)}`)
const SECRET_GENERATION = secretGeneration(`sgn_${'1'.repeat(32)}`)
const CONNECTION_REF = `con_${'2'.repeat(32)}`
const ACCOUNT = accountRef('acc_00000000000040008000000000000061')
const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000062')
const actors = Object.freeze({
  owner: principalRef('prn_00000000000040008000000000000061'),
  member: principalRef('prn_00000000000040008000000000000062'),
  stranger: principalRef('prn_00000000000040008000000000000063'),
  workload: principalRef('prn_00000000000040008000000000000064'),
})

function text(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

type ProviderInvocation = Extract<
  RouteTransportInvocation,
  Readonly<{ binding: Readonly<{ authority: Readonly<{ kind: 'provider_connection' }> }> }>
>

function providerInvocation(): ProviderInvocation {
  const config = {
    method: 'POST' as const,
    requestTimeoutMs: 5_000,
    credential: { kind: 'bearer' as const },
  }
  return Object.freeze({
    binding: Object.freeze({
      adapterId: 'http-json:v1' as const,
      endpointUrl: 'https://provider.example/run',
      authority: Object.freeze({
        kind: 'provider_connection' as const,
        connectionRef: 'connection:production-evidence',
        providerRef: 'provider:production-evidence',
      }),
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    }),
    authority: Object.freeze({
      attemptRef: 'operation-attempt:production-evidence:1',
      effectGeneration: 1,
      operationKeyDigest: canonicalDigest({ operation: 'production-evidence' }),
      mandateDigest: canonicalDigest({ mandate: 'production-evidence' }),
      grantDigest: canonicalDigest({ grant: 'production-evidence' }),
      capabilityContractDigest: canonicalDigest({ contract: 'production-evidence' }),
      maximumSpend: Object.freeze({ currency: 'USD', units: '0', exponent: 2 }),
      expiresAt: NOW + 30_000,
      callIdentity: Object.freeze({
        keyId: 'route-calls:production-evidence',
        signature: 'hmac-sha256:production-evidence',
      }),
      authorityGeneration: 4,
      authorityDigest: canonicalDigest({ connection: 'production-evidence', generation: 4 }),
      canonicalConnectionRef: CONNECTION_REF,
      leaseRef: 'lease:production-evidence',
      invocationRef: 'invocation:production-evidence',
      operationRef: 'operation:production-evidence',
      grantedScopes: Object.freeze(['provider:invoke']),
      grantedResources: Object.freeze(['operation:production-evidence']),
      readinessValidUntil: NOW + 20_000,
      readinessDigest: canonicalDigest({ readiness: 'production-evidence' }),
    }),
    inputJson: JSON.stringify({ destination: 'PER' }),
  })
}

function requestDigest(invocation: RouteTransportInvocation): string {
  return canonicalDigest({
    adapterId: invocation.binding.adapterId,
    endpointUrl: invocation.binding.endpointUrl,
    configDigest: invocation.binding.configDigest,
    attemptRef: invocation.authority.attemptRef,
    operationKeyDigest: invocation.authority.operationKeyDigest,
    mandateDigest: invocation.authority.mandateDigest,
    grantDigest: invocation.authority.grantDigest,
    capabilityContractDigest: invocation.authority.capabilityContractDigest,
    inputJson: invocation.inputJson,
  } as StableHashValue)
}

function providerTicket(invocation: ProviderInvocation): CanonicalProviderConsequenceTicket {
  const invocationDigest = providerConsequenceInvocationDigest(invocation)
  if (invocationDigest === undefined) throw new Error('production_evidence_invocation_invalid')
  return Object.freeze({
    version: 'provider-consequence:v1',
    ticketRef: 'provider-effect-ticket:production-evidence',
    effectRef: 'connection-effect:production-evidence',
    requestDigest: requestDigest(invocation),
    invocationDigest,
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 10_000,
    invocationRef: invocation.authority.invocationRef!,
    operationRef: invocation.authority.operationRef!,
    leaseRef: invocation.authority.leaseRef!,
    canonicalLeaseRef: 'lease:canonical:production-evidence',
    canonicalConnectionRef: CONNECTION_REF,
    canonicalConnectionGeneration: invocation.authority.authorityGeneration,
    providerRef: invocation.binding.authority.providerRef,
    adapterId: invocation.binding.adapterId,
    authorityDigest: invocation.authority.authorityDigest,
    grantedScopes: invocation.authority.grantedScopes!,
    grantedResources: invocation.authority.grantedResources!,
    readinessValidUntil: invocation.authority.readinessValidUntil!,
    ...(invocation.authority.readinessDigest === undefined
      ? {}
      : { readinessDigest: invocation.authority.readinessDigest }),
    owningAccountRef: ACCOUNT,
    activeAccountRef: ACCOUNT,
    actorPrincipalRef: actors.workload,
    grantRef: 'grant:production-evidence',
    grantGeneration: 1,
    secret: Object.freeze({
      secretRef: SECRET_REF,
      activeGeneration: SECRET_GENERATION,
      pointerRevision: 7,
    }),
  })
}

function vault(scope: 'platform' | 'customer'): InfisicalVaultConfiguration {
  return Object.freeze({
    scope,
    baseUrl: 'https://app.infisical.com',
    projectId: `project-${scope}`,
    environment: 'production',
    secretPath: `/agentic-economy/${scope}`,
    machineIdentityId: `identity-${scope}`,
  })
}

function pointerStore(pointer: SecretPointer): SecretPointerStore {
  return Object.freeze({
    getActive: async () => pointer,
    advanceActive: async () => { throw new Error('pointer_advance_forbidden') },
  })
}

function oidcJwt(): string {
  const seconds = NOW / 1_000
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'production-evidence' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iat: seconds - 60, nbf: seconds - 60, exp: seconds + 3_540 })).toString('base64url'),
    Buffer.from('signature').toString('base64url'),
  ].join('.')
}

type JitEvidenceCapture = Readonly<{
  collectors: ProductionEvidenceSinkCollectors
  observation: RouteTransportObservation
  outboundAuthorization: string
  artifacts: readonly string[]
}>

async function captureJitEvidence(canaryText: string): Promise<JitEvidenceCapture> {
  getVercelOidcToken.mockReset()
  getVercelOidcToken.mockResolvedValue(oidcJwt())
  const invocation = providerInvocation()
  const ticket = providerTicket(invocation)
  const journalRows: unknown[] = []
  const auditEvents: unknown[] = []
  const capturedLogs: unknown[] = []
  const capturedErrors: unknown[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((...args) => { capturedLogs.push(args) })
  const error = vi.spyOn(console, 'error').mockImplementation((...args) => { capturedErrors.push(args) })
  const journal: ProviderConsequenceJournal = {
    begin: async (input) => {
      const row = Object.freeze({ operation: 'begin', input })
      journalRows.push(row)
      auditEvents.push(Object.freeze({ event: 'provider_consequence_claimed', input }))
      return { kind: 'claimed', claimRef: 'claim:production-evidence' }
    },
    complete: async (input) => {
      const row = Object.freeze({ operation: 'complete', input })
      journalRows.push(row)
      auditEvents.push(Object.freeze({ event: 'provider_consequence_completed', input }))
    },
    abortBeforeRelease: async (input) => {
      journalRows.push(Object.freeze({ operation: 'abort', input }))
      auditEvents.push(Object.freeze({ event: 'provider_consequence_aborted', input }))
    },
  }
  const pointer = Object.freeze({
    secretRef: SECRET_REF,
    activeGeneration: SECRET_GENERATION,
    revision: 7,
  })
  const vaultFetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/v1/auth/oidc-auth/login') {
      return Response.json({
        accessToken: 'vault-access-token', tokenType: 'Bearer', expiresIn: 600, accessTokenMaxTTL: 600,
      })
    }
    if (url.pathname.startsWith('/api/v4/secrets/')) {
      return Response.json({
        secret: {
          secretKey: `${SECRET_REF}--${SECRET_GENERATION}`,
          secretValue: canaryText,
          environment: 'production',
          workspace: 'project-customer',
        },
      })
    }
    throw new Error(`unexpected_vault_request:${url.pathname}`)
  })
  let outboundAuthorization = ''
  const send: RouteTransportFetch = vi.fn(async (_target, init) => {
    outboundAuthorization = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '')
    return Response.json({ serviceReference: 'service:production-evidence' })
  })
  const boundary = createJitProviderConsequenceBoundary({
    verifyTicket: async (opaque) => opaque === 'opaque-ticket:production-evidence' ? ticket : undefined,
    journal,
    secretRuntime: {
      configuration: { platform: vault('platform'), customer: vault('customer') },
      platform: { pointerStore: pointerStore(pointer), generationProbe: { validate: async () => undefined } },
      customer: { pointerStore: pointerStore(pointer), generationProbe: { validate: async () => undefined } },
      fetch: vaultFetch,
      now: () => NOW,
    },
    send,
    now: () => NOW,
  })
  let observation: RouteTransportObservation
  try {
    observation = await boundary.execute({ ticket: 'opaque-ticket:production-evidence', invocation })
  } finally {
    log.mockRestore()
    error.mockRestore()
  }
  const environmentArtifact = JSON.stringify({
    variableNames: Object.keys(process.env).sort(),
    oidcTokenIssued: getVercelOidcToken.mock.calls.length === 1,
  })
  const artifacts = Object.freeze([
    JSON.stringify(journalRows),
    JSON.stringify(capturedLogs),
    JSON.stringify(capturedErrors),
    JSON.stringify(auditEvents),
    environmentArtifact,
    JSON.stringify({ ticket, observation }),
  ])
  const collectors: ProductionEvidenceSinkCollectors = Object.freeze({
    convex_row: async () => ({ sourceRef: 'jit-execution:journal-rows', textFragments: [artifacts[0]!] }),
    log: async () => ({ sourceRef: 'jit-execution:console-log-capture', textFragments: [artifacts[1]!] }),
    error: async () => ({ sourceRef: 'jit-execution:console-error-capture', textFragments: [artifacts[2]!] }),
    audit: async () => ({ sourceRef: 'jit-execution:journal-audit-events', textFragments: [artifacts[3]!] }),
    environment: async () => ({ sourceRef: 'jit-execution:environment-name-snapshot', textFragments: [artifacts[4]!] }),
    snapshot: async () => ({ sourceRef: 'jit-execution:ticket-and-result-snapshot', textFragments: [artifacts[5]!] }),
  })
  return Object.freeze({ collectors, observation, outboundAuthorization, artifacts })
}

function expectJitEvidenceIsSafe(jit: JitEvidenceCapture, canaryText: string): void {
  const canary = new TextEncoder().encode(canaryText)
  expect(jit.observation).toMatchObject({ disposition: 'succeeded', releaseStarted: true })
  expect(jit.outboundAuthorization).toBe(`Bearer ${canaryText}`)
  const canaryRepresentations = [
    canaryText,
    Buffer.from(canary).toString('hex'),
    Buffer.from(canary).toString('base64'),
    Buffer.from(canary).toString('base64url'),
  ]
  for (const artifact of jit.artifacts) {
    for (const representation of canaryRepresentations) expect(artifact).not.toContain(representation)
  }
}

describe('Phase 2 exact production evidence composition', () => {
  it('captures an actual JIT provider consequence without leaking its secret into durable sinks', async () => {
    const canaryText = 'ae-secret-canary-production-proof'
    const jit = await captureJitEvidence(canaryText)

    expectJitEvidenceIsSafe(jit, canaryText)
  })

  it('drives every measured candidate identity through seven canonical cases and six runtime-captured sinks', async () => {
    const inventorySource = text(CONTRACT)
    const measuredInventory = JSON.parse(inventorySource) as MeasuredProtectedSurfaceInventory
    const runtimeHandlerTests = JSON.parse(text(RUNTIME_TEST_REGISTRY)) as ProductionEvidenceRequest['runtimeHandlerTests']
    const measuredInventorySha256 = createHash('sha256').update(inventorySource).digest('hex')
    const candidateSurfaceCount = measuredInventory.serverFunctions.length
      + measuredInventory.publicConvex.length
      + measuredInventory.convexHttpActions.length
      + measuredInventory.convexHttpRoutes.length
      + measuredInventory.crons.length
      + measuredInventory.backgroundFamilies.length
    const canaryText = 'ae-secret-canary-production-proof'
    const canary = new TextEncoder().encode(canaryText)
    const jit = await captureJitEvidence(canaryText)
    const proof = await collectProductionEvidence({
      measuredInventory,
      resolveSurface: async (row) => Object.freeze({
        surfaceRef: row.ref,
        owningAccountRef: ACCOUNT,
        resourceRef: `phase2-evidence:${row.sha256}`,
      }),
      actors,
      wrongAccountRef: OTHER_ACCOUNT,
      currentGeneration: 1,
      measuredInventorySha256,
      runtimeHandlerTests,
      canary,
      sinkCollectors: jit.collectors,
    })

    expect(proof.baselineSurfaceCount).toBe(195)
    expect(proof.baselineCounts).toEqual(measuredInventory.expectedCounts)
    expect(proof.candidateCounts).toEqual(measuredInventory.actualCounts)
    expect(proof.measuredSurfaceCount).toBe(candidateSurfaceCount)
    expect(proof.measuredSurfaceRefs).toHaveLength(candidateSurfaceCount)
    expect(new Set(proof.measuredSurfaceRefs).size).toBe(candidateSurfaceCount)
    expect(proof.expectedDecisionMatrix).toMatchObject({
      surfaceCount: candidateSurfaceCount,
      caseCount: candidateSurfaceCount * 7,
    })
    expect(proof.expectedDecisionMatrix.rows).toHaveLength(candidateSurfaceCount * 7)
    expect(new Set(proof.expectedDecisionMatrix.rows.map(({ surfaceRef }) => surfaceRef)).size)
      .toBe(candidateSurfaceCount)
    const protectedRows = proof.expectedDecisionMatrix.rows
      .filter(({ protection }) => protection === 'protected')
    expect(protectedRows.filter(({ caseKind, decision }) =>
      ['missing_workload', 'stranger', 'wrong_account', 'stale_generation'].includes(caseKind)
      && decision.kind === 'denied')).toHaveLength(protectedRows.length * 4 / 7)
    expect(protectedRows.some(({ caseKind, decision }) =>
      caseKind === 'missing_workload' && decision.kind === 'allowed')).toBe(false)
    const consequentialRows = [
      ...measuredInventory.serverFunctions,
      ...measuredInventory.publicConvex,
      ...measuredInventory.convexHttpActions,
      ...measuredInventory.convexHttpRoutes,
      ...measuredInventory.crons,
      ...measuredInventory.backgroundFamilies,
    ].filter((row) => row.consequential)
    expect(proof.runtimeHandlerTestIndex).toMatchObject({
      kind: 'generated_full_suite_test_index',
      inventorySha256: measuredInventorySha256,
      sinkCount: new Set(consequentialRows.map((row) => row.authoritySink)).size,
    })
    expect(proof.runtimeHandlerTestIndex.testRefs)
      .toHaveLength(proof.runtimeHandlerTestIndex.sinkCount)
    expectJitEvidenceIsSafe(jit, canaryText)
    expect(proof.sinkSourceRefs).toEqual([
      'jit-execution:journal-rows',
      'jit-execution:console-log-capture',
      'jit-execution:console-error-capture',
      'jit-execution:journal-audit-events',
      'jit-execution:environment-name-snapshot',
      'jit-execution:ticket-and-result-snapshot',
    ])
    expect(proof.canary.checkedSinks).toEqual([
      'convex_row', 'log', 'error', 'audit', 'environment', 'snapshot',
    ])
  })
})
