import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'
import YAML from 'yaml'

const host = 'http://127.0.0.1:5141'
const fixture = 'http://host.docker.internal:5142'
const nodes = [], edges = []
const node = (id, data) => nodes.push({ id, data: { desc: '', selected: false, title: id, ...data },
  type: 'custom', sourcePosition: 'right', targetPosition: 'left',
  position: { x: nodes.length * 260, y: 100 }, width: 244, height: 90 })
const edge = (source, target, sourceHandle = 'source') => edges.push({
  id: `${source}-${sourceHandle}-${target}`, source, target, sourceHandle, targetHandle: 'target', type: 'custom',
  data: { sourceType: nodes.find(n => n.id === source).data.type, targetType: nodes.find(n => n.id === target).data.type,
    isInIteration: false, isInLoop: false },
})
const code = (id, variables, source, outputs) => node(id, { type: 'code', code_language: 'python3', code: source,
  variables: Object.entries(variables).map(([variable, value_selector]) => ({ variable, value_selector })),
  outputs: Object.fromEntries(outputs.map(name => [name, { type: 'string', children: null }])) })
const http = (id, path, selector) => node(id, { type: 'http-request', method: 'POST', url: `${fixture}${path}`,
  authorization: { type: 'no-auth' }, headers: 'Content-Type:application/json', params: '',
  body: { type: 'json', data: [{ id: randomUUID(), key: '', type: 'text', value: `{{#${selector.join('.')}#}}` }] },
  timeout: { connect: 5, read: 10, write: 10 }, retry_config: { enabled: false, max_retries: 0, retry_interval: 1000 },
})
const route = (id, selector) => node(id, { type: 'if-else', cases: [{ case_id: 'true', logical_operator: 'and',
  conditions: [{ id: randomUUID(), variable_selector: selector, comparison_operator: 'is', value: 'continue', varType: 'string' }] }] })
const answer = (id, selector) => node(id, { type: 'answer', answer: `{{#${selector.join('.')}#}}`, variables: [] })
const assign = (id, selector, variable = 'pending') => node(id, { type: 'assigner', version: '2',
  items: [{ input_type: 'variable', operation: 'over-write', value: selector,
    variable_selector: ['conversation', variable], write_mode: 'over-write' }] })

node('start', { type: 'start', variables: ['sessionId', 'requestId'].map(variable => ({
  variable, label: variable, type: 'text-input', required: true, max_length: 100, options: [],
})) })
code('plan_request', { query: ['sys', 'query'], pending: ['conversation', 'pending'],
  session: ['start', 'sessionId'], request: ['start', 'requestId'] },
  'import json\ndef main(query, pending, session, request):\n return {"request":json.dumps({"query":query,"pending":pending,"sessionId":session,"requestId":request})}', ['request'])
http('understand', '/plan', ['plan_request', 'request'])
nodes.find(n => n.id === 'understand').data.timeout.read = 35
code('select', { body: ['understand', 'body'] }, `import json
def main(body):
 p=json.loads(body)
 request={"sessionId":p["sessionId"],"requestId":p["requestId"],"action":"registry.tools.search","input":{"query":p["capability"],"source":"current","limit":8}}
 if p.get("callRef"): request.update(action="call.status",input={"callRef":p["callRef"]})
 return {"state":json.dumps(p),"request":json.dumps(request),"route":"pause" if p["clarification"] else "observe" if p.get("callRef") else "continue","answer":p["clarification"]}`, ['state', 'request', 'route', 'answer'])
assign('retain_selection', ['select', 'state'])
route('have_inputs', ['select', 'route'])
nodes.find(n => n.id === 'have_inputs').data.cases.push({ case_id: 'observe', logical_operator: 'and',
  conditions: [{ id: randomUUID(), variable_selector: ['select', 'route'], comparison_operator: 'is', value: 'observe', varType: 'string' }] })
http('resume_observation', '/market', ['select', 'request'])
answer('ask_input', ['select', 'answer'])
http('discover', '/market', ['select', 'request'])
code('prepare_quote', { body: ['discover', 'body'], state: ['select', 'state'] }, `import json
def main(body,state):
 p=json.loads(state); result=json.loads(body)
 stop=p["kind"]=="discover" or result["kind"]=="noMatch"
 if not stop and not any(row.get("toolRef")==p["toolRef"] for row in result["results"]): raise ValueError("trial_selected_tool_not_returned")
 request={"sessionId":p["sessionId"],"requestId":p["requestId"],"action":"tool.quote","input":{"toolRef":p["toolRef"],"input":p["input"]}}
 return {"request":json.dumps(request),"route":"stop" if stop else "continue","answer":"**Tools**\\n"+json.dumps(result)}`, ['request', 'route', 'answer'])
route('needs_action', ['prepare_quote', 'route'])
answer('catalogue_answer', ['prepare_quote', 'answer'])
http('quote', '/market', ['prepare_quote', 'request'])
code('prepare_call', { body: ['quote', 'body'], state: ['select', 'state'] }, `import json
def main(body,state):
 p=json.loads(state); q=json.loads(body)
 request={"sessionId":p["sessionId"],"requestId":p["requestId"],"action":"tool.call","input":q.get("continuation",{}).get("args",{})}
 return {"request":json.dumps(request),"route":"continue" if q["kind"]=="committed" else "pause","answer":"**Needs authority or funding**\\n"+q.get("reason",q.get("code","unavailable"))}`, ['request', 'route', 'answer'])
route('can_call', ['prepare_call', 'route'])
answer('quote_refusal', ['prepare_call', 'answer'])
http('call', '/market', ['prepare_call', 'request'])
code('prepare_observation', { body: ['call', 'body'], state: ['select', 'state'] }, `import json
def main(body,state):
 p=json.loads(state); r=json.loads(body)
 request={"sessionId":p["sessionId"],"requestId":p["requestId"],"action":"call.status","input":{"callRef":r.get("callRef","")}}
 return {"request":json.dumps(request),"route":"continue" if r["kind"] in ["pending","outcome_unknown"] else "finish"}`, ['request', 'route'])
route('needs_observation', ['prepare_observation', 'route'])
http('observe', '/market', ['prepare_observation', 'request'])

const finalCode = `import json
def main(body,previous,state):
 r=json.loads(body)
 if r["kind"]!="completed":
  p=json.loads(state)
  if r["kind"] in ["pending","outcome_unknown"]: p["callRef"]=r["callRef"]
  return {"answer":"**Action blocked or pending**\\n"+r.get("code",r["kind"]),"pending":json.dumps(p),"evidence":previous}
 out=r["output"]
 if "sources" in out:
  text="**Completed synthetic research**\\n\\n| Finding | Date | Source |\\n|---|---|---|\\n"
  for s in out["sources"]: text+="| "+s["fact"]+" | "+s["date"]+" | ["+s["title"]+"]("+s["url"]+") |\\n"
 else:
  text="**Completed synthetic audit**\\n\\n"+"\\n".join("- "+f["finding"] for f in out["findings"])
 return {"answer":previous+"\\n\\n"+text,"pending":"","evidence":previous+"\\n\\n"+text}`
for (const [id, source] of [['finish_call', 'call'], ['finish_observation', 'observe'], ['finish_resume', 'resume_observation']]) {
  code(id, { body: [source, 'body'], previous: ['conversation', 'evidence'], state: ['select', 'state'] }, finalCode, ['answer', 'pending', 'evidence'])
  assign(`${id}_pending`, [id, 'pending'])
  assign(`${id}_evidence`, [id, 'evidence'], 'evidence')
  answer(`${id}_answer`, [id, 'answer'])
  edge(source, id); edge(id, `${id}_pending`); edge(`${id}_pending`, `${id}_evidence`); edge(`${id}_evidence`, `${id}_answer`)
}
// Only the selected branch runs. No workflow retries surround purchase dispatch.
edge('start', 'plan_request'); edge('plan_request', 'understand'); edge('understand', 'select')
edge('select', 'retain_selection'); edge('retain_selection', 'have_inputs')
edge('have_inputs', 'discover', 'true'); edge('have_inputs', 'ask_input', 'false')
edge('have_inputs', 'resume_observation', 'observe')
edge('discover', 'prepare_quote'); edge('prepare_quote', 'needs_action')
edge('needs_action', 'quote', 'true'); edge('needs_action', 'catalogue_answer', 'false')
edge('quote', 'prepare_call'); edge('prepare_call', 'can_call')
edge('can_call', 'call', 'true'); edge('can_call', 'quote_refusal', 'false')
// Replace direct call->finish with conditional observation.
const direct = edges.findIndex(e => e.source === 'call' && e.target === 'finish_call'); edges.splice(direct, 1)
edge('call', 'prepare_observation'); edge('prepare_observation', 'needs_observation')
edge('needs_observation', 'observe', 'true'); edge('needs_observation', 'finish_call', 'false')

const app = { kind: 'app', version: '0.3.1', dependencies: [],
  app: { name: 'AE research-to-action synthetic trial', description: 'Local fixture comparison; no production money or credentials.',
    mode: 'advanced-chat', icon: '🧪', icon_background: '#FFEAD5', use_icon_as_answer_icon: false },
  workflow: { conversation_variables: ['pending', 'evidence'].map(name => ({ name, id: randomUUID(),
    description: 'Synthetic trial state only', value: '', value_type: 'string', selector: ['conversation', name] })),
    environment_variables: [], features: { opening_statement: 'Synthetic research and action trial.',
      suggested_questions: [], suggested_questions_after_answer: { enabled: false },
      retriever_resource: { enabled: false }, sensitive_word_avoidance: { enabled: false },
      file_upload: { enabled: false }, speech_to_text: { enabled: false }, text_to_speech: { enabled: false } },
    graph: { nodes, edges, viewport: { x: 0, y: 0, zoom: 0.5 } } },
}
const dsl = YAML.stringify(app)
writeFileSync('output/chat-trial/dify-chatflow.yaml', dsl)

if (process.argv[2] === 'install') {
  let cookie = ''
  async function api(path, body) {
    const csrf = cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=').slice(1).join('=')
    const response = await fetch(host + '/console/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', cookie, ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const cookies = response.headers.getSetCookie().map(c => c.split(';')[0])
    if (cookies.length) cookie = [...new Map([...cookie.split('; ').filter(Boolean), ...cookies].map(c => [c.split('=')[0], c])).values()].join('; ')
    const data = await response.json()
    if (!response.ok) throw new Error(`Dify ${path}: ${response.status} ${JSON.stringify(data)}`)
    return data
  }
  const password = randomBytes(24).toString('base64url')
  const email = 'trial@aecon.example'
  const status = await api('/setup')
  if (status.step === 'not_started') {
    await api('/setup', { email, name: 'AE local trial', password, language: 'en-US' })
    writeFileSync('output/chat-trial/local-admin', JSON.stringify({ email, password }), { mode: 0o600 })
  }
  const admin = JSON.parse(readFileSync('output/chat-trial/local-admin', 'utf8'))
  await api('/login', { ...admin, password: Buffer.from(admin.password).toString('base64'), remember_me: true, language: 'en-US' })
  const imported = await api('/apps/imports', { mode: 'yaml-content', yaml_content: dsl })
  const appId = imported.app_id
  if (!appId) throw new Error(`Dify import did not create an app: ${JSON.stringify(imported)}`)
  await api(`/apps/${appId}/workflows/publish`, { marked_name: 'Synthetic trial', marked_comment: 'No production integration' })
  const key = await api(`/apps/${appId}/api-keys`, {})
  writeFileSync('output/chat-trial/dify-access', JSON.stringify({ appId, token: key.token }), { mode: 0o600 })
  writeFileSync('output/chat-trial/evidence/dify-app.json', JSON.stringify({ appId, imported, nodes: nodes.length, edges: edges.length, synthetic: true }, null, 2))
  process.stdout.write(`Dify synthetic Chatflow installed: ${appId}\n`)
}
