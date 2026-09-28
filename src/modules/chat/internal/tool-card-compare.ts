import { isRecord } from '@/modules/common/is-record'
import type { PublicToolAvailability, PublicToolPrice } from '@/modules/capability-supply/public'
import { formatToolPrice, formatToolReadiness } from '@/modules/market/tool-view-model'
import { readExactAmount } from '@/modules/money/public'

const EFFECT_LABEL = {
  data_release: 'Data release',
  financial_exposure: 'Financial exposure',
  external_state_change: 'External state change',
} as const

const DATA_USE_LABEL = {
  public: 'Public',
  personal: 'Personal',
  sensitive: 'Sensitive',
  credential: 'Credential',
} as const

const COMPARE_FIELDS = ['price', 'effects', 'dataUse', 'availability'] as const

export function readPrice(value: unknown): PublicToolPrice | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  if (value.kind === 'on_request') return { kind: 'on_request' }
  if (value.kind === 'fixed') {
    const amount = readExactAmount(value.amount)
    return amount === undefined ? undefined : { kind: 'fixed', amount }
  }
  if (value.kind === 'range') {
    const minimum = readExactAmount(value.minimum)
    const maximum = readExactAmount(value.maximum)
    return minimum === undefined || maximum === undefined
      ? undefined
      : { kind: 'range', minimum, maximum }
  }
  return undefined
}

export function readPosture(value: unknown): PublicToolAvailability['posture'] | undefined {
  if (!isRecord(value) || typeof value.posture !== 'string') return undefined
  if (value.posture === 'routeable' || value.posture === 'setup_required' || value.posture === 'unavailable') {
    return value.posture
  }
  return undefined
}

function uniqueLabels(values: readonly string[]): string | undefined {
  const labels: string[] = []
  for (const value of values) {
    if (labels.includes(value)) continue
    labels.push(value)
  }
  return labels.length === 0 ? undefined : labels.join(', ')
}

function effectLabel(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.class !== 'string') return undefined
  if (value.class === 'data_release') return EFFECT_LABEL.data_release
  if (value.class === 'financial_exposure') return EFFECT_LABEL.financial_exposure
  if (value.class === 'external_state_change') return EFFECT_LABEL.external_state_change
  return undefined
}

function dataUseLabel(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.classification !== 'string') return undefined
  if (value.classification === 'public') return DATA_USE_LABEL.public
  if (value.classification === 'personal') return DATA_USE_LABEL.personal
  if (value.classification === 'sensitive') return DATA_USE_LABEL.sensitive
  if (value.classification === 'credential') return DATA_USE_LABEL.credential
  return undefined
}

function labelsFromPolicy(
  values: unknown,
  labelOf: (value: unknown) => string | undefined,
): string | undefined {
  if (!Array.isArray(values)) return undefined
  return uniqueLabels(values.flatMap((value) => {
    const label = labelOf(value)
    return label === undefined ? [] : [label]
  }))
}

function merchandiseCompareValue(field: (typeof COMPARE_FIELDS)[number], value: unknown): string | undefined {
  switch (field) {
    case 'price': {
      const price = readPrice(value)
      return price === undefined ? undefined : formatToolPrice(price)
    }
    case 'effects':
      return labelsFromPolicy(value, effectLabel)
    case 'dataUse':
      return labelsFromPolicy(value, dataUseLabel)
    case 'availability': {
      const posture = readPosture(value)
      return posture === undefined ? undefined : formatToolReadiness(posture)
    }
    default: {
      const exhaustive: never = field
      return exhaustive
    }
  }
}

function compareFieldLabel(field: (typeof COMPARE_FIELDS)[number]): string {
  switch (field) {
    case 'price':
      return 'Price'
    case 'effects':
      return 'Effects'
    case 'dataUse':
      return 'Data use'
    case 'availability':
      return 'Readiness'
    default: {
      const exhaustive: never = field
      return exhaustive
    }
  }
}

function isCompareField(value: string): value is (typeof COMPARE_FIELDS)[number] {
  return (COMPARE_FIELDS as readonly string[]).includes(value)
}

export function projectCompareContrasts(
  output: Record<string, unknown>,
  choices: readonly Readonly<{ toolRef: string; title: string }>[],
): readonly Readonly<{ label: string; value: string }>[] {
  if (!Array.isArray(output.facts)) return []
  const facts: { label: string; value: string }[] = []
  for (const entry of output.facts) {
    if (!isRecord(entry) || typeof entry.field !== 'string' || !isCompareField(entry.field)) continue
    if (!Array.isArray(entry.values)) continue
    const parts: string[] = []
    for (const cell of entry.values) {
      if (!isRecord(cell)) continue
      const merchandised = merchandiseCompareValue(entry.field, cell.value)
      if (merchandised === undefined) continue
      const title = typeof cell.toolRef === 'string'
        ? choices.find((choice) => choice.toolRef === cell.toolRef)?.title
        : undefined
      parts.push(title === undefined ? merchandised : `${title}: ${merchandised}`)
      if (parts.length >= 4) break
    }
    if (parts.length === 0) continue
    facts.push({ label: compareFieldLabel(entry.field), value: parts.join('; ') })
    if (facts.length >= 4) break
  }
  return facts
}
