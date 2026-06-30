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

export function formatProviderId(providerId: string): string {
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

export function isChatModelCandidate(model: OpenRouterModelRecord): boolean {
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

  const models = records
    .filter(isChatModelCandidate)
    .filter((record) => whitelistSet === undefined || whitelistSet.has(record.id))
    .map((record) => {
      const providerId = record.id.includes('/') ? record.id.slice(0, record.id.indexOf('/')) : 'openrouter'
      return {
        id: record.id,
        name: record.name,
        provider: providerLabelFromModelId(record.id),
        providerId,
      }
    })

  return sortModels(dedupeModels(models))
}

export function groupModelsByProvider(models: readonly AnswerModel[]): AnswerModelsByProvider {
  const grouped: AnswerModelsByProvider = {}

  for (const model of models) {
    const bucket = grouped[model.provider] ?? []
    bucket.push(model)
    grouped[model.provider] = bucket
  }

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

  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`openrouter_models_${response.status}`)
  }

  const payload = (await response.json()) as { data?: OpenRouterModelRecord[] }
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
  return [...models].sort((a, b) => a.name.localeCompare(b.name))
}

function dedupeModels(models: AnswerModel[]): AnswerModel[] {
  const seen = new Set<string>()
  const deduped: AnswerModel[] = []

  for (const model of models) {
    if (seen.has(model.id)) {
      continue
    }
    seen.add(model.id)
    deduped.push(model)
  }

  return deduped
}

export function resetOpenRouterModelsCacheForTest(): void {
  modelsCache = undefined
}
