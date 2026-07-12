import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const base = process.env.AE_ROUTING_BASE_URL ?? 'https://loyal-peacock-107.convex.site'
const signatureAgent = process.env.AE_ROUTING_SIGNATURE_AGENT ?? 'https://ae-routing-agent-directory.sonny-c-claw.workers.dev'
const privateKeyPath = process.env.AE_ROUTING_PRIVATE_JWK_PATH
if (privateKeyPath === undefined) throw new Error('AE_ROUTING_PRIVATE_JWK_PATH is required')
const privateJwk = JSON.parse(await readFile(privateKeyPath, 'utf8'))
const signer = await signerFromJWK(privateJwk)
const allScenarios = Object.freeze([
  { name: 'success', state: 'completed', effectState: 'committed', outcomeRecord: 'provider_outcome_reported' },
  { name: 'fallback_success', state: 'completed', effectState: 'committed', outcomeRecord: 'provider_outcome_reported', requiresFallback: true },
  { name: 'failure', state: 'failed', effectState: 'not_committed', outcomeRecord: 'provider_effect_not_committed', requiresFallback: true },
  { name: 'unknown', state: 'outcome_unknown', effectState: 'unknown', outcomeRecord: 'provider_outcome_unknown' },
])
const requestedScenarios = new Set((process.env.AE_TRACER_SCENARIOS ?? allScenarios.map((scenario) => scenario.name).join(',')).split(',').map((value) => value.trim()).filter(Boolean))
const scenarios = allScenarios.filter((scenario) => requestedScenarios.has(scenario.name))
if (scenarios.length === 0 || scenarios.length !== requestedScenarios.size) throw new Error('AE_TRACER_SCENARIOS contains an unknown scenario')
let rpcId = 0

const http = []
const mcp = []
for (const scenario of scenarios) http.push(await runHttp(scenario))
for (const scenario of scenarios) mcp.push(await runMcp(scenario))
process.stdout.write(`${JSON.stringify({ http, mcp }, null, 2)}\n`)

async function runHttp(scenario) {
  const routed = await post('/v1/route', {
    protocolVersion: 'ae-routing:v1', networkId: 'registered-businesses', query: 'book a shipping label',
    constraints: { currency: 'AUD', maximumSpendMinor: 250 },
  })
  const quote = routed.result.quote
  const executeInput = {
    protocolVersion: 'ae-routing:v1', quoteId: quote.quoteId, quoteDigest: quote.quoteDigest,
    approval: { maximumSpendMinor: 250, currency: 'AUD', expiresAt: Date.now() + 30_000, allowedDataFields: ['scenario', 'primary_context', 'fallback_context'] },
    idempotencyKey: `hosted-http:${scenario.name}:${randomUUID()}`, data: { scenario: scenario.name, primary_context: 'primary-only', fallback_context: 'fallback-only' },
  }
  const executed = await post('/v1/execute', executeInput)
  const replayed = await post('/v1/execute', executeInput)
  const changed = await post('/v1/execute', { ...executeInput, data: { ...executeInput.data, primary_context: 'changed' } })
  const reconciliation = scenario.name === 'unknown'
    ? await post('/v1/reconcile', { protocolVersion: 'ae-routing:v1', rootRunId: executed.result.run.rootRunId })
    : undefined
  const inspected = await post('/v1/inspect', { protocolVersion: 'ae-routing:v1', rootRunId: executed.result.run.rootRunId })
  return summarizeAndAssert(scenario, routed.result, executed.result, inspected.result, replayed.result, changed.result, reconciliation?.result)
}

async function runMcp(scenario) {
  const route = await rpc(nextRpcId(), 'tools/call', { name: 'ae.route', arguments: {
    protocolVersion: 'ae-routing:v1', networkId: 'registered-businesses', query: 'book a shipping label',
    constraints: { currency: 'AUD', maximumSpendMinor: 250 },
  } })
  const quote = route.result.structuredContent.quote
  const executeArguments = {
    protocolVersion: 'ae-routing:v1', quoteId: quote.quoteId, quoteDigest: quote.quoteDigest,
    approval: { maximumSpendMinor: 250, currency: 'AUD', expiresAt: Date.now() + 30_000, allowedDataFields: ['scenario', 'primary_context', 'fallback_context'] },
    idempotencyKey: `hosted-mcp:${scenario.name}:${randomUUID()}`, data: { scenario: scenario.name, primary_context: 'primary-only', fallback_context: 'fallback-only' },
  }
  const execute = await rpc(nextRpcId(), 'tools/call', { name: 'ae.execute', arguments: executeArguments })
  const replay = await rpc(nextRpcId(), 'tools/call', { name: 'ae.execute', arguments: executeArguments })
  const changed = await rpc(nextRpcId(), 'tools/call', { name: 'ae.execute', arguments: { ...executeArguments, data: { ...executeArguments.data, primary_context: 'changed' } } })
  const run = execute.result?.structuredContent?.run
  if (run === undefined) throw new Error(`mcp:${scenario.name}:execution_missing_run:${JSON.stringify(execute)}`)
  const reconciliation = scenario.name === 'unknown'
    ? await rpc(nextRpcId(), 'tools/call', { name: 'ae.reconcile', arguments: { protocolVersion: 'ae-routing:v1', rootRunId: run.rootRunId } })
    : undefined
  const inspect = await rpc(nextRpcId(), 'tools/call', { name: 'ae.inspect', arguments: { protocolVersion: 'ae-routing:v1', rootRunId: run.rootRunId } })
  return summarizeAndAssert(scenario, route.result.structuredContent, execute.result.structuredContent, inspect.result.structuredContent, replay.result.structuredContent, changed.result.structuredContent, reconciliation?.result.structuredContent)
}

async function post(path, body) {
  return await signedFetch(path, body, {})
}

async function rpc(id, method, params) {
  return await signedFetch('/mcp', { jsonrpc: '2.0', id, method, params }, { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' })
}

async function signedFetch(path, value, extraHeaders) {
  const body = JSON.stringify(value)
  const request = new Request(`${base}${path}`, { method: 'POST', body, headers: {
    'Content-Type': 'application/json', 'Content-Digest': `sha-256=:${createHash('sha256').update(body).digest('base64')}:`,
    'Signature-Agent': `"${signatureAgent}"`, ...extraHeaders,
  } })
  const now = new Date()
  const signed = await signatureHeaders(request, {
    signer, keyid: privateJwk.kid,
    components: ['@method', '@authority', '@path', 'content-digest', 'signature-agent'],
    created: new Date(now.getTime() - 1_000), expires: new Date(now.getTime() + 30_000), tag: 'web-bot-auth',
  })
  const response = await fetch(request, { headers: { ...Object.fromEntries(request.headers), Signature: signed.Signature, 'Signature-Input': signed['Signature-Input'] } })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${path}:${response.status}:${JSON.stringify(payload)}`)
  return payload
}

function summarizeAndAssert(scenario, routed, executed, inspected, replayed, changed, reconciliation) {
  const quote = routed.quote
  const run = executed.run
  const summary = {
    scenario: scenario.name,
    routeKind: routed.kind, executionMode: quote.executionMode, bindingId: quote.selectedGraph.bindingId,
    enforcement: quote.enforcement, executeKind: executed.kind, rootRunId: run.rootRunId,
    state: run.state, effectState: run.effectState, providerReference: run.leaves[0]?.providerReference,
    stepBindingIds: quote.selectedGraph.steps.map((step) => step.bindingId),
    leafBindingIds: run.leaves.map((leaf) => leaf.bindingId),
    recordTypes: run.records.map((record) => record.type), inspectKind: inspected.kind,
    disclosedDataFields: run.records.filter((record) => record.type === 'provider_attempt_released').map((record) => ({ bindingId: record.bindingId, fields: record.disclosedDataFields })),
    exactReplayRootRunId: replayed.run?.rootRunId,
    changedReplayKind: changed.kind,
    changedReplayReason: changed.reason,
    reconciliationKind: reconciliation?.kind,
    reconciledRootRunId: reconciliation?.run?.rootRunId,
    inspectedState: inspected.run?.state,
    inspectedRecordTypes: inspected.run?.records?.map((record) => record.type) ?? [],
  }
  if (summary.routeKind !== 'quoted' || summary.executionMode !== 'live') throw new Error(`${scenario.name}:route_contract_failed`)
  if (summary.executeKind !== 'run_admitted' || summary.inspectKind !== 'run_found') throw new Error(`${scenario.name}:run_not_inspectable`)
  if (summary.exactReplayRootRunId !== summary.rootRunId) throw new Error(`${scenario.name}:exact_terminal_replay_failed`)
  if (summary.changedReplayKind !== 'execution_refused' || summary.changedReplayReason !== 'idempotency_payload_mismatch') throw new Error(`${scenario.name}:changed_terminal_replay_not_refused`)
  if (summary.state !== scenario.state || summary.effectState !== scenario.effectState) throw new Error(`${scenario.name}:outcome_posture_incorrect:${JSON.stringify(summary)}`)
  if (!summary.recordTypes.includes(scenario.outcomeRecord)) throw new Error(`${scenario.name}:outcome_record_missing`)
  if (scenario.requiresFallback === true && (summary.leafBindingIds.length !== 2 || !summary.recordTypes.includes('fallback_released'))) {
    throw new Error(`${scenario.name}:fallback_not_proven`)
  }
  if (scenario.name === 'unknown') {
    if (summary.reconciliationKind !== 'provider_outcome_reconciled' || summary.reconciledRootRunId !== summary.rootRunId) {
      throw new Error('unknown:same_root_reconciliation_failed')
    }
    if (summary.inspectedState !== 'completed'
      || !summary.inspectedRecordTypes.includes('provider_reconciliation_observed')
      || !summary.inspectedRecordTypes.includes('root_run_reconciled')) {
      throw new Error('unknown:reconciliation_records_missing')
    }
  }
  const expectedDisclosures = scenario.requiresFallback === true
    ? [
        { bindingId: 'binding:shipping-label-conformance:v1', fields: ['primary_context', 'scenario'] },
        { bindingId: 'binding:shipping-label-conformance:zz-fallback:v1', fields: ['fallback_context', 'scenario'] },
      ]
    : [{ bindingId: 'binding:shipping-label-conformance:v1', fields: ['primary_context', 'scenario'] }]
  if (JSON.stringify(summary.disclosedDataFields) !== JSON.stringify(expectedDisclosures)) throw new Error(`${scenario.name}:minimum_disclosure_not_proven`)
  return summary
}

function nextRpcId() { rpcId += 1; return rpcId }
