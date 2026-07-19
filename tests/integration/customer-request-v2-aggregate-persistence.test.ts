import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  defineCapabilityContract, openCapabilityDecisionModel,
  type CapabilityInputKey, type PointedSchemaIdentity,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { projectStoredAggregate } from '@/modules/customer-request/application/route-plan-projection'
import { compileCustomerRequest, writableCustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import { evaluateCustomerRequestSnapshot } from '@/modules/customer-request/evaluation'
import {
  createCustomerRequestRoutePlanGeneration,
  type CustomerRequestRoutePlanGeneration,
  writableCustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'
import type { CustomerRequestSemanticProposal } from '@/modules/customer-request/semantic-interpreter'
import { setCapabilitySupplyEligibility } from '../../convex/capabilitySupply'
import historicalV2Fixture from '../fixtures/customer-request/v2-pre-reference-aggregate.json'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('atomic V2 Customer Request aggregate persistence', () => {
  it('replays a frozen pre-reference V2 record without changing its aggregate, projection, or authority meaning', async () => {
    const backend = convexTest(schema, modules)
    const fixture = structuredClone(historicalV2Fixture)
    const frozenAggregate = fixture.revision.aggregate
    const { aggregateDigest: _aggregateDigest, ...aggregateMaterial } = frozenAggregate
    const customerProjection = projectStoredAggregate(
      frozenAggregate as Parameters<typeof projectStoredAggregate>[0],
      fixture.command.resultingRouteGenerationRef,
    )

    expect(fixture.sourceRevision).toBe('d15f3b4b23cca4444535e982591f4b7c3983c144')
    expect(canonicalDigest(aggregateMaterial as StableHashValue)).toBe(frozenAggregate.aggregateDigest)
    expect(frozenAggregate.aggregateDigest).toBe(fixture.head.currentAggregateDigest)
    expect(frozenAggregate.aggregateDigest).toBe(fixture.command.aggregateDigest)
    expect(frozenAggregate.plan.authority).toBe('proposal_only')
    expect(customerProjection).toMatchObject({
      requestRef: fixture.head.requestId,
      revision: fixture.head.currentRevision,
      state: 'ready_to_compare',
      summary: frozenAggregate.snapshot.intent,
      nextAction: 'prepare_options',
      routeGenerationRef: fixture.command.resultingRouteGenerationRef,
    })
    expect(frozenAggregate).not.toHaveProperty('completedTaskReferences')
    expect(frozenAggregate).not.toHaveProperty('importedCommitmentReferences')

    await backend.run(async (ctx) => {
      await ctx.db.insert('customerRequestV2Revisions', fixture.revision as never)
      await ctx.db.insert('customerRequestV2Heads', fixture.head as never)
      await ctx.db.insert('customerRequestV2RoutePlanGenerations', fixture.routeGeneration as never)
      await ctx.db.insert('customerRequestV2RoutePlanHeads', fixture.routeHead as never)
      await ctx.db.insert('customerRequestV2Commands', fixture.command as never)
    })

    const current = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: fixture.head.requestId,
    })
    expect(current).toEqual({
      kind: 'current',
      aggregate: frozenAggregate,
      routeGenerationNumber: fixture.routeHead.currentGeneration,
      routeGenerationRef: fixture.command.resultingRouteGenerationRef,
    })
    if (current.kind !== 'current') throw new Error('historical current readback missing')
    expect(projectStoredAggregate(
      current.aggregate,
      current.routeGenerationRef,
    )).toEqual(customerProjection)
    expect(current.aggregate).not.toHaveProperty('completedTaskReferences')
    expect(current.aggregate).not.toHaveProperty('importedCommitmentReferences')

    const replayInput = {
      commandKey: fixture.command.commandKey,
      commandDigest: fixture.command.commandDigest,
      principalId: fixture.command.principalId,
      requestId: fixture.command.requestId,
    }
    const exactReplay = {
      kind: 'replayed',
      aggregate: frozenAggregate,
      noEffect: false,
      routeGenerationRef: fixture.command.resultingRouteGenerationRef,
    }
    await expect(backend.query(internal.customerRequestV2.getCommandReplay, replayInput))
      .resolves.toEqual(exactReplay)
    await expect(backend.query(internal.customerRequestV2.getCommandReplay, replayInput))
      .resolves.toEqual(exactReplay)
    await expect(backend.query(internal.customerRequestV2.getCommandReplay, {
      ...replayInput,
      commandDigest: canonicalDigest({ changed: true }),
    })).resolves.toEqual({ kind: 'conflict' })

    const persisted = await backend.run(async (ctx) => {
      const revision = await ctx.db.query('customerRequestV2Revisions').first()
      const head = await ctx.db.query('customerRequestV2Heads').first()
      const command = await ctx.db.query('customerRequestV2Commands').first()
      if (revision === null || head === null || command === null) throw new Error('historical rows missing')
      return { revision: revision.aggregate, head, command }
    })
    expect(persisted.revision).toEqual(frozenAggregate)
    expect(persisted.revision).not.toHaveProperty('completedTaskReferences')
    expect(persisted.revision).not.toHaveProperty('importedCommitmentReferences')
    expect(persisted.head.currentAggregateDigest).toBe(frozenAggregate.aggregateDigest)
    expect(persisted.command).toMatchObject(fixture.command)
  })

  it('reserves one inspectable Request shell before interpretation and rejects key or identity drift', async () => {
    const backend = convexTest(schema, modules)
    const command = {
      commandKey: 'principal:one:submit:request:shell:command:one',
      commandDigest: canonicalDigest({ request: 'Coordinate an accessible office relocation.' }),
      principalId: 'principal:one',
      delegatedAgentId: 'agent:one',
      requestId: 'request:shell',
      intent: 'Coordinate an accessible office relocation.',
      networkId: 'ae:public',
      createdAt: 1_700_000_000_000,
    }

    await expect(backend.mutation(internal.customerRequestV2.reserveSubmission, command))
      .resolves.toEqual({ kind: 'stored', requestId: 'request:shell' })
    await expect(backend.mutation(internal.customerRequestV2.reserveSubmission, command))
      .resolves.toEqual({ kind: 'replayed', requestId: 'request:shell' })
    await expect(backend.query(internal.customerRequestV2.getSubmissionShell, {
      requestId: 'request:shell',
      principalId: 'principal:one',
    })).resolves.toMatchObject({
      kind: 'found',
      shell: {
        requestId: 'request:shell',
        principalId: 'principal:one',
        delegatedAgentId: 'agent:one',
        intent: 'Coordinate an accessible office relocation.',
        networkId: 'ae:public',
      },
    })
    await expect(backend.mutation(internal.customerRequestV2.reserveSubmission, {
      ...command,
      commandDigest: canonicalDigest({ request: 'Changed payload.' }),
    })).resolves.toEqual({ kind: 'command_conflict' })
    await expect(backend.mutation(internal.customerRequestV2.reserveSubmission, {
      ...command,
      commandKey: 'principal:two:submit:request:shell:command:two',
      commandDigest: canonicalDigest({ request: 'A different caller.' }),
      principalId: 'principal:two',
      delegatedAgentId: 'agent:two',
    })).resolves.toEqual({ kind: 'identity_conflict' })
    await expect(backend.query(internal.customerRequestV2.getSubmissionShell, {
      requestId: 'request:shell',
      principalId: 'principal:two',
    })).resolves.toEqual({ kind: 'not_found' })
  })

  it('commits snapshot, evaluation, exact plan authority and idempotency receipt together', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const command = {
      commandKey: 'command:v2:submit', commandDigest: 'sha256:' + 'a'.repeat(64),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate, routeGeneration,
    }

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, command))
      .resolves.toEqual({ kind: 'stored', requestId: 'request:v2:persist', revision: 1 })
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, command))
      .resolves.toEqual({ kind: 'replayed', requestId: 'request:v2:persist', revision: 1 })

    const current = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: 'request:v2:persist',
    })
    expect(current).toMatchObject({
      kind: 'current',
      aggregate: {
        aggregateVersion: 2,
        snapshot: { revision: 1 },
        plan: {
          actions: [{ contractRef: aggregate.plan.actions[0]?.contractRef }],
          completionRequirements: [{
            contractRef: aggregate.plan.actions[0]?.contractRef,
            evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion',
          }],
        },
      },
    })
    const persisted = await backend.run(async (ctx) => ({
      heads: await ctx.db.query('customerRequestV2Heads').collect(),
      revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
      commands: await ctx.db.query('customerRequestV2Commands').collect(),
    }))
    expect(persisted).toMatchObject({ heads: [{}], revisions: [{}], commands: [{}] })
  })

  it('admits a conservative route snapshot when the same publication readiness is extended before commit', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const candidate = aggregate.evaluation.candidates.find(({ publicationRef }) => publicationRef !== undefined)
    const compiledReadiness = candidate?.readinessValidUntil
    if (candidate?.publicationRef === undefined || candidate.publicationRevision === undefined
      || compiledReadiness === undefined) throw new Error('compiled publication readiness missing')
    const publication = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', candidate.publicationRef!)
            .eq('revision', candidate.publicationRevision!)
        )).unique()
    ))
    if (publication === null || publication.bindingId !== candidate.bindingId
      || publication.offeringId !== candidate.offeringId) {
      throw new Error('exact sandbox candidate publication missing')
    }
    const extended = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef,
      expectedRevision: publication.revision,
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: compiledReadiness + 60_000,
      operationKey: 'test:extend-readiness-before-commit',
      correlationId: 'test:extend-readiness-before-commit',
      reasonCode: 'test_extend_readiness',
      evidenceRefs: ['test:extended-readiness'],
    })
    expect(extended).toMatchObject({
      kind: 'observed',
      publicationRef: publication.publicationRef,
      revision: publication.revision,
    })

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:extended-readiness',
      commandDigest: canonicalDigest({ command: 'extended-readiness' }),
      expectedRevision: 0,
      expectedRouteGeneration: 0,
      aggregate,
      routeGeneration,
    })).resolves.toEqual({
      kind: 'stored',
      requestId: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
    })
    const current = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: aggregate.snapshot.requestId,
    })
    expect(current).toMatchObject({
      kind: 'current',
      routeGenerationRef: routeGeneration.generationRef,
    })
    if (current.kind !== 'current') throw new Error('stored aggregate missing')
    expect(current.aggregate.evaluation.candidates.find(({ publicationRef }) => (
      publicationRef === publication.publicationRef
    ))?.readinessValidUntil).toBe(compiledReadiness)
  })

  it('rejects a route snapshot when publication readiness shortens before commit', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const candidate = aggregate.evaluation.candidates.find(({ publicationRef }) => publicationRef !== undefined)
    const compiledReadiness = candidate?.readinessValidUntil
    if (candidate?.publicationRef === undefined || candidate.publicationRevision === undefined
      || compiledReadiness === undefined) throw new Error('compiled publication readiness missing')
    const publication = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', candidate.publicationRef!)
            .eq('revision', candidate.publicationRevision!)
        )).unique()
    ))
    if (publication === null || publication.bindingId !== candidate.bindingId
      || publication.offeringId !== candidate.offeringId) {
      throw new Error('exact sandbox candidate publication missing')
    }
    const shortened = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef,
      expectedRevision: publication.revision,
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: compiledReadiness - 60_000,
      operationKey: 'test:shorten-readiness-before-commit',
      correlationId: 'test:shorten-readiness-before-commit',
      reasonCode: 'test_shorten_readiness',
      evidenceRefs: ['test:shortened-readiness'],
    })
    expect(shortened).toMatchObject({ kind: 'observed' })

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:shortened-readiness',
      commandDigest: canonicalDigest({ command: 'shortened-readiness' }),
      expectedRevision: 0,
      expectedRouteGeneration: 0,
      aggregate,
      routeGeneration,
    })).resolves.toEqual({ kind: 'aggregate_invalid' })
  })

  it('replays a pre-#172 detached generation while refusing the same cancellation omission as a new write', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const command = {
      commandKey: 'command:v2:historical-cancellation-replay',
      commandDigest: canonicalDigest({ command: 'historical-cancellation-replay' }),
      expectedRevision: 0,
      expectedRouteGeneration: 0,
      aggregate,
      routeGeneration,
    }
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, command))
      .resolves.toMatchObject({ kind: 'stored' })
    const historicalGeneration = preCancellationRouteGeneration(routeGeneration)
    const historicalWritable = writableCustomerRequestRoutePlanGeneration(historicalGeneration)
    await backend.run(async (ctx) => {
      const stored = await ctx.db.query('customerRequestV2RoutePlanGenerations').first()
      const storedCommand = await ctx.db.query('customerRequestV2Commands').first()
      const head = await ctx.db.query('customerRequestV2RoutePlanHeads').first()
      if (stored === null || storedCommand === null || head === null) {
        throw new Error('historical route generation fixture missing')
      }
      await ctx.db.replace(stored._id, {
        requestId: stored.requestId,
        generation: historicalGeneration.generation,
        generationRef: historicalGeneration.generationRef,
        generationDigest: historicalGeneration.generationDigest,
        requestRevision: stored.requestRevision,
        routeGeneration: historicalWritable,
        recordedAt: stored.recordedAt,
      })
      await ctx.db.patch(storedCommand._id, {
        resultingRouteGenerationRef: historicalGeneration.generationRef,
      })
      await ctx.db.patch(head._id, {
        currentGenerationRef: historicalGeneration.generationRef,
        currentGenerationDigest: historicalGeneration.generationDigest,
      })
    })
    const historicalCommand = { ...command, routeGeneration: historicalWritable }
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, historicalCommand))
      .resolves.toEqual({ kind: 'replayed', requestId: aggregate.snapshot.requestId, revision: 1 })
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      ...historicalCommand,
      commandKey: 'command:v2:historical-cancellation-new-write',
      commandDigest: canonicalDigest({ command: 'historical-cancellation-new-write' }),
    })).resolves.toEqual({ kind: 'aggregate_invalid' })
  })

  it('converges identical route material and durably replays the refresh command without history churn', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    await backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:refresh-base', commandDigest: canonicalDigest({ command: 'refresh-base' }),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate, routeGeneration,
    })
    const candidate = await compileRefreshCandidate(backend, aggregate, 1, {
      kind: 'capability_candidates', selections: [sandboxSelection(aggregate)],
    }, Date.now())
    if (candidate.routeGeneration === undefined) throw new Error('identical candidate generation missing')
    expect(candidate.routeGeneration.createdAt).not.toBe(routeGeneration.createdAt)
    const refresh = {
      commandKey: 'command:v2:refresh-identical',
      commandDigest: canonicalDigest({ command: 'refresh-identical' }),
      principalId: aggregate.snapshot.principalId,
      requestId: aggregate.snapshot.requestId,
      expectedRequestRevision: aggregate.snapshot.revision,
      expectedGeneration: routeGeneration.generation,
      expectedGenerationRef: routeGeneration.generationRef,
      candidateAggregate: candidate.aggregate,
      candidateRouteGeneration: candidate.routeGeneration,
    }

    await expect(backend.mutation(internal.customerRequestV2.refreshRoutePlanGeneration, refresh))
      .resolves.toMatchObject({ kind: 'unchanged', routeGeneration: { generation: 1 } })
    await expect(backend.mutation(internal.customerRequestV2.refreshRoutePlanGeneration, refresh))
      .resolves.toMatchObject({ kind: 'unchanged', routeGeneration: { generation: 1 } })
    await expect(backend.query(internal.customerRequestV2.getRoutePlanGenerationRefreshReplay, {
      commandKey: refresh.commandKey, commandDigest: refresh.commandDigest,
      principalId: refresh.principalId, requestId: refresh.requestId,
    })).resolves.toMatchObject({ kind: 'unchanged', routeGeneration: { generation: 1 } })
    await expect(backend.query(internal.customerRequestV2.getRoutePlanGenerationRefreshReplay, {
      commandKey: refresh.commandKey, commandDigest: canonicalDigest({ command: 'changed' }),
      principalId: refresh.principalId, requestId: refresh.requestId,
    })).resolves.toEqual({ kind: 'command_conflict' })
    const persisted = await backend.run(async (ctx) => ({
      generations: await ctx.db.query('customerRequestV2RoutePlanGenerations').collect(),
      generationCommands: await ctx.db.query('customerRequestV2RoutePlanGenerationCommands').collect(),
      routeHead: await ctx.db.query('customerRequestV2RoutePlanHeads').unique(),
    }))
    expect(persisted.generations).toHaveLength(1)
    expect(persisted.generationCommands).toHaveLength(1)
    expect(persisted.routeHead).toMatchObject({
      currentGeneration: 1, currentGenerationRef: routeGeneration.generationRef,
    })
  })

  it('atomically supersedes changed liveness material and rejects a concurrent stale head', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    await backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:liveness-base', commandDigest: canonicalDigest({ command: 'liveness-base' }),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate, routeGeneration,
    })
    const publication = await backend.run(async (ctx) => await ctx.db.query('capabilityPublications').first())
    if (publication === null) throw new Error('liveness refresh publication missing')
    const now = Date.now()
    const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef, expectedRevision: publication.revision,
      credentialState: 'ready', healthState: 'healthy', validUntil: now + 900_000,
      operationKey: 'test:refresh-liveness', correlationId: 'test:refresh-liveness',
      reasonCode: 'test_refresh_liveness', evidenceRefs: ['test:refresh-liveness'],
    })
    if (observed.kind !== 'observed') throw new Error(`liveness observation failed: ${observed.reason}`)
    const candidate = await compileRefreshCandidate(backend, aggregate, 1, {
      kind: 'capability_candidates', selections: [sandboxSelection(aggregate)],
    }, now)
    if (candidate.routeGeneration === undefined) throw new Error('liveness candidate generation missing')
    expect(candidate.routeGeneration.routes[0]?.expiresAt).not.toBe(routeGeneration.routes[0]?.expiresAt)
    const refresh = {
      commandKey: 'command:v2:liveness-refresh', commandDigest: canonicalDigest({ command: 'liveness-refresh' }),
      principalId: aggregate.snapshot.principalId, requestId: aggregate.snapshot.requestId,
      expectedRequestRevision: 1, expectedGeneration: 1, expectedGenerationRef: routeGeneration.generationRef,
      candidateAggregate: candidate.aggregate, candidateRouteGeneration: candidate.routeGeneration,
    }
    await expect(backend.mutation(internal.customerRequestV2.refreshRoutePlanGeneration, refresh))
      .resolves.toMatchObject({ kind: 'superseded', routeGeneration: { generation: 2, requestRevision: 1 } })
    await expect(backend.mutation(internal.customerRequestV2.refreshRoutePlanGeneration, {
      ...refresh,
      commandKey: 'command:v2:liveness-concurrent',
      commandDigest: canonicalDigest({ command: 'liveness-concurrent' }),
    })).resolves.toEqual({ kind: 'route_generation_conflict' })
    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: aggregate.snapshot.requestId,
    })).resolves.toMatchObject({
      kind: 'current', aggregate: { snapshot: { revision: 1 } },
      routeGenerationNumber: 2, routeGenerationRef: candidate.routeGeneration.generationRef,
    })
    const persisted = await backend.run(async (ctx) => ({
      revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
      generations: await ctx.db.query('customerRequestV2RoutePlanGenerations').collect(),
      generationCommands: await ctx.db.query('customerRequestV2RoutePlanGenerationCommands').collect(),
    }))
    expect(persisted.revisions).toHaveLength(1)
    expect(persisted.generations).toHaveLength(2)
    expect(persisted.generationCommands).toHaveLength(1)
  })

  it('makes needs-information and unsupported refresh outcomes the resumable current decision', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    await backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:typed-refresh-base', commandDigest: canonicalDigest({ command: 'typed-refresh-base' }),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate, routeGeneration,
    })
    const needsInformation = await compileRefreshCandidate(backend, aggregate, 1, {
      kind: 'needs_intent_direction', prompt: 'What result should the businesses produce?',
    }, Date.now())
    const needsCommand = {
      commandKey: 'command:v2:refresh-needs-information',
      commandDigest: canonicalDigest({ command: 'refresh-needs-information' }),
      principalId: aggregate.snapshot.principalId, requestId: aggregate.snapshot.requestId,
      expectedRequestRevision: 1, expectedGeneration: 1, expectedGenerationRef: routeGeneration.generationRef,
      candidateAggregate: needsInformation.aggregate,
    }
    await expect(backend.mutation(internal.customerRequestV2.refreshRoutePlanGeneration, needsCommand))
      .resolves.toMatchObject({ kind: 'needs_information', aggregate: { outcome: 'needs_information' } })
    await expect(backend.query(internal.customerRequestV2.getRoutePlanGenerationRefreshReplay, {
      commandKey: needsCommand.commandKey, commandDigest: needsCommand.commandDigest,
      principalId: needsCommand.principalId, requestId: needsCommand.requestId,
    })).resolves.toMatchObject({ kind: 'needs_information', aggregate: { outcome: 'needs_information' } })
    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: aggregate.snapshot.requestId,
    })).resolves.toMatchObject({
      kind: 'current', aggregate: { outcome: 'needs_information' },
      currentDecisionCommandKey: needsCommand.commandKey,
    })

    const unsupported = await compileRefreshCandidate(backend, aggregate, 1, {
      kind: 'capability_candidates', selections: [],
    }, Date.now() + 1)
    const unsupportedCommand = {
      commandKey: 'command:v2:refresh-unsupported',
      commandDigest: canonicalDigest({ command: 'refresh-unsupported' }),
      principalId: aggregate.snapshot.principalId, requestId: aggregate.snapshot.requestId,
      expectedRequestRevision: 1, expectedGeneration: 1, expectedGenerationRef: routeGeneration.generationRef,
      expectedDecisionCommandKey: needsCommand.commandKey,
      candidateAggregate: unsupported.aggregate,
    }
    const { expectedDecisionCommandKey: _currentDecision, ...staleUnsupportedCommand } = unsupportedCommand
    await expect(backend.mutation(internal.customerRequestV2.refreshRoutePlanGeneration, {
      ...staleUnsupportedCommand,
      commandKey: 'command:v2:refresh-unsupported-stale-decision',
      commandDigest: canonicalDigest({ command: 'refresh-unsupported-stale-decision' }),
    })).resolves.toEqual({ kind: 'route_generation_conflict' })
    await expect(backend.mutation(internal.customerRequestV2.refreshRoutePlanGeneration, unsupportedCommand))
      .resolves.toMatchObject({ kind: 'unsupported', aggregate: { outcome: 'unsupported' } })
    await expect(backend.query(internal.customerRequestV2.getRoutePlanGenerationRefreshReplay, {
      commandKey: unsupportedCommand.commandKey, commandDigest: unsupportedCommand.commandDigest,
      principalId: unsupportedCommand.principalId, requestId: unsupportedCommand.requestId,
    })).resolves.toMatchObject({ kind: 'unsupported', aggregate: { outcome: 'unsupported' } })
    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: aggregate.snapshot.requestId,
    })).resolves.toMatchObject({
      kind: 'current', aggregate: { outcome: 'unsupported' },
      currentDecisionCommandKey: unsupportedCommand.commandKey,
    })
    const persisted = await backend.run(async (ctx) => ({
      generations: await ctx.db.query('customerRequestV2RoutePlanGenerations').collect(),
      generationCommands: await ctx.db.query('customerRequestV2RoutePlanGenerationCommands').collect(),
      routeHead: await ctx.db.query('customerRequestV2RoutePlanHeads').unique(),
    }))
    expect(persisted.generations).toHaveLength(1)
    expect(persisted.generationCommands).toHaveLength(2)
    expect(persisted.routeHead).toMatchObject({
      currentGeneration: 1,
      currentGenerationRef: routeGeneration.generationRef,
      currentDecisionCommandKey: unsupportedCommand.commandKey,
    })
  })

  it('writes no refresh history when registered supply changes between compilation and commit', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    await backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:refresh-stale-base', commandDigest: canonicalDigest({ command: 'refresh-stale-base' }),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate, routeGeneration,
    })
    const candidate = await compileRefreshCandidate(backend, aggregate, 1, {
      kind: 'capability_candidates', selections: [sandboxSelection(aggregate)],
    }, Date.now())
    if (candidate.routeGeneration === undefined) throw new Error('stale candidate generation missing')
    await revokeFirstSupply(backend)
    await expect(backend.mutation(internal.customerRequestV2.refreshRoutePlanGeneration, {
      commandKey: 'command:v2:refresh-stale', commandDigest: canonicalDigest({ command: 'refresh-stale' }),
      principalId: aggregate.snapshot.principalId, requestId: aggregate.snapshot.requestId,
      expectedRequestRevision: 1, expectedGeneration: 1, expectedGenerationRef: routeGeneration.generationRef,
      candidateAggregate: candidate.aggregate, candidateRouteGeneration: candidate.routeGeneration,
    })).resolves.toEqual({ kind: 'context_stale' })
    const persisted = await backend.run(async (ctx) => ({
      generations: await ctx.db.query('customerRequestV2RoutePlanGenerations').collect(),
      generationCommands: await ctx.db.query('customerRequestV2RoutePlanGenerationCommands').collect(),
      routeHead: await ctx.db.query('customerRequestV2RoutePlanHeads').unique(),
    }))
    expect(persisted.generations).toHaveLength(1)
    expect(persisted.generationCommands).toHaveLength(0)
    expect(persisted.routeHead).toMatchObject({ currentGeneration: 1, currentGenerationRef: routeGeneration.generationRef })
  })

  it('writes nothing on revision, identity, or idempotency conflict', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const first = {
      commandKey: 'command:v2:submit', commandDigest: 'sha256:' + 'a'.repeat(64),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate, routeGeneration,
    }
    await backend.mutation(internal.customerRequestV2.commitAggregate, first)

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      ...first, commandDigest: 'sha256:' + 'b'.repeat(64),
    })).resolves.toEqual({ kind: 'command_conflict' })
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      ...first, commandKey: 'command:v2:stale', commandDigest: 'sha256:' + 'c'.repeat(64),
    })).resolves.toEqual({ kind: 'revision_conflict' })

    const persisted = await backend.run(async (ctx) => ({
      revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
      commands: await ctx.db.query('customerRequestV2Commands').collect(),
    }))
    expect(persisted.revisions).toHaveLength(1)
    expect(persisted.commands).toHaveLength(1)
  })

  it('fails replay when its immutable route generation is missing', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const command = {
      commandKey: 'command:v2:generation-replay', commandDigest: 'sha256:' + '2'.repeat(64),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate, routeGeneration,
    }
    await backend.mutation(internal.customerRequestV2.commitAggregate, command)
    await backend.run(async (ctx) => {
      const generation = await ctx.db.query('customerRequestV2RoutePlanGenerations').first()
      if (generation === null) throw new Error('generation fixture missing')
      await ctx.db.delete(generation._id)
    })
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, command))
      .rejects.toThrow('customer_request_v2_command_generation_integrity_failure')
    await expect(backend.query(internal.customerRequestV2.getCommandReplay, {
      commandKey: command.commandKey,
      commandDigest: command.commandDigest,
      principalId: aggregate.snapshot.principalId,
      requestId: aggregate.snapshot.requestId,
    })).rejects.toThrow('customer_request_v2_command_generation_integrity_failure')
  })

  it('fails current readback when a plan-ready aggregate has no generation head', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    await backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:missing-route-head', commandDigest: 'sha256:' + '3'.repeat(64),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate, routeGeneration,
    })
    await backend.run(async (ctx) => {
      const head = await ctx.db.query('customerRequestV2RoutePlanHeads').first()
      if (head === null) throw new Error('route head fixture missing')
      await ctx.db.delete(head._id)
    })
    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: aggregate.snapshot.requestId,
    })).rejects.toThrow('customer_request_route_plan_head_integrity_failure')
  })

  it('writes nothing when the registered capability graph changes before commit', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    await revokeFirstSupply(backend)

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:stale-graph', commandDigest: 'sha256:' + 'd'.repeat(64),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate, routeGeneration,
    })).resolves.toEqual({ kind: 'context_stale' })
    await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
  })

  it('writes nothing when a caller recomputes the digest over forged semantic authority', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const forged = structuredClone(aggregate)
    forged.outcome = 'unsupported'
    const { aggregateDigest: _discarded, ...forgedMaterial } = forged
    forged.aggregateDigest = canonicalDigest(forgedMaterial)

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:forged', commandDigest: 'sha256:' + 'e'.repeat(64),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate: forged, routeGeneration,
    })).resolves.toEqual({ kind: 'aggregate_invalid' })
    await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
  })

  it('refuses incomplete data, effect, and evidence declarations before generation persistence', async () => {
    for (const declaration of ['dataUse', 'effects', 'evidence'] as const) {
      const backend = convexTest(schema, modules)
      const { aggregate, routeGeneration } = await compiledAggregate(backend)
      const incomplete = structuredClone(routeGeneration)
      const step = incomplete.routes[0]?.steps[0]
      if (step === undefined) throw new Error('route declaration test step missing')
      step[declaration] = []
      await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
        commandKey: `command:v2:incomplete:${declaration}`,
        commandDigest: canonicalDigest({ declaration }),
        expectedRevision: 0,
        expectedRouteGeneration: 0,
        aggregate,
        routeGeneration: incomplete,
      })).resolves.toEqual({ kind: 'aggregate_invalid' })
      await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
      await expect(backend.query(internal.customerRequestV2.getCurrentRoutePlanGeneration, {
        requestId: aggregate.snapshot.requestId,
      })).resolves.toEqual({ kind: 'not_found' })
    }
  })

  it('reopens registered contracts and rejects a fully re-digested invented composition edge', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const forged = structuredClone(aggregate)
    const action = forged.plan.actions[0]
    if (action === undefined) throw new Error('test action missing')
    action.dependsOn = ['action:invented-upstream']
    action.inputMappings = [{
      mappingId: 'mapping:invented',
      semanticIdentity: 'ae.invented:v1',
      source: { actionId: 'action:invented-upstream', annotationId: 'invented', evidenceId: 'invented', outputPointer: '/invented' },
      target: { annotationId: 'invented', inputKey: 'ae_input:invented' as CapabilityInputKey, inputPointer: '/invented' },
      schemaIdentity: ('sha256:' + '6'.repeat(64)) as PointedSchemaIdentity,
      authority: 'registered_contract_semantics',
    }]
    const {
      planRevisionId: _oldPlanRevisionId, planDigest: _oldPlanDigest, createdAt: _oldCreatedAt,
      ...planMaterial
    } = forged.plan
    forged.plan.planDigest = canonicalDigest(planMaterial)
    forged.plan.planRevisionId = `plan:${forged.plan.planDigest}`
    const { aggregateDigest: _oldAggregateDigest, ...aggregateMaterial } = forged
    forged.aggregateDigest = canonicalDigest(aggregateMaterial)

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:invented-mapping', commandDigest: 'sha256:' + '7'.repeat(64),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate: forged, routeGeneration,
    })).resolves.toEqual({ kind: 'aggregate_invalid' })
    await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
  })

  it('reopens the exact contract and rejects invented completion evidence even when every caller digest is recomputed', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const forged = structuredClone(aggregate)
    for (const requirement of forged.evaluation.completionRequirements) requirement.evidenceId = 'invented_evidence'
    for (const requirement of forged.plan.completionRequirements) requirement.evidenceId = 'invented_evidence'
    const { evaluationDigest: _oldEvaluationDigest, ...evaluationMaterial } = forged.evaluation
    forged.evaluation.evaluationDigest = canonicalDigest({ ...evaluationMaterial, intent: forged.snapshot.intent })
    const {
      planRevisionId: _oldPlanRevisionId,
      planDigest: _oldPlanDigest,
      createdAt: _oldCreatedAt,
      ...planMaterial
    } = forged.plan
    forged.plan.planDigest = canonicalDigest(planMaterial)
    forged.plan.planRevisionId = `plan:${forged.plan.planDigest}`
    const { aggregateDigest: _oldAggregateDigest, ...aggregateMaterial } = forged
    forged.aggregateDigest = canonicalDigest(aggregateMaterial)

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:invented-evidence', commandDigest: 'sha256:' + 'f'.repeat(64),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate: forged, routeGeneration,
    })).resolves.toEqual({ kind: 'aggregate_invalid' })
    await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
  })

  it('rejects a fully re-digested aggregate whose structured input violates the exact contract schema', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const facts = aggregate.snapshot.facts.map((fact) => ({ ...fact, value: 42 }))
    const actions = aggregate.plan.actions.map((action) => ({ ...action, inputs: facts }))
    const evaluation = evaluateCustomerRequestSnapshot({
      requestId: aggregate.snapshot.requestId,
      requestRevision: aggregate.snapshot.revision,
      intent: aggregate.snapshot.intent,
      facts,
      registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
      candidates: aggregate.evaluation.candidates.map((candidate) => ({
        businessId: candidate.businessId, offeringId: candidate.offeringId, bindingId: candidate.bindingId,
        model, offeringRegistrationHash: candidate.offeringRegistrationHash,
        bindingRegistrationHash: candidate.bindingRegistrationHash,
        cancellation: candidate.cancellation,
      })),
      proposedActions: actions,
      resolveModel: () => model,
    })
    const snapshotMaterial = {
      requestId: aggregate.snapshot.requestId, revision: aggregate.snapshot.revision,
      principalId: aggregate.snapshot.principalId, delegatedAgentId: aggregate.snapshot.delegatedAgentId,
      intent: aggregate.snapshot.intent, networkId: aggregate.snapshot.networkId, facts,
    }
    const snapshot = { ...aggregate.snapshot, facts, snapshotDigest: canonicalDigest(snapshotMaterial) }
    const proposalDigest = canonicalDigest({
      interpreterId: aggregate.plan.interpreterId,
      selected: actions.map(({ selectionKey, contractRef }) => ({ selectionKey, contractRef })),
      facts,
    })
    const planMaterial = {
      requestId: aggregate.plan.requestId, requestRevision: aggregate.plan.requestRevision,
      proposedByAgentId: aggregate.plan.proposedByAgentId, interpreterId: aggregate.plan.interpreterId,
      proposalDigest, registrySnapshotDigest: aggregate.plan.registrySnapshotDigest,
      actions, completionRequirements: evaluation.completionRequirements,
    }
    const planDigest = canonicalDigest(planMaterial)
    const plan = {
      ...aggregate.plan, ...planMaterial, planDigest, planRevisionId: `plan:${planDigest}`,
    }
    const aggregateMaterial = {
      aggregateVersion: 2 as const, snapshot, evaluation, plan, outcome: 'plan_ready' as const,
    }
    const forged = writableCustomerRequestV2Aggregate({
      ...aggregateMaterial, aggregateDigest: canonicalDigest(aggregateMaterial),
    })

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:wrong-type', commandDigest: 'sha256:' + '9'.repeat(64),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate: forged, routeGeneration,
    })).resolves.toEqual({ kind: 'aggregate_invalid' })
    await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
  })

  it('returns typed resubmission for historical nonterminal work without converting it', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('customerRequestHeads', {
        requestId: 'request:v1:historical', principalId: 'principal:v1', delegatedAgentId: 'agent:v1',
        currentRevision: 1, createdAt: 1, updatedAt: 1,
      })
    })

    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: 'request:v1:historical',
    })).resolves.toEqual({
      kind: 'needs_attention', requestId: 'request:v1:historical',
      reason: 'historical_request_resubmit_required', resumable: false,
    })
    await expect(backend.mutation(internal.customerRequestV2Preparation.prepare, {
      commandKey: 'prepare:v1:historical', commandDigest: 'sha256:' + '8'.repeat(64),
      principalId: 'principal:v1', requestId: 'request:v1:historical', expectedRevision: 1,
      actionId: 'action:v1:historical', now: 2,
    })).resolves.toEqual({
      kind: 'needs_attention', reason: 'historical_request_resubmit_required',
    })
    const persisted = await backend.run(async (ctx) => ({
      historicalHeads: await ctx.db.query('customerRequestHeads').collect(),
      heads: await ctx.db.query('customerRequestV2Heads').collect(),
      revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
      commands: await ctx.db.query('customerRequestV2Commands').collect(),
      preparations: await ctx.db.query('customerRequestV2ActionPreparations').collect(),
      preparationCommands: await ctx.db.query('customerRequestV2PreparationCommands').collect(),
    }))
    expect(persisted).toEqual({
      historicalHeads: [expect.objectContaining({
        requestId: 'request:v1:historical', principalId: 'principal:v1',
        delegatedAgentId: 'agent:v1', currentRevision: 1, createdAt: 1, updatedAt: 1,
      })],
      heads: [], revisions: [], commands: [], preparations: [], preparationCommands: [],
    })
  })

  it('retains an exact embedded-route revision as immutable history and requires resubmission', async () => {
    const backend = convexTest(schema, modules)
    const { aggregate, routeGeneration } = await compiledAggregate(backend)
    const { planRevisionId: _planRevisionId, planDigest: _planDigest, createdAt, ...planMaterial } = aggregate.plan
    const legacyRoutes = routeGeneration.routes.map((route) => ({
      ...route,
      steps: route.steps.map(({ resolvedInputs: _resolvedInputs, deferredInputs: _deferredInputs, ...step }) => step),
    }))
    const legacyPlanMaterial = { ...planMaterial, routes: legacyRoutes }
    const planDigest = canonicalDigest(legacyPlanMaterial)
    const legacyPlan = { planRevisionId: `plan:${planDigest}`, ...legacyPlanMaterial, planDigest, createdAt }
    const { aggregateDigest: _aggregateDigest, ...aggregateMaterial } = aggregate
    const legacyAggregateMaterial = { ...aggregateMaterial, plan: legacyPlan }
    const legacyAggregate = { ...legacyAggregateMaterial, aggregateDigest: canonicalDigest(legacyAggregateMaterial) }
    await backend.run(async (ctx) => {
      await ctx.db.insert('customerRequestV2Revisions', {
        requestId: aggregate.snapshot.requestId,
        requestRevision: aggregate.snapshot.revision,
        aggregate: legacyAggregate,
      })
      await ctx.db.insert('customerRequestV2Heads', {
        requestId: aggregate.snapshot.requestId,
        principalId: aggregate.snapshot.principalId,
        delegatedAgentId: aggregate.snapshot.delegatedAgentId,
        currentRevision: aggregate.snapshot.revision,
        currentAggregateDigest: legacyAggregate.aggregateDigest,
        createdAt: aggregate.snapshot.recordedAt,
        updatedAt: aggregate.snapshot.recordedAt,
      })
      await ctx.db.insert('customerRequestV2Commands', {
        commandKey: 'command:v2:legacy-replay',
        commandDigest: 'sha256:' + '4'.repeat(64),
        principalId: aggregate.snapshot.principalId,
        requestId: aggregate.snapshot.requestId,
        expectedRevision: 0,
        resultingRevision: aggregate.snapshot.revision,
        aggregateDigest: legacyAggregate.aggregateDigest,
        committedAt: aggregate.snapshot.recordedAt,
      })
    })
    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: aggregate.snapshot.requestId,
    })).resolves.toEqual({
      kind: 'needs_attention', requestId: aggregate.snapshot.requestId,
      reason: 'historical_request_resubmit_required', resumable: false,
    })
    const persisted = await backend.run(async (ctx) => (
      await ctx.db.query('customerRequestV2Revisions').first()
    ))
    expect(persisted?.aggregate).toEqual(legacyAggregate)
    expect(persisted?.aggregate.plan).toHaveProperty('routes')
    await expect(backend.query(internal.customerRequestV2.getCommandReplay, {
      commandKey: 'command:v2:legacy-replay',
      commandDigest: 'sha256:' + '4'.repeat(64),
      principalId: aggregate.snapshot.principalId,
      requestId: aggregate.snapshot.requestId,
    })).resolves.toEqual({
      kind: 'needs_attention', requestId: aggregate.snapshot.requestId,
      reason: 'historical_request_resubmit_required', resumable: false,
    })
    await backend.run(async (ctx) => {
      const revision = await ctx.db.query('customerRequestV2Revisions').first()
      if (revision === null || !('routes' in revision.aggregate.plan)) throw new Error('legacy revision missing')
      await ctx.db.patch(revision._id, {
        aggregate: {
          ...revision.aggregate,
          plan: { ...revision.aggregate.plan, proposalDigest: 'sha256:' + '5'.repeat(64) },
        },
      })
    })
    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: aggregate.snapshot.requestId,
    })).rejects.toThrow('customer_request_v2_legacy_aggregate_integrity_failure')
  })
})

async function compiledAggregate(backend: ReturnType<typeof convexTest>) {
  await backend.mutation(internal.devSeed.seedDevCatalog, {})
  await admitSandboxSupply(backend)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await backend.finishInProgressScheduledFunctions()
  await observeSandboxPublication(backend)
  const supply = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 64 })
  if (supply.kind !== 'available') throw new Error(`eligible supply unavailable: ${supply.reason}`)
  const contract = defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
  const model = openCapabilityDecisionModel(contract)
  const input = model.inputs[0]
  if (input === undefined) throw new Error('test input missing')
  const fact = {
    contractRef: model.contractRef, selectionKey: model.selectionKey,
    inputKey: input.key, inputPointer: input.inputPointer, schemaIdentity: input.schemaIdentity,
    value: 'Find a match', source: { kind: 'customer' as const, assertionRef: 'assertion:test' },
  }
  const result = compileCustomerRequest({
    requestId: 'request:v2:persist', expectedRevision: 0,
    principalId: 'principal:v2', delegatedAgentId: 'agent:v2', intent: 'Find a match', networkId: 'ae:public',
    proposal: {
      kind: 'capability_candidates',
      selections: [{ selectionKey: model.selectionKey, contractRef: model.contractRef, facts: [fact] }],
    },
    interpreterId: 'interpreter:test',
    bindings: supply.supplies.map(({ offering, binding, publication }) => ({
      businessId: String(offering.businessId), offeringId: offering.offeringId, bindingId: binding.bindingId,
      contractRef: {
        capabilityId: binding.capabilityId,
        version: binding.version,
        contractDigest: binding.contractDigest,
      },
      offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
      price: offering.presentation.price,
      commercialRelationship: offering.presentation.commercialRelationship,
      cancellation: binding.cancellation,
      ...(publication === undefined ? {} : {
        publicationRef: publication.publicationRef, publicationRevision: publication.revision,
        readinessValidUntil: publication.readinessValidUntil,
      }),
    })),
    models: [model], now: 1_000,
  })
  if (result.kind !== 'compiled') throw new Error(`compile failed: ${result.reason}`)
  if (result.routeGeneration === undefined) throw new Error('route generation missing')
  return {
    aggregate: writableCustomerRequestV2Aggregate(result.aggregate),
    routeGeneration: writableCustomerRequestRoutePlanGeneration(result.routeGeneration),
  }
}

function sandboxSelection(
  aggregate: Awaited<ReturnType<typeof compiledAggregate>>['aggregate'],
): Extract<CustomerRequestSemanticProposal, { kind: 'capability_candidates' }>['selections'][number] {
  const action = aggregate.plan.actions[0]
  if (action === undefined) throw new Error('sandbox action missing')
  return { selectionKey: action.selectionKey, contractRef: action.contractRef, facts: [] }
}

async function compileRefreshCandidate(
  backend: ReturnType<typeof convexTest>,
  aggregate: Awaited<ReturnType<typeof compiledAggregate>>['aggregate'],
  expectedGeneration: number,
  proposal: CustomerRequestSemanticProposal,
  now: number,
) {
  const supply = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 64 })
  if (supply.kind !== 'available') throw new Error(`refresh supply unavailable: ${supply.reason}`)
  const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
  const result = compileCustomerRequest({
    requestId: aggregate.snapshot.requestId,
    expectedRevision: aggregate.snapshot.revision - 1,
    expectedRouteGeneration: expectedGeneration,
    principalId: aggregate.snapshot.principalId,
    delegatedAgentId: aggregate.snapshot.delegatedAgentId,
    intent: aggregate.snapshot.intent,
    networkId: aggregate.snapshot.networkId,
    priorFacts: aggregate.snapshot.facts,
    proposal,
    interpreterId: 'interpreter:refresh-test',
    bindings: supply.supplies.map(({ offering, binding, publication }) => ({
      businessId: String(offering.businessId), offeringId: offering.offeringId, bindingId: binding.bindingId,
      contractRef: { capabilityId: binding.capabilityId, version: binding.version, contractDigest: binding.contractDigest },
      offeringRegistrationHash: offering.registrationHash, bindingRegistrationHash: binding.registrationHash,
      price: offering.presentation.price,
      commercialRelationship: offering.presentation.commercialRelationship,
      cancellation: binding.cancellation,
      ...(publication === undefined ? {} : {
        publicationRef: publication.publicationRef, publicationRevision: publication.revision,
        readinessValidUntil: publication.readinessValidUntil,
      }),
    })),
    models: [model], now,
  })
  if (result.kind !== 'compiled') throw new Error(`refresh compile failed: ${result.reason}`)
  return {
    aggregate: writableCustomerRequestV2Aggregate(result.aggregate),
    ...(result.routeGeneration === undefined ? {} : {
      routeGeneration: writableCustomerRequestRoutePlanGeneration(result.routeGeneration),
    }),
  }
}

function preCancellationRouteGeneration(
  generation: CustomerRequestRoutePlanGeneration,
): CustomerRequestRoutePlanGeneration {
  const decisionSnapshot = generation.decisionSnapshot
  if (decisionSnapshot === undefined) throw new Error('decision snapshot fixture missing')
  const historical = writableCustomerRequestRoutePlanGeneration(generation)
  for (const route of historical.routes) {
    for (const step of route.steps) Reflect.deleteProperty(step, 'cancellation')
  }
  const routeIdByCurrentId = new Map<string, string>()
  for (const route of historical.routes) {
    const { routeDigest: _routeDigest, ...routeMaterial } = route
    const {
      routePlanId: currentRoutePlanId,
      fallbacks: _fallbacks,
      comparison,
      ...routeCoreWithoutComparison
    } = routeMaterial
    const { ordering: _ordering, ...baseComparison } = comparison
    routeIdByCurrentId.set(currentRoutePlanId, `route:${canonicalDigest({
      ...routeCoreWithoutComparison,
      comparison: baseComparison,
    } as StableHashValue)}`)
  }
  for (const route of historical.routes) {
    const currentRoutePlanId = route.routePlanId
    route.routePlanId = routeIdByCurrentId.get(currentRoutePlanId) ?? currentRoutePlanId
    for (const alternative of route.fallbacks.alternatives) {
      alternative.alternativeRouteRef = routeIdByCurrentId.get(alternative.alternativeRouteRef)
        ?? alternative.alternativeRouteRef
    }
    const { routeDigest: _routeDigest, ...routeMaterial } = route
    route.routeDigest = canonicalDigest(routeMaterial as StableHashValue)
  }
  return createCustomerRequestRoutePlanGeneration({
    generation: historical.generation,
    requestId: historical.requestId,
    requestRevision: historical.requestRevision,
    compiler: historical.compiler,
    registrySnapshotDigest: historical.registrySnapshotDigest,
    decisionSnapshot,
    routes: historical.routes,
    createdAt: historical.createdAt,
  })
}

async function admitSandboxSupply(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    const offerings = await ctx.db.query('capabilityOfferings').collect()
    const bindings = await ctx.db.query('capabilityTransportBindings').collect()
    for (const binding of bindings) {
      const offering = offerings.find((candidate) => candidate.offeringId === binding.offeringId)
      if (offering === undefined) throw new Error('sandbox offering missing')
      const result = await setCapabilitySupplyEligibility(ctx.db, {
        offeringId: offering.offeringId, bindingId: binding.bindingId,
        contractRef: { capabilityId: binding.capabilityId, version: binding.version, contractDigest: binding.contractDigest },
        decision: 'admit', expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:business-reviewed'], conformanceEvidenceRefs: ['test:adapter-reviewed'],
      }, 2_000)
      if (result.kind !== 'eligible') throw new Error(`sandbox admission failed: ${result.reason}`)
    }
  })
}

async function observeSandboxPublication(backend: ReturnType<typeof convexTest>) {
  const publication = await backend.run(async (ctx) => await ctx.db.query('capabilityPublications').first())
  if (publication === null) throw new Error('sandbox publication missing')
  const now = Date.now()
  const result = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: publication.publicationRef, expectedRevision: publication.revision,
    credentialState: 'ready', healthState: 'healthy', validUntil: now + 300_000,
    operationKey: 'test:observe-publication', correlationId: 'test:aggregate-persistence',
    reasonCode: 'test_readiness', evidenceRefs: ['test:readiness'],
  })
  if (result.kind !== 'observed') throw new Error(`sandbox readiness failed: ${result.reason}`)
}

async function revokeFirstSupply(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    const binding = await ctx.db.query('capabilityTransportBindings').first()
    if (binding === null) throw new Error('sandbox binding missing')
    const offering = (await ctx.db.query('capabilityOfferings').collect())
      .find((candidate) => candidate.offeringId === binding.offeringId) ?? null
    if (offering === null) throw new Error('sandbox offering missing')
    const result = await setCapabilitySupplyEligibility(ctx.db, {
      offeringId: offering.offeringId, bindingId: binding.bindingId,
      contractRef: { capabilityId: binding.capabilityId, version: binding.version, contractDigest: binding.contractDigest },
      decision: 'revoke', expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['test:revoked'], conformanceEvidenceRefs: ['test:revoked'],
    }, 3_000)
    if (result.kind !== 'ineligible') throw new Error(`sandbox revocation failed: ${result.reason}`)
  })
}

async function v2Rows(backend: ReturnType<typeof convexTest>) {
  return await backend.run(async (ctx) => ({
    heads: await ctx.db.query('customerRequestV2Heads').collect(),
    revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
    commands: await ctx.db.query('customerRequestV2Commands').collect(),
  }))
}
