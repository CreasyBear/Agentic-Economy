import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exactAmountSchema } from '../../src/modules/money/internal/exact-amount.ts'

const DEFAULT_ORIGIN = 'http://127.0.0.1:3000'
const CHECK_COUNT = 7
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

const llms = await request('/llms.txt')
if (llms.response?.status !== 200) {
  record(1, false, requestFailure(llms))
} else if (!llms.text.includes('/api/v1/services')) {
  record(1, false, 'HTTP 200 but body does not mention /api/v1/services')
} else {
  record(1, true, 'HTTP 200 and body mentions /api/v1/services')
}

const servicesResult = await request('/api/v1/services')
const services = Array.isArray(servicesResult.data?.services) ? servicesResult.data.services : undefined
const servicesOk = servicesResult.response?.status === 200
  && servicesResult.data?.kind === 'ok'
  && servicesResult.data?.schemaVersion === 'public-services-api:v1'
  && Array.isArray(services)
  && services.length > 0
if (servicesResult.response?.status !== 200) {
  record(2, false, requestFailure(servicesResult))
} else if (servicesResult.data?.kind !== 'ok') {
  record(2, false, 'body kind is not ok')
} else if (servicesResult.data?.schemaVersion !== 'public-services-api:v1') {
  record(2, false, 'unexpected schemaVersion')
} else if (!Array.isArray(services)) {
  record(2, false, 'services is not an array')
} else if (services.length === 0) {
  record(2, false, 'services array is empty')
} else {
  record(2, true, `HTTP 200 with ${services.length} service(s)`)
}

let chosenService
let chosenEndpoint
if (!servicesOk) {
  record(3, false, 'depends on C2 having a non-empty services array')
} else {
  const invalidService = services.findIndex((service) => {
    const business = service?.business
    return typeof business?.slug !== 'string'
      || business.slug.length === 0
      || typeof service.name !== 'string'
      || service.name.length === 0
      || typeof service.summary !== 'string'
      || service.summary.length === 0
      || !Array.isArray(service.endpoints)
  })
  const openService = services.find((service) => (
    Array.isArray(service?.endpoints)
      && service.endpoints.some((endpoint) => endpoint?.access === 'open')
  ))
  if (invalidService >= 0) {
    record(3, false, `service ${invalidService + 1} is missing business.slug, name, summary, or endpoints[]`)
  } else if (openService === undefined) {
    record(3, false, 'no service has an endpoint with access=open')
  } else {
    chosenService = openService
    chosenEndpoint = openService.endpoints.find((endpoint) => endpoint?.access === 'open')
    record(3, true, `all ${services.length} service(s) have required fields and an open endpoint exists`)
  }
}

const firstName = typeof services?.[0]?.name === 'string' ? services[0].name.trim() : ''
const query = firstName.split(/\s+/)[0] || ''
if (!query) {
  record(4, false, 'cannot derive a search word from the first service name')
} else {
  const search = await request(`/api/v1/services/search?q=${encodeURIComponent(query)}`)
  const searchServices = Array.isArray(search.data?.services) ? search.data.services : undefined
  if (search.response?.status !== 200) {
    record(4, false, requestFailure(search))
  } else if (!Array.isArray(searchServices) || searchServices.length < 1) {
    record(4, false, 'search returned no services')
  } else if (search.data?.query !== query) {
    record(4, false, `search did not echo query ${JSON.stringify(query)}`)
  } else {
    record(4, true, `HTTP 200 returned ${searchServices.length} service(s) and echoed query`)
  }
}

if (chosenService === undefined || chosenEndpoint === undefined) {
  record(5, false, 'depends on C3 finding an open endpoint')
} else if (typeof chosenEndpoint.url !== 'string' || chosenEndpoint.url.length === 0) {
  record(5, false, 'open endpoint has no URL')
} else {
  const quote = await request(chosenEndpoint.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  const amount = quote.data?.price?.amount
  const validAmount = (() => {
    try {
      const parsed = exactAmountSchema.safeParse(amount)
      return parsed.success && BigInt(parsed.data.units) > 0n
    } catch {
      return false
    }
  })()
  const validUntilValue = quote.data?.validUntil
  const validUntil = typeof validUntilValue === 'number'
    ? validUntilValue
    : Date.parse(typeof validUntilValue === 'string' ? validUntilValue : '')
  if (quote.response?.status !== 200) {
    record(5, false, requestFailure(quote))
  } else if (quote.data?.provenance !== 'ae_sandbox_provider') {
    record(5, false, 'quote provenance is not ae_sandbox_provider')
  } else if (!validAmount) {
    record(5, false, 'quote price.amount is not a valid positive exact amount')
  } else if (!Number.isFinite(validUntil) || validUntil <= Date.now()) {
    record(5, false, 'quote validUntil is missing or not in the future')
  } else {
    record(5, true, `HTTP 200 sandbox quote for ${chosenService.name} with a future validity`)
  }
}

if (
  chosenService === undefined
  || typeof chosenService.business?.slug !== 'string'
  || typeof chosenService.id !== 'string'
) {
  record(6, false, 'depends on C3 finding a service id and business slug')
} else {
  const detail = await request(`/api/businesses/${encodeURIComponent(chosenService.business.slug)}`)
  const offerings = detail.data?.business?.offerings
  const hasOffering = Array.isArray(offerings)
    && offerings.some((offering) => offering?.offeringRef === chosenService.id)
  if (detail.response?.status !== 200) {
    record(6, false, requestFailure(detail))
  } else if (!hasOffering) {
    record(6, false, `business detail does not contain offeringRef ${JSON.stringify(chosenService.id)}`)
  } else {
    record(6, true, 'business detail contains the same offeringRef as the service')
  }
}

const skill = await request('/SKILL.md')
if (skill.response?.status !== 200) {
  record(7, false, requestFailure(skill))
} else if (!skill.text.includes('/api/v1/services')) {
  record(7, false, 'HTTP 200 but body does not mention /api/v1/services')
} else {
  record(7, true, 'HTTP 200 and body mentions /api/v1/services')
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
