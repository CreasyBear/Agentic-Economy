import { uniqBy } from 'es-toolkit/array'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { runWithAbortAndTimeout } from '@/modules/common/transport-timeout'

export type AnswerModel = {
  id: string
  name: string
  provider: string
  providerId: string
}

export type AnswerModelsByProvider = Record<string, AnswerModel[]>

export type AnswerModelSelectorData = {
  enabled: boolean
  modelsByProvider: AnswerModelsByProvider
  selectedModelId: string
  hasAvailableModels: boolean
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const MODEL_CACHE_TTL_MS = 2 * 60 * 1000
const OPENROUTER_MODELS_TIMEOUT_MS = 10_000
const MAX_OPENROUTER_MODELS_RESPONSE_BYTES = 512 * 1024

const EXCLUDED_ID_KEYWORDS = [
  'embed',
  'whisper',
  'tts',
  'dall-e',
  'moderation',
  'transcribe',
  'realtime',
  'audio',
  'image-preview',
  'vision-only',
]

let modelsCache:
  | {
      expiresAt: number
      value: AnswerModel[]
    }
  | undefined

type OpenRouterModelRecord = {
  id: string
  name: string
  architecture?: {
    input_modalities?: string[]
    output_modalities?: string[]
  }
}

export function providerLabelFromModelId(modelId: string): string {
  const slashIndex = modelId.indexOf('/')
  if (slashIndex <= 0) {
    return 'OpenRouter'
  }

  const providerId = modelId.slice(0, slashIndex)
  return formatProviderId(providerId)
}

function formatProviderId(providerId: string): string {
  return providerId
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function readAnswerModelWhitelist(): readonly string[] | undefined {
  const raw = process.env.AE_LLM_MODELS?.trim()
  if (raw === undefined || raw.length === 0) {
    return undefined
  }

  const models = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  return models.length > 0 ? models : undefined
}

function isChatModelCandidate(model: OpenRouterModelRecord): boolean {
  const id = model.id.toLowerCase()
  if (EXCLUDED_ID_KEYWORDS.some((keyword) => id.includes(keyword))) {
    return false
  }

  const inputModalities = model.architecture?.input_modalities
  const outputModalities = model.architecture?.output_modalities
  if (inputModalities === undefined || outputModalities === undefined) {
    return true
  }

  if (!inputModalities.includes('text') || !outputModalities.includes('text')) {
    return false
  }

  return true
}

export function normalizeOpenRouterModels(records: readonly OpenRouterModelRecord[]): AnswerModel[] {
  const whitelist = readAnswerModelWhitelist()
  const whitelistSet = whitelist !== undefined ? new Set(whitelist) : undefined

  const models: AnswerModel[] = []
  for (const record of records) {
    if (!isChatModelCandidate(record)) {
      continue
    }
    if (whitelistSet !== undefined && !whitelistSet.has(record.id)) {
      continue
    }
    const providerId = record.id.includes('/') ? record.id.slice(0, record.id.indexOf('/')) : 'openrouter'
    models.push({
      id: record.id,
      name: record.name,
      provider: providerLabelFromModelId(record.id),
      providerId,
    })
  }

  return sortModels(dedupeModels(models))
}

export function groupModelsByProvider(models: readonly AnswerModel[]): AnswerModelsByProvider {
  // Provably pure: Object.groupBy preserves provider key order and bucket membership/order from the prior loop.
  const grouped = Object.groupBy(models, (model) => model.provider) as AnswerModelsByProvider

  for (const provider of Object.keys(grouped)) {
    const bucket = grouped[provider]
    if (bucket !== undefined) {
      grouped[provider] = sortModels(bucket)
    }
  }

  return grouped
}

export function resolveSelectedModelId(
  models: readonly AnswerModel[],
  preferredModelId: string | undefined,
  fallbackModelId: string,
): string {
  const allowed = new Set(models.map((model) => model.id))
  if (preferredModelId !== undefined && allowed.has(preferredModelId)) {
    return preferredModelId
  }
  if (allowed.has(fallbackModelId)) {
    return fallbackModelId
  }
  return models[0]?.id ?? fallbackModelId
}

export function resolveChatModelId(
  models: readonly AnswerModel[],
  forwardedProps: Record<string, unknown>,
  fallbackModelId: string,
): string {
  const requested =
    typeof forwardedProps.model === 'string' && forwardedProps.model.trim().length > 0
      ? forwardedProps.model.trim()
      : undefined

  return resolveSelectedModelId(models, requested, fallbackModelId)
}

export async function fetchOpenRouterModels(apiKey: string): Promise<AnswerModel[]> {
  const now = Date.now()
  if (modelsCache !== undefined && modelsCache.expiresAt > now) {
    return modelsCache.value
  }

  const { response, responseBody } = await runWithAbortAndTimeout({
    timeoutMs: OPENROUTER_MODELS_TIMEOUT_MS,
    timeoutError: () => new Error('openrouter_models_timeout'),
    run: async (signal) => {
      const response = await fetch(OPENROUTER_MODELS_URL, {
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        ...(signal === undefined ? {} : { signal }),
      })
      const bounded = await readBoundedRequestText(response, MAX_OPENROUTER_MODELS_RESPONSE_BYTES)
      return { response, responseBody: bounded.ok ? bounded.text : undefined }
    },
  })

  if (!response.ok) {
    throw new Error(`openrouter_models_${response.status}`)
  }

  if (responseBody === undefined) {
    throw new Error('openrouter_models_response_too_large')
  }

  const payload = JSON.parse(responseBody) as { data?: OpenRouterModelRecord[] }
  const models = normalizeOpenRouterModels(payload.data ?? [])
  modelsCache = {
    expiresAt: now + MODEL_CACHE_TTL_MS,
    value: models,
  }
  return models
}

export function buildFallbackModels(defaultModelId: string): AnswerModel[] {
  const whitelist = readAnswerModelWhitelist()
  const modelIds = whitelist ?? [defaultModelId]

  return modelIds.map((id) => ({
    id,
    name: id.includes('/') ? id.slice(id.indexOf('/') + 1) : id,
    provider: providerLabelFromModelId(id),
    providerId: id.includes('/') ? id.slice(0, id.indexOf('/')) : 'openrouter',
  }))
}

export async function getAnswerModelSelectorData(
  llm: { apiKey: string; model: string },
  preferredModelId?: string,
): Promise<AnswerModelSelectorData> {
  let models: AnswerModel[]
  try {
    models = await fetchOpenRouterModels(llm.apiKey)
  } catch {
    models = buildFallbackModels(llm.model)
  }

  if (models.length === 0) {
    models = buildFallbackModels(llm.model)
  }

  const selectedModelId = resolveSelectedModelId(models, preferredModelId, llm.model)

  return {
    enabled: true,
    modelsByProvider: groupModelsByProvider(models),
    selectedModelId,
    hasAvailableModels: models.length > 0,
  }
}

function sortModels(models: AnswerModel[]): AnswerModel[] {
  return models.toSorted((a, b) => a.name.localeCompare(b.name))
}

function dedupeModels(models: AnswerModel[]): AnswerModel[] {
  return uniqBy(models, (model) => model.id)
}

export function resetOpenRouterModelsCacheForTest(): void {
  modelsCache = undefined
}
