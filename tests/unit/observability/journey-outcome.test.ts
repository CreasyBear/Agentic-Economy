import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emitJourneyEvent, eraseAccountJourney } from '../../../convex/lib/journey/events'
import { readStalledPage } from '../../../convex/lib/journey/stalled'
import { buildDigest, formatDigest } from '../../../convex/operatorDigest'
import { internal } from '../../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { journeyForFinalization } from '../../../convex/lib/capabilityExecution/callLifecycle/dispatchFinalize'
import { convexTestWithWorkers } from '../../helpers/convex-fixtures'

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  metrics: { count: vi.fn() },
  captureMessage: vi.fn(),
  withScope: vi.fn((callback: (scope: { setTag: (key: string, value: string) => void; setLevel: (level: string) => void }) => void) => {
    callback({ setTag() {}, setLevel() {} })
  }),
}))

vi.mock('@sentry/node', () => sentry)

import { initSentryServer } from '@/lib/observability/sentry.server'
import {
  recordAnonymousChat,
  recordCallTerminal,
  recordChatAnswer,
  recordFundingTerminal,
  recordJourneyOutcome,
  recordPublishResult,
  recordQuoteJourney,
  recordSearchResult,
  setJourneyReporter,
} from '@/lib/observability/journey'

function journeyLogs(): Array<{ journey: string; outcome: string; good: boolean }> {
  return vi.mocked(console.info).mock.calls.flatMap(([prefix, body]) => {
    if (prefix !== '[ae.journey]' || typeof body !== 'string') return []
    return [JSON.parse(body) as { journey: string; outcome: string; good: boolean }]
  })
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  setJourneyReporter(undefined)
})

afterEach(() => {
  setJourneyReporter(undefined)
  vi.restoreAllMocks()
})

describe('journey outcomes', () => {
  it('logs one structured event and ignores a reporter failure', () => {
    setJourneyReporter(() => { throw new Error('sentry down') })
    expect(() => recordJourneyOutcome({ journey: 'search', outcome: 'match', good: true })).not.toThrow()
    expect(journeyLogs()).toEqual([{ journey: 'search', outcome: 'match', good: true }])
  })

  it('classifies search results and errors', () => {
    recordSearchResult('match')
    recordSearchResult('scoped')
    recordSearchResult('noMatch')
    recordSearchResult('unavailable')
    expect(journeyLogs()).toEqual([
      { journey: 'search', outcome: 'match', good: true },
      { journey: 'search', outcome: 'scoped', good: true },
      { journey: 'search', outcome: 'noMatch', good: true },
      { journey: 'search', outcome: 'error', good: false },
    ])
  })

  it('separates an issued quote from a fault and an ordinary refusal', () => {
    recordQuoteJourney({ kind: 'committed' })
    recordQuoteJourney({ kind: 'refused', code: 'inspection_unavailable', retryable: true })
    recordQuoteJourney({ kind: 'refused', code: 'tool_not_ready', retryable: true })
    recordQuoteJourney({ kind: 'refused', code: 'insufficient_balance', retryable: false })
    recordQuoteJourney({ kind: 'refused', code: 'tool_not_ready', retryable: false })
    expect(journeyLogs().map(event => event.outcome)).toEqual([
      'issued', 'refused_by_fault', 'refused_by_fault', 'refused', 'refused',
    ])
  })

  it('records a call once, on the first leave from pending', () => {
    recordCallTerminal('pending', 'completed')
    recordCallTerminal('completed', 'completed')
    recordCallTerminal('reconciliation_required', 'completed')
    recordCallTerminal('pending', 'reconciliation_required')
    recordCallTerminal('pending', 'refused')
    recordCallTerminal('pending', 'cancelled')
    recordCallTerminal('pending', 'enqueued')
    expect(journeyLogs()).toEqual([
      { journey: 'call', outcome: 'completed', good: true },
      { journey: 'call', outcome: 'outcome_unknown', good: false },
      { journey: 'call', outcome: 'refused', good: false },
      { journey: 'call', outcome: 'cancelled', good: false },
    ])
  })

  it('records funding once, on the first leave from pending', () => {
    recordFundingTerminal('pending', 'succeeded')
    recordFundingTerminal('succeeded', 'succeeded')
    recordFundingTerminal('outcome_unknown', 'succeeded')
    recordFundingTerminal('pending', 'outcome_unknown')
    recordFundingTerminal('pending', 'failed')
    expect(journeyLogs()).toEqual([
      { journey: 'funding', outcome: 'completed', good: true },
      { journey: 'funding', outcome: 'stuck', good: false },
      { journey: 'funding', outcome: 'failed', good: false },
    ])
  })

  it('records one chat answer, including a clarification, and not a second terminal write', () => {
    recordChatAnswer('working', 'completed')
    recordChatAnswer('completed', 'completed')
    recordChatAnswer('input-required', 'completed')
    recordChatAnswer('submitted', 'input-required')
    recordChatAnswer('working', 'failed')
    recordAnonymousChat('completed')
    expect(journeyLogs()).toEqual([
      { journey: 'chat', outcome: 'completed', good: true },
      { journey: 'chat', outcome: 'input_required', good: true },
      { journey: 'chat', outcome: 'failed', good: false },
      { journey: 'chat', outcome: 'completed', good: true },
    ])
  })

  it('records publish completion and refusal, and ignores replay', () => {
    recordPublishResult({ kind: 'published' })
    recordPublishResult({ kind: 'replayed' })
    recordPublishResult({ kind: 'refused' })
    expect(journeyLogs()).toEqual([
      { journey: 'publish', outcome: 'completed', good: true },
      { journey: 'publish', outcome: 'refused', good: false },
    ])
  })

  it('forwards one Sentry metric and one tagged event when Sentry is configured', () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/1')
    expect(initSentryServer()).toBe(true)
    recordSearchResult('noMatch')
    expect(sentry.metrics.count).toHaveBeenCalledTimes(1)
    expect(sentry.metrics.count).toHaveBeenCalledWith('ae.journey', 1, {
      attributes: { journey: 'search', outcome: 'noMatch', good: 'true' },
    })
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(sentry.captureMessage).toHaveBeenCalledWith('[ae.journey]')
    expect(journeyLogs()).toHaveLength(1)
  })
})

describe('journey events (convex)', () => {
  const ACCOUNT = `acc_${'3'.repeat(32)}`
  const DAY = 24 * 3600_000

  it('emits each journey event once per key', async () => {
    const backend = convexTestWithWorkers()
    const results = await backend.run(async ctx => [
      await emitJourneyEvent(ctx, ACCOUNT, 'signed_up'),
      await emitJourneyEvent(ctx, ACCOUNT, 'signed_up'),
    ])
    expect(results).toEqual([true, false])
    const rows = await backend.run(ctx => ctx.db.query('journeyEvents').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ accountRef: ACCOUNT, name: 'signed_up', eventKey: `${ACCOUNT}:signed_up` })
  })

  it('emits one activated for a completed receipted call finalized twice', async () => {
    const backend = convexTestWithWorkers()
    const row = { callRef: 'call:a', ownerId: ACCOUNT }
    const projection = { state: 'completed', result: { kind: 'completed', receipt: { commercialModel: 'account_aud' } } } as never
    await backend.run(ctx => journeyForFinalization(ctx, row, projection, Date.now()))
    await backend.run(ctx => journeyForFinalization(ctx, row, projection, Date.now()))
    const rows = await backend.run(ctx => ctx.db.query('journeyEvents').collect())
    expect(rows.filter(event => event.name === 'activated')).toHaveLength(1)
    expect(rows.filter(event => event.name === 'first_call')).toHaveLength(1)
    expect(rows.filter(event => event.name === 'retained_w1')).toHaveLength(0)
  })

  it('emits first_call only for a completed call, receipted or not', async () => {
    const backend = convexTestWithWorkers()
    const row = { callRef: 'call:f', ownerId: ACCOUNT }
    await backend.run(ctx => journeyForFinalization(ctx, row, { state: 'refused' } as never, Date.now()))
    expect(await backend.run(ctx => ctx.db.query('journeyEvents').collect())).toHaveLength(0)
    await backend.run(ctx => journeyForFinalization(ctx, row, { state: 'completed', result: { kind: 'completed' } } as never, Date.now()))
    const names = (await backend.run(ctx => ctx.db.query('journeyEvents').collect())).map(event => event.name)
    expect(names).toEqual(['first_call'])
  })

  it('emits agent_connected when an agent principal is first recorded for the account', async () => {
    const backend = convexTestWithWorkers()
    const write = {
      principalId: 'principal:journey', ownerId: ACCOUNT, credentialId: 'credential:journey', applicationRef: 'app:journey',
      environment: 'sandbox' as const, scopes: ['market_tools:call'], authorityMode: 'approval_required' as const,
      grantGeneration: 1, spendingPolicyDigest: 'sha256:journey', lifecycle: 'active' as const, seenAt: 1_000,
    }
    await expect(backend.mutation(internal.agentAccessPrincipals.recordAgentPrincipal, write)).resolves.toEqual({ kind: 'recorded' })
    await backend.mutation(internal.agentAccessPrincipals.recordAgentPrincipal, { ...write, seenAt: 2_000 })
    const keys = (await backend.run(ctx => ctx.db.query('journeyEvents').collect())).map(event => event.eventKey)
    expect(keys).toEqual([`${ACCOUNT}:agent_connected`])
  })

  it.each([
    [2, 0],
    [8, 1],
    [15, 0],
  ])('emits retained_w1 for a receipted call %i days after activation: %i', async (days, expected) => {
    const backend = convexTestWithWorkers()
    await backend.run(async ctx => {
      await ctx.db.insert('journeyEvents', {
        accountRef: ACCOUNT, name: 'activated', eventKey: `${ACCOUNT}:activated`, createdAt: Date.now() - days * DAY,
      })
    })
    const projection = { state: 'completed', result: { kind: 'completed', receipt: { commercialModel: 'account_aud' } } } as never
    await backend.run(ctx => journeyForFinalization(ctx, { callRef: 'call:b', ownerId: ACCOUNT }, projection, Date.now()))
    await backend.run(ctx => journeyForFinalization(ctx, { callRef: 'call:b', ownerId: ACCOUNT }, projection, Date.now()))
    const rows = await backend.run(ctx => ctx.db.query('journeyEvents').collect())
    expect(rows.filter(event => event.name === 'retained_w1')).toHaveLength(expected)
    expect(rows.filter(event => event.name === 'activated')).toHaveLength(1)
  })

  it('reports an account that signed up 25h ago and is not funded', async () => {
    const backend = convexTestWithWorkers()
    const now = Date.now()
    await backend.run(async ctx => {
      await ctx.db.insert('journeyEvents', {
        accountRef: ACCOUNT, name: 'signed_up', eventKey: `${ACCOUNT}:signed_up`, createdAt: now - 25 * 3600_000,
      })
    })
    const page = await backend.run(ctx => readStalledPage(ctx, 'notFunded', now, { numItems: 10, cursor: null }))
    expect(page).toMatchObject({ page: [{ accountRef: ACCOUNT, since: now - 25 * 3600_000 }], isDone: true })
  })

  it('counts every stalled account across pages, oldest first, not a fixed window', async () => {
    const backend = convexTestWithWorkers()
    const now = Date.now()
    const total = 230
    await backend.run(async ctx => {
      for (let index = 0; index < total; index += 1) {
        const accountRef = `acc_stalled_${String(index).padStart(3, '0')}`
        await ctx.db.insert('journeyEvents', { accountRef, name: 'signed_up', eventKey: `${accountRef}:signed_up`, createdAt: now - 10 * DAY + index })
      }
      await ctx.db.insert('journeyEvents', { accountRef: 'acc_progressed', name: 'signed_up', eventKey: 'acc_progressed:signed_up', createdAt: now - 11 * DAY })
      await ctx.db.insert('journeyEvents', { accountRef: 'acc_progressed', name: 'funded', eventKey: 'acc_progressed:funded', createdAt: now - 10 * DAY })
    })
    const runQuery = (async (reference: Parameters<typeof backend.query>[0], args: Record<string, unknown>) => await backend.query(reference, args as never)) as never
    const digest = await buildDigest({ runQuery }, now)
    expect(digest.counts).toEqual({ notFunded: total, noAgent: 1, neverCalled: 0 })
    expect(digest.text).toContain(`Signed up, not funded: ${total} total`)
    expect(digest.text).toMatch(/^- acc_stalled_000, 10d \(since \d{4}-\d{2}-\d{2}\)$/mu)
    expect(digest.text).toContain(`...and ${total - 25} more`)
  })

  it('omits a skipped intent and puts a multi-line intent on its own quoted line', () => {
    const now = 10 * 3600_000
    const stalled = {
      notFunded: [{ accountRef: 'acc_skip', since: 0 }, { accountRef: 'acc_inject', since: 0 }],
      noAgent: [],
      neverCalled: [],
    }
    const text = formatDigest(stalled, new Map([['acc_skip', ''], ['acc_inject', 'ship it\n- acc_fake, 0h']]), now)
    const lines = text.split('\n')
    expect(lines).toContain('- acc_skip, 10h (since 1970-01-01)')
    expect(lines).toContain('  intent: "ship it - acc_fake, 0h"')
    expect(lines.filter(line => line.startsWith('- '))).toHaveLength(2)
  })

  it('marks a cut intent and switches long ages to days', () => {
    const now = 72 * 3600_000
    const text = formatDigest({ notFunded: [{ accountRef: 'acc_long', since: 0 }], noAgent: [], neverCalled: [] },
      new Map([['acc_long', 'x'.repeat(200)]]), now)
    expect(text).toContain('- acc_long, 3d (since 1970-01-01)')
    expect(text).toContain(`  intent: "${'x'.repeat(140)}..."`)
  })

  it('erases journey rows and the intent answer for an account', async () => {
    const backend = convexTestWithWorkers()
    await backend.run(async ctx => {
      await emitJourneyEvent(ctx, ACCOUNT, 'signed_up')
      await ctx.db.insert('accountIntents', { accountRef: ACCOUNT, text: 'goal', createdAt: 1, updatedAt: 1 })
      await emitJourneyEvent(ctx, 'acc_other', 'signed_up')
    })
    await backend.run(ctx => eraseAccountJourney(ctx, ACCOUNT))
    const rows = await backend.run(async ctx => [...await ctx.db.query('journeyEvents').collect(), ...await ctx.db.query('accountIntents').collect()])
    expect(rows.map(row => row.accountRef)).toEqual(['acc_other'])
  })

  it('erases every journey row of a heavy account across batches', async () => {
    const backend = convexTestWithWorkers()
    await backend.run(async ctx => {
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert('journeyEvents', { accountRef: ACCOUNT, name: 'topped_up', eventKey: `${ACCOUNT}:topped_up:f${index}`, createdAt: index })
      }
    })
    vi.useFakeTimers()
    try {
      await backend.run(ctx => eraseAccountJourney(ctx, ACCOUNT))
      await backend.finishAllScheduledFunctions(vi.runAllTimers)
    } finally {
      vi.useRealTimers()
    }
    await expect(backend.run(ctx => ctx.db.query('journeyEvents').collect())).resolves.toHaveLength(0)
  })

  it('settles a 4xx-rejected forward so it cannot starve newer rows in the retry sweep', async () => {
    const backend = convexTestWithWorkers()
    vi.stubEnv('POSTHOG_KEY', 'phc_test')
    const send = vi.fn(async () => new Response('{}', { status: 400 }))
    vi.stubGlobal('fetch', send)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const rejected = await backend.run(async ctx => await Promise.all(Array.from({ length: 51 }, (_, index) =>
        ctx.db.insert('journeyEvents', { accountRef: `acc_r${index}`, name: 'signed_up', eventKey: `acc_r${index}:signed_up`, createdAt: Date.now() - 2 * DAY + index }))))
      for (const eventId of rejected) await backend.action(internal.journeyEvents.forward, { eventId })
      const newer = await backend.run(async ctx => await ctx.db.insert('journeyEvents', {
        accountRef: ACCOUNT, name: 'signed_up', eventKey: `${ACCOUNT}:signed_up`, createdAt: Date.now() - 3600_000,
      }))
      send.mockImplementation(async () => new Response('{}', { status: 200 }))
      send.mockClear()
      vi.useFakeTimers()
      await backend.mutation(internal.journeyEvents.retryUnforwarded, {})
      await backend.finishAllScheduledFunctions(vi.runAllTimers)
      vi.useRealTimers()
      expect(send).toHaveBeenCalledTimes(1)
      await expect(backend.run(ctx => ctx.db.get(newer))).resolves.toMatchObject({ forwardedAt: expect.any(Number) })
    } finally {
      vi.useRealTimers()
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })

  it('forwards to PostHog with a valid, stable event uuid', async () => {
    const backend = convexTestWithWorkers()
    vi.stubEnv('POSTHOG_KEY', 'phc_test')
    const send = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', send)
    try {
      const eventId = await backend.run(async ctx => await ctx.db.insert('journeyEvents', {
        accountRef: ACCOUNT, name: 'activated', eventKey: `${ACCOUNT}:activated`, createdAt: Date.now(),
      }))
      await backend.action(internal.journeyEvents.forward, { eventId })
      const [, init] = send.mock.calls[0] as unknown as [URL, RequestInit]
      const event = JSON.parse(String(init.body)).batch[0]
      expect(event.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
      expect(event).toMatchObject({ distinct_id: canonicalDigest({ format: 'ae.journey:v1', value: ACCOUNT }), event: 'activated' })
      expect(String(init.body)).not.toContain(ACCOUNT)
      await expect(backend.run(ctx => ctx.db.get(eventId))).resolves.toMatchObject({ forwardedAt: expect.any(Number) })
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })

  it('re-forwards a row a failed forward left unmarked, and skips recent and forwarded rows', async () => {
    const backend = convexTestWithWorkers()
    vi.stubEnv('POSTHOG_KEY', 'phc_test')
    const send = vi.fn(async () => new Response('{}', { status: 503 }))
    vi.stubGlobal('fetch', send)
    try {
      const eventId = await backend.run(async ctx => await ctx.db.insert('journeyEvents', {
        accountRef: ACCOUNT, name: 'signed_up', eventKey: `${ACCOUNT}:signed_up`, createdAt: Date.now() - 3600_000,
      }))
      await backend.run(async ctx => {
        await ctx.db.insert('journeyEvents', { accountRef: 'acc_recent', name: 'signed_up', eventKey: 'acc_recent:signed_up', createdAt: Date.now() })
        await ctx.db.insert('journeyEvents', { accountRef: 'acc_done', name: 'signed_up', eventKey: 'acc_done:signed_up', createdAt: Date.now() - 3600_000, forwardedAt: 1 })
      })
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      await backend.action(internal.journeyEvents.forward, { eventId })
      await expect(backend.run(ctx => ctx.db.get(eventId))).resolves.not.toHaveProperty('forwardedAt')
      send.mockImplementation(async () => new Response('{}', { status: 200 }))
      send.mockClear()
      vi.useFakeTimers()
      await backend.mutation(internal.journeyEvents.retryUnforwarded, {})
      await backend.finishAllScheduledFunctions(vi.runAllTimers)
      vi.useRealTimers()
      expect(send).toHaveBeenCalledTimes(1)
      await expect(backend.run(ctx => ctx.db.get(eventId))).resolves.toMatchObject({ forwardedAt: expect.any(Number) })
    } finally {
      vi.useRealTimers()
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })
})
