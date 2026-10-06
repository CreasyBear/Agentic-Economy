import { Response as UndiciResponse, type fetch as UndiciFetch } from 'undici'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import { readCommercialPolicyGate } from '../../../convex/moneyCommercialPolicy'
import { planCallChanged } from '../../../convex/lib/capabilityExecution/plans/callEventBridge'
import { convexTestWithMarketComponents, convexTestWithWorkers, preloadWorkflowComponentModules } from '../../helpers/convex-fixtures'
import { publishCurrentTool, seedAgent, seedCommercialPolicies, validCustodyEnvironment } from '../../helpers/quote-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const providerFetch = vi.hoisted(() => vi.fn<typeof UndiciFetch>())
vi.mock('undici', async (original) => ({ ...await original<Record<string, unknown>>(), fetch: providerFetch }))

beforeAll(preloadWorkflowComponentModules)
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
  vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'production')
  for (const [key, value] of Object.entries(validCustodyEnvironment)) vi.stubEnv(key, value)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); providerFetch.mockReset() })

async function fixture(workflow = false, approvalRequired = false) {
  const backend = workflow ? convexTestWithWorkers() : convexTestWithMarketComponents()
  const suffix = `plan-${crypto.randomUUID()}`
  const tool = await publishCurrentTool(backend, suffix, 'production', '0')
  await seedCommercialPolicies(backend, suffix, Date.now())
  const gate = await backend.run(ctx => readCommercialPolicyGate(ctx.db, { environment: 'production', now: Date.now() }))
  if (gate.kind !== 'admitted') throw new Error(JSON.stringify(gate))
  const agent = await seedAgent(backend, { canonicalAccountRef: tool.accountRef }, tool.toolRef, suffix, '20000000')
  const principal = { ...agent.principal, authorityMode: approvalRequired ? 'approval_required' as const : 'spending_policy' as const }
  if (approvalRequired) await backend.run(async ctx => {
    const grant = await ctx.db.query('agentAccessGrants').withIndex('by_grantRef', q => q.eq('grantRef', agent.grant.grantRef)).unique()
    const row = await ctx.db.query('agentAccessPrincipals').withIndex('by_principalId', q => q.eq('principalId', principal.principalId)).unique()
    if (grant === null || row === null) throw new Error('agent_fixture_missing')
    await ctx.db.patch(grant._id, { authorityMode: 'approval_required' })
    await ctx.db.patch(row._id, { authorityMode: 'approval_required' })
  })
  const input = { nodes: [
    { id: 'last', toolRef: tool.toolRef, input: { request: 'flow://middle/output#/result' }, dependsOn: ['middle'] },
    { id: 'first', toolRef: tool.toolRef, input: { request: 'Perth' }, dependsOn: [] },
    { id: 'middle', toolRef: tool.toolRef, input: { request: 'flow://first/output#/result' }, dependsOn: ['first'] },
  ] }
  const quote = async () => {
    const result = await backend.action(api.capabilityPlans.quote, await withSourceWrite('protected_action', {
      operationKey: crypto.randomUUID(), correlationId: suffix, principal, planJson: JSON.stringify(input),
    }))
    if (result.kind !== 'quoted') throw new Error(`plan_quote_refused:${JSON.stringify(result)}`)
    return result
  }
  const quoted = await quote()
  const run = async (key = 'run:one', total = quoted.approvedTotalAudUnits, planRef = quoted.planRef) =>
    backend.mutation(internal.capabilityPlans.beginRun, await withSourceWrite('protected_action', {
      operationKey: crypto.randomUUID(), correlationId: suffix, principal,
      planRef, approvedTotalAudUnits: total, idempotencyKey: key,
    }))
  const read = () => backend.query(internal.capabilityPlans.readProgress, { planRef: quoted.planRef })
  const row = () => backend.run(ctx => ctx.db.query('capabilityPlans').withIndex('by_planRef', q => q.eq('planRef', quoted.planRef)).unique())
  const activate = async () => {
    expect(await run()).toMatchObject({ kind: 'ready' })
    await backend.action(internal.capabilityPlans.continueRun, { planRef: quoted.planRef })
    expect(await read()).toMatchObject({ state: 'running', hold: { status: 'reserved', heldAudUnits: '0' } })
  }
  const admitFirst = async () => {
    const identity = { planRef: quoted.planRef, nodeId: 'first' }
    const preparation = await backend.action(internal.capabilityPlans.prepareNode, identity)
    expect(preparation.kind).toBe('quoted')
    const results = await Promise.all([1, 2].map(() => backend.mutation(internal.capabilityPlans.admitNode, { ...identity, preparation })))
    expect(results[0]).toEqual(results[1])
    const first = results[0]
    if (first?.kind !== 'admitted') throw new Error('node_not_admitted')
    return backend.run(async ctx => {
      const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', first.callRef)).unique()
      if (call === null) throw new Error('call_missing')
      return call
    })
  }
  return { backend, tool, input, agent: { ...agent, principal }, quoted, quote, run, read, row, activate, admitFirst,
    owner: backend.withIdentity({ subject: `user_${suffix}`, issuer: 'https://identity.example', exp: 8_000_000_000 }) }
}

describe('Plan lifecycle through persisted authority and ordinary Calls', () => {
  it('runs the actual workflow, Call worker and trigger bridge once per dependent node', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'plan-workflow-fixture-signing-secret-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:plan-proof')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    providerFetch.mockImplementation(async () => {
      return new UndiciResponse(JSON.stringify({ result: `result ${providerFetch.mock.calls.length}` }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const f = await fixture(true)
    // Readiness is explicitly established by the publication fixture. Its
    // background probe is unrelated to this Plan's three Provider requests.
    await f.backend.run(async ctx => {
      for (const task of await ctx.db.system.query('_scheduled_functions').collect()) {
        if (task.name.startsWith('capabilitySupplyReadiness:') && task.state.kind === 'pending') await ctx.scheduler.cancel(task._id)
      }
    })
    await f.activate()
    for (let index = 0; index < 30; index++) {
      await vi.advanceTimersByTimeAsync(100)
      await f.backend.finishInProgressScheduledFunctions()
      if ((await f.read())?.state === 'succeeded') break
    }
    expect(await f.read(), JSON.stringify(await f.read())).toMatchObject({ state: 'succeeded', hold: { status: 'released', heldAudUnits: '0' } })
    const calls = await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())
    expect(calls).toHaveLength(3)
    expect(calls.map(row => row.state)).toEqual(['completed', 'completed', 'completed'])
    expect(calls.find(row => row.planNodeId === 'middle')?.inputJson).toBe('{"request":"result 1"}')
    expect(calls.find(row => row.planNodeId === 'last')?.inputJson).toBe('{"request":"result 2"}')
    expect(providerFetch).toHaveBeenCalledTimes(3)
    const workflowId = (await f.row())?.workflowId
    expect(workflowId).toBeTruthy()
    expect(await f.run()).toMatchObject({ kind: 'replayed' })
    expect((await f.row())?.workflowId).toBe(workflowId)
    expect(providerFetch).toHaveBeenCalledTimes(3)
  })

  it('binds chat execution to its live turn and sealed quote, refusing stopped turns before any Hold', async () => {
    const f = await fixture(false, true)
    await f.backend.run(async ctx => {
      const grant = await ctx.db.query('authorityDelegationGrants').withIndex('by_grantRef', q => q.eq('grantRef', f.agent.grant.grantRef)).unique()
      if (grant === null) throw new Error('missing_fixture_grant')
      await ctx.db.patch(grant._id, { resourceRefs: ['*', f.tool.toolRef] })
    })
    const turn = await f.backend.mutation(api.chatTurns.startTurn, await withSourceWrite('protected_action', {
      principal: { kind: 'agent_key' as const, ...f.agent.principal }, clientTurnId: 'plan-chat-turn', prompt: 'Run this Plan',
      operationKey: 'plan-chat-turn', correlationId: 'plan-chat-turn',
    }))
    expect(await f.backend.mutation(internal.chatTurns.finishTurn, { turnRef: turn.turnRef, promptMessageId: turn.promptMessageId, state: 'working' })).toBe(true)
    const authority = { kind: 'agent_key' as const, turnRef: turn.turnRef, credentialLocator: f.agent.principal.credentialId,
      applicationRef: f.agent.principal.applicationRef, environment: f.agent.principal.environment,
      scopes: [...f.agent.principal.scopes], grantRef: f.agent.grant.grantRef }
    const quote = await f.backend.action(internal.chatPlans.quote, { authority, planJson: JSON.stringify(f.input) })
    expect(quote.kind).toBe('quoted')
    if (quote.kind !== 'quoted') throw new Error('chat_plan_quote_failed')
    expect(await f.backend.mutation(internal.chatPlans.beginRun, { authority, planRef: f.quoted.planRef, approvedTotalAudUnits: '0' }))
      .toMatchObject({ kind: 'refused', code: 'plan_access_denied' })
    const runArgs = { authority, planRef: quote.planRef, approvedTotalAudUnits: quote.approvedTotalAudUnits }
    expect(await f.backend.mutation(internal.chatPlans.beginRun, { ...runArgs, approvedTotalAudUnits: '1' }))
      .toMatchObject({ kind: 'refused', code: 'approved_total_mismatch' })
    const results = await Promise.all([f.backend.mutation(internal.chatPlans.beginRun, runArgs), f.backend.mutation(internal.chatPlans.beginRun, runArgs)])
    expect(results.map(result => result.kind).sort()).toEqual(['awaiting_approval', 'replayed'])
    expect(await f.backend.query(internal.chatPlans.get, { authority, planRef: quote.planRef })).toMatchObject({ state: 'awaiting_approval' })
    await f.backend.run(async ctx => {
      const row = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', turn.turnRef)).unique()
      if (row === null) throw new Error('chat_turn_missing')
      await ctx.db.patch(row._id, { cancelRequestedAt: Date.now() })
    })
    expect(await f.backend.mutation(internal.chatPlans.beginRun, runArgs)).toMatchObject({ kind: 'refused', code: 'plan_access_denied' })
    expect(await f.backend.action(internal.chatPlans.quote, { authority, planJson: JSON.stringify(f.input) })).toMatchObject({ kind: 'refused' })
    const plans = await f.backend.run(ctx => ctx.db.query('capabilityPlans').collect())
    expect(plans.every(plan => plan.holdReservationAttempt === undefined)).toBe(true)
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
  })

  it('requires the current owner and exact displayed material, then commits one approval before the Hold', async () => {
    const f = await fixture(false, true)
    expect(await f.run()).toMatchObject({ kind: 'awaiting_approval' })
    expect((await f.row())?.authority).toBeUndefined()
    expect((await f.row())?.holdReservationAttempt).toBeUndefined()
    const decide = async (overrides: { approvedTotalAudUnits?: string; planDigest?: string } = {}) => {
      const operationKey = `plan-approval:${f.quoted.planRef}:approve`
      return withSourceWrite('protected_action', { planRef: f.quoted.planRef, planDigest: f.quoted.planDigest,
        approvedTotalAudUnits: f.quoted.approvedTotalAudUnits, decision: 'approve' as const, operationKey, correlationId: operationKey, ...overrides })
    }
    expect(await f.backend.mutation(api.capabilityPlans.decideOwner, await decide())).toMatchObject({ kind: 'refused', code: 'plan_access_denied' })
    expect(await f.owner.mutation(api.capabilityPlans.decideOwner, await decide({ approvedTotalAudUnits: '1' }))).toMatchObject({ kind: 'refused', code: 'approved_total_mismatch' })
    expect(await f.owner.mutation(api.capabilityPlans.decideOwner, await decide({ planDigest: 'changed' }))).toMatchObject({ kind: 'refused', code: 'plan_changed' })
    const results = await Promise.all([f.owner.mutation(api.capabilityPlans.decideOwner, await decide()), f.owner.mutation(api.capabilityPlans.decideOwner, await decide())])
    expect(results.map(result => result.kind).sort()).toEqual(['replayed', 'running'])
    expect((await f.row())?.authority).toMatchObject({ planDigest: f.quoted.planDigest, approvedTotalAudUnits: '0' })
    expect((await f.row())?.holdReservationAttempt).toBeUndefined()
    const observed = await f.owner.query(api.capabilityPlans.readOwner, { planRef: f.quoted.planRef })
    expect(observed).toMatchObject({ kind: 'available', quote: { planDigest: f.quoted.planDigest } })
    expect(await f.backend.query(api.capabilityPlans.readOwner, { planRef: f.quoted.planRef })).toMatchObject({ kind: 'refused' })
    expect(await f.owner.query(api.capabilityPlans.listOwner, {})).toHaveLength(1)
    expect(await f.backend.query(api.capabilityPlans.listOwner, {})).toEqual([])
  })

  it('denies or expires an approval without a Hold, Call or replacement decision', async () => {
    const f = await fixture(false, true)
    await f.run()
    const decide = async (decision: 'approve' | 'deny') => {
      const operationKey = `plan-approval:${f.quoted.planRef}:${decision}`
      return f.owner.mutation(api.capabilityPlans.decideOwner, await withSourceWrite('protected_action', {
        planRef: f.quoted.planRef, planDigest: f.quoted.planDigest, approvedTotalAudUnits: f.quoted.approvedTotalAudUnits,
        decision, operationKey, correlationId: operationKey,
      }))
    }
    vi.setSystemTime(f.quoted.expiresAt + 1)
    expect(await decide('approve')).toMatchObject({ kind: 'refused', code: 'plan_quote_expired' })
    expect(await decide('deny')).toMatchObject({ state: 'cancelled' })
    expect(await decide('deny')).toMatchObject({ kind: 'replayed', state: 'cancelled' })
    expect(await decide('approve')).toMatchObject({ kind: 'refused', code: 'approval_required' })
    expect((await f.row())?.holdReservationAttempt).toBeUndefined()
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
  })

  it('quotes an unordered typed DAG without a Hold or Call, and checks the exact total before concurrent replay', async () => {
    const f = await fixture()
    expect(f.quoted.stages).toEqual([['first'], ['middle'], ['last']])
    expect((await f.row())?.holdReservationAttempt).toBeUndefined()
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
    const starts = await Promise.all([f.run(), f.run()])
    expect(starts.map(result => result.kind).sort()).toEqual(['ready', 'replayed'])
    expect(await f.run('run:one', '1')).toEqual({ kind: 'refused', code: 'approved_total_mismatch' })
    const second = await f.quote()
    expect(await f.run('run:one', second.approvedTotalAudUnits, second.planRef)).toEqual({ kind: 'refused', code: 'idempotency_key_reused' })
    expect((await f.row())?.authority?.approvedTotalAudUnits).toBe('0')
    expect((await f.row())?.holdReservationAttempt).toBeUndefined()
  })

  it('refuses a changed grant before reserving any money', async () => {
    const f = await fixture()
    await f.backend.run(async ctx => {
      const principal = await ctx.db.query('agentAccessPrincipals').withIndex('by_principalId', q => q.eq('principalId', f.agent.principal.principalId)).unique()
      if (principal === null) throw new Error('principal_missing')
      await ctx.db.patch(principal._id, { grantGeneration: principal.grantGeneration + 1 })
    })
    expect(await f.run()).toEqual({ kind: 'refused', code: 'grant_changed' })
    expect((await f.row())?.authority).toBeUndefined()
  })

  it('repeated status reads consume no nonce and admit no work', async () => {
    const f = await fixture()
    const args = await withSourceWrite('protected_action', { operationKey: 'get:plan', correlationId: 'get:plan',
      principal: f.agent.principal, planRef: f.quoted.planRef })
    const before = await f.backend.run(ctx => ctx.db.query('sourceWriteNonces').collect())
    expect(await f.backend.query(api.capabilityPlans.get, args)).toMatchObject({ kind: 'available', planRef: f.quoted.planRef })
    expect(await f.backend.query(api.capabilityPlans.get, args)).toEqual(await f.backend.query(api.capabilityPlans.get, args))
    expect(await f.backend.run(ctx => ctx.db.query('sourceWriteNonces').collect())).toEqual(before)
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
  })

  it('admits exactly one Call and binds its authority to the frozen input and node ceiling', async () => {
    const f = await fixture()
    await f.activate()
    const call = await f.admitFirst()
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
    expect(call).toMatchObject({ planRef: f.quoted.planRef, planNodeId: 'first', inputJson: '{"request":"Perth"}' })
    const basis = await f.backend.query(internal.capabilityPlans.readNodeAuthority, { planRef: f.quoted.planRef, nodeId: 'first', callRef: call.callRef })
    expect(basis).toMatchObject({ resolvedInputDigest: call.inputDigest, ceilingAudUnits: '0' })
    expect(await f.backend.query(internal.capabilityPlans.readNodeAuthority, { planRef: f.quoted.planRef, nodeId: 'middle', callRef: call.callRef })).toBeNull()
    expect(await f.backend.query(internal.capabilityQuotes.readForCall, { principal: f.agent.principal,
      quoteRef: call.quoteRef ?? '', idempotencyKey: call.idempotencyKey, now: Date.now() })).toBeNull()
  })

  it('waits for financial completion before enabling a dependent node or releasing the Hold', async () => {
    const f = await fixture()
    await f.activate()
    const call = await f.admitFirst()
    await f.backend.run(async ctx => {
      await ctx.db.patch(call._id, { state: 'completed', formanceFinancialState: 'reserved',
        result: { kind: 'completed', callRef: call.callRef, toolRef: call.toolRef, evidenceHash: 'test:output', output: { result: 'Perth result' } } })
      const plan = await ctx.db.query('capabilityPlans').withIndex('by_planRef', q => q.eq('planRef', f.quoted.planRef)).unique()
      if (plan === null) throw new Error('plan_missing')
      await ctx.db.patch(plan._id, { workflowFinished: true })
    })
    expect((await f.read())?.nodes.find(node => node.nodeId === 'middle')?.state).toBe('waiting')
    expect(await f.backend.mutation(internal.capabilityPlans.prepareTerminal, { planRef: f.quoted.planRef })).toEqual({ kind: 'waiting' })
    await f.backend.run(async ctx => {
      await ctx.db.patch(call._id, { formanceFinancialState: 'settled', formanceSettlementRefs: ['test:ledger'] })
      const updated = await ctx.db.get(call._id)
      await planCallChanged(ctx, updated)
      await planCallChanged(ctx, updated)
    })
    expect((await f.row())?.concludedNodeIds).toEqual(['first'])
    expect(await f.backend.mutation(internal.capabilityPlans.prepareTerminal, { planRef: f.quoted.planRef })).toMatchObject({ kind: 'ready' })
  })

  it('pauses a selected node during uncertain payment without permanently cancelling it', async () => {
    const f = await fixture()
    await f.activate()
    const identity = { planRef: f.quoted.planRef, nodeId: 'first' }
    const preparation = await f.backend.action(internal.capabilityPlans.prepareNode, identity)
    const row = await f.row()
    if (row === null) throw new Error('plan_missing')
    await f.backend.run(ctx => ctx.db.patch(row._id, { state: 'reconciliation_required' }))
    expect(await f.backend.mutation(internal.capabilityPlans.admitNode, { ...identity, preparation })).toEqual({ kind: 'paused' })
    expect((await f.row())?.nodeOutcomes).toEqual([])
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
    await f.backend.run(ctx => ctx.db.patch(row._id, { state: 'running' }))
    expect(await f.backend.mutation(internal.capabilityPlans.admitNode, { ...identity, preparation })).toMatchObject({ kind: 'admitted' })
    expect((await f.row())?.nodeOutcomes).toEqual([])
  })

  it('keeps admission paused when one sibling settles while another remains uncertain', async () => {
    const f = await fixture()
    await f.activate()
    const call = await f.admitFirst()
    await f.backend.run(async ctx => {
      const { _id, _creationTime, ...material } = call
      const other = await ctx.db.insert('capabilityCalls', { ...material, callRef: `${call.callRef}:other`, planNodeId: 'middle',
        state: 'reconciliation_required', formanceFinancialState: 'outcome_unknown' })
      await planCallChanged(ctx, await ctx.db.get(other))
      await ctx.db.patch(_id, { state: 'completed', formanceFinancialState: 'settled', formanceSettlementRefs: ['test:ledger'],
        result: { kind: 'completed', callRef: call.callRef, toolRef: call.toolRef, evidenceHash: 'test:output', output: { result: 'saved answer' } } })
      await planCallChanged(ctx, await ctx.db.get(_id))
      await ctx.db.patch(other, { formanceFinancialState: 'reserved' })
    })
    expect((await f.row())?.state).toBe('reconciliation_required')
    expect((await f.row())?.concludedNodeIds).toEqual(['first'])
    expect((await f.row())?.holdReleaseRefs).toBeUndefined()
  })

  it('cancels before a Hold without buying, and propagates skipped ancestors in dependency order', async () => {
    const f = await fixture()
    await f.backend.mutation(api.capabilityPlans.cancel, await withSourceWrite('protected_action', {
      operationKey: 'cancel:plan', correlationId: 'cancel:plan', principal: f.agent.principal, planRef: f.quoted.planRef,
    }))
    expect(await f.read()).toMatchObject({ state: 'cancelled', hold: { status: 'none' } })
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
    const plan = await f.row()
    if (plan === null) throw new Error('plan_missing')
    await f.backend.run(ctx => ctx.db.patch(plan._id, { state: 'running', terminationIntent: undefined,
      nodeOutcomes: [{ nodeId: 'first', outcome: 'input_invalid' }] }))
    expect((await f.read())?.nodes.map(node => [node.nodeId, node.state])).toEqual([['last', 'skipped'], ['first', 'skipped'], ['middle', 'skipped']])
  })
})
