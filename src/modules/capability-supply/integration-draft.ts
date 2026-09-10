import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import { inspectSource } from './internal/publication-importer-types'
import { publicationMaterialContainsCredential } from './internal/publication/source'
import type { SupplySourceInput } from './source-preview'

const SHA256_REF = /^sha256:[0-9a-f]{64}$/u
const SOURCE_REVISION_PREFIX: Record<SupplySourceInput['kind'], string> = {
  openapi: 'openapi:',
  mcp: 'mcp:',
  agent_plugin: 'agent-plugin-1.0:',
  x402: 'x402:',
}

export type SupplyIntegrationDraft = Readonly<{
  sourceKind: SupplySourceInput['kind']
  sourceDescriptorJson: string
  sourceDigest: string
  sourceRevision: string
  candidateRef: string
  sourceSelectorJson: string
  connectionRef?: string
  validationInputJson?: string
  updatedAt: number
}>

export type NormalizeSupplyIntegrationDraftInput = Readonly<{
  sourceKind: SupplySourceInput['kind']
  sourceDescriptorJson: string
  sourceDigest: string
  sourceRevision: string
  candidateRef: string
  sourceSelectorJson: string
  connectionRef?: string | undefined
  validationInputJson?: string | undefined
  updatedAt: number
}>

export type SupplyIntegrationDraftNormalization =
  | Readonly<{
      kind: 'valid'
      draft: SupplyIntegrationDraft
      source: SupplySourceInput
      sourceSelector: Readonly<Record<string, unknown>>
      targetUrl: string
      method?: string | undefined
    }>
  | Readonly<{ kind: 'refused'; reason: 'draft_invalid' | 'source_contains_credential' | 'candidate_changed' }>

export function normalizeSupplyIntegrationDraft(
  input: NormalizeSupplyIntegrationDraftInput,
): SupplyIntegrationDraftNormalization {
  if (!SHA256_REF.test(input.sourceDigest) || !SHA256_REF.test(input.candidateRef)) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if (!input.sourceRevision.startsWith(SOURCE_REVISION_PREFIX[input.sourceKind])) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if (!Number.isSafeInteger(input.updatedAt) || input.updatedAt <= 0) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if (input.connectionRef !== undefined && !boundedText(input.connectionRef, 200)) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }

  let sourceValue: unknown
  let selectorValue: unknown
  let validationInput: unknown
  try {
    sourceValue = JSON.parse(input.sourceDescriptorJson)
    selectorValue = JSON.parse(input.sourceSelectorJson)
    validationInput = input.validationInputJson === undefined
      ? undefined
      : JSON.parse(input.validationInputJson)
  } catch {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  const source = normalizeSupplySourceDescriptor(sourceValue)
  if (source === undefined || source.kind !== input.sourceKind || !isRecord(selectorValue)) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  for (const value of [source, selectorValue, validationInput]) {
    if (value === undefined) continue
    if (inspectSource(value).kind !== 'accepted') return { kind: 'refused', reason: 'draft_invalid' }
    if (publicationMaterialContainsCredential(value)) {
      return { kind: 'refused', reason: 'source_contains_credential' }
    }
  }
  const normalizedSourceJson = stableStringify(source as StableHashValue)
  const normalizedSelectorJson = stableStringify(selectorValue as StableHashValue)
  const normalizedValidationJson = validationInput === undefined
    ? undefined
    : stableStringify(validationInput as StableHashValue)
  if (
    input.sourceDescriptorJson !== normalizedSourceJson
    || input.sourceSelectorJson !== normalizedSelectorJson
    || (input.validationInputJson !== undefined && input.validationInputJson !== normalizedValidationJson)
  ) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if (canonicalDigest({ sourceDigest: input.sourceDigest, selector: selectorValue } as StableHashValue) !== input.candidateRef) {
    return { kind: 'refused', reason: 'candidate_changed' }
  }
  const target = sourceTarget(source, selectorValue)
  if (target === undefined) return { kind: 'refused', reason: 'draft_invalid' }
  return {
    kind: 'valid',
    draft: {
      sourceKind: input.sourceKind,
      sourceDescriptorJson: normalizedSourceJson,
      sourceDigest: input.sourceDigest,
      sourceRevision: input.sourceRevision,
      candidateRef: input.candidateRef,
      sourceSelectorJson: normalizedSelectorJson,
      ...(input.connectionRef === undefined ? {} : { connectionRef: input.connectionRef }),
      ...(normalizedValidationJson === undefined ? {} : { validationInputJson: normalizedValidationJson }),
      updatedAt: input.updatedAt,
    },
    source,
    sourceSelector: selectorValue,
    targetUrl: target.url,
    ...(target.method === undefined ? {} : { method: target.method }),
  }
}

export function normalizeSupplySourceDescriptor(value: unknown): SupplySourceInput | undefined {
  if (!isRecord(value) || (value.environment !== 'sandbox' && value.environment !== 'production')) return undefined
  switch (value.kind) {
    case 'openapi':
      return exactKeys(value, ['kind', 'definitionUrl', 'environment']) && validUrl(value.definitionUrl)
        ? { kind: 'openapi', definitionUrl: value.definitionUrl, environment: value.environment }
        : undefined
    case 'mcp': {
      if (!exactKeys(value, ['kind', 'serverUrl', 'registryName', 'remoteRef', 'environment'], true)) return undefined
      const serverUrl = validUrl(value.serverUrl) ? value.serverUrl : undefined
      const registryName = boundedTextValue(value.registryName, 255)
      const remoteRef = sha256Ref(value.remoteRef)
      if ((serverUrl === undefined) === (registryName === undefined)) return undefined
      if (serverUrl !== undefined && value.remoteRef !== undefined) return undefined
      if (value.remoteRef !== undefined && remoteRef === undefined) return undefined
      return {
        kind: 'mcp',
        ...(serverUrl === undefined ? {} : { serverUrl }),
        ...(registryName === undefined ? {} : { registryName }),
        ...(remoteRef === undefined ? {} : { remoteRef }),
        environment: value.environment,
      }
    }
    case 'agent_plugin':
      return exactKeys(value, ['kind', 'pluginJson', 'mcpJson', 'remoteRef', 'environment'], true)
        && Object.hasOwn(value, 'pluginJson') && Object.hasOwn(value, 'mcpJson')
        && isRecord(value.pluginJson) && isRecord(value.mcpJson)
        && (value.remoteRef === undefined || sha256Ref(value.remoteRef) !== undefined)
        ? {
            kind: 'agent_plugin',
            pluginJson: value.pluginJson as never,
            mcpJson: value.mcpJson as never,
            ...(typeof value.remoteRef === 'string' ? { remoteRef: value.remoteRef } : {}),
            environment: value.environment,
          }
        : undefined
    case 'x402':
      return exactKeys(value, ['kind', 'resourceUrl', 'method', 'environment'])
        && validUrl(value.resourceUrl) && (value.method === 'GET' || value.method === 'POST')
        ? { kind: 'x402', resourceUrl: value.resourceUrl, method: value.method, environment: value.environment }
        : undefined
    default:
      return undefined
  }
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  optional = false,
): boolean {
  const actual = Object.keys(value)
  if (actual.some((key) => !allowed.includes(key))) return false
  return optional || allowed.every((key) => Object.hasOwn(value, key))
}

function validUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === ''
  } catch {
    return false
  }
}

function sha256Ref(value: unknown): string | undefined {
  return typeof value === 'string' && SHA256_REF.test(value) ? value : undefined
}

function boundedTextValue(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && boundedText(value, maximum) ? value : undefined
}

export function supplyIntegrationDraftRefs(
  businessId: string,
  candidateRef: string,
): Readonly<{ offeringRef: string; accessPathRef: string }> {
  const identity = canonicalDigest({ version: 'supply-integration-draft:v1', businessId, candidateRef })
  const suffix = identity.slice('sha256:'.length)
  return {
    offeringRef: `offering:supply-draft:${suffix}`,
    accessPathRef: `access:supply-draft:${suffix}`,
  }
}

function sourceTarget(
  source: SupplySourceInput,
  selector: Readonly<Record<string, unknown>>,
): Readonly<{ url: string; method?: string }> | undefined {
  const selectorUrl = typeof selector.serverUrl === 'string'
    ? selector.serverUrl
    : typeof selector.resourceUrl === 'string'
      ? selector.resourceUrl
      : undefined
  const value = source.kind === 'openapi'
    ? selectorUrl ?? source.definitionUrl
    : source.kind === 'x402'
      ? source.resourceUrl
      : selectorUrl ?? (source.kind === 'mcp' ? source.serverUrl : undefined)
  if (value === undefined) return undefined
  let url: string
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') return undefined
    url = source.kind === 'openapi' && typeof selector.path === 'string'
      ? new URL(selector.path.replace(/^\/+/, ''), parsed.href.endsWith('/') ? parsed.href : `${parsed.href}/`).toString()
      : parsed.toString()
  } catch {
    return undefined
  }
  const method = typeof selector.method === 'string' ? selector.method.toUpperCase() : undefined
  return { url, ...(method === undefined ? {} : { method }) }
}

function boundedText(value: string, maximum: number): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maximum && trimmed === value
}
