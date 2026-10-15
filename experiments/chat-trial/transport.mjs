import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { fixture } from './cases.mjs'

const sessionId = `mcp-${randomUUID()}`
await fixture('/session', { id: sessionId, mode: 'active' })
const methods = []
function client() {
  const agent = new Client({ name: 'ae-trial-native-client', version: '1' })
  const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:5142/mcp'), {
    fetch: async (input, init) => {
      const request = new Request(input, init)
      request.headers.set('x-trial-session', sessionId)
      request.headers.set('x-trial-request', 'same-command')
      if (request.method === 'POST') methods.push((await request.clone().json()).method)
      return fetch(request)
    },
  })
  return { agent, transport }
}
const first = client()
await first.agent.connect(first.transport)
const tools = await first.agent.listTools()
assert.equal(tools.tools.length, 4)
const search = (await first.agent.callTool({ name: 'ae_registry_tools_search', arguments: { query: 'battery storage research', source: 'current' } })).structuredContent
const quote = (await first.agent.callTool({ name: 'ae_tool_quote', arguments: { toolRef: search.results[0].toolRef, input: { keyword: 'battery storage' } } })).structuredContent
const called = (await first.agent.callTool({ name: 'ae_tool_call', arguments: quote.continuation.args })).structuredContent
await first.agent.close()
const second = client()
await second.agent.connect(second.transport)
await second.agent.listTools()
const replay = (await second.agent.callTool({ name: 'ae_tool_call', arguments: quote.continuation.args })).structuredContent
assert.equal(replay.callRef, called.callRef)
assert.equal((await fixture(`/inspect?id=${encodeURIComponent(sessionId)}`)).dispatches, 1)
await second.agent.close()

const otherId = `mcp-other-${randomUUID()}`
await fixture('/session', { id: otherId, mode: 'active' })
const crossAccount = await fetch('http://127.0.0.1:5142/plan', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'continue',
    pending: JSON.stringify({ sessionId, requestId: 'same-command', callRef: called.callRef }), sessionId: otherId, requestId: 'other' }) })
assert.equal(crossAccount.status, 400)
assert.equal((await crossAccount.json()).error, 'trial_account_mismatch')
assert.equal((await fixture(`/inspect?id=${encodeURIComponent(otherId)}`)).dispatches, 0)
writeFileSync('output/chat-trial/evidence/mcp-transport.json', JSON.stringify({ synthetic: true,
  tools: tools.tools.map(tool => tool.name), methods, callRef: called.callRef, reconnectedCallRef: replay.callRef,
  dispatches: 1, crossAccountResume: 'refused before I/O', productionAuthAndPayments: false }, null, 2))
process.stdout.write('Native MCP list -> search -> Quote -> Call -> reconnect/replay: PASS; cross-account resume: refused\n')
