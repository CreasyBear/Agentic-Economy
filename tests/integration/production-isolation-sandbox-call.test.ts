import { afterEach, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import {
  formanceSnapshot, observeHealthyReadiness, prepareSubjects, publishCurrentTool, seedAgent,
} from '../helpers/quote-fixtures'

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

it('retains a valid sandbox Quote and performs no Call work when invoked in production', async () => {
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
  const backend = convexTestWithMarketComponents()
  const suffix = 'production-isolation-sandbox-call'
  const tool = await publishCurrentTool(backend, suffix, 'sandbox')
  const buyer = await seedAgent(backend, { canonicalAccountRef: tool.accountRef }, tool.toolRef, suffix, '20000000', 'sandbox')
  await backend.finishAllScheduledFunctions(() => undefined)
  await observeHealthyReadiness(backend, tool, suffix)
  const input = { request: 'Perth' }
  const subjects = await prepareSubjects(backend, buyer, tool.toolRef, input, suffix)
  const issued = await backend.mutation(internal.capabilityQuotes.issueQuote, {
    operationKey: `${suffix}:issue`, correlationId: `${suffix}:issue`, principal: buyer.principal,
    toolRef: tool.toolRef, input, formance: formanceSnapshot(subjects),
  })
  expect(issued.kind).toBe('committed')
  if (issued.kind !== 'committed') throw new Error('sandbox_quote_not_issued')
  const before = await backend.run(ctx => ctx.db.query('capabilityQuotes').collect())
  expect(before).toHaveLength(1)

  // An agent-key Turn is required for the chat wrappers to reach their financial fences.
  await backend.run(async ctx => {
    const grant = await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', q => q.eq('grantRef', buyer.grant.grantRef)).unique()
    if (grant === null) throw new Error('sandbox_chat_grant_missing')
    await ctx.db.patch(grant._id, { resourceRefs: ['*', tool.toolRef] })
  })
  vi.useFakeTimers()
  vi.setSystemTime(Date.now())
  const turn = await backend.mutation(api.chatTurns.startTurn, await withSourceWrite('protected_action', {
    principal: { kind: 'agent_key' as const, ...buyer.principal }, clientTurnId: suffix,
    prompt: 'Call the quoted Tool', operationKey: `${suffix}:turn`, correlationId: `${suffix}:turn`,
  }))
  expect(await backend.mutation(internal.chatTurns.finishTurn, {
    turnRef: turn.turnRef, promptMessageId: turn.promptMessageId, state: 'working',
  })).toBe(true)
  const storedTurn = await backend.run(ctx => ctx.db.query('chatTurns')
    .withIndex('by_turnRef', q => q.eq('turnRef', turn.turnRef)).unique())
  expect(storedTurn).toMatchObject({ state: 'working', principalRef: buyer.principal.principalId })
  const authority = {
    kind: 'agent_key' as const, turnRef: turn.turnRef, credentialLocator: buyer.principal.credentialId,
    applicationRef: buyer.principal.applicationRef, environment: buyer.principal.environment,
    scopes: buyer.principal.scopes, grantRef: buyer.grant.grantRef,
  }
  const chatPrepare = (operationKey: string) => backend.mutation(internal.chatQuoteAdmission.prepare, {
    authority, operationKey, correlationId: operationKey, toolRef: tool.toolRef, input,
  })
  expect(await chatPrepare(`${suffix}:chat:baseline`)).toMatchObject({
    principal: { principalId: buyer.principal.principalId }, subjects: { kind: 'prepared' },
  })
  expect(await backend.mutation(internal.chatCall.authorize, { authority, quoteRef: issued.quoteRef }))
    .toMatchObject({ principalId: buyer.principal.principalId })

  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
  expect(await chatPrepare(`${suffix}:chat:blocked`)).toMatchObject({
    principal: { principalId: buyer.principal.principalId },
    subjects: { kind: 'refused', code: 'tool_unsupported' },
  })
  expect(await backend.action(internal.chatCall.call, {
    authority, quoteRef: issued.quoteRef, idempotencyKey: `${suffix}:chat:call`,
    operationKey: `${suffix}:chat:call`, correlationId: `${suffix}:chat:call`,
  })).toMatchObject({ kind: 'refused', code: 'environment_mismatch', retryable: false })
  const refused = await backend.action(api.capabilityCalls.call, await withSourceWrite('protected_action', {
    operationKey: `${suffix}:call`, correlationId: `${suffix}:call`, principal: buyer.principal,
    quoteRef: issued.quoteRef, idempotencyKey: `${suffix}:call`,
  }))
  expect(refused).toMatchObject({ kind: 'refused', code: 'environment_mismatch', retryable: false })
  expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').collect())).toEqual(before)
  expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
    expect(await backend.run(ctx => ctx.db.query('moneyProviderObligations').collect())).toEqual([])
  await backend.run(async ctx => {
    const jobs = await ctx.db.system.query('_scheduled_functions').collect()
    for (const job of jobs) {
      if (job.state.kind === 'pending' && job.args.some(arg => typeof arg === 'object' && arg !== null
        && !Array.isArray(arg) && 'promptMessageId' in arg && arg.promptMessageId === turn.promptMessageId)) {
        await ctx.scheduler.cancel(job._id)
      }
    }
  })
})
