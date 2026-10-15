import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { cases, fixture } from './cases.mjs'
import { createLangGraphTrial } from './langgraph.mjs'

const candidate = process.argv[2]
if (!['dify', 'langgraph'].includes(candidate)) throw new Error('Use dify or langgraph')
const graph = candidate === 'langgraph' ? createLangGraphTrial() : undefined
const access = candidate === 'dify' ? JSON.parse(readFileSync('output/chat-trial/dify-access', 'utf8')) : undefined
const results = []
const live = process.argv.includes('--live')
for (const test of cases.filter(test => !live || ['research-answer', 'discover-only', 'audit-result', 'clarification'].includes(test.id))) {
  const sessionId = `${candidate}-${test.id}-${randomUUID().slice(0, 8)}`
  const requestId = 'request-1'
  let conversationId
  const turns = []
  const begin = performance.now()
  try {
    await fixture('/session', { id: sessionId, mode: test.mode })
    async function turn(query, request = requestId) {
      if (graph) return graph.run({ sessionId, requestId: request, query })
      const response = await fetch('http://127.0.0.1:5141/v1/chat-messages', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${access.token}` },
        body: JSON.stringify({ inputs: { sessionId, requestId: request }, query, user: sessionId,
          response_mode: 'blocking', ...(conversationId ? { conversation_id: conversationId } : {}) }),
        signal: AbortSignal.timeout(45_000),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(`Dify ${response.status}: ${JSON.stringify(data)}`)
      conversationId = data.conversation_id
      return data
    }
    let result
    try { result = await turn(test.query) } catch (error) {
      if (!test.retryQuery) throw error
      const before = await fixture(`/inspect?id=${encodeURIComponent(sessionId)}`)
      if (before.dispatches !== 0 || before.events.length !== 0) throw new Error('model_failure_triggered_market_io')
      turns.push({ expectedModelFailure: error.message, marketIoBeforeRetry: 0 })
      result = await turn(test.retryQuery)
    }
    turns.push(result)
    if (test.reply) result = graph ? await graph.resume(sessionId, { query: test.reply }) : await turn(test.reply)
    if (test.resume) {
      const before = await fixture(`/inspect?id=${encodeURIComponent(sessionId)}`)
      if (before.dispatches !== 0) throw new Error('purchase_before_authority_or_funding')
      await fixture('/resume', { id: sessionId })
      result = graph ? await graph.resume(sessionId) : await turn('continue')
    }
    if (test.complete) {
      const before = await fixture(`/inspect?id=${encodeURIComponent(sessionId)}`)
      if (before.dispatches !== 1 || before.calls.some(call => call.kind === 'completed')) throw new Error('unresolved_call_not_held')
      // Reconnect/observe while the Provider is still unresolved, then release it.
      const still = graph ? await graph.resume(sessionId) : await turn('continue')
      turns.push(still)
      const held = await fixture(`/inspect?id=${encodeURIComponent(sessionId)}`)
      if (held.dispatches !== 1 || held.calls.length !== 1) throw new Error('reconnect_created_purchase')
      await fixture('/complete', { id: sessionId })
      result = graph ? await graph.resume(sessionId) : await turn('continue')
    }
    if (test.deny) result = graph ? await graph.resume(sessionId, { approved: false }) : await turn('deny')
    if (test.denyThenFund) {
      turns.push(graph ? await graph.resume(sessionId, { approved: false }) : await turn('deny'))
      const next = await turn('Audit https://example.com', 'request-2')
      turns.push(next)
      if (graph && next.__interrupt__[0].value.reason !== 'insufficient_balance') throw new Error('previous_request_state_leaked')
      if ((await fixture(`/inspect?id=${encodeURIComponent(sessionId)}`)).dispatches !== 0) throw new Error('purchase_before_funding')
      await fixture('/resume', { id: sessionId })
      result = graph ? await graph.resume(sessionId) : await turn('continue', 'request-2')
    }
    if (test.followup) result = await turn(test.followup, 'request-2')
    turns.push(result)
    const inspected = await fixture(`/inspect?id=${encodeURIComponent(sessionId)}`)
    const answer = result.answer ?? ''
    const outcome = answer.includes('Completed synthetic') ? 'completed'
      : answer.includes('**Tools**') ? 'discovery' : 'blocked'
    const research = test.query.startsWith('Research') && test.expected === 'completed'
    const format = !research || answer.includes('| Finding | Date | Source |') && answer.includes('https://research.example/battery-capacity')
    const ok = outcome === test.expected && inspected.dispatches === test.dispatches && format
    results.push({ id: test.id, ok, outcome, expected: test.expected, format, ms: Math.round(performance.now() - begin),
      dispatches: inspected.dispatches, answer, events: inspected.events, calls: inspected.calls, turns })
  } catch (error) {
    results.push({ id: test.id, ok: false, error: error.message, ms: Math.round(performance.now() - begin) })
  }
  process.stdout.write(`${candidate} ${test.id}: ${results.at(-1).ok ? 'PASS' : 'FAIL'}${results.at(-1).error ? ` ${results.at(-1).error}` : ''}\n`)
}
writeFileSync(`output/chat-trial/evidence/${candidate}${live ? '-live-intent' : ''}-results.json`, JSON.stringify({ candidate,
  synthetic: true, planner: live ? 'live intent only; fixture selection and synthesis' : 'scripted', runtimeVersion: candidate === 'dify' ? '1.17.1' : '1.5.0',
  runnerMaxRssKiB: process.resourceUsage().maxRSS, results }, null, 2))
process.exitCode = results.every(result => result.ok) ? 0 : 1
