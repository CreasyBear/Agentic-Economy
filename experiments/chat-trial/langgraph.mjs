import { Annotation, Command, END, MemorySaver, START, StateGraph, interrupt } from '@langchain/langgraph'
import { renderTrialResult } from './render.mjs'

const State = Annotation.Root(Object.fromEntries([
  'sessionId', 'requestId', 'query', 'plan', 'search', 'quoteResult', 'result', 'answer', 'evidence',
].map(name => [name, Annotation()])))

async function post(path, input) {
  const response = await fetch(`http://127.0.0.1:5142${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    signal: AbortSignal.timeout(path === '/plan' ? 35_000 : 10_000),
  })
  if (!response.ok) throw new Error(`trial_http_${response.status}`)
  return response.json()
}

function operation(state, action, input) {
  return post('/market', { sessionId: state.sessionId, requestId: state.requestId, action, input })
}

export function createLangGraphTrial() {
  const graph = new StateGraph(State)
    .addNode('understand', async state => ({ plan: await post('/plan', {
      sessionId: state.sessionId, requestId: state.requestId, query: state.query, pending: '',
    }) }))
    .addNode('clarify', state => {
      const answer = interrupt({ kind: 'input_required', question: state.plan.clarification })
      return { query: answer.query }
    })
    .addNode('discover', async state => {
      const search = await operation(state, 'registry.tools.search', { query: state.plan.capability, source: 'current', limit: 8 })
      if (search.kind !== 'noMatch' && !search.results.some(row => row.toolRef === state.plan.toolRef)) {
        throw new Error('trial_selected_tool_not_returned')
      }
      return { search }
    })
    .addNode('get_quote', async state => ({ quoteResult: await operation(state, 'tool.quote', {
      toolRef: state.plan.toolRef, input: state.plan.input,
    }) }))
    .addNode('await_authority', state => {
      const reason = state.result?.kind === 'refused' ? state.result.code : state.quoteResult?.code
      const choice = interrupt({ kind: reason === 'price_changed' ? 'review_required' : reason === 'insufficient_balance' ? 'funding_required' : 'authority_required', reason,
        selection: state.plan, evidence: state.result })
      if (choice.approved !== true) return { result: { kind: 'refused', code: 'authority_denied' } }
      return {}
    })
    .addNode('await_delivery', state => {
      interrupt({ kind: state.result.kind, callRef: state.result.callRef })
      return {}
    })
    .addNode('call', async state => ({ result: await operation(state, 'tool.call', state.quoteResult.continuation.args) }))
    .addNode('observe', async state => ({ result: await operation(state, 'call.status', { callRef: state.result.callRef }) }))
    .addNode('deliver', state => {
      const text = state.plan.kind === 'discover' || state.search.kind === 'noMatch'
        ? `**Tools**\n${JSON.stringify(state.search)}` : renderTrialResult(state.result)
      const answer = [state.evidence, text].filter(Boolean).join('\n\n')
      return { answer, evidence: answer }
    })
    .addEdge(START, 'understand')
    .addConditionalEdges('understand', state => state.plan.clarification ? 'clarify' : 'discover')
    .addEdge('clarify', 'understand')
    .addConditionalEdges('discover', state => state.plan.kind === 'discover' || state.search.kind === 'noMatch' ? 'deliver' : 'get_quote')
    .addConditionalEdges('get_quote', state => state.quoteResult.kind === 'committed' ? 'call' : 'await_authority')
    .addConditionalEdges('await_authority', state => state.result?.code === 'authority_denied' ? 'deliver' : 'get_quote')
    .addConditionalEdges('call', state => state.result.kind === 'refused' ? 'await_authority'
      : state.result.kind === 'completed' ? 'deliver' : 'observe')
    .addConditionalEdges('observe', state => state.result.kind === 'completed' ? 'deliver' : 'await_delivery')
    .addEdge('await_delivery', 'observe')
    .addEdge('deliver', END)
  const checkpointer = new MemorySaver()
  const app = graph.compile({ checkpointer })
  return {
    async run(input) { return app.invoke({ ...input, plan: null, search: null, quoteResult: null, result: null, answer: '' },
      { configurable: { thread_id: input.sessionId } }) },
    async resume(sessionId, value = { approved: true }) {
      return app.invoke(new Command({ resume: value }), { configurable: { thread_id: sessionId } })
    },
    async state(sessionId) { return app.getState({ configurable: { thread_id: sessionId } }) },
    persistence: 'MemorySaver: reconnect within process only; not process-restart durability',
  }
}
