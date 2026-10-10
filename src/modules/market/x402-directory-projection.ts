import { degradeBackend } from '@/lib/observability/degrade-backend'
import { x402DefaultAssetFacts, x402LegacyDiscoveryInfo, x402NetworkLabel } from '@/modules/capability-supply/public'
import { isRecord } from '@/modules/common/is-record'
import { formatExactAmount } from '@/modules/money/public'
import { directorySourceLabels } from './x402-directory-metadata'
import type { X402DirectoryContract, X402DirectoryEntry, X402DirectoryField } from './x402-directory'
import { x402DirectoryFunctionalTitle } from './x402-directory-title'

function text(value: unknown, max = 240): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (trimmed.length === 0) return undefined
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed
}

function payToFact(value: unknown): string | undefined {
  const raw = text(value, 128)
  if (raw === undefined) return undefined
  if (/^0x[a-fA-F0-9]{40}$/u.test(raw)) return raw.toLowerCase()
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(raw)) return raw
  return undefined
}

const SOLANA_MAINNET_NETWORK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
const SOLANA_MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

function directoryPriceAssetFacts(assetId: string, network: string): Readonly<{ symbol: string; decimals: number }> | undefined {
  const asset = x402DefaultAssetFacts(assetId, network)
  if (asset !== undefined) return asset
  if (assetId === SOLANA_MAINNET_USDC_MINT && (network === 'solana' || network === SOLANA_MAINNET_NETWORK)) return { symbol: 'USDC', decimals: 6 }
  return undefined
}

function priceFacts(price: Readonly<Record<string, unknown>>) {
  const scheme = text(price.scheme, 64)
  const units = text(scheme === 'upto' ? price.maxAmountRequired ?? price.amount : price.amount ?? price.maxAmountRequired, 128)
  const assetId = text(price.asset, 160)
  const network = text(price.network, 100)
  if (units === undefined || assetId === undefined || network === undefined || !/^\d+$/u.test(units)) return { amount: 'Price not supplied' }
  const asset = directoryPriceAssetFacts(assetId, network)
  const formatted = asset === undefined ? undefined : formatExactAmount({ currency: asset.symbol, units, exponent: asset.decimals })
  const payTo = payToFact(price.payTo)
  return {
    amount: formatted === undefined ? `${units} atomic units (${assetId})` : `${formatted} ${asset?.symbol}`,
    asset: assetId,
    ...(formatted === undefined || asset === undefined ? {} : { symbol: asset.symbol, decimalAmount: formatted }),
    ...(payTo === undefined ? {} : { payTo }),
  }
}

function schemaNode(value: unknown, ...path: string[]): Record<string, unknown> | undefined {
  let node = value
  for (const key of path) node = isRecord(node) ? node[key] : undefined
  return isRecord(node) ? node : undefined
}

/** A JSON schema as its first named fields, e.g. "Inputs: query (required), limit, +2 more". */
export function jsonSchemaFieldSummary(schema: unknown, label: 'Inputs' | 'Returns'): string | undefined {
  if (!isRecord(schema) || !isRecord(schema.properties)) return undefined
  const fields = Object.keys(schema.properties)
  if (fields.length === 0) return label === 'Inputs' ? 'No named input fields declared' : 'No named output fields declared'
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [])
  const shown = fields.slice(0, 5).map((field) => `${text(field, 48) ?? 'field'}${required.has(field) ? ' (required)' : ''}`)
  return `${label}: ${shown.join(', ')}${fields.length > shown.length ? `, +${fields.length - shown.length} more` : ''}`
}

function timestamp(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : undefined
}
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/** Link projection only: no endpoint, icon, skill or schema references are fetched. */
function publicUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/u.test(value)) return undefined
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : undefined
  } catch (cause) { return degradeBackend(cause, undefined, { site: 'publicUrl', reason: 'invalid_response' }) }
}

// Complete JSON or an explicit omission. Never produce truncated executable examples.
function boundedJson(value: unknown, maximum = 32768): string | undefined {
  if (value === undefined) return undefined
  try {
    const json = JSON.stringify(value, null, 2)
    return json !== undefined && json.length <= maximum ? json : undefined
  } catch (cause) { return degradeBackend(cause, undefined, { site: 'boundedJson', reason: 'invalid_response' }) }
}

function declaredType(value: unknown): string | undefined {
  return Array.isArray(value) ? value.flatMap(item => typeof item === 'string' ? [item] : []).join(' | ') || undefined : text(value, 80)
}

function contract(
  schema: Record<string, unknown> | undefined,
  example: unknown,
  locations: readonly X402DirectoryField['location'][],
  type?: string,
): X402DirectoryContract | undefined {
  if (schema === undefined && example === undefined && type === undefined) return undefined
  const fields: X402DirectoryField[] = []
  let fieldsTruncated = false
  function visit(node: Record<string, unknown> | undefined, sample: unknown, location: X402DirectoryField['location'], path = '', depth = 0) {
    const properties = isRecord(node?.properties) ? node.properties : undefined
    const sampleRecord = isRecord(sample) ? sample : undefined
    const names = [...new Set([...Object.keys(properties ?? {}), ...Object.keys(sampleRecord ?? {})])]
    const required = new Set(Array.isArray(node?.required) ? node.required : [])
    for (const name of names) {
      if (fields.length >= 64 || depth > 3) { fieldsTruncated = true; return }
      const property = schemaNode(properties, name)
      const value = sampleRecord?.[name]
      const fieldType = declaredType(property?.type)
      const description = text(property?.description, 1000)
      const defaultJson = boundedJson(property?.default, 2048)
      const exampleJson = boundedJson(value === undefined ? property?.example : value, 4096)
      const enumValues = Array.isArray(property?.enum) ? property.enum.slice(0, 30).flatMap(item => { const json = boundedJson(item, 512); return json === undefined ? [] : [json] }) : []
      const constraints = ['format', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems'].flatMap(key => {
        const value = property?.[key]
        return typeof value === 'string' || typeof value === 'number' ? [`${key}: ${text(String(value), 240)}`] : []
      })
      const fieldPath = path === '' ? name : `${path}.${name}`
      fields.push({
        name: text(name, 160) ?? 'field', path: fieldPath, location, source: property === undefined ? 'example' : 'schema',
        ...(property === undefined ? {} : { required: required.has(name) }),
        ...(fieldType === undefined ? {} : { type: fieldType }),
        ...(description === undefined ? {} : { description }),
        ...(defaultJson === undefined ? {} : { defaultJson }),
        ...(exampleJson === undefined ? {} : { exampleJson }),
        ...(enumValues.length === 0 ? {} : { enumValues }),
        ...(constraints.length === 0 ? {} : { constraints }),
      })
      if (isRecord(property?.properties) || isRecord(value)) visit(property, value, location, fieldPath, depth + 1)
      if (isRecord(property?.items) || Array.isArray(value)) visit(schemaNode(property, 'items'), Array.isArray(value) ? value[0] : undefined, location, `${fieldPath}[]`, depth + 1)
    }
  }
  if (locations.length === 1 && locations[0] === 'output') visit(schema, example, 'output')
  else for (const location of locations) visit(schemaNode(schema, 'properties', location), isRecord(example) ? example[location] : undefined, location)
  const schemaJson = boundedJson(schema)
  const exampleJson = boundedJson(example, 16384)
  return {
    fields,
    ...(type === undefined ? {} : { type }),
    ...(schemaJson === undefined ? schema === undefined ? {} : { schemaOmitted: true as const } : { schemaJson }),
    ...(exampleJson === undefined ? example === undefined ? {} : { exampleOmitted: true as const } : { exampleJson }),
    ...(fieldsTruncated ? { fieldsTruncated: true as const } : {}),
  }
}

export function projectX402DirectoryEntry(resource: unknown): X402DirectoryEntry {
  const record: Readonly<Record<string, unknown>> = isRecord(resource) ? resource : {}
  const resourceUrl = typeof record.resource === 'string' ? record.resource : ''
  let provider = 'Unknown provider'
  try { provider = new URL(resourceUrl).hostname || provider } catch (cause) { degradeBackend(cause, undefined, { site: 'projectX402DirectoryEntry', reason: 'invalid_response' }) /* Opaque directory resources remain visible. */ }
  const bazaar = schemaNode(record, 'extensions', 'bazaar')
  const legacy = Array.isArray(record.accepts) ? record.accepts.filter(isRecord).find(price => isRecord(price.outputSchema)) : undefined
  const legacySchema = schemaNode(legacy, 'outputSchema')
  const legacyInfo = x402LegacyDiscoveryInfo(legacy)
  const input = schemaNode(bazaar, 'info', 'input') ?? schemaNode(legacyInfo, 'input')
  const output = schemaNode(bazaar, 'info', 'output') ?? schemaNode(legacyInfo, 'output')
  const method = text(input?.method, 16)?.toUpperCase()
  const protocol = text(record.type, 32) ?? 'unspecified'
  const description = text(record.description, 1600)
  const serviceName = text(record.serviceName, 140)
  const iconUrl = publicUrl(record.iconUrl)
  const skillUrl = publicUrl(record.skillUrl)
  const category = text(bazaar?.category, 80)
  // Keep the callable job distinct from an umbrella service identity.
  const explicitTitle = text(record.title, 100) ?? text(record.name, 100) ?? text(bazaar?.title, 100)
  const title = x402DirectoryFunctionalTitle({ explicitTitle, description, serviceName, fallback: provider === 'Unknown provider' ? 'Service listing' : `Service from ${provider}` })
  const declaredInputs = schemaNode(bazaar, 'schema', 'properties', 'input', 'properties', method === 'GET' ? 'queryParams' : 'body')
  const legacyOutput = schemaNode(legacySchema, 'output')
  const legacyOutputSchema = legacyOutput !== undefined && (typeof legacyOutput.type === 'string' || isRecord(legacyOutput.properties) || typeof legacyOutput.$ref === 'string') ? legacyOutput : undefined
  const declaredOutput = schemaNode(bazaar, 'schema', 'properties', 'output', 'properties', 'example') ?? legacyOutputSchema ?? (legacySchema !== undefined && legacySchema.input === undefined ? legacySchema : undefined)
  const declaredInput = schemaNode(bazaar, 'schema', 'properties', 'input')
  const inputContract = contract(declaredInput, input, ['body', 'queryParams', 'pathParams', 'headers'], text(input?.bodyType, 80))
  const outputContract = contract(declaredOutput, legacyOutputSchema === undefined || bazaar !== undefined ? output?.example : undefined, ['output'], text(output?.type, 80) ?? text(legacy?.mimeType, 80))
  const outputType = text(output?.type, 40)
  const outputDescription = text(declaredOutput?.description, 200)
  const schemaType = text(declaredOutput?.type, 40)
  const outputSummary = outputDescription ?? (outputType === undefined
    ? schemaType === undefined ? undefined : `${schemaType} response schema declared by the provider`
    : `${outputType.toUpperCase()} response declared by the provider`)
  const inputSummary = jsonSchemaFieldSummary(declaredInputs, 'Inputs')
  const updatedAt = timestamp(record.lastUpdated)
  const quality = schemaNode(record, 'quality')
  const calls30d = count(quality?.l30DaysTotalCalls)
  const payers30d = count(quality?.l30DaysUniquePayers)
  const lastCalledAt = timestamp(quality?.lastCalledAt)
  const tags = [...new Set([...(Array.isArray(record.tags) ? record.tags : []), ...(Array.isArray(bazaar?.tags) ? bazaar.tags : [])].flatMap((tag) => { const label = text(tag, 48); return label === undefined ? [] : [label] }))].slice(0, 20)
  return {
    resource: resourceUrl,
    title,
    ...directorySourceLabels(record),
    ...(serviceName === undefined ? {} : { serviceName }),
    ...(iconUrl === undefined ? {} : { iconUrl }),
    ...(skillUrl === undefined ? {} : { skillUrl }),
    ...(category === undefined ? {} : { category }),
    ...(inputContract === undefined ? {} : { input: inputContract }),
    ...(outputContract === undefined ? {} : { output: outputContract }),
    description: description ?? 'The provider has not supplied a description.',
    protocol,
    ...(method === undefined ? {} : { method, methodLabel: `${protocol.toUpperCase()} ${method}` }),
    ...(outputSummary === undefined ? {} : { outputSummary }),
    ...(inputSummary === undefined ? {} : { schemaSummary: inputSummary }),
    ...(tags.length === 0 ? {} : { tags }),
    provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', ...(updatedAt === undefined ? {} : { updatedAt }) },
    ...(calls30d === undefined && payers30d === undefined && lastCalledAt === undefined ? {} : { activity: {
      ...(calls30d === undefined ? {} : { calls30d }), ...(payers30d === undefined ? {} : { payers30d }), ...(lastCalledAt === undefined ? {} : { lastCalledAt }),
    } }),
    provider,
    prices: Array.isArray(record.accepts) ? record.accepts.filter(isRecord).map((price) => {
      const network = text(price.network, 100) ?? 'Unspecified network'
      return { network, networkLabel: x402NetworkLabel(network), scheme: text(price.scheme, 64) ?? 'Unspecified scheme', ...priceFacts(price) }
    }) : [],
    metadataJson: JSON.stringify(record, null, 2),
  }
}
