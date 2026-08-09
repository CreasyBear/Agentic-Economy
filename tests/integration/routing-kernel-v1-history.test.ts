import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules, ownerAdmin } from '../helpers/convex-fixtures'

describe('V1 routing history readback', () => {
  it('requires source-owned admin readback authority and never mutates history', async () => {
    const backend = convexTest(schema, modules)
    await seedRepresentativeHistory(backend)
    const before = await historyRows(backend)

    await expect(backend.query(api.routingKernelV1History.read, {
      reference: { kind: 'binding', bindingId: 'binding:history' },
    })).resolves.toEqual({ kind: 'authorization_denied' })
    await expect(backend.withIdentity({
      subject: 'user_without_admin_membership', issuer: 'https://identity.example', tokenIdentifier: 'token_without_admin_membership',
    }).query(api.routingKernelV1History.read, {
      reference: { kind: 'binding', bindingId: 'binding:history' },
    })).resolves.toEqual({ kind: 'authorization_denied' })

    expect(await historyRows(backend)).toEqual(before)
  })

  it('returns bounded redacted metadata for exact binding, grant, preparation and run references', async () => {
    const backend = convexTest(schema, modules)
    await seedRepresentativeHistory(backend)
    const admin = await ownerAdmin(backend, 'user_history_admin')
    const before = await historyRows(backend)

    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'binding', bindingId: 'binding:history' },
    })).resolves.toEqual({
      kind: 'historical_v1',
      record: {
        kind: 'binding', bindingId: 'binding:history', businessId: expect.any(String),
        networkId: 'network:history', capabilityContractId: 'history.lookup', operation: 'lookup',
        admission: 'admitted', conformance: 'conformant', registeredAt: 10, updatedAt: 11,
      },
    })
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'grant', grantId: 'grant:history' },
    })).resolves.toEqual({
      kind: 'historical_v1',
      record: {
        kind: 'grant', grantId: 'grant:history', status: 'revoked',
        issuedAt: 20, updatedAt: 22, expiresAt: 30, revokedAt: 22,
      },
    })
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'preparation', preparationRequestId: 'preparation:history' },
    })).resolves.toEqual({
      kind: 'historical_v1',
      record: {
        kind: 'preparation', preparationRequestId: 'preparation:history', customerRequestId: 'request:history',
        generation: 1, capabilityContractId: 'history.lookup', capabilityContractVersion: '1',
        candidateSetDigest: 'sha256:candidate-set', createdAt: 30, candidateCount: 1,
      },
    })
    const run = await admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'run', rootRunId: 'run:history' },
    })
    expect(run).toEqual({
      kind: 'historical_v1',
      record: {
        kind: 'run', rootRunId: 'run:history', networkId: 'network:history', executionMode: 'live',
        state: 'completed', effectState: 'committed', updatedAt: 43, completedAt: 43,
        leaves: [{
          leafRunId: 'leaf:history', bindingId: 'binding:history', state: 'completed',
          attemptDisposition: 'dispatched', effectState: 'committed',
        }],
        protocol: [{ recordId: 'record:history', sequence: 1, type: 'root_run_completed', leafRunId: 'leaf:history', occurredAt: 43 }],
      },
    })
    expect(JSON.stringify(run)).not.toMatch(/endpoint\.history|SECRET_HISTORY|agent:history|principal:history|provider:secret|private-outcome/)
    expect(await historyRows(backend)).toEqual(before)
  })

  it('returns typed not-found and oversize refusals instead of scanning or truncating history', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_history_admin')
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'run', rootRunId: 'run:missing' },
    })).resolves.toEqual({ kind: 'not_found', referenceKind: 'run', ref: 'run:missing' })
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'binding', bindingId: ` ${'x'.repeat(250)}` },
    })).resolves.toEqual({ kind: 'not_found', referenceKind: 'binding', ref: 'invalid_reference' })

    await seedOversizeRun(backend)
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'run', rootRunId: 'run:oversize' },
    })).resolves.toEqual({
      kind: 'history_too_large', referenceKind: 'run', ref: 'run:oversize', maximumChildren: 100,
    })
    await seedOversizePreparation(backend)
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'preparation', preparationRequestId: 'preparation:oversize' },
    })).resolves.toEqual({
      kind: 'history_too_large', referenceKind: 'preparation', ref: 'preparation:oversize', maximumChildren: 100,
    })
    await seedOversizeProtocolRun(backend)
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'run', rootRunId: 'run:oversize-protocol' },
    })).resolves.toEqual({
      kind: 'history_too_large', referenceKind: 'run', ref: 'run:oversize-protocol', maximumChildren: 100,
    })
  })
})


async function seedRepresentativeHistory(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    const ownerId = await ctx.db.insert('owners', { clerkUserId: 'owner:history', createdAt: 1, updatedAt: 1 })
    const businessId = await ctx.db.insert('businesses', {
      ownerId, slug: 'history-business', name: 'History Business', normalizedName: 'history business',
      category: 'history', suburb: 'Perth', stateTerritory: 'WA', publicStatus: 'suppressed', trustTier: 'listed',
      claimStatus: 'suppressed', sourceHash: 'source:history', createdAt: 1, updatedAt: 1,
    })
    await ctx.db.insert('routingKernelBindings', {
      bindingId: 'binding:history', businessId, nodeId: 'node:history', networkId: 'network:history',
      capabilityContractId: 'history.lookup', operation: 'lookup', admission: 'admitted', conformance: 'conformant',
      admissionEvidenceRefs: ['evidence:history'], conformanceEvidenceRefs: ['evidence:history'], queryTerms: ['history'],
      endpointUrl: 'https://endpoint.history/private', credentialRef: 'env:SECRET_HISTORY', registrationHash: 'sha256:binding',
      registeredAt: 10, updatedAt: 11,
    })
    await ctx.db.insert('routingKernelAgentGrants', {
      grantId: 'grant:history', agentId: 'agent:history', principalId: 'principal:history', networkIds: ['network:history'],
      maximumSpend: { currency: 'AUD', units: '9999', exponent: 2 }, allowedDataFields: ['private-field'], expiresAt: 30,
      status: 'revoked', evidenceRefs: ['evidence:grant'], grantHash: 'sha256:grant', issuedAt: 20, updatedAt: 22, revokedAt: 22,
    })
    await ctx.db.insert('routingKernelPreparationCandidateSets', {
      preparationRequestId: 'preparation:history', customerRequestId: 'request:history', generation: 1,
      capabilityContractId: 'history.lookup', capabilityContractVersion: '1', createdAt: 30,
      candidateSetDigest: 'sha256:candidate-set',
    })
    await ctx.db.insert('routingKernelPreparationCandidates', {
      preparationRequestId: 'preparation:history', candidateSetDigest: 'sha256:candidate-set', position: 0,
      bindingId: 'binding:history', nodeId: 'node:history', businessId: String(businessId), recipientName: 'Private recipient',
      presentationEvidenceDigest: 'sha256:presentation', capabilityContractId: 'history.lookup', capabilityContractVersion: '1',
      registrationEnvironment: 'history', registrationHash: 'sha256:registration', registrationEvidenceDigest: 'sha256:evidence',
      incidentEpochDigest: 'sha256:incident-epoch', incidentEvidenceDigest: 'sha256:incident-evidence',
      coverageDisposition: 'option_received', protectedDataDisposition: 'released', providerContactDisposition: 'attempted',
      coverageReasonCode: 'history', coverageRecordedAt: 31,
    })
    await insertRun(ctx, 'run:history', 'completed', 43)
    await ctx.db.insert('routingKernelLeafRuns', {
      rootRunId: 'run:history', leafRunId: 'leaf:history', stepGrantId: 'step:history', bindingId: 'binding:history',
      nodeId: 'node:history', capabilityContractId: 'history.lookup', state: 'completed', attemptDisposition: 'dispatched',
      effectState: 'committed', enforcement: 'enforced', providerReference: 'provider:secret', outcome: { secret: 'private-outcome' },
    })
    await ctx.db.insert('routingKernelProtocolRecords', {
      incidentContract: 'legacy_quarantined', recordId: 'record:history', rootRunId: 'run:history', sequence: 1,
      type: 'root_run_completed', leafRunId: 'leaf:history', providerReference: 'provider:secret',
      disclosedDataFields: ['private-field'], occurredAt: 43,
    })
  })
}

async function seedOversizeRun(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    await insertRun(ctx, 'run:oversize', 'running', 50)
    for (let index = 0; index <= 100; index += 1) {
      await ctx.db.insert('routingKernelLeafRuns', {
        rootRunId: 'run:oversize', leafRunId: `leaf:oversize:${index}`, stepGrantId: `step:oversize:${index}`,
        bindingId: 'binding:oversize', nodeId: 'node:oversize', capabilityContractId: 'history.lookup',
        state: 'pending', attemptDisposition: 'not_released', effectState: 'not_started', enforcement: 'enforced',
      })
    }
  })
}

async function seedOversizePreparation(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('routingKernelPreparationCandidateSets', {
      preparationRequestId: 'preparation:oversize', customerRequestId: 'request:oversize', generation: 1,
      capabilityContractId: 'history.lookup', capabilityContractVersion: '1', createdAt: 60,
      candidateSetDigest: 'sha256:candidate-set-oversize',
    })
    for (let index = 0; index <= 100; index += 1) {
      await ctx.db.insert('routingKernelPreparationCandidates', {
        preparationRequestId: 'preparation:oversize', candidateSetDigest: 'sha256:candidate-set-oversize', position: index,
        bindingId: `binding:oversize:${index}`, nodeId: `node:oversize:${index}`, businessId: `business:oversize:${index}`,
        recipientName: `Recipient ${index}`, presentationEvidenceDigest: `sha256:presentation:${index}`,
        capabilityContractId: 'history.lookup', capabilityContractVersion: '1', registrationEnvironment: 'history',
        registrationHash: `sha256:registration:${index}`, registrationEvidenceDigest: `sha256:evidence:${index}`,
        incidentEpochDigest: `sha256:epoch:${index}`, incidentEvidenceDigest: `sha256:incident:${index}`,
        coverageDisposition: 'eligible_not_contacted', protectedDataDisposition: 'not_released',
        providerContactDisposition: 'none', coverageReasonCode: 'history', coverageRecordedAt: 60,
      })
    }
  })
}

async function seedOversizeProtocolRun(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    await insertRun(ctx, 'run:oversize-protocol', 'running', 70)
    for (let index = 0; index <= 100; index += 1) {
      await ctx.db.insert('routingKernelProtocolRecords', {
        incidentContract: 'legacy_quarantined', recordId: `record:oversize:${index}`,
        rootRunId: 'run:oversize-protocol', sequence: index, type: 'root_run_admitted', occurredAt: 70,
      })
    }
  })
}

async function insertRun(ctx: Parameters<Parameters<ReturnType<typeof convexTest>['run']>[0]>[0], rootRunId: string, state: 'running' | 'completed', updatedAt: number) {
  await ctx.db.insert('routingKernelRootRuns', {
    incidentContract: 'legacy_quarantined', costContract: 'attributed_v2', rootRunId,
    quoteId: `quote:${rootRunId}`, quoteDigest: `sha256:${rootRunId}`, networkId: 'network:history', executionMode: 'live',
    agentId: 'agent:history', principalId: 'principal:history', state, enforcement: 'enforced',
    effectState: state === 'completed' ? 'committed' : 'not_started',
    authorizedAmount: { currency: 'AUD', units: '1000', exponent: 2 },
    quotedMaximumAmount: { currency: 'AUD', units: '1000', exponent: 2 }, updatedAt,
    ...(state === 'completed' ? { completedAt: updatedAt } : {}),
  })
}

async function historyRows(backend: ReturnType<typeof convexTest>) {
  return await backend.run(async (ctx) => ({
    bindings: await ctx.db.query('routingKernelBindings').collect(),
    grants: await ctx.db.query('routingKernelAgentGrants').collect(),
    preparations: await ctx.db.query('routingKernelPreparationCandidateSets').collect(),
    candidates: await ctx.db.query('routingKernelPreparationCandidates').collect(),
    roots: await ctx.db.query('routingKernelRootRuns').collect(),
    leaves: await ctx.db.query('routingKernelLeafRuns').collect(),
    protocol: await ctx.db.query('routingKernelProtocolRecords').collect(),
  }))
}
