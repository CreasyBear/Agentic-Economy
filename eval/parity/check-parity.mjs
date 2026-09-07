import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ORIGIN = 'http://127.0.0.1:3024'
const CHECK_COUNT = 7
const TOOL_SEARCH_SCHEMA_VERSION = 'registry-tools:v3'
const TOOL_DETAIL_SCHEMA_VERSION = 'registry-tools:v2'
const TOOL_COMPARE_SCHEMA_VERSION = 'registry-tools:v2'
const MISSING_TOOL_REF = `operation:v1:${'0'.repeat(64)}`
const TOOL_MARKET_PATHS = [
  '/api/v1/market-tools/search',
  '/api/v1/market-tools/list',
  '/api/v1/market-tools/describe',
  '/api/v1/market-tools/compare',
]
const TOOL_MARKET_ACTIONS = [
  'registry.tools.search',
  'registry.tools.list',
  'registry.tools.describe',
  'registry.tools.compare',
]
const CALL_PATH = '/api/v1/tools/call'
const CALL_ACTION = 'tool.call'
const CALL_SCOPE = 'market_tools:call'
const TOOL_QUOTE_ACTION = 'tool.quote'
const TOOL_QUOTE_PATH = '/api/v1/tools/quote'
const CALL_STATUS_ACTION = 'call.status'
const CALL_CANCEL_ACTION = 'call.cancel'
const CALL_RECONCILE_ACTION = 'call.reconcile'
const CALL_LIST_PATH = '/api/v1/calls'
const CALL_STATUS_PATH = '/api/v1/calls/{callRef}'
const CALL_CANCEL_PATH = '/api/v1/calls/{callRef}/cancel'
const CALL_RECONCILE_PATH = '/api/v1/calls/{callRef}/reconcile'
const CALL_ROUTE_ACTIONS = [
  TOOL_QUOTE_ACTION,
  CALL_ACTION,
  'call.list',
  CALL_STATUS_ACTION,
  CALL_CANCEL_ACTION,
  CALL_RECONCILE_ACTION,
]
const CALL_ROUTE_PATHS = [
  TOOL_QUOTE_PATH,
  CALL_PATH,
  CALL_LIST_PATH,
  CALL_STATUS_PATH,
  CALL_CANCEL_PATH,
  CALL_RECONCILE_PATH,
]
const TOOL_QUOTE_CONTRACT_VERSION = 'tool.quote:v2'
const CALL_CONTRACT_VERSION = 'tool.call:v1'
const CALL_ROUTE_CONTRACT_VERSIONS = [
  TOOL_QUOTE_CONTRACT_VERSION,
  CALL_CONTRACT_VERSION,
  'call.list:v1',
  'call.status:v1',
  'call.cancel:v1',
  'call.reconcile:v1',
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

function isToolRef(value) {
  return typeof value === 'string' && /^operation:v1:[0-9a-f]{64}$/.test(value)
}

function hasEnvelope(value, kinds, schemaVersion) {
  return isRecord(value) && value.schemaVersion === schemaVersion && kinds.includes(value.kind)
}

function validChoice(value) {
  return isRecord(value)
    && isToolRef(value.toolRef)
    && isNonEmptyString(value.capabilityId)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.description)
    && isRecord(value.provider)
    && isNonEmptyString(value.provider.name)
    && isNonEmptyString(value.provider.slug)
    && isNonEmptyString(value.priceLabel)
    && ['operational', 'degraded', 'unverified'].includes(value.healthStatus)
}

function sameRefs(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false
  const sortedExpected = [...expected].sort()
  return [...actual].sort().every((ref, index) => ref === sortedExpected[index])
}

const llms = await request('/llms.txt')
const llmsRequired = [
  `POST ${origin}${TOOL_MARKET_PATHS[0]}`,
  `POST ${origin}${TOOL_MARKET_PATHS[2]}`,
  CALL_PATH,
]
const forbiddenDiscovery = ['/api/v1/services', '/api/answer', '/api/chat/anonymous']
if (llms.response?.status !== 200) {
  record(1, false, requestFailure(llms))
} else if (!llmsRequired.every((value) => llms.text.includes(value))) {
  record(1, false, 'body omits canonical POST Tool search, description, or Call route')
} else if (forbiddenDiscovery.some((value) => llms.text.includes(value))) {
  record(1, false, 'body advertises services, answer, or anonymous chat')
} else {
  record(1, true, 'HTTP 200 with canonical Tool reads and authenticated Call only')
}

const manifestResult = await request('/.well-known/ucp')
const manifest = manifestResult.data
const toolReads = Array.isArray(manifest?.endpoints)
  ? manifest.endpoints.filter((endpoint) => endpoint?.kind === 'tool_read')
  : []
const callEndpoint = Array.isArray(manifest?.endpoints)
  ? manifest.endpoints.find((endpoint) => endpoint?.kind === 'call')
  : undefined
const toolReadsValid = toolReads.length === TOOL_MARKET_PATHS.length
  && toolReads.every((endpoint, index) => (
    endpoint.path === TOOL_MARKET_PATHS[index]
    && endpoint.method === 'POST'
    && endpoint.authentication === 'none'
    && endpoint.actionId === TOOL_MARKET_ACTIONS[index]
  ))
const callEndpointValid = callEndpoint?.path === CALL_PATH
  && callEndpoint.method === 'POST'
  && callEndpoint.authentication === 'clerk_api_key'
  && callEndpoint.requiredScope === CALL_SCOPE
  && callEndpoint.actionId === CALL_ACTION
  && callEndpoint.contractVersion === CALL_CONTRACT_VERSION
  && manifest?.toolGateway?.action === CALL_ACTION
  && manifest?.toolGateway?.contract === CALL_CONTRACT_VERSION
if (manifestResult.response?.status !== 200) {
  record(2, false, requestFailure(manifestResult))
} else if (manifest?.schemaVersion !== 'ae-site-discovery:v2') {
  record(2, false, 'unexpected manifest schemaVersion')
} else if (!toolReadsValid) {
  record(2, false, 'Tool reads are not the exact four anonymous POST actions in canonical order')
} else if (!callEndpointValid) {
  record(2, false, 'authenticated tool.call endpoint contract is incomplete')
} else {
  record(2, true, 'HTTP 200 with four canonical Tool reads and one authenticated Call endpoint')
}

// Shape-only parity is a false positive: a catalogue full of description-only or
// unavailable entries cannot complete the market loop. Use the public filter
// an agent would use and require at least one callable Tool.
const search = await post(TOOL_MARKET_PATHS[0], {
  query: 'weather forecast',
  limit: 20,
  filters: { healthStatus: ['operational'] },
})
const searchKinds = ['ok', 'no_candidates', 'unavailable']
const searchUnavailableReasons = ['query_invalid', 'source_unavailable', 'source_capacity_exceeded']
let searchRefs = []
let searchValid = hasEnvelope(search.data, searchKinds, TOOL_SEARCH_SCHEMA_VERSION)
if (searchValid && search.data.kind === 'ok') {
  const items = search.data.items
  searchRefs = Array.isArray(items) ? items.map((item) => item?.toolRef).filter(isToolRef) : []
  searchValid = typeof search.data.query === 'string'
    && Array.isArray(items)
    && items.every(validChoice)
    && searchRefs.length === items.length
    && Number.isInteger(search.data.count)
    && search.data.count === items.length
    && isRecord(search.data.pagination)
    && Number.isInteger(search.data.pagination.limit)
    && search.data.pagination.limit >= 1
    && search.data.pagination.limit <= 20
    && typeof search.data.pagination.hasMore === 'boolean'
    && (search.data.pagination.nextCursor === undefined || isNonEmptyString(search.data.pagination.nextCursor))
    && searchRefs.length > 0
} else if (searchValid && search.data.kind === 'no_candidates') {
  searchValid = typeof search.data.query === 'string'
    && search.data.count === 0
    && Array.isArray(search.data.items)
    && search.data.items.length === 0
    && isNonEmptyString(search.data.note)
    && isRecord(search.data.pagination)
} else if (searchValid && search.data.kind === 'unavailable') {
  searchValid = searchUnavailableReasons.includes(search.data.reason)
}
searchValid = searchValid && searchRefs.length > 0
if (search.response?.status !== 200) {
  record(3, false, requestFailure(search))
} else if (!searchValid) {
  record(3, false, 'search returned no callable Tool or left the compact registry-tools:v3 contract')
} else {
  record(3, true, `HTTP 200 ${search.data.kind}${searchRefs.length === 0 ? '' : ` with ${searchRefs.length} choice(s)`}`)
}

const detailRef = searchRefs[0] ?? MISSING_TOOL_REF
const detail = await post(TOOL_MARKET_PATHS[2], { toolRef: detailRef })
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
let detailValid = hasEnvelope(detail.data, detailKinds, TOOL_DETAIL_SCHEMA_VERSION)
if (detailValid && detail.data.kind === 'found') {
  const tool = detail.data.tool
  detailValid = isRecord(tool)
    && tool.toolRef === detailRef
    && isNonEmptyString(tool.capabilityId)
    && isNonEmptyString(tool.title)
    && isNonEmptyString(tool.description)
    && isRecord(tool.provider)
    && isNonEmptyString(tool.provider.name)
    && isNonEmptyString(tool.provider.slug)
    && isNonEmptyString(tool.priceLabel)
    && ['operational', 'degraded', 'unverified'].includes(tool.healthStatus)
    && isRecord(tool.inputJsonSchema)
    && isRecord(tool.outputJsonSchema)
} else if (detailValid && detail.data.kind === 'unavailable') {
  detailValid = detail.data.toolRef === detailRef
    && detailUnavailableReasons.includes(detail.data.reason)
} else if (detailValid && detail.data.kind === 'not_found') {
  detailValid = detail.data.toolRef === detailRef
}
detailValid = detailRef !== MISSING_TOOL_REF && detail.data?.kind === 'found' && detailValid
if (detail.response?.status !== 200) {
  record(4, false, requestFailure(detail))
} else if (!detailValid) {
  record(4, false, 'no callable Tool produced a full exact Tool descriptor')
} else {
  record(4, true, `HTTP 200 ${detail.data.kind} for the exact toolRef without provider fetches`)
}

const requestedRefs = searchRefs.length === 0 ? [MISSING_TOOL_REF] : searchRefs.slice(0, 4)
const compare = await post(TOOL_MARKET_PATHS[3], { toolRefs: requestedRefs })
const compareReasons = ['query_invalid', 'tool_not_found', 'tool_unavailable']
let compareValid = hasEnvelope(compare.data, ['ok', 'unavailable'], TOOL_COMPARE_SCHEMA_VERSION)
if (compareValid && compare.data.kind === 'ok') {
  const returnedRefs = Array.isArray(compare.data.tools)
    ? compare.data.tools.map((tool) => tool?.toolRef)
    : []
  compareValid = Array.isArray(compare.data.tools)
    && compare.data.tools.every(validChoice)
    && sameRefs(returnedRefs, requestedRefs)
} else if (compareValid && compare.data.kind === 'unavailable') {
  compareValid = compareReasons.includes(compare.data.reason)
}
compareValid = compare.data?.kind === 'ok' && compareValid
if (compare.response?.status !== 200) {
  record(5, false, requestFailure(compare))
} else if (!compareValid) {
  record(5, false, 'callable Tool comparison did not succeed for the requested toolRefs')
} else {
  record(5, true, `HTTP 200 ${compare.data.kind} for ${requestedRefs.length} exact ref(s)`)
}

const technicalManifestResult = await request('/.well-known/ucp?technical=1')
const technicalManifest = technicalManifestResult.data
const gateway = technicalManifest?.toolGateway
const quoteRoute = Array.isArray(gateway?.routes)
  ? gateway.routes.find((route) => route?.actionId === TOOL_QUOTE_ACTION)
  : undefined
const callRoutesValid = Array.isArray(gateway?.routes)
  && gateway.routes.length === CALL_ROUTE_ACTIONS.length
  && gateway.routes.every((route, index) => (
    route.actionId === CALL_ROUTE_ACTIONS[index]
    && route.path === CALL_ROUTE_PATHS[index]
    && route.contractVersion === CALL_ROUTE_CONTRACT_VERSIONS[index]
  ))
const manifestSafetyValid = gateway?.contract === CALL_CONTRACT_VERSION
  && gateway.action === CALL_ACTION
  && gateway.scope === CALL_SCOPE
  && gateway.executionModes?.gateway?.action === CALL_ACTION
  && gateway.executionModes?.gateway?.authentication === 'clerk_api_key'
  && gateway.executionModes?.gateway?.requiresToolRef === true
  && quoteRoute?.path === TOOL_QUOTE_PATH
  && quoteRoute.contractVersion === TOOL_QUOTE_CONTRACT_VERSION
  && gateway.recovery?.statusAction === CALL_STATUS_ACTION
  && gateway.recovery?.advancedActions?.cancel === CALL_CANCEL_ACTION
  && gateway.recovery?.advancedActions?.reconcile === CALL_RECONCILE_ACTION
  && gateway.recovery?.retryRule === 'inspect_status_then_recover_uncertain'
if (technicalManifestResult.response?.status !== 200) {
  record(6, false, requestFailure(technicalManifestResult))
} else if (technicalManifest?.schemaVersion !== 'ae-site-discovery:v2') {
  record(6, false, 'technical manifest schemaVersion is not current')
} else if (!callRoutesValid) {
  record(6, false, 'Tool Quote and Call route descriptors are incomplete or out of order')
} else if (!manifestSafetyValid) {
  record(6, false, 'manifest lost Call authentication, stable identity, or recovery policy')
} else {
  record(6, true, 'HTTP 200 technical manifest preserves Quote/Call/auth/idempotency-recovery policy')
}

const skill = await request('/SKILL.md')
const skillText = skill.text ?? ''
const skillOrder = [
  'ae search "weather forecast" --json',
  'ae describe "$AE_TOOL_REF" --json',
  'ae call "$AE_TOOL_REF" --input "$AE_INPUT_JSON" --json',
  'ae connect --json',
  'ae status "$AE_CALL_REF" --json',
  'ae recover "$AE_CALL_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json',
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
  record(7, false, 'skill does not teach search, Tool description, Call, connect, status, recover in order')
} else if (!skillText.includes(`${origin}/mcp`) || !skillText.includes(CALL_PATH)) {
  record(7, false, 'skill omits MCP or the authenticated Tool Call route')
} else if (forbiddenDiscovery.some((value) => skillText.includes(value))) {
  record(7, false, 'skill advertises services, answer, or anonymous chat')
} else {
  record(7, true, 'HTTP 200 with canonical Tool/Quote/Call loop, MCP, and no legacy discovery')
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
