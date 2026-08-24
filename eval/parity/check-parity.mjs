import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ORIGIN = 'http://127.0.0.1:3024'
const CHECK_COUNT = 7
const SCHEMA_VERSION = 'registry-operations:v1'
const MISSING_OPERATION_REF = `operation:v1:${'0'.repeat(64)}`
const OPERATION_PATHS = [
  '/api/v1/market-operations/search',
  '/api/v1/market-operations/detail',
  '/api/v1/market-operations/compare',
  '/api/v1/market-operations/inspect-plan',
]
const OPERATION_ACTIONS = [
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
]
const scriptDirectory = dirname(fileURLToPath(import.meta.url))

function readOrigin() {
  const { values } = parseArgs({
    options: { origin: { type: 'string' } },
    strict: false,
  })
  const envOrigin = process.env.ORIGIN?.trim() || DEFAULT_ORIGIN
  const origin = typeof values.origin === 'string' ? values.origin : envOrigin
  return origin.replace(/\/+$/, '')
}

const origin = readOrigin()
const checks = []

function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim() || 'no reason'
}

function record(number, passed, reason) {
  checks.push({ number, passed, reason: oneLine(reason) })
}

function requestFailure(result) {
  return result.error === undefined
    ? `HTTP ${result.response?.status ?? 'unknown'}`
    : `request failed: ${oneLine(result.error)}`
}

async function request(target, options = {}) {
  try {
    const url = new URL(target, origin)
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10_000),
    })
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = undefined
    }
    return { response, text, data }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function isOperationRef(value) {
  return typeof value === 'string' && /^operation:v1:[0-9a-f]{64}$/.test(value)
}

function isMappingRef(value) {
  return typeof value === 'string' && /^mapping:v1:[0-9a-f]{64}$/.test(value)
}

function hasEnvelope(value, kinds) {
  return isRecord(value) && value.schemaVersion === SCHEMA_VERSION && kinds.includes(value.kind)
}

function validNavigation(value) {
  return Array.isArray(value) && value.every((entry) => (
    isRecord(entry)
    && isNonEmptyString(entry.actionId)
    && ['GET', 'POST'].includes(entry.method)
    && ['none', 'required'].includes(entry.authentication)
  ))
}

function validAuthentication(value) {
  return isRecord(value) && ['keyless', 'platform_credential', 'x402', 'unknown'].includes(value.kind)
}

function validAvailability(value) {
  return isRecord(value) && ['integrated', 'routeable', 'unavailable'].includes(value.posture)
}

function validPrice(value) {
  return isRecord(value) && ['fixed', 'range', 'on_request'].includes(value.kind)
}

function validChoice(value) {
  return isRecord(value)
    && isOperationRef(value.operationRef)
    && isNonEmptyString(value.capabilityId)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.summary)
    && isRecord(value.supplier)
    && isNonEmptyString(value.supplier.name)
    && isNonEmptyString(value.supplier.slug)
    && validPrice(value.price)
    && validAuthentication(value.authentication)
    && validAvailability(value.availability)
    && validNavigation(value.navigation)
}

function validRanking(value, operationRefs) {
  return Array.isArray(value) && value.every((entry) => (
    isRecord(entry)
    && operationRefs.includes(entry.operationRef)
    && Number.isInteger(entry.rank)
    && entry.rank > 0
    && typeof entry.score === 'number'
    && Number.isFinite(entry.score)
    && entry.score >= 0
  ))
}

function sameRefs(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false
  const sortedExpected = [...expected].sort()
  return [...actual].sort().every((ref, index) => ref === sortedExpected[index])
}

const llms = await request('/llms.txt')
const llmsRequired = [
  `POST ${origin}${OPERATION_PATHS[0]}`,
  `POST ${origin}${OPERATION_PATHS[1]}`,
  '/api/v1/operations/call',
]
const forbiddenDiscovery = ['/api/v1/services', '/api/answer', '/api/chat/anonymous']
if (llms.response?.status !== 200) {
  record(1, false, requestFailure(llms))
} else if (!llmsRequired.every((value) => llms.text.includes(value))) {
  record(1, false, 'body omits canonical POST search, detail, or operation call')
} else if (forbiddenDiscovery.some((value) => llms.text.includes(value))) {
  record(1, false, 'body advertises services, answer, or anonymous chat')
} else {
  record(1, true, 'HTTP 200 with canonical Operation reads and authenticated call only')
}

const manifestResult = await request('/.well-known/ucp')
const manifest = manifestResult.data
const operationReads = Array.isArray(manifest?.endpoints)
  ? manifest.endpoints.filter((endpoint) => endpoint?.kind === 'operation_read')
  : []
const invokeEndpoint = Array.isArray(manifest?.endpoints)
  ? manifest.endpoints.find((endpoint) => endpoint?.kind === 'operation_invoke')
  : undefined
const operationReadsValid = operationReads.length === OPERATION_PATHS.length
  && operationReads.every((endpoint, index) => (
    endpoint.path === OPERATION_PATHS[index]
    && endpoint.method === 'POST'
    && endpoint.authentication === 'none'
    && endpoint.actionId === OPERATION_ACTIONS[index]
  ))
const invokeEndpointValid = invokeEndpoint?.path === '/api/v1/operations/call'
  && invokeEndpoint.method === 'POST'
  && invokeEndpoint.authentication === 'clerk_api_key'
  && invokeEndpoint.requiredScope === 'market_operations:invoke'
  && manifest?.operationGateway?.action === 'operation.invoke'
  && manifest?.operationGateway?.contract === 'operation.invoke:v1'
if (manifestResult.response?.status !== 200) {
  record(2, false, requestFailure(manifestResult))
} else if (manifest?.schemaVersion !== 'ae-site-discovery:v2') {
  record(2, false, 'unexpected manifest schemaVersion')
} else if (!operationReadsValid) {
  record(2, false, 'operation reads are not the exact four anonymous POST actions in canonical order')
} else if (!invokeEndpointValid) {
  record(2, false, 'authenticated operation.invoke endpoint contract is incomplete')
} else {
  record(2, true, 'HTTP 200 with four canonical reads and one authenticated invoke endpoint')
}

const search = await post(OPERATION_PATHS[0], { query: '', limit: 20 })
const searchKinds = ['ok', 'no_candidates', 'unavailable']
const searchUnavailableReasons = ['query_invalid', 'source_unavailable', 'source_capacity_exceeded']
let searchRefs = []
let searchValid = hasEnvelope(search.data, searchKinds) && validNavigation(search.data.navigation)
if (searchValid && search.data.kind === 'ok') {
  const items = search.data.items
  searchRefs = Array.isArray(items) ? items.map((item) => item?.operationRef).filter(isOperationRef) : []
  searchValid = typeof search.data.query === 'string'
    && Array.isArray(items)
    && items.every(validChoice)
    && searchRefs.length === items.length
    && Number.isInteger(search.data.matchedCount)
    && search.data.matchedCount >= items.length
    && validRanking(search.data.ranking, searchRefs)
    && isRecord(search.data.pagination)
    && Number.isInteger(search.data.pagination.limit)
    && search.data.pagination.limit >= 1
    && search.data.pagination.limit <= 20
    && typeof search.data.pagination.hasMore === 'boolean'
    && (search.data.pagination.nextCursor === undefined || isNonEmptyString(search.data.pagination.nextCursor))
} else if (searchValid && search.data.kind === 'no_candidates') {
  searchValid = typeof search.data.query === 'string'
    && isRecord(search.data.appliedFilters)
    && search.data.matchedCount === 0
    && Array.isArray(search.data.ranking)
    && search.data.ranking.length === 0
} else if (searchValid && search.data.kind === 'unavailable') {
  searchValid = searchUnavailableReasons.includes(search.data.reason)
}
if (search.response?.status !== 200) {
  record(3, false, requestFailure(search))
} else if (!searchValid) {
  record(3, false, 'search response is outside the compact registry-operations:v1 contract')
} else {
  record(3, true, `HTTP 200 ${search.data.kind}${searchRefs.length === 0 ? '' : ` with ${searchRefs.length} choice(s)`}`)
}

const detailRef = searchRefs[0] ?? MISSING_OPERATION_REF
const detail = await post(OPERATION_PATHS[1], { operationRef: detailRef })
const detailKinds = ['found', 'unavailable', 'not_found']
const detailUnavailableReasons = [
  'setup_required',
  'temporarily_unavailable',
  'readiness_expired',
  'publisher_withdrew',
  'under_review',
  'updated_terms_require_review',
  'not_supported_by_ae',
]
let detailValid = hasEnvelope(detail.data, detailKinds)
if (detailValid && detail.data.kind === 'found') {
  const operation = detail.data.operation
  detailValid = isRecord(operation)
    && operation.operationRef === detailRef
    && operation.callVia === '/api/v1/operations/call'
    && operation.paymentLane === 'brokered'
    && isRecord(operation.contract)
    && isRecord(operation.contract.inputJsonSchema)
    && isRecord(operation.contract.outputJsonSchema)
    && validAuthentication(operation.authentication)
    && validAvailability(operation.availability)
    && validNavigation(operation.navigation)
} else if (detailValid && detail.data.kind === 'unavailable') {
  detailValid = detail.data.operationRef === detailRef
    && detailUnavailableReasons.includes(detail.data.reason)
    && validNavigation(detail.data.navigation)
} else if (detailValid && detail.data.kind === 'not_found') {
  detailValid = detail.data.operationRef === detailRef && validNavigation(detail.data.navigation)
}
if (detailRef === MISSING_OPERATION_REF) detailValid = detailValid && detail.data?.kind === 'not_found'
if (detail.response?.status !== 200) {
  record(4, false, requestFailure(detail))
} else if (!detailValid) {
  record(4, false, 'detail response is outside the full Operation descriptor contract')
} else {
  record(4, true, `HTTP 200 ${detail.data.kind} for the exact operationRef without provider fetches`)
}

const requestedRefs = searchRefs.length === 0 ? [MISSING_OPERATION_REF] : searchRefs.slice(0, 4)
const compare = await post(OPERATION_PATHS[2], { operationRefs: requestedRefs })
const compareReasons = ['query_invalid', 'operation_not_found', 'operation_unavailable']
let compareValid = hasEnvelope(compare.data, ['ok', 'unavailable']) && validNavigation(compare.data.navigation)
if (compareValid && compare.data.kind === 'ok') {
  const returnedRefs = Array.isArray(compare.data.operations)
    ? compare.data.operations.map((operation) => operation?.operationRef)
    : []
  compareValid = Array.isArray(compare.data.operations)
    && compare.data.operations.every(validChoice)
    && sameRefs(returnedRefs, requestedRefs)
    && Array.isArray(compare.data.facts)
    && compare.data.facts.length > 0
    && compare.data.facts.every((fact) => (
      isRecord(fact)
      && isNonEmptyString(fact.field)
      && Array.isArray(fact.values)
      && sameRefs(fact.values.map((value) => value?.operationRef), requestedRefs)
    ))
} else if (compareValid && compare.data.kind === 'unavailable') {
  compareValid = compareReasons.includes(compare.data.reason)
}
if (compare.response?.status !== 200) {
  record(5, false, requestFailure(compare))
} else if (!compareValid) {
  record(5, false, 'compare response does not correspond to the requested operationRefs')
} else {
  record(5, true, `HTTP 200 ${compare.data.kind} for ${requestedRefs.length} exact ref(s)`)
}

const inspectPlan = await post(OPERATION_PATHS[3], { operationRefs: requestedRefs })
const inspectPlanReasons = [
  'query_invalid',
  'operation_not_found',
  'operation_unavailable',
  'mapping_unavailable',
  'mapping_incompatible',
  'mapping_cycle',
]
let inspectPlanValid = hasEnvelope(inspectPlan.data, ['ok', 'unavailable'])
  && validNavigation(inspectPlan.data.navigation)
if (inspectPlanValid && inspectPlan.data.kind === 'ok') {
  const summary = inspectPlan.data.summary
  inspectPlanValid = isNonEmptyString(inspectPlan.data.inspectPlanRef)
    && sameRefs(inspectPlan.data.operationRefs, requestedRefs)
    && Array.isArray(inspectPlan.data.mappingRefs)
    && inspectPlan.data.mappingRefs.length === 0
    && inspectPlan.data.mappingRefs.every(isMappingRef)
    && isRecord(summary)
    && isRecord(summary.maximumCost)
    && ['known', 'requires_preparation'].includes(summary.maximumCost.kind)
    && Array.isArray(summary.dataUse)
    && Array.isArray(summary.effects)
    && typeof summary.expiry === 'number'
    && Number.isFinite(summary.expiry)
    && summary.expiry > Date.now()
} else if (inspectPlanValid && inspectPlan.data.kind === 'unavailable') {
  inspectPlanValid = inspectPlanReasons.includes(inspectPlan.data.reason)
    && (inspectPlan.data.operationRef === undefined || requestedRefs.includes(inspectPlan.data.operationRef))
}
const gateway = manifest?.operationGateway
const manifestSafetyValid = gateway?.contract === 'operation.invoke:v1'
  && gateway.action === 'operation.invoke'
  && gateway.scope === 'market_operations:invoke'
  && gateway.access?.connected?.authentication === 'clerk_api_key'
  && gateway.access?.connected?.invokeAction === 'operation.invoke'
  && gateway.recovery?.statusAction === 'operation.status'
  && gateway.recovery?.advancedActions?.cancel === 'operation.cancel'
  && gateway.recovery?.advancedActions?.reconcile === 'operation.reconcile'
  && gateway.recovery?.retryRule === 'inspect_status_then_recover_uncertain'
if (inspectPlan.response?.status !== 200) {
  record(6, false, requestFailure(inspectPlan))
} else if (!inspectPlanValid) {
  record(6, false, 'inspect-plan response is outside the bounded plan contract')
} else if (!manifestSafetyValid) {
  record(6, false, 'manifest lost invoke authentication, stable identity, or recovery policy')
} else {
  record(6, true, `HTTP 200 ${inspectPlan.data.kind}; manifest preserves invoke/auth/idempotency-recovery policy`)
}

const skill = await request('/SKILL.md')
const skillText = skill.text ?? ''
const skillOrder = [
  'ae search "weather forecast" --json',
  'ae inspect "$AE_OPERATION_REF" --json',
  'ae call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --json',
  'ae connect --json',
  'ae status "$AE_INVOCATION_REF" --json',
  'ae recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json',
]
let previousSkillIndex = -1
const skillOrderValid = skillOrder.every((value) => {
  const index = skillText.indexOf(value)
  if (index <= previousSkillIndex) return false
  previousSkillIndex = index
  return true
})
if (skill.response?.status !== 200) {
  record(7, false, requestFailure(skill))
} else if (!skillOrderValid) {
  record(7, false, 'skill does not teach search, detail, call, connect, status, recover in order')
} else if (!skillText.includes(`${origin}/mcp`) || !skillText.includes('/api/v1/operations/call')) {
  record(7, false, 'skill omits MCP or the authenticated operation call route')
} else if (forbiddenDiscovery.some((value) => skillText.includes(value))) {
  record(7, false, 'skill advertises services, answer, or anonymous chat')
} else {
  record(7, true, 'HTTP 200 with canonical Operation loop, MCP, and no legacy discovery')
}

const passes = checks.filter((check) => check.passed).length
for (const check of checks) {
  console.log(`C${check.number} ${check.passed ? 'PASS' : 'FAIL'} ${check.reason}`)
}
console.log(`score: ${passes}/${CHECK_COUNT}`)

try {
  mkdirSync(scriptDirectory, { recursive: true })
  const resultsPath = `${scriptDirectory}/results.tsv`
  if (!existsSync(resultsPath)) {
    writeFileSync(resultsPath, 'commit\tscore\tstatus\tdescription\n')
  }
  let commit = 'nogit'
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: scriptDirectory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || 'nogit'
  } catch {
    // The harness also runs outside a Git checkout.
  }
  const status = passes === CHECK_COUNT ? 'pass' : 'fail'
  const description = checks.map((check) => `C${check.number}=${check.passed ? 'pass' : 'fail'}`).join(',')
  appendFileSync(resultsPath, `${commit}\t${passes}/${CHECK_COUNT}\t${status}\t${description}\n`)
} catch (error) {
  console.error(`Could not append eval/parity/results.tsv: ${oneLine(error instanceof Error ? error.message : error)}`)
}

process.exitCode = passes === CHECK_COUNT ? 0 : 1
