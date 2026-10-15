import { createHash } from 'node:crypto'
import { z } from 'zod'
import { contractFor } from '../../convex/lib/chat/tools/contracts'
import { callMachineResultSchema, projectCallMachineResult } from '@/modules/capability-execution/call-contracts'
import { toolQuoteInputSchema, toolQuoteResultSchema } from '@/modules/capability-execution/quote'

export const RESEARCH_REF = `operation:v1:${'a'.repeat(64)}`
export const AUDIT_REF = `operation:v1:${'b'.repeat(64)}`
export const amount = { currency: 'AUD' as const, exponent: 6 as const, units: '100000' }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const modeSchema = z.enum(['active', 'guest', 'expired', 'unfunded', 'approval', 'pending', 'uncertain', 'held_pending', 'held_uncertain', 'empty', 'changed'])
export const sessionInputSchema = z.strictObject({ id: z.string().min(1).max(100), mode: modeSchema })
type Mode = z.infer<typeof modeSchema>
type Quote = Extract<z.infer<typeof toolQuoteResultSchema>, { kind: 'committed' }>
type Result = z.infer<typeof callMachineResultSchema>
type Session = {
  mode: Mode; events: { action: string; input: unknown }[];
  quotes: Map<string, { quote: Quote; input: z.infer<typeof toolQuoteInputSchema> }>;
  calls: Map<string, Result>; keys: Map<string, { material: string; callRef: string }>;
  dispatches: number; completed: Map<string, Result>;
}

// Only the test controller changes fixture authority. A workflow cannot grant it.
export class FixtureMarket {
  private readonly sessions = new Map<string, Session>()

  create(value: unknown) {
    const { id, mode } = sessionInputSchema.parse(value)
    if (this.sessions.has(id)) throw new Error('trial_session_exists')
    this.sessions.set(id, { mode, events: [], quotes: new Map(), calls: new Map(), keys: new Map(), dispatches: 0, completed: new Map() })
    return { id, mode }
  }

  resume(id: string) {
    this.session(id).mode = 'active'
  }

  complete(id: string) {
    const session = this.session(id)
    for (const [callRef, result] of session.completed) session.calls.set(callRef, result)
  }

  expireQuotes(id: string) {
    for (const row of this.session(id).quotes.values()) row.quote.expiresAt = Date.now() - 1
  }

  inspect(id: string) {
    const session = this.session(id)
    return { mode: session.mode, events: session.events, dispatches: session.dispatches,
      calls: [...session.calls.values()], quotes: [...session.quotes.values()].map(row => row.quote) }
  }

  private session(id: string) {
    const session = this.sessions.get(id)
    if (session === undefined) throw new Error('trial_session_not_found')
    return session
  }

  execute(id: string, action: string, value: unknown, requestId = 'request-1'): unknown {
    const session = this.session(id)
    session.events.push({ action, input: value })
    if (action === 'registry.tools.search') {
      const input = contractFor(action).schema.parse(value)
      const query = z.strictObject({ query: z.string() }).passthrough().parse(input).query
      const research = !/audit/iu.test(query)
      const toolRef = research ? RESEARCH_REF : AUDIT_REF
      const rows = session.mode === 'empty' ? [] : [{
        id: toolRef, toolRef, source: 'current', access: 'ae_callable',
        title: research ? 'Synthetic battery research' : 'Synthetic website audit',
        summary: research ? 'Returns dated fixture evidence with source URLs.' : 'Audits a synthetic page.',
        provider: 'Trial fixture', actionClass: research ? 'retrieve' : 'analyze',
        objectClass: 'web', readiness: 'ready', price: { kind: 'indicative', label: 'A$0.10 per fixture Call' },
        detailRef: `/tools/${toolRef}`, next: [],
      }]
      return contractFor(action).outputSchema.parse({
        schemaVersion: 'registry-tools:v3', query, partialResults: false,
        assessed: { source: 'current', scope: 'complete', examined: rows.length, coverage: 'complete' },
        pagination: { limit: 8, hasMore: false }, next: [],
        ...(rows.length === 0 ? { kind: 'noMatch', results: [], reason: 'No fixture supply' } : { kind: 'match', results: rows }),
      })
    }
    if (action === 'tool.quote') {
      const input = toolQuoteInputSchema.parse(value)
      const code = session.mode === 'guest' || session.mode === 'expired' ? 'grant_not_found'
        : session.mode === 'unfunded' ? 'insufficient_balance'
        : ![RESEARCH_REF, AUDIT_REF].includes(input.toolRef) ? 'tool_not_found' : undefined
      if (code !== undefined) return toolQuoteResultSchema.parse({ kind: 'refused', toolRef: input.toolRef,
        code, reason: session.mode, retryable: false, correlationRef: `trial:${id}` })
      const quoteRef = `operation-commitment:v1:${digest([id, requestId, input])}`
      const previous = session.quotes.get(quoteRef)
      if (previous) return previous.quote
      const quote = toolQuoteResultSchema.parse({ kind: 'committed', quoteRef, toolRef: input.toolRef,
        toolVersion: 1, expiresAt: Date.now() + 60_000, price: amount,
        account: { accountRef: `trial-account:${id}`, available: { ...amount, units: '5000000' } },
        budget: { principalRef: `trial-principal:${id}`, maximumPerCall: { ...amount, units: '1000000' } },
        policyRefs: ['trial-synthetic-policy'], evidenceDigest: `sha256:${digest(input)}`,
        continuation: { action: 'tool.call', args: { quoteRef, idempotencyKey: `trial:${digest([id, requestId, input])}` } },
      })
      if (quote.kind !== 'committed') throw new Error('trial_quote_contract')
      session.quotes.set(quoteRef, { quote, input })
      return quote
    }
    if (action === 'tool.call') {
      const input = z.strictObject({ quoteRef: z.string(), idempotencyKey: z.string().min(1) }).parse(value)
      const selected = session.quotes.get(input.quoteRef)
      if (!selected) return callMachineResultSchema.parse({ kind: 'refused', code: 'operation_not_found', retryable: false })
      const material = digest([input.quoteRef, selected.input])
      const previous = session.keys.get(input.idempotencyKey)
      if (previous) {
        if (previous.material !== material) return callMachineResultSchema.parse({ kind: 'refused', code: 'idempotency_conflict', retryable: false })
        return session.calls.get(previous.callRef)
      }
      if (selected.quote.expiresAt <= Date.now()) return callMachineResultSchema.parse({ kind: 'refused',
        toolRef: selected.input.toolRef, code: 'price_changed', retryable: false })
      if (session.mode === 'approval' || session.mode === 'guest' || session.mode === 'expired') {
        return callMachineResultSchema.parse({ kind: 'refused', toolRef: selected.input.toolRef,
          code: 'authority_required', retryable: false })
      }
      if (session.mode === 'unfunded') return callMachineResultSchema.parse({ kind: 'refused',
        toolRef: selected.input.toolRef, code: 'insufficient_balance', retryable: false })
      if (session.mode === 'changed') return callMachineResultSchema.parse({ kind: 'refused',
        toolRef: selected.input.toolRef, code: 'price_changed', retryable: false })
      const callRef = `operation-invocation:v1:${digest([id, input.idempotencyKey, material])}`
      const complete = this.completed(callRef, selected.input.toolRef, selected.input.input)
      session.completed.set(callRef, complete)
      session.calls.set(callRef, complete)
      session.keys.set(input.idempotencyKey, { material, callRef })
      session.dispatches += 1
      if (session.mode === 'pending' || session.mode === 'held_pending') {
        const pending = callMachineResultSchema.parse({ kind: 'pending', callRef, toolRef: selected.input.toolRef, retryAfterMs: 10, next: [] })
        if (session.mode === 'held_pending') session.calls.set(callRef, pending)
        return pending
      }
      if (session.mode === 'uncertain' || session.mode === 'held_uncertain') {
        const uncertain = callMachineResultSchema.parse({ kind: 'outcome_unknown',
        callRef, toolRef: selected.input.toolRef, next: [], evidence: {
          attemptRef: 'trial-attempt', effectGeneration: 1, requiredAt: new Date().toISOString(),
          retry: 'reconcile_before_retry', evidenceSource: 'Synthetic lost response after dispatch',
        } })
        if (session.mode === 'held_uncertain') session.calls.set(callRef, uncertain)
        return uncertain
      }
      return complete
    }
    if (action === 'call.status') {
      const input = z.strictObject({ callRef: z.string() }).parse(value)
      const result = session.calls.get(input.callRef)
      if (!result) throw new Error('trial_call_not_found')
      return result
    }
    throw new Error('trial_action_not_allowed')
  }

  private completed(callRef: string, toolRef: string, input: z.infer<typeof toolQuoteInputSchema>['input']): Result {
    return projectCallMachineResult({ kind: 'completed', callRef, toolRef,
      evidenceHash: `sha256:${digest([toolRef, input])}`,
      output: toolRef === RESEARCH_REF ? { synthetic: true, sources: [
        { title: 'Fixture battery capacity', url: 'https://research.example/battery-capacity', date: '2026-10-14', fact: 'Fixture battery capacity is 42 MWh.' },
        { title: 'Fixture storage duration', url: 'https://research.example/storage-duration', date: '2026-10-13', fact: 'Fixture storage duration is four hours.' },
      ] } : { synthetic: true, page: input.url ?? 'https://example.com', findings: [
        { severity: 'medium', finding: 'Fixture page has no descriptive title.' },
      ] },
      usage: { usageRef: `trial-usage:${callRef}`, observedAt: Date.now(),
        chargeState: 'paid', amount, priceDigest: 'trial-price' },
    })
  }
}
