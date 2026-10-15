import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fixture } from './cases.mjs'
import { createLangGraphTrial } from './langgraph.mjs'

const { token } = JSON.parse(readFileSync('output/chat-trial/dify-access', 'utf8'))
const id = `restart-${randomUUID()}`
await fixture('/session', { id, mode: 'held_uncertain' })
let conversation
async function turn(query) {
  const response = await fetch('http://127.0.0.1:5141/v1/chat-messages', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ inputs: { sessionId: id, requestId: 'same-command' }, query,
      user: id, response_mode: 'blocking', ...(conversation ? { conversation_id: conversation } : {}) }),
    signal: AbortSignal.timeout(45_000),
  })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  conversation = result.conversation_id
  return result
}
await turn('Audit https://example.com')
const held = await fixture(`/inspect?id=${id}`)
assert.equal(held.dispatches, 1)
assert.equal(held.calls[0].kind, 'outcome_unknown')
assert.equal(spawnSync('docker', ['restart', 'ae-chat-trial-api-1'], { stdio: 'ignore' }).status, 0)
let healthy = false
for (let attempt = 0; attempt < 45; attempt++) {
  try { if ((await fetch('http://127.0.0.1:5141/health')).ok) { healthy = true; break } } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000))
}
assert.equal(healthy, true, 'owned Dify API did not restart')
await fixture('/complete', { id })
const after = await turn('continue')
const inspected = await fixture(`/inspect?id=${id}`)
assert.match(after.answer, /Completed synthetic audit/)
assert.equal(inspected.dispatches, 1)
assert.equal(inspected.calls[0].callRef, held.calls[0].callRef)
assert.deepEqual(inspected.events.slice(-1).map(event => event.action), ['call.status'])

const lgId = `volatile-${randomUUID()}`
await fixture('/session', { id: lgId, mode: 'held_uncertain' })
const first = createLangGraphTrial()
await first.run({ sessionId: lgId, requestId: 'same-command', query: 'Audit https://example.com' })
const reconnected = await first.state(lgId)
assert.equal(reconnected.values.result.kind, 'outcome_unknown')
const empty = await createLangGraphTrial().state(lgId)
assert.deepEqual(empty.values, {})
writeFileSync('output/chat-trial/evidence/persistence.json', JSON.stringify({ synthetic: true,
  dify: { apiRestart: 'survived', conversation, callRef: held.calls[0].callRef, dispatches: 1,
    resumedAction: inspected.events.at(-1).action, answer: after.answer },
  langgraph: { sameProcessReconnect: 'survived', replacementRuntime: 'state missing with MemorySaver',
    productionCheckpointerImplemented: false },
  boundary: 'Dify API restart only; fixture/provider and database restart were not tested',
}, null, 2))
process.stdout.write('Dify owned API restart resumes same uncertain Call with1 dispatch; LangGraph MemorySaver is process-local\n')
